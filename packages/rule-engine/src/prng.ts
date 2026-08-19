// packages/rule-engine/src/prng.ts
//
// SPEC §4.5 (INV-2) — the determinism spine. All sampling in the engine draws
// from a seeded PRNG whose seed is derived deterministically from
// `(session_seed, turn_count, normalized_query)` — NEVER wall-clock, `Date.now`,
// `Math.random`, or any external entropy. Replaying an identical input-log
// therefore reproduces every substrate result byte-for-byte (§4.5).

import { createHash } from "node:crypto";
import type { Query } from "./query";
import { normalizeQuery } from "./normalized-query";

/**
 * Derive the 32-bit PRNG seed from `(session_seed, turn_count, normalized_query)`.
 * The three components are joined into a canonical string and hashed; the first
 * four bytes of the digest are the unsigned 32-bit seed. Changing any component
 * changes the seed.
 */
export function deriveSeed(
  sessionSeed: number,
  turnCount: number,
  normalizedQuery: string,
): number {
  const canonical = `${sessionSeed}:${turnCount}:${normalizedQuery}`;
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
 * derive the seed from `(session_seed, turn_count, normalized_query)`, and return
 * a fresh seeded PRNG. This is the entry point the solver uses to seed a draw.
 */
export function seededRng(
  sessionSeed: number,
  turnCount: number,
  query: Query,
): () => number {
  return createPrng(deriveSeed(sessionSeed, turnCount, normalizeQuery(query)));
}
