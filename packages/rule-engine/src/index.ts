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
export {
  evaluate,
  evaluateValueExpression,
  matchesTagPattern,
} from "./evaluate";
export type { EntityCandidate, EvalBindings } from "./evaluate";

// §0.9.0 (A13) — the interpretation lookup: the producer for the half of
// `Entity` (§3.1) the substrate does not carry.
export {
  DEFAULT_INTERPRETATION,
  resolveInterpretation,
  mintEntity,
} from "./interpretation";
export type {
  SubstrateSpanView,
  ResolvedInterpretation,
} from "./interpretation";

export {
  resolutionOrder,
  resolveLayers,
  OVERRIDE_CONFLICT_EVENT,
} from "./layer-resolution";
export type {
  HardDecision,
  LayerEffects,
  Resolution,
} from "./layer-resolution";
export { NoopLogger, CollectingLogger } from "./instrumentation";
export type { LogLevel, Logger } from "./instrumentation";

export { createDebugTrace, DebugTraceRecorder } from "./debug-trace";
export type { DebugConfig } from "./debug-trace";

export type { Graph, GraphSpan } from "./graph";
export { createSubstrateGraph } from "./graph";

export {
  evaluateLayers,
  solverCore,
  resolveMove,
  populate,
  MAX_ROOM_OBJECTS,
  DEFAULT_QUERY_K,
  DEFAULT_MOVEMENT_AFFORDANCES,
} from "./solver";
export type {
  WeightedCandidate,
  EvaluateLayersResult,
  CommitResult,
  MoveResolution,
  RoomResolution,
  ResolveMoveOptions,
  PopulateOptions,
  PreparedRule,
  PreparedLayer,
} from "./solver";
