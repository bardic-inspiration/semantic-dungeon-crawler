import { describe, expect, it } from "vitest";
import {
  PassthroughComposition,
  selectComposition,
  type CompositionContext,
  type CompositionStrategy,
} from "./composition";
import { scoreLocalCoherence } from "./coherence";
import { l2Normalize } from "./embedding";
import { FlatIndex } from "./index-flat";
import { CollectingLogger } from "./instrumentation";
import type { SubstrateSpan } from "./types";

function span(id: string, embedding: number[] = [1, 0]): SubstrateSpan {
  return {
    id,
    source_refs: ["doc:1"],
    source_span: { source: "doc:1", char_ranges: "0-4" },
    prose: "text",
    embedding,
    semantic_tags: [],
    archetype: "prop",
    local_coherence: 1,
  };
}

/**
 * A `CompositionContext` over a fixed vector set — the same shape `runBuild`
 * hands the stage, small enough to drive a strategy in isolation. `embed` maps
 * any prose to a fixed (normalized) composite direction so the test is
 * deterministic without a real provider.
 */
function fakeContext(vectors: number[][]): CompositionContext {
  const index = new FlatIndex(vectors);
  const composite = l2Normalize([1, 1]);
  return {
    embed: (texts) => Promise.resolve(texts.map(() => composite)),
    index,
    coherenceK: 4,
    scoreCoherence: (vector) => scoreLocalCoherence(index, vector, 4),
  };
}

describe("composition / restructure", () => {
  it("null selector yields passthrough (output === input)", () => {
    const strat = selectComposition(null);
    expect(strat).toBeInstanceOf(PassthroughComposition);
    const spans = [span("a"), span("b")];
    expect(strat.restructure(spans, fakeContext([[1, 0]]))).toBe(spans);
  });

  it("a named (deferred) strategy is accepted and plumbed, warns, falls through to passthrough", () => {
    const logger = new CollectingLogger();
    const strat = selectComposition("semantic-cluster", logger);
    expect(strat.id).toBe("passthrough");
    expect(logger.warnings()).toContain("composition.strategy_deferred");
  });

  // §0.10.0 B6 (C10) — the seam gives a strategy what a REAL composite needs: it
  // embeds and coherence-scores its own composite through the context, so the
  // emitted span carries a populated `embedding`, `local_coherence`, and
  // `SourceSpan.members`. This proves the seam without shipping a real strategy.
  it("a strategy emits a real composite via the context (embedding + coherence + members)", async () => {
    const a = span("a", l2Normalize([1, 0.1]));
    const b = span("b", l2Normalize([0.9, 0.2]));

    const stub: CompositionStrategy = {
      id: "stub-merge-v1",
      async restructure(spans, ctx) {
        const [first, second] = [spans[0]!, spans[1]!];
        const prose = `${first.prose}\n\n${second.prose}`;
        const [embedding] = await ctx.embed([prose]);
        const composite: SubstrateSpan = {
          id: `composite:${first.id}+${second.id}`,
          source_refs: [...first.source_refs, ...second.source_refs],
          source_span: {
            source: first.source_span.source,
            char_ranges: `${first.source_span.char_ranges},${second.source_span.char_ranges}`,
            members: [first.id, second.id],
          },
          prose,
          embedding: embedding!,
          semantic_tags: [],
          archetype: first.archetype,
          local_coherence: ctx.scoreCoherence(embedding!),
        };
        return [...spans, composite];
      },
    };

    const ctx = fakeContext([a.embedding, b.embedding]);
    const out = await stub.restructure([a, b], ctx);

    expect(out).toHaveLength(3);
    const composite = out[2]!;
    expect(composite.source_span.members).toEqual(["a", "b"]);
    expect(composite.embedding).toHaveLength(2);
    expect(Math.hypot(...composite.embedding)).toBeCloseTo(1, 10);
    expect(composite.local_coherence).toBeGreaterThanOrEqual(0);
    expect(composite.local_coherence).toBeLessThanOrEqual(1);
  });
});
