// packages/server/src/server.ts
//
// SPEC §5.1 / §6.5 — the Phase 4 server core (issues #85, #86). Stands up the REST
// contract: `GET /session/new`, `GET /room/current`, and `POST /interact`, over
// in-memory sessions (§6.5 — acceptable for alpha). All resolution is delegated to
// `rule-engine` (`populate` for a room, `resolveMove` for an interaction); the
// server holds NO rule logic of its own — it only maps HTTP to the engine and back.
//
// INV-1: the server imports no rendering library — it is a headless HTTP contract
// over the engine. INV-3: only resolved JSON (`ResolvedRoomResponse`) leaves the
// server; the substrate embeddings, the graph, `SessionState`, and rule/commit
// internals never appear in a response body — not on the happy path, and not in an
// error envelope. INV-2: a session is reproducible from its seed — `populate` seeds
// on `(session_seed, turn_count, query)`, so two sessions with the same seed resolve
// byte-identical rooms.
//
// §0.9.0 (A12): the substrate and ruleset are server-wide startup config; every
// session created here binds to the one server-wide ruleset. §0.11.0 (C2): a
// well-formed request that resolves to nothing is a `200` "stuck" room, never a
// `4xx`/`5xx`. §0.11.0 (C3): local, single-user, trusted-operator — no auth boundary.

import type {
  Entity,
  InteractRequest,
  InteractResponse,
  InteractionResult,
  ResolutionStatus,
  ResolvedRoomResponse,
  Ruleset,
  SessionState,
} from "schema";
import {
  createSubstrateGraph,
  populate,
  resolveMove,
  DEFAULT_MOVEMENT_AFFORDANCES,
  type CommitResult,
  type Graph,
  type GraphSpan,
  type RoomResolution,
} from "rule-engine";
import { SessionStore } from "./sessions";
import {
  errorResponse,
  jsonResponse,
  type ServerResponse,
} from "./http-contract";

/** The server-wide substrate: the indexed spans plus the starting room's ref (§A12). */
export interface SubstrateConfig {
  /** The substrate spans a Phase 2 build materialized (`graph.json`) — INV-3: the
   *  raw embedding stays here, never on the wire. */
  spans: GraphSpan[];
  /** `embedding_ref` of the room a fresh session starts in; must name one of `spans`. */
  start_ref: string;
}

/** Everything a running server is configured with at startup (§A12). */
export interface ServerConfig {
  /** The server-wide ruleset every session binds to (§A12); its `spec_version`
   *  is echoed as `X-Spec-Version` (§3.5). */
  ruleset: Ruleset;
  substrate: SubstrateConfig;
  /**
   * §0.9.0 (A12) developer-mode flag — the sibling of the debug flag. Off (a
   * shipped game) means `POST /session/new` ruleset binding is unavailable; that
   * endpoint lands in issue #87, so this is threaded through now and unused here.
   */
  devMode?: boolean;
  /**
   * The entropy source for a server-chosen seed when `GET /session/new` omits one.
   * This is the single entropy boundary INV-2 is defined against — everything
   * downstream is a pure function of the seed — so it is injectable (tests pass a
   * deterministic source). Defaults to a fresh per-session random seed.
   */
  newSeed?: () => number;
  /** Session-id source; injectable for tests. Defaults to a monotonic counter. */
  newSessionId?: () => string;
}

/** A parsed inbound request — method + raw url — the transport-agnostic input. */
export interface HttpRequest {
  method: string;
  url: string;
  /** Raw request body (`POST /interact`). Absent/`""` for the GET routes. */
  body?: string;
}

/** The running server: a pure `handle` plus the in-memory session store. */
export interface Server {
  handle(req: HttpRequest): ServerResponse;
  readonly sessions: SessionStore;
}

const DEFAULT_MAX_SEED = 0x7fffffff;

function defaultSeedSource(): number {
  // The seed IS the entropy source (INV-2); a fresh session draws one so distinct
  // sessions explore the substrate differently. Everything downstream is seeded
  // from it and fully reproducible.
  return Math.floor(Math.random() * DEFAULT_MAX_SEED);
}

function counterIdSource(): () => string {
  let n = 0;
  return () => `session-${++n}`;
}

/**
 * Build a running {@link Server} from startup config. Materializes the substrate
 * graph once (`createSubstrateGraph`), indexes the room entities by ref for the
 * `GET /room/current` lookup, and validates that `start_ref` names a real span —
 * a misconfigured substrate fails fast at startup, not per request.
 */
export function createServer(config: ServerConfig): Server {
  const { spans, start_ref } = config.substrate;

  const entityByRef = new Map<string, Entity>();
  for (const s of spans) entityByRef.set(s.entity.embedding_ref, s.entity);
  if (!entityByRef.has(start_ref)) {
    throw new Error(
      `server config: start_ref "${start_ref}" names no substrate span`,
    );
  }

  const graph: Graph = createSubstrateGraph(spans);
  const specVersion = config.ruleset.spec_version;
  const sessions = new SessionStore({
    startRef: start_ref,
    newSeed: config.newSeed ?? defaultSeedSource,
    newSessionId: config.newSessionId ?? counterIdSource(),
  });

  function sessionNew(params: URLSearchParams): ServerResponse {
    const seedParam = params.get("seed");
    let seed: number;
    if (seedParam === null) {
      seed = sessions.chooseSeed();
    } else {
      const parsed = Number(seedParam);
      if (seedParam.trim() === "" || !Number.isInteger(parsed)) {
        return errorResponse(
          specVersion,
          400,
          "bad_request",
          "seed must be an integer",
        );
      }
      seed = parsed;
    }
    const session = sessions.create(seed);
    return jsonResponse(specVersion, 200, {
      session_id: session.session_id,
      seed: session.session_seed,
    });
  }

  // Resolve the room at a session's live position through the engine (INV-1: no
  // rule logic here). `room` is guaranteed present — `start_ref` was validated at
  // startup and every position we set names a known ref — so `null` is a `500`.
  function resolveRoom(
    session: SessionState,
  ): { room: Entity; resolution: RoomResolution } | null {
    const room = entityByRef.get(session.position.vector_ref);
    if (room === undefined) return null;
    const resolution = populate(room, session, graph, config.ruleset.layers);
    return { room, resolution };
  }

  function toResolvedRoom(
    room: Entity,
    r: RoomResolution,
  ): ResolvedRoomResponse {
    // Only resolved output crosses the wire (INV-3): the room, its sampled objects,
    // derived exits, and status — never the `commit` state or a debug trace.
    return {
      room,
      objects: r.objects,
      exits: r.exits,
      resolution_status: r.resolution_status,
    };
  }

  function roomCurrent(params: URLSearchParams): ServerResponse {
    const sessionId = params.get("session_id");
    if (sessionId === null || sessionId === "") {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "session_id is required",
      );
    }
    const session = sessions.get(sessionId);
    if (session === undefined) {
      return errorResponse(
        specVersion,
        404,
        "unknown_session",
        "unknown session",
      );
    }

    const resolved = resolveRoom(session);
    if (resolved === null) {
      return errorResponse(
        specVersion,
        500,
        "internal_error",
        "internal error",
      );
    }
    return jsonResponse(
      specVersion,
      200,
      toResolvedRoom(resolved.room, resolved.resolution),
    );
  }

  // A well-formed `InteractRequest` (§3.3): a non-empty `session_id` and an
  // `action` naming an `object_id` + `affordance`. Anything else is a malformed
  // body (`400`) — validated here so the engine only ever sees a valid shape.
  function isInteractRequest(value: unknown): value is InteractRequest {
    if (typeof value !== "object" || value === null) return false;
    const { session_id, action } = value as Record<string, unknown>;
    if (typeof session_id !== "string" || session_id === "") return false;
    if (typeof action !== "object" || action === null) return false;
    const { object_id, affordance } = action as Record<string, unknown>;
    return typeof object_id === "string" && typeof affordance === "string";
  }

  // Derive the client-facing `InteractionResult` (§3.3 A6) from the commit phase:
  // author-emitted `text`/`reveal` only. `vars`/`primitives` are engine-internal
  // and never surface here (INV-3).
  function interactionResult(commit: CommitResult): InteractionResult {
    const texts = commit.emits
      .map((e) => e.text)
      .filter((t): t is string => t !== undefined);
    const revealed = commit.emits.flatMap((e) => e.reveal ?? []);
    return {
      ...(texts.length > 0 ? { text: texts.join("\n") } : {}),
      ...(revealed.length > 0 ? { revealed } : {}),
    };
  }

  function interact(bodyRaw: string | undefined): ServerResponse {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyRaw ?? "");
    } catch {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "malformed request body",
      );
    }
    if (!isInteractRequest(parsed)) {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "malformed interact request",
      );
    }
    const { session_id, action } = parsed;
    const session = sessions.get(session_id);
    if (session === undefined) {
      return errorResponse(
        specVersion,
        404,
        "unknown_session",
        "unknown session",
      );
    }

    const before = resolveRoom(session);
    if (before === null) {
      return errorResponse(
        specVersion,
        500,
        "internal_error",
        "internal error",
      );
    }

    // Exit-anchoring (§0.9.0 A4): a move initiated through a traversal-capable
    // object anchors `resolveMove` to that exit's target; the client names the
    // object by id, we look it up in this turn's derived exits (same seed +
    // turn_count the client saw, so the exit set is reproduced byte-for-byte).
    const exit = before.resolution.exits.find(
      (e) =>
        e.via_object_id === action.object_id &&
        e.affordance_required === action.affordance,
    );
    const movementAffordances =
      config.ruleset.movement_affordances ?? DEFAULT_MOVEMENT_AFFORDANCES;
    const isMovement = movementAffordances.includes(action.affordance);

    // Every interaction routes through the identical `resolveMove` (§4.1 / §4.4):
    // it runs `evaluateLayers` + the commit phase whether or not a transition
    // results (§3.3 A6). No rule logic lives in the server (INV-1).
    const move = resolveMove(session, graph, config.ruleset.layers, {
      ...(exit ? { anchor: { target_ref: exit.target_entity_id } } : {}),
    });

    // A transition happens only for a movement affordance that resolved somewhere;
    // a local affordance never moves, and a movement that resolves nowhere is a
    // valid "stuck" turn, never an error (§0.11.0 C2).
    const transitioned = isMovement && move.destination !== null;

    // Advance run state — one deterministic turn per well-formed interact (INV-2).
    // Commit-phase writes apply regardless of transition (§4.1 A5); the input log
    // records the player input (§3.9) so the session stays replay-reproducible.
    session.turn_count += 1;
    session.vars = move.commit.vars;
    if (move.commit.ended) session.ended = true;
    session.input_log.push({ kind: "interact", action });
    if (transitioned) {
      const ref = move.destination!.entity.embedding_ref;
      session.position = { vector_ref: ref };
      if (!session.visited_set.includes(ref)) session.visited_set.push(ref);
    }

    const after = resolveRoom(session);
    if (after === null) {
      return errorResponse(
        specVersion,
        500,
        "internal_error",
        "internal error",
      );
    }
    const newRoom = toResolvedRoom(after.room, after.resolution);

    // A movement that resolved nowhere is "stuck" even when the unchanged room
    // still has exits — the interaction, not the room, resolved to nothing (C2).
    const resolution_status: ResolutionStatus =
      isMovement && !transitioned ? "stuck" : newRoom.resolution_status;

    const body: InteractResponse = {
      new_room: { ...newRoom, resolution_status },
      transition_occurred: transitioned,
      interaction_result: interactionResult(move.commit),
      ...(session.ended ? { session_ended: true } : {}),
    };
    return jsonResponse(specVersion, 200, body);
  }

  function handle(req: HttpRequest): ServerResponse {
    let url: URL;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return errorResponse(specVersion, 400, "bad_request", "malformed url");
    }
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "GET" && path === "/session/new") {
      return sessionNew(url.searchParams);
    }
    if (method === "GET" && path === "/room/current") {
      return roomCurrent(url.searchParams);
    }
    if (method === "POST" && path === "/interact") {
      return interact(req.body);
    }
    // No 405 in the §5.1 status set: an unknown route OR an unimplemented
    // method+path is a 404 via the single error envelope.
    return errorResponse(specVersion, 404, "unknown_route", "unknown route");
  }

  return { handle, sessions };
}
