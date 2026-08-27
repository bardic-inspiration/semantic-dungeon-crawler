// packages/server/src/sessions.ts
//
// SPEC §5.1 / §6.5 / §3.8 / §0.11.0 (C3) — the in-memory session store. A session
// is created by `GET /session/new`, read by `GET /room/current` and
// `POST /interact`, and lives only in memory (§6.5 — a server restart drops every
// session, expected for alpha). Durable storage is post-alpha (§6.8); the Phase-6
// hardening this file now carries is the §0.11.0 (C3) trust-model bound — a bounded
// live-session count with oldest-idle eviction, and idle-TTL eviction — so the
// store cannot grow without bound. This is hardening of the existing surface, NOT
// an auth system (§0.11.0 C3): no accounts, no authentication.
//
// INV-3: `SessionState` is server-internal — it is returned only to the server's
// own code, never serialized to a client. INV-2: the state a fresh session starts
// with is a pure function of its seed and start position, so replay reproduces it.
// The eviction clock (below) is a side channel only — it decides whether a session
// still EXISTS (like a server restart, §6.5), never the resolved JSON of one that
// does, so a replayed input-log still reproduces byte-identical output.

import type { Ruleset, SessionState } from "schema";
import { establishRoot } from "rule-engine";

/**
 * §0.11.0 (C3) default live-session ceiling. A safety cap well above the §4.4
 * reference budget's "single-digit concurrent sessions" — sessions persist across
 * turns until an explicit `DELETE` or an idle timeout, so the bound has to leave
 * headroom for a handful of parallel players plus their not-yet-cleaned-up
 * predecessors, while still keeping the in-memory store bounded. It is a ceiling,
 * not a target.
 */
export const DEFAULT_MAX_SESSIONS = 256;

/**
 * §0.11.0 (C3) default idle TTL: a session unaccessed for 30 minutes is evicted on
 * next touch/sweep. Long enough not to drop a player mid-think in a turn-based game
 * (§5.1's request/response pacing), short enough that an abandoned session does not
 * pin memory indefinitely.
 */
export const DEFAULT_IDLE_TTL_MS = 30 * 60_000;

export interface SessionStoreOptions {
  /** `vector_ref` of the room a fresh session starts positioned in (§A3). */
  startRef: string;
  /** Entropy source for a server-chosen seed (INV-2's entropy boundary). */
  newSeed: () => number;
  /** Unique session-id source. */
  newSessionId: () => string;
  /**
   * §0.11.0 (C3) live-session ceiling. At capacity, creating a session evicts the
   * oldest-idle one first. Defaults to {@link DEFAULT_MAX_SESSIONS}.
   */
  maxSessions?: number;
  /**
   * §0.11.0 (C3) idle TTL in ms. A session not accessed within this window is
   * evicted (lazily, on the next `get` that touches it or the next `create`
   * sweep). Defaults to {@link DEFAULT_IDLE_TTL_MS}.
   */
  idleTtlMs?: number;
  /**
   * Monotonic millisecond clock the store stamps last-activity with (INV-2 side
   * channel — see the file header). Injectable so eviction is deterministic in
   * tests. Defaults to `Date.now`.
   */
  clock?: () => number;
}

export class SessionStore {
  readonly #byId = new Map<string, SessionState>();
  // §0.9.0 (A12) dev-mode per-session ruleset binding. Held out-of-band rather
  // than on `SessionState` — the bound ruleset is server config, not run-state,
  // and never crosses the wire (INV-3). A session with no entry here uses the
  // server-wide ruleset (the non-dev-mode default).
  readonly #rulesetById = new Map<string, Ruleset>();
  // §0.11.0 (C3) — last-activity timestamp per live session (id → clock ms). The
  // key set mirrors `#byId`; a session's entry is refreshed on every `get` and
  // dropped on eviction/`delete`, so the oldest-idle session is the one with the
  // smallest value.
  readonly #activityById = new Map<string, number>();
  readonly #startRef: string;
  readonly #newSeed: () => number;
  readonly #newSessionId: () => string;
  readonly #maxSessions: number;
  readonly #idleTtlMs: number;
  readonly #clock: () => number;

  constructor(options: SessionStoreOptions) {
    this.#startRef = options.startRef;
    this.#newSeed = options.newSeed;
    this.#newSessionId = options.newSessionId;
    this.#maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.#idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.#clock = options.clock ?? Date.now;
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
    // §0.11.0 (C3) — reap anything already idle past the TTL, then, if still at
    // capacity, evict the oldest-idle session before adding another, so the store
    // never exceeds `maxSessions`.
    const now = this.#clock();
    this.#sweepExpired(now);
    while (this.#byId.size >= this.#maxSessions) {
      const oldest = this.#oldestIdleId();
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    const session: SessionState = {
      session_id: this.#newSessionId(),
      session_seed: seed,
      position: { vector_ref: this.#startRef },
      turn_count: 0,
      trace_centroid: null,
      momentum: null,
      path_coherence: 0,
      visited_set: [],
      address_tokens: [],
      current_token: null,
      vars: {},
      registry: [],
      links: [],
      ended: false,
      input_log: [],
    };
    // §0.9.0 (A3): seed the address-token tree with the ROOT token for the start
    // place, so every later move has a parent and `Entity.contains` has a root
    // composite to resolve from. Deterministic from `(seed, start)` (INV-2); the
    // start is not itself "visited" (it enters no `visited_set`).
    establishRoot(session);
    this.#byId.set(session.session_id, session);
    this.#activityById.set(session.session_id, now);
    if (ruleset !== undefined)
      this.#rulesetById.set(session.session_id, ruleset);
    return session;
  }

  /**
   * The stored session for `id`, or `undefined` if unknown or evicted (a `404`
   * upstream). §0.11.0 (C3): an access is activity — a live session's last-activity
   * time is refreshed here, so a continuously-used session never idles out; one
   * already idle past the TTL is evicted lazily on this access and reads back as
   * `undefined` (the same `unknown_session` boundary a never-created id gets).
   */
  get(id: string): SessionState | undefined {
    const session = this.#byId.get(id);
    if (session === undefined) return undefined;
    const now = this.#clock();
    if (this.#isExpired(id, now)) {
      this.delete(id);
      return undefined;
    }
    this.#activityById.set(id, now);
    return session;
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
    this.#activityById.delete(id);
  }

  /** Number of live sessions — for the metrics surface wired in issue #88. */
  get size(): number {
    return this.#byId.size;
  }

  /** §0.11.0 (C3) — a session is expired when it has been idle longer than the TTL. */
  #isExpired(id: string, now: number): boolean {
    const last = this.#activityById.get(id);
    if (last === undefined) return false;
    return now - last > this.#idleTtlMs;
  }

  /** §0.11.0 (C3) — evict every session idle past the TTL (a lazy sweep on create). */
  #sweepExpired(now: number): void {
    // Collect first: deleting the backing maps while iterating them is avoided.
    const expired: string[] = [];
    for (const id of this.#byId.keys()) {
      if (this.#isExpired(id, now)) expired.push(id);
    }
    for (const id of expired) this.delete(id);
  }

  /** §0.11.0 (C3) — the id of the least-recently-active session, or `undefined` if empty. */
  #oldestIdleId(): string | undefined {
    let oldestId: string | undefined;
    let oldestAt = Infinity;
    for (const [id, at] of this.#activityById) {
      if (at < oldestAt) {
        oldestAt = at;
        oldestId = id;
      }
    }
    return oldestId;
  }
}
