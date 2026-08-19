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
import type { SubstrateSpan } from "./types";

export interface CompositionStrategy {
  readonly id: string;
  restructure(spans: SubstrateSpan[]): SubstrateSpan[];
}

/** Identity strategy — contiguous spans only, output === input. */
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
