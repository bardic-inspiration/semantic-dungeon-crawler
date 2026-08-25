// packages/rule-engine/src/normalized-query.ts
//
// SPEC §4.5 / §0.10.0 (B3) — `normalized_query`: a canonical, hashed serialization
// of a `Query` (§4.4). It is the second component of the PRNG seed
// (`session_seed`, `normalized_query`) — `turn_count` is not a seed component
// (§0.13.0) — so it MUST be stable across two spellings of the same query, and
// MUST NOT admit any float that could drift between runs. Canonicalization (§4.5):
//
//   - `origin`  — serialized as its `vector_ref` token only, never a raw float
//                 vector (the ref IS the "rounded to the stored index coordinate"
//                 result — floats never reach the seed).
//   - `radius`  — quantized to fixed precision.
//   - `direction` — quantized componentwise, ORDER PRESERVED (a gradient vector).
//   - `filter`  — canonicalized with sorted object keys, and arrays treated as
//                 order-insensitive SETS (tag/archetype prefilters commute).
//   - `k`       — an integer count; serialized as-is.
//
// The canonical string is hashed (SHA-256). Two structurally-equal queries hash
// identically regardless of construction order or float spelling; that is what
// makes the §4.5 replay guarantee well-defined.

import { createHash } from "node:crypto";
import type { Query } from "./query";

// Fixed precision for quantizing floats before they enter the seed. Two float
// spellings that round to the same 1e-6 grid point collapse to one normalized
// query, so float drift cannot fork a replay (§4.5).
export const QUANTIZATION_DECIMALS = 6;

/** Round to fixed precision and normalize `-0` to `0` so spellings agree. */
export function quantize(value: number): number {
  const factor = 10 ** QUANTIZATION_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Canonicalize an author-supplied `filter`: object keys sorted at every level,
 * and arrays sorted by their canonical element form (a filter is a set of
 * tags/archetypes, so member order must not change the seed).
 */
function canonicalizeFilter(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeFilter).sort().join(",") + "]";
  }
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalizeFilter(record[k]))
      .join(",") +
    "}"
  );
}

/** The canonical (pre-hash) serialization — exported for tests and debugging. */
export function canonicalizeQuery(query: Query): string {
  const parts = [
    `origin:${JSON.stringify(query.origin.vector_ref)}`,
    `k:${JSON.stringify(query.k)}`,
    `radius:${query.radius === undefined ? "null" : quantize(query.radius)}`,
    `direction:${
      query.direction === undefined
        ? "null"
        : "[" + query.direction.map(quantize).join(",") + "]"
    }`,
    `filter:${query.filter === undefined ? "null" : canonicalizeFilter(query.filter)}`,
  ];
  return "{" + parts.join(",") + "}";
}

/**
 * `normalized_query` (§4.5): the hashed canonical serialization of a `Query`.
 * Pure function of the query's discretized, canonical form — no wall-clock, no
 * construction-order or float-spelling dependence.
 */
export function normalizeQuery(query: Query): string {
  return createHash("sha256")
    .update(canonicalizeQuery(query), "utf8")
    .digest("hex");
}
