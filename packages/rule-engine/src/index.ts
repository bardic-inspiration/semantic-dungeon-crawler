// packages/rule-engine/src/index.ts
//
// SPEC §6.4 (Phase 3) — the rule engine. The determinism spine (#71) provides
// the substrate `Query` shape, `normalized_query` canonicalization, the seeded
// PRNG, and `sample()`; the DSL parser (#72) turns a `predicate`/`scope` string
// into an AST. The solver (`evaluateLayers`/`resolveMove`/`populate`), layer
// resolution, and debug trace land in their own issues (§4.1–§4.3, §4.6).
//
// INV-1: this package is a pure, headless engine — it imports `schema` only, and
// never a rendering library.

export type { Query } from "./query";
export {
  QUANTIZATION_DECIMALS,
  quantize,
  canonicalizeQuery,
  normalizeQuery,
} from "./normalized-query";
export { deriveSeed, createPrng, seededRng } from "./prng";
export { sample } from "./sample";
export type { Draw } from "./sample";

export * from "./parser";
