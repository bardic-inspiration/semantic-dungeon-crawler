// packages/server/src/http-contract.ts
//
// SPEC §5.1 base contract — the transport-agnostic response shape and the two
// builders every endpoint returns through. Centralizing them here is what makes
// the contract uniform: every response is `application/json`, carries the
// `X-Spec-Version` header (§3.5), and every error uses the single envelope
// `{ error: { code, message } }` (INV-3 — a `message` only, never ruleset text,
// graph data, or a stack trace).

import type { ProtocolBoundaryError } from "schema";

/** A fully-formed HTTP response, independent of any transport (`node:http`, a test). */
export interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  /** Serialized JSON body — `application/json` on every response (§5.1). */
  body: string;
}

function baseHeaders(specVersion: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // §5.1 — echoes the running spec_version on EVERY response, errors included.
    "X-Spec-Version": specVersion,
  };
}

/** A `200`/success JSON response carrying `payload` as its body. */
export function jsonResponse(
  specVersion: string,
  status: number,
  payload: unknown,
): ServerResponse {
  return {
    status,
    headers: baseHeaders(specVersion),
    body: JSON.stringify(payload),
  };
}

/**
 * A `204 No Content` response (session deletion, §5.1). Carries no body — but
 * still echoes `X-Spec-Version`, which the base contract requires on EVERY
 * response, errors and empty bodies included.
 */
export function noContentResponse(specVersion: string): ServerResponse {
  return {
    status: 204,
    headers: baseHeaders(specVersion),
    body: "",
  };
}

/**
 * An error response using the single §5.1 envelope. `code` is a stable machine
 * token; `message` is a short human string. Neither ever carries engine internals
 * (INV-3) — callers pass only safe, static strings.
 */
export function errorResponse(
  specVersion: string,
  status: number,
  code: string,
  message: string,
): ServerResponse {
  return {
    status,
    headers: baseHeaders(specVersion),
    body: JSON.stringify({ error: { code, message } }),
  };
}

/**
 * Map a {@link ProtocolBoundaryError} to its §5.1 error envelope (§2.1 / §6.7).
 * The taxonomy member owns its HTTP status and stable `code`, so every handler
 * that raises one produces an identical, documented response instead of an ad hoc
 * throw. Only the server-emitted members are ever passed here — each carries a
 * numeric `httpStatus`; the client-only `network_failure` has none and never
 * reaches the server, so it falls back to `500` defensively (it cannot occur).
 */
export function protocolErrorResponse(
  specVersion: string,
  error: ProtocolBoundaryError,
): ServerResponse {
  return errorResponse(
    specVersion,
    error.httpStatus ?? 500,
    error.code,
    error.message,
  );
}
