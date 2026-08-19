import { describe, expect, it } from "vitest";
import { PassthroughComposition, selectComposition } from "./composition";
import { CollectingLogger } from "./instrumentation";
import type { SubstrateSpan } from "./types";

function span(id: string): SubstrateSpan {
  return {
    id,
    source_refs: ["doc:1"],
    source_span: { source: "doc:1", char_ranges: "0-4" },
    prose: "text",
    embedding: [1, 0],
    semantic_tags: [],
    archetype: "prop",
    local_coherence: 1,
  };
}

describe("composition / restructure", () => {
  it("null selector yields passthrough (output === input)", () => {
    const strat = selectComposition(null);
    expect(strat).toBeInstanceOf(PassthroughComposition);
    const spans = [span("a"), span("b")];
    expect(strat.restructure(spans)).toBe(spans);
  });

  it("a named (deferred) strategy is accepted and plumbed, warns, falls through to passthrough", () => {
    const logger = new CollectingLogger();
    const strat = selectComposition("semantic-cluster", logger);
    expect(strat.id).toBe("passthrough");
    expect(logger.warnings()).toContain("composition.strategy_deferred");
  });

  it("a composite span keeps its member ids as provenance (SourceSpan.members)", () => {
    // The data model exists now even though no strategy produces composites yet.
    const composite: SubstrateSpan = {
      ...span("composite:1"),
      source_span: {
        source: "doc:1",
        char_ranges: "0-4,10-14",
        members: ["a", "b"],
      },
    };
    expect(composite.source_span.members).toEqual(["a", "b"]);
  });
});
