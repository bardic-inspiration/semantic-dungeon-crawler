// packages/server/src/server.ts
//
// SPEC §5.1 / §6.5 — the Phase 4 server core (issues #85, #86, #87). Stands up the
// full §5.1 REST contract: `GET`/`POST /session/new`, `GET /room/current`,
// `POST /interact`, `GET /session/{id}/log`, `GET /session/{id}/registry`,
// `DELETE /session/{id}`, and `GET /health`, over in-memory sessions (§6.5 —
// acceptable for alpha). All resolution is delegated to `rule-engine` (`populate`
// for a room, `resolveMove` for an interaction); the server holds NO rule logic of
// its own — it only maps HTTP to the engine and back.
//
// INV-1: the server imports no rendering library — it is a headless HTTP contract
// over the engine. INV-3: only resolved JSON (`ResolvedRoomResponse`) leaves the
// server; the substrate embeddings, the graph, `SessionState`, and rule/commit
// internals never appear in a response body — not on the happy path, and not in an
// error envelope. INV-2: a session is reproducible from its seed — `populate` seeds
// on `(session_seed, turn_count, query)`, so two sessions with the same seed resolve
// byte-identical rooms.
//
// §0.9.0 (A12): the substrate is server-wide startup config, and a session binds
// the one server-wide ruleset — except that with dev mode ON, `POST /session/new`
// binds a per-session ruleset (by value or by registered reference); with dev mode
// OFF that endpoint is unavailable. §0.11.0 (C2): a well-formed request that
// resolves to nothing is a `200` "stuck" room, never a `4xx`/`5xx`. §0.11.0 (C3):
// local, single-user, trusted-operator — no auth boundary.

import type {
  AddressLabel,
  AddressRegistryEntry,
  DebugTrace,
  Entity,
  InteractRequest,
  InteractResponse,
  InteractionResult,
  ResolvedRoomResponse,
  Ruleset,
  SessionState,
} from "schema";
import { SPEC_VERSION } from "schema";
import {
  createSubstrateGraph,
  populate,
  resolveMove,
  DEFAULT_MOVEMENT_AFFORDANCES,
  type CommitResult,
  type DebugConfig,
  type Graph,
  type GraphSpan,
  type RoomResolution,
} from "rule-engine";
import { SessionStore } from "./sessions";
import {
  InMemoryMetrics,
  NoopLogger,
  isReadableMetrics,
  type Logger,
  type Metrics,
} from "./instrumentation";
import {
  errorResponse,
  jsonResponse,
  noContentResponse,
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
   * shipped game) means `POST /session/new` per-session ruleset binding is
   * unavailable — that endpoint answers `404` and the server-wide ruleset serves
   * every session. On, it lets a session bind its own ruleset by value or by ref.
   */
  devMode?: boolean;
  /**
   * §0.9.0 (A12) named rulesets a dev-mode `POST /session/new` may bind by
   * reference (`ruleset_ref`). This is what lets the Phase-4 exit criteria
   * round-trip each fixture ruleset (#89) without inlining it. Unused when dev
   * mode is off; an unknown `ruleset_ref` is a `404`.
   */
  rulesetRegistry?: Record<string, Ruleset>;
  /**
   * §4.6 / §2.1 debug flag — SERVER config, never read from a client request
   * (INV-3). On, resolution runs with the debug recorder and `GET /debug/trace`
   * returns the last resolution's `DebugTrace`; off (or omitted) is the
   * zero-overhead hot path — the recorder is never constructed and the endpoint is
   * a `404`. The flag is checked before the recorder is built (§4.6).
   */
  debug?: boolean;
  /**
   * §2.1 / §5.1 metrics flag — gates `GET /metrics`. On, the endpoint returns the
   * `{ counters, gauges }` snapshot from the {@link Metrics} sink; off (or
   * omitted) it is a `404`. The sink still records regardless — this only gates
   * the read endpoint, not the write-side wiring.
   */
  metricsEnabled?: boolean;
  /**
   * §2.1 `Logger` sink the server reports request-boundary events through — the
   * same interface `corpus-builder`/`rule-engine` use, not a parallel mechanism.
   * Injectable (tests pass a `CollectingLogger`); defaults to {@link NoopLogger}.
   */
  logger?: Logger;
  /**
   * §2.1 `Metrics` sink the server records request-boundary counters/gauges
   * through. `GET /metrics` reads its snapshot. Injectable; defaults to a fresh
   * {@link InMemoryMetrics}. A sink that cannot snapshot yields an empty snapshot.
   */
  metrics?: Metrics;
  /**
   * Monotonic millisecond clock for request-latency metrics — a side channel
   * only (INV-2: it never touches resolution output). Injectable so tests get a
   * deterministic snapshot; defaults to `performance.now()`.
   */
  clock?: () => number;
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
  // §5.1 — the `X-Spec-Version` header echoes the ENGINE's running spec_version
  // (§3.5), never the loaded ruleset's. `Ruleset.spec_version` is author-supplied
  // content and INV-4 requires running a ruleset whose version disagrees rather
  // than rejecting it, so sourcing the header from there let author content set
  // the protocol version adapters negotiate against — the one guarantee §5.1
  // hangs on this header ("lets a third-party adapter trust a MINOR version bump
  // to be safe to ignore"). It is also server-wide, not per-session: a dev-mode
  // session binding its own ruleset does not change the protocol.
  const specVersion = SPEC_VERSION;
  const sessions = new SessionStore({
    startRef: start_ref,
    newSeed: config.newSeed ?? defaultSeedSource,
    newSessionId: config.newSessionId ?? counterIdSource(),
  });

  // §2.1 supporting systems, wired in at startup. The server reports through these
  // interfaces; it does not reimplement logging/metrics.
  const logger: Logger = config.logger ?? new NoopLogger();
  const metrics: Metrics = config.metrics ?? new InMemoryMetrics();
  const clock: () => number = config.clock ?? (() => performance.now());

  if (config.ruleset.spec_version !== SPEC_VERSION) {
    // §3.4 says a ruleset's spec_version "must match packages/schema version",
    // but INV-4 forbids rejecting one that doesn't — the same "surface, never
    // reject" stance §3.5/C5 takes for `authored_against`. So: warn and run.
    logger.log("warn", "ruleset.spec_version_mismatch", {
      ruleset: config.ruleset.spec_version,
      engine: SPEC_VERSION,
    });
  }

  // §4.6 debug flag — SERVER config (INV-3). Read once at startup so no per-request
  // path re-reads it, and no client field can flip it. When off, `debugConfig` is
  // `undefined` and the recorder is never constructed (zero overhead, §4.6).
  const debugEnabled = config.debug === true;
  const debugConfig: DebugConfig | undefined = debugEnabled
    ? { enabled: true }
    : undefined;

  // §2.1 — the SAME flag gates elevated log verbosity, not just the trace: "one
  // server-side flag gates both `DebugTrace` construction/exposure and elevated
  // log verbosity." `debugLog` is the gate: with the flag off it is `undefined`,
  // so every debug-level call site is skipped *before* it builds its fields
  // (§4.6's gate-before-construct rule applies to debug logging too — never
  // construct-then-discard). With it on, it is the configured sink.
  const debugLog: Logger | undefined = debugEnabled ? logger : undefined;

  // §4.6 `GET /debug/trace` reads the LAST resolution's trace for a session. Held
  // server-side only (INV-3): a `DebugTrace` is an engine-internal view that leaves
  // the server exclusively through the debug-gated endpoint, never a normal
  // response body. Populated only while debug mode is on.
  const lastTraceBySession = new Map<string, DebugTrace>();

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

  // §3.4 well-formedness (INV-4): a ruleset carries a `spec_version` string and a
  // `layers` array. We validate SHAPE only — a well-formed-but-incoherent ruleset
  // is legal and must run (INV-4), so no coherence check happens here.
  function isRuleset(value: unknown): value is Ruleset {
    if (typeof value !== "object" || value === null) return false;
    const { spec_version, layers } = value as Record<string, unknown>;
    return typeof spec_version === "string" && Array.isArray(layers);
  }

  // §0.9.0 (A12) `POST /session/new` — DEV-MODE ONLY. Binds a per-session ruleset
  // by value (`ruleset`) or by reference (`ruleset_ref`, a server-registered
  // ruleset) and returns `{ session_id, seed }`. With dev mode off the endpoint is
  // unavailable (`404`, via the envelope) and the server-wide ruleset stands.
  function postSessionNew(bodyRaw: string | undefined): ServerResponse {
    if (config.devMode !== true) {
      return errorResponse(
        specVersion,
        404,
        "dev_mode_disabled",
        "developer mode is off",
      );
    }

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
    if (typeof parsed !== "object" || parsed === null) {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "malformed session request",
      );
    }
    const {
      seed: seedRaw,
      ruleset_ref: rulesetRef,
      ruleset: rulesetInline,
    } = parsed as Record<string, unknown>;

    // Seed: an integer if supplied, else server-chosen (INV-2's entropy boundary).
    let seed: number;
    if (seedRaw === undefined) {
      seed = sessions.chooseSeed();
    } else if (typeof seedRaw === "number" && Number.isInteger(seedRaw)) {
      seed = seedRaw;
    } else {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "seed must be an integer",
      );
    }

    // Resolve the per-session ruleset: inline value wins, else a registered ref,
    // else `undefined` (fall back to the server-wide ruleset).
    let bound: Ruleset | undefined;
    if (rulesetInline !== undefined) {
      if (!isRuleset(rulesetInline)) {
        return errorResponse(
          specVersion,
          400,
          "bad_request",
          "malformed ruleset",
        );
      }
      bound = rulesetInline;
    } else if (rulesetRef !== undefined) {
      if (typeof rulesetRef !== "string") {
        return errorResponse(
          specVersion,
          400,
          "bad_request",
          "ruleset_ref must be a string",
        );
      }
      bound = config.rulesetRegistry?.[rulesetRef];
      if (bound === undefined) {
        return errorResponse(
          specVersion,
          404,
          "unknown_ruleset",
          "unknown ruleset_ref",
        );
      }
    }

    const session = sessions.create(seed, bound);
    return jsonResponse(specVersion, 200, {
      session_id: session.session_id,
      seed: session.session_seed,
    });
  }

  // The ruleset a session resolves against: its dev-mode per-session binding
  // (§0.9.0 A12) if any, else the server-wide ruleset. This is the single place
  // resolution reads a ruleset, so both `GET /room/current` and `POST /interact`
  // honor a bound ruleset identically.
  function rulesetFor(session: SessionState): Ruleset {
    return sessions.rulesetFor(session.session_id) ?? config.ruleset;
  }

  // Resolve the room at a session's live position through the engine (INV-1: no
  // rule logic here). `room` is guaranteed present — `start_ref` was validated at
  // startup and every position we set names a known ref — so `null` is a `500`.
  function resolveRoom(
    session: SessionState,
    debug?: DebugConfig,
  ): { room: Entity; resolution: RoomResolution } | null {
    const room = entityByRef.get(session.position.vector_ref);
    if (room === undefined) return null;
    const ruleset = rulesetFor(session);
    const resolution = populate(room, session, graph, ruleset.layers, {
      // §2.1 / §4.3 — the solver's warnings (notably the conflicting-`override`
      // "messy resolution" warn, a §6.4 Exit criterion) are emitted through the
      // §2.1 `Logger`. Without a sink here they were swallowed by the engine's
      // default `NoopLogger` and never reached an operator.
      logger,
      // §3.4 (A4) — the author's movement-affordance designation. Omitted, the
      // engine applies its own defaults; dropped, an author's override silently
      // did nothing.
      ...(ruleset.movement_affordances
        ? { movementAffordances: ruleset.movement_affordances }
        : {}),
      ...(debug ? { debug } : {}),
    });
    debugLog?.log("debug", "room.resolved", {
      session_id: session.session_id,
      turn_count: session.turn_count,
      objects: resolution.objects.length,
      exits: resolution.exits.length,
      resolution_status: resolution.resolution_status,
    });
    return { room, resolution };
  }

  // Retain a resolution's §4.6 trace for `GET /debug/trace`. A no-op when debug
  // mode is off — `trace` is `undefined` because the recorder was never built, so
  // nothing is stored and the endpoint stays a `404`.
  function recordTrace(sessionId: string, trace: DebugTrace | undefined): void {
    if (trace !== undefined) lastTraceBySession.set(sessionId, trace);
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

    const resolved = resolveRoom(session, debugConfig);
    if (resolved === null) {
      return errorResponse(
        specVersion,
        500,
        "internal_error",
        "internal error",
      );
    }
    recordTrace(session.session_id, resolved.resolution.debug);
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
      // §3.3 (A6) — auto-derived from the commit-phase writes, for debug/UX. The
      // engine builds it (it is the only thing that sees the writes); the server
      // passes it through. Author keys/values only, never internals (INV-3).
      ...(commit.effects_summary.length > 0
        ? { effects_summary: commit.effects_summary }
        : {}),
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
    const ruleset = rulesetFor(session);
    const movementAffordances =
      ruleset.movement_affordances ?? DEFAULT_MOVEMENT_AFFORDANCES;
    const isMovement = movementAffordances.includes(action.affordance);

    // Every interaction routes through the identical `resolveMove` (§4.1 / §4.4):
    // it runs `evaluateLayers` + the commit phase whether or not a transition
    // results (§3.3 A6). No rule logic lives in the server (INV-1). The move is the
    // primary resolution of an interaction, so its trace is the one `GET
    // /debug/trace` exposes (the before/after room reads stay debug-off — zero
    // extra work, and no overwrite of the move's trace).
    const resolveStarted = clock();
    const move = resolveMove(session, graph, ruleset.layers, {
      // §2.1 / §4.3 — see `resolveRoom`: the solver reports through this sink.
      logger,
      ...(exit ? { anchor: { target_ref: exit.target_entity_id } } : {}),
      ...(debugConfig ? { debug: debugConfig } : {}),
    });
    recordTrace(session.session_id, move.debug);
    // §2.1 runtime metrics — one resolved turn per well-formed interact (counter),
    // and the rule-evaluation duration per move the section names alongside
    // request latency and active session count. A side channel only: resolution
    // never reads it back (INV-2).
    metrics.increment("interact.turns");
    metrics.observe("resolve.duration_ms", clock() - resolveStarted);

    // A transition happens only for a movement affordance that resolved somewhere;
    // a local affordance never moves, and a movement that resolves nowhere is a
    // valid "stuck" turn, never an error (§0.11.0 C2).
    const transitioned = isMovement && move.destination !== null;
    // §2.1 debug verbosity — gated before the fields are built (§4.6). Operator-
    // facing only: the session's own counters and the resolution status, never
    // candidates, rule text, or embeddings (INV-3).
    debugLog?.log("debug", "interact.resolved", {
      session_id: session.session_id,
      turn_count: session.turn_count,
      transitioned,
      resolution_status: move.resolution_status,
    });

    // Advance run state. Commit-phase writes apply regardless of transition
    // (§4.1 A5); the input log records every player input (§3.9) so the session
    // stays replay-reproducible whether or not the player moved.
    session.vars = move.commit.vars;
    if (move.commit.ended) session.ended = true;
    session.input_log.push({ kind: "interact", action });
    if (transitioned) {
      // §3.3 (A6) requires a non-movement interaction to return "the unchanged
      // room". A room is a function of (position, session_seed, turn_count) via
      // the §4.5 seed, so a stationary player's room is stable only if
      // `turn_count` does not advance while they stand still — advancing it and
      // re-resolving re-sampled `objects[]`, and reading a book handed the player
      // a differently-populated room.
      //
      // §3.8 does not define when `turn_count` advances, so this is derived from
      // the A6 constraint rather than stated: it counts turns that CHANGED
      // POSITION. A blocked move does not advance it either, for the same reason
      // — the player is still standing in the same room.
      session.turn_count += 1;
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

    // §0.12.0 — a movement affordance that resolved nowhere is reported on its
    // own field. It used to overwrite `new_room.resolution_status`, which made
    // `POST /interact` and an immediately-following `GET /room/current` disagree
    // about the same room; §3.3 requires `new_room` to be a full re-resolution
    // identical to what that GET would return.
    const movementBlocked = isMovement && !transitioned;

    const body: InteractResponse = {
      new_room: newRoom,
      transition_occurred: transitioned,
      interaction_result: interactionResult(move.commit),
      ...(session.ended ? { session_ended: true } : {}),
      ...(movementBlocked ? { movement_blocked: true } : {}),
    };
    return jsonResponse(specVersion, 200, body);
  }

  // §0.9.0 (A9) `GET /session/{id}/log` — the accumulated `InputLogEntry[]` (§3.9)
  // for replay/diff. It carries only player/author INPUTS (INV-2): rule-driven
  // scratch/overlay writes are deterministic consequences and re-derive on replay,
  // so they are not in the log.
  function sessionLog(sessionId: string): ServerResponse {
    const session = sessions.get(sessionId);
    if (session === undefined) {
      return errorResponse(
        specVersion,
        404,
        "unknown_session",
        "unknown session",
      );
    }
    return jsonResponse(specVersion, 200, session.input_log);
  }

  // §0.9.0 (A10) the client-facing projection of a player-provenance registry
  // entry: its `tag` and a display `label`, nothing else. No authored label field
  // exists yet, so the label defaults to the tag — a deterministic identity view.
  function toAddressLabel(entry: AddressRegistryEntry): AddressLabel {
    return { tag: entry.tag, label: entry.tag };
  }

  // §0.9.0 (A10) `GET /session/{id}/registry` — `AddressLabel[]` of PLAYER-
  // provenance entries only. The registry's `points_to` references, snapshot
  // payloads, and build/author entries are engine internals and never surface
  // (INV-3 refinement, §0): only the player's own names/labels cross the wire.
  function sessionRegistry(sessionId: string): ServerResponse {
    const session = sessions.get(sessionId);
    if (session === undefined) {
      return errorResponse(
        specVersion,
        404,
        "unknown_session",
        "unknown session",
      );
    }
    const labels = session.registry
      .filter((entry) => entry.provenance === "player")
      .map(toAddressLabel);
    return jsonResponse(specVersion, 200, labels);
  }

  // §5.1 `DELETE /session/{id}` — free the in-memory session. Idempotent by
  // design: deleting an unknown or already-deleted session is still a `204`, never
  // a `404`, so a client can tear down without first checking existence.
  function sessionDelete(sessionId: string): ServerResponse {
    sessions.delete(sessionId);
    // Drop any retained debug trace alongside the session — it can never be served
    // once the session is gone (the endpoint 404s on unknown sessions), and this
    // keeps the trace map bounded by live sessions.
    lastTraceBySession.delete(sessionId);
    return noContentResponse(specVersion);
  }

  // §5.1 `GET /health` — liveness/readiness (§6.7). A static, session-independent
  // `{ status: "ok" }`; it still carries `X-Spec-Version` like every response.
  function health(): ServerResponse {
    return jsonResponse(specVersion, 200, { status: "ok" });
  }

  // §4.6 / §5.1 `GET /debug/trace?session_id={id}` — the last resolution's
  // `DebugTrace`, DEBUG-MODE ONLY. The flag is checked FIRST: with debug off the
  // endpoint is a `404` and no trace work was ever done (zero overhead, §4.6 — the
  // recorder is never constructed). The flag is server config, never a request
  // field (INV-3): nothing in the query can turn debug on.
  function debugTrace(params: URLSearchParams): ServerResponse {
    if (!debugEnabled) {
      return errorResponse(
        specVersion,
        404,
        "debug_disabled",
        "debug endpoint is disabled",
      );
    }
    const sessionId = params.get("session_id");
    if (sessionId === null || sessionId === "") {
      return errorResponse(
        specVersion,
        400,
        "bad_request",
        "session_id is required",
      );
    }
    if (sessions.get(sessionId) === undefined) {
      return errorResponse(
        specVersion,
        404,
        "unknown_session",
        "unknown session",
      );
    }
    const trace = lastTraceBySession.get(sessionId);
    if (trace === undefined) {
      return errorResponse(
        specVersion,
        404,
        "no_trace",
        "no resolution has been traced for this session",
      );
    }
    return jsonResponse(specVersion, 200, trace);
  }

  // §2.1 / §5.1 `GET /metrics` — the `{ counters, gauges }` snapshot from the §2.1
  // `Metrics` interface, METRICS-MODE ONLY (`404` when disabled). A sink that
  // cannot snapshot (a custom write-only `Metrics`) yields an empty snapshot.
  function metricsEndpoint(): ServerResponse {
    if (config.metricsEnabled !== true) {
      return errorResponse(
        specVersion,
        404,
        "metrics_disabled",
        "metrics endpoint is disabled",
      );
    }
    const snapshot = isReadableMetrics(metrics)
      ? metrics.snapshot()
      : { counters: {}, gauges: {} };
    return jsonResponse(specVersion, 200, snapshot);
  }

  // The pure routing core. `handle` wraps it with §2.1 request-boundary
  // instrumentation; keeping dispatch separate means the logger/metrics side
  // channel sees every route uniformly and can never alter a response (INV-2).
  function dispatch(req: HttpRequest): ServerResponse {
    let url: URL;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return errorResponse(specVersion, 400, "bad_request", "malformed url");
    }
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "GET" && path === "/health") {
      return health();
    }
    if (method === "GET" && path === "/metrics") {
      return metricsEndpoint();
    }
    if (method === "GET" && path === "/debug/trace") {
      return debugTrace(url.searchParams);
    }
    if (path === "/session/new") {
      if (method === "GET") return sessionNew(url.searchParams);
      if (method === "POST") return postSessionNew(req.body);
    }
    if (method === "GET" && path === "/room/current") {
      return roomCurrent(url.searchParams);
    }
    if (method === "POST" && path === "/interact") {
      return interact(req.body);
    }

    // Parameterized `/session/{id}[/log|/registry]` routes (§5.1). Split into
    // segments so the `{id}` is a real path parameter, not a query field.
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments[0] === "session" && segments.length >= 2) {
      const sessionId = decodeURIComponent(segments[1]!);
      if (segments.length === 3 && method === "GET" && segments[2] === "log") {
        return sessionLog(sessionId);
      }
      if (
        segments.length === 3 &&
        method === "GET" &&
        segments[2] === "registry"
      ) {
        return sessionRegistry(sessionId);
      }
      if (segments.length === 2 && method === "DELETE") {
        return sessionDelete(sessionId);
      }
    }

    // No 405 in the §5.1 status set: an unknown route OR an unimplemented
    // method+path is a 404 via the single error envelope.
    return errorResponse(specVersion, 404, "unknown_route", "unknown route");
  }

  // §2.1 request boundary — the one place `Logger`/`Metrics` are invoked, so every
  // route is instrumented identically through the shared interfaces. This is a
  // pure side channel: it reads the response only to report it and never mutates
  // it, and resolution never reads any of this back (INV-2). Only operator-facing
  // request metadata is recorded — method, path, status — never engine internals
  // (INV-3).
  function handle(req: HttpRequest): ServerResponse {
    const started = clock();
    const response = dispatch(req);
    metrics.increment("http.requests");
    metrics.observe("http.request.duration_ms", clock() - started);
    metrics.observe("sessions.active", sessions.size);
    logger.log("info", "http.request", {
      method: req.method.toUpperCase(),
      url: req.url,
      status: response.status,
    });
    return response;
  }

  return { handle, sessions };
}
