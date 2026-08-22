// packages/server/src/server.ts
//
// SPEC §5.1 / §6.5 — the Phase 4 server core (issue #85). Stands up the read-side
// of the REST contract: `GET /session/new` and `GET /room/current`, over in-memory
// sessions (§6.5 — acceptable for alpha). All resolution is delegated to
// `rule-engine` (`populate`); the server holds NO rule logic of its own.
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

import type { Entity, ResolvedRoomResponse, Ruleset } from "schema";
import {
  createSubstrateGraph,
  populate,
  type Graph,
  type GraphSpan,
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

    // The room is the entity at the session's live position; guaranteed present
    // because `start_ref` was validated at startup and only known refs are set.
    const room = entityByRef.get(session.position.vector_ref);
    if (room === undefined) {
      return errorResponse(
        specVersion,
        500,
        "internal_error",
        "internal error",
      );
    }

    // All resolution is the engine's — the server contributes no rule logic (INV-1).
    const resolved = populate(room, session, graph, config.ruleset.layers);
    const body: ResolvedRoomResponse = {
      room,
      objects: resolved.objects,
      exits: resolved.exits,
      resolution_status: resolved.resolution_status,
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
    // No 405 in the §5.1 status set: an unknown route OR an unimplemented
    // method+path is a 404 via the single error envelope.
    return errorResponse(specVersion, 404, "unknown_route", "unknown route");
  }

  return { handle, sessions };
}
