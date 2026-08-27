// packages/schema/src/errors.ts
//
// SPEC §2.1 ("Config & errors") / §6.7 — the protocol-boundary error taxonomy.
// §2.1 requires that "Protocol-boundary errors (malformed ruleset, missing
// session, network failure) get a typed error taxonomy instead of ad hoc
// throws", built out in Phase 6 hardening. This module is that taxonomy: one
// shared, exported set of error classes every protocol edge raises, so the
// server and both clients react to the same shapes instead of each throwing its
// own way.
//
// It lives in `schema` because it is imported by ALL packages (the server maps
// members to HTTP responses; the clients raise/receive them), the same reason the
// Section 3 types live here (INV-5). These are plain `Error` subclasses — no Node
// or DOM dependency — so `client-threejs` may import them without crossing the
// INV-3 boundary (schema is always allowed; `rule-engine`/`corpus-builder` are
// not).
//
// SCOPE (INV-4). This taxonomy covers PROTOCOL/FORMAT-level failures only —
// a body that will not parse, a session that does not exist, a server that
// cannot be reached, a ruleset that is not even the right SHAPE. It never covers
// authored CONTENT: a well-formed but semantically contradictory ("bad") ruleset
// is legal and must run (INV-4), so it is never a `MalformedRulesetError`.
// Build-time artifact errors (a corrupt `graph.json`, a DSL syntax error) are
// likewise outside it — they are not protocol boundaries. See the header notes on
// `server/src/graph-loader.ts` and `rule-engine/src/parser.ts`.

/** The stable machine token for each protocol-boundary failure (§5.1 envelope `code`). */
export type ProtocolErrorCode =
  | "malformed_ruleset"
  | "unknown_session"
  | "malformed_request"
  | "network_failure";

/**
 * The base of the protocol-boundary taxonomy. Every member carries a stable
 * {@link ProtocolErrorCode} (the discriminant, and the §5.1 envelope `code`) and,
 * for the server-emitted members, the HTTP `httpStatus` the server maps it to.
 * `httpStatus` is `undefined` for a member the server never emits —
 * `network_failure` is raised client-side when no HTTP response was received, so
 * it has no status of its own.
 */
export class ProtocolBoundaryError extends Error {
  readonly code: ProtocolErrorCode;
  readonly httpStatus: number | undefined;
  constructor(
    code: ProtocolErrorCode,
    httpStatus: number | undefined,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions | undefined);
    this.name = "ProtocolBoundaryError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * A ruleset that is not well-formed at load/bind time — the wrong SHAPE (missing
 * `spec_version`, `layers` not an array), NOT incoherent content (INV-4). Raised
 * where a ruleset enters the engine: the dev-mode `POST /session/new` inline
 * binding (→ `400`) and the server's startup `--ruleset` load (→ fail loud).
 */
export class MalformedRulesetError extends ProtocolBoundaryError {
  constructor(message = "malformed ruleset") {
    super("malformed_ruleset", 400, message);
    this.name = "MalformedRulesetError";
  }
}

/** A request naming a `session_id` the server does not hold (→ `404`). */
export class UnknownSessionError extends ProtocolBoundaryError {
  constructor(message = "unknown session") {
    super("unknown_session", 404, message);
    this.name = "UnknownSessionError";
  }
}

/**
 * A request BODY that is absent, not valid JSON, or the wrong shape for its
 * endpoint (`POST /interact`, dev-mode `POST /session/new`) (→ `400`).
 */
export class MalformedRequestError extends ProtocolBoundaryError {
  constructor(message = "malformed request body") {
    super("malformed_request", 400, message);
    this.name = "MalformedRequestError";
  }
}

/**
 * Client-side: the server could not be reached, or the transport itself failed
 * before any HTTP response arrived (connection refused, DNS failure, aborted
 * socket). Distinct from receiving a non-2xx envelope — that is a completed
 * request the client surfaces from the server's `code`. `httpStatus` is
 * `undefined`: there was no response. The originating transport error, when any,
 * is preserved on `cause`.
 */
export class NetworkFailureError extends ProtocolBoundaryError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("network_failure", undefined, message, options);
    this.name = "NetworkFailureError";
  }
}

/** Narrow an unknown thrown value to a taxonomy member. */
export function isProtocolBoundaryError(
  value: unknown,
): value is ProtocolBoundaryError {
  return value instanceof ProtocolBoundaryError;
}
