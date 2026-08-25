// packages/rule-engine/src/prng.ts
//
// SPEC §4.5 (INV-2) — the determinism spine. All sampling in the engine draws
// from a seeded PRNG whose seed is derived deterministically from
// `(session_seed, normalized_query)` — NEVER wall-clock, `Date.now`,
// `Math.random`, or any external entropy. `turn_count` is NOT a seed component
// (§0.13.0): `normalized_query.origin` carries the discretized position, so the
// seed keys on WHERE the player stands, not how many turns have elapsed.
// Replaying an identical input-log therefore reproduces every substrate result
// byte-for-byte, and a stationary player re-seeds identically (§3.3 A6, §4.5).

import { createHash } from "node:crypto";
import type { Query } from "./query";
import { normalizeQuery } from "./normalized-query";

/**
 * Derive the 32-bit PRNG seed from `(session_seed, normalized_query)`. The two
 * components are joined into a canonical string and hashed; the first four bytes
 * of the digest are the unsigned 32-bit seed. Changing either component changes
 * the seed. `turn_count` is deliberately not a component (§0.13.0).
 */
export function deriveSeed(
  sessionSeed: number,
  normalizedQuery: string,
): number {
  const canonical = `${sessionSeed}:${normalizedQuery}`;
  const digest = createHash("sha256").update(canonical, "utf8").digest();
  return digest.readUInt32BE(0);
}

/**
 * mulberry32 — a small, fast, fully deterministic 32-bit PRNG. Given one seed it
 * yields a fixed sequence of values in `[0, 1)`. This is the ONLY entropy source
 * in the engine (§4.5).
 */
export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compose the full seeding chain for a query: canonicalize + hash the query,
 * derive the seed from `(session_seed, normalized_query)`, and return a fresh
 * seeded PRNG. This is the entry point the solver uses to seed a draw.
 */
export function seededRng(sessionSeed: number, query: Query): () => number {
  return createPrng(deriveSeed(sessionSeed, normalizeQuery(query)));
}
