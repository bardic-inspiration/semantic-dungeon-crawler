// packages/server/src/sessions.ts
//
// SPEC §5.1 / §6.5 / §3.8 — the in-memory session store. A session is created by
// `GET /session/new`, read by `GET /room/current` (and, later, `POST /interact`),
// and lives only in memory (§6.5 — a server restart drops every session, expected
// for alpha). Durable storage and TTL/count eviction are post-alpha hardening
// (§6.7/§6.8), explicitly out of this scaffold's scope.
//
// INV-3: `SessionState` is server-internal — it is returned only to the server's
// own code, never serialized to a client. INV-2: the state a fresh session starts
// with is a pure function of its seed and start position, so replay reproduces it.

import type { Ruleset, SessionState } from "schema";

export interface SessionStoreOptions {
  /** `vector_ref` of the room a fresh session starts positioned in (§A3). */
  startRef: string;
  /** Entropy source for a server-chosen seed (INV-2's entropy boundary). */
  newSeed: () => number;
  /** Unique session-id source. */
  newSessionId: () => string;
}

export class SessionStore {
  readonly #byId = new Map<string, SessionState>();
  // §0.9.0 (A12) dev-mode per-session ruleset binding. Held out-of-band rather
  // than on `SessionState` — the bound ruleset is server config, not run-state,
  // and never crosses the wire (INV-3). A session with no entry here uses the
  // server-wide ruleset (the non-dev-mode default).
  readonly #rulesetById = new Map<string, Ruleset>();
  readonly #startRef: string;
  readonly #newSeed: () => number;
  readonly #newSessionId: () => string;

  constructor(options: SessionStoreOptions) {
    this.#startRef = options.startRef;
    this.#newSeed = options.newSeed;
    this.#newSessionId = options.newSessionId;
  }

  /** Draw a server-chosen seed for a `GET /session/new` that omitted one. */
  chooseSeed(): number {
    return this.#newSeed();
  }

  /**
   * Create and store a fresh session bound to `seed`. A new session starts at the
   * server-wide start position with an empty run-state (§3.8): zero turns, no
   * overlay, no scratch vars — every field a deterministic consequence of the
   * seed, so `(seed)` alone reproduces the session (INV-2).
   *
   * `ruleset` binds a dev-mode per-session ruleset (§0.9.0 A12); omit it and the
   * session resolves against the server-wide ruleset ({@link rulesetFor} returns
   * `undefined` so the server falls back).
   */
  create(seed: number, ruleset?: Ruleset): SessionState {
    const session: SessionState = {
      session_id: this.#newSessionId(),
      session_seed: seed,
      position: { vector_ref: this.#startRef },
      turn_count: 0,
      trace_centroid: null,
      momentum: null,
      path_coherence: 0,
      visited_set: [],
      vars: {},
      registry: [],
      links: [],
      ended: false,
      input_log: [],
    };
    this.#byId.set(session.session_id, session);
    if (ruleset !== undefined)
      this.#rulesetById.set(session.session_id, ruleset);
    return session;
  }

  /** The stored session for `id`, or `undefined` if unknown (a `404` upstream). */
  get(id: string): SessionState | undefined {
    return this.#byId.get(id);
  }

  /**
   * The dev-mode ruleset bound to `id` at creation (§0.9.0 A12), or `undefined`
   * when the session uses the server-wide ruleset. Server-internal (INV-3).
   */
  rulesetFor(id: string): Ruleset | undefined {
    return this.#rulesetById.get(id);
  }

  /**
   * Free a session's in-memory state (`DELETE /session/{id}`, §5.1). Idempotent
   * by design: deleting an unknown or already-deleted session is a no-op, so the
   * endpoint can always answer `204` (§5.1).
   */
  delete(id: string): void {
    this.#byId.delete(id);
    this.#rulesetById.delete(id);
  }

  /** Number of live sessions — for the metrics surface wired in issue #88. */
  get size(): number {
    return this.#byId.size;
  }
}
