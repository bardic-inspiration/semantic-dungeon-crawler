// packages/corpus-builder/src/composition.ts
//
// SPEC §6.3 (composition step) / §6.3.1 (`restructure` selector) / §0.10.0 B6 —
// an OPTIONAL stage that runs AFTER embedding and tagging (so it can read those
// signals) and produces DISCONTINUOUS COMPOSITE SPANS fed back into the index. A
// composite is still a span; its provenance is its member span ids
// (`SourceSpan.members`, §3.1), mirroring `Entity.contains`.
//
// The DEFAULT (`restructure: null`) is IDENTITY/PASSTHROUGH — contiguous spans
// only, output equals input. The concrete grouping strategies
// (`semantic-cluster`, `thematic-group`, `interleave`) are deferred; the field
// and the composite-span data model exist now so adding a strategy needs NO
// breaking change (§6.3.1). A manifest naming a deferred strategy is ACCEPTED and
// plumbed (it warns and falls through to passthrough), never rejected (INV-4).

import type { Logger } from "./instrumentation";
import type { SubstrateIndex } from "./index-flat";
import type { SubstrateSpan } from "./types";

/**
 * What the composition stage needs to emit a REAL composite (§0.10.0 B6). A
 * composite is a NEW span, so — per §3.1 / `types.ts` `SubstrateSpan` — it must
 * carry an `embedding` and a `local_coherence`, neither of which a strategy can
 * invent: it has to embed its composite prose with the SAME provider the build
 * used, and score it against the SAME index. The context hands it both, plus the
 * neighborhood size, so the stage "feeds composites back into the index" (B6)
 * observably rather than in principle. The default passthrough ignores it.
 */
export interface CompositionContext {
  /** Embed + L2-normalize composite prose with the build's embedding provider. */
  embed(texts: string[]): Promise<number[][]>;
  /** The build's B2 index over the current spans' vectors (for feed-back queries). */
  readonly index: SubstrateIndex;
  /** The B5 neighborhood size, so a composite is coherence-scored like any span. */
  readonly coherenceK: number;
  /** Score a (normalized) composite vector's `local_coherence` against the index. */
  scoreCoherence(vector: number[]): number;
}

export interface CompositionStrategy {
  readonly id: string;
  /**
   * Restructure the embedded/tagged spans, optionally emitting discontinuous
   * composites (§0.10.0 B6). Given a `CompositionContext` so a composite can be
   * embedded and coherence-scored. May be async (embedding is). The default is
   * identity/passthrough (output === input).
   */
  restructure(
    spans: SubstrateSpan[],
    ctx: CompositionContext,
  ): SubstrateSpan[] | Promise<SubstrateSpan[]>;
}

/** Identity strategy — contiguous spans only, output === input (ctx unused). */
export class PassthroughComposition implements CompositionStrategy {
  readonly id = "passthrough";
  restructure(spans: SubstrateSpan[]): SubstrateSpan[] {
    return spans;
  }
}

/**
 * Resolve a manifest `restructure` selector to a strategy. `null` (the default)
 * is passthrough. Any named strategy is currently DEFERRED: it is accepted and
 * plumbed but warns and falls through to passthrough (INV-4 — the build is not
 * rejected for naming a not-yet-implemented strategy).
 */
export function selectComposition(
  restructure: string | null,
  logger?: Logger,
): CompositionStrategy {
  if (restructure === null || restructure === "passthrough") {
    return new PassthroughComposition();
  }
  logger?.log("warn", "composition.strategy_deferred", {
    requested: restructure,
    using: "passthrough",
  });
  return new PassthroughComposition();
}
