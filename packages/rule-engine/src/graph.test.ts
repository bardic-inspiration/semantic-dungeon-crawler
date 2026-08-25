// SPEC §4.4 / §0.10.0 (B3) — the substrate `Query` shape honored end to end.
//
// `createSubstrateGraph.query` used to read only `origin`/`radius`/`k`, so two of
// B3's three parameterizations — the gradient (`direction`) and the author
// prefilter (`filter`) — were canonicalized into the seed yet ignored by the
// substrate. These tests pin all three plus the server-internal `embeddingOf`
// accessor.

import { describe, it, expect } from "vitest";
import {
  createSubstrateGraph,
  GRADIENT_BIAS_WEIGHT,
  type GraphSpan,
} from "./graph";
import type { SubstrateSpanView } from "./interpretation";
import type { Query } from "./query";

function makeSpan(
  id: string,
  over: Partial<SubstrateSpanView> = {},
): SubstrateSpanView {
  return {
    id,
    semantic_tags: [],
    archetype: "prop",
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
    ...over,
  };
}

describe("embeddingOf (§3.8 accessor, INV-3)", () => {
  const graph = createSubstrateGraph([
    { span: makeSpan("vec:a"), embedding: [1, 2, 3] },
  ]);

  it("returns a span's embedding by ref", () => {
    expect(graph.embeddingOf("vec:a")).toEqual([1, 2, 3]);
  });

  it("returns null for an unknown ref (never throws)", () => {
    expect(graph.embeddingOf("vec:nope")).toBeNull();
  });

  it("hands back a copy so the index cannot be mutated through it", () => {
    const v = graph.embeddingOf("vec:a")!;
    v[0] = 99;
    expect(graph.embeddingOf("vec:a")).toEqual([1, 2, 3]);
  });
});

describe("Query.direction — gradient bias (§4.4 B3)", () => {
  // Two candidates equidistant from the origin by cosine distance: one displaced
  // "up" from the origin, one "down". `up` is declared SECOND, so a plain query
  // (tie broken by declaration order) ranks `down` first.
  const spans: GraphSpan[] = [
    { span: makeSpan("vec:origin"), embedding: [1, 0] },
    { span: makeSpan("vec:down"), embedding: [1, -0.5] },
    { span: makeSpan("vec:up"), embedding: [1, 0.5] },
  ];
  const graph = createSubstrateGraph(spans);
  const base: Query = { origin: { vector_ref: "vec:origin" }, k: 2 };

  it("without a direction, the equidistant tie breaks by declaration order", () => {
    const ids = graph.query(base).map((c) => c.span.id);
    expect(ids).toEqual(["vec:down", "vec:up"]);
  });

  it("a direction biases ranking toward the aligned candidate", () => {
    const ids = graph
      .query({ ...base, direction: [0, 1] })
      .map((c) => c.span.id);
    expect(ids[0]).toBe("vec:up");
  });

  it("reverses when the gradient points the other way", () => {
    const ids = graph
      .query({ ...base, direction: [0, -1] })
      .map((c) => c.span.id);
    expect(ids[0]).toBe("vec:down");
  });

  it("still reports the RAW cosine distance, not the biased score", () => {
    const up = graph
      .query({ ...base, direction: [0, 1] })
      .find((c) => c.span.id === "vec:up")!;
    // Raw cosine distance of [1,0] vs [1,0.5], unaffected by the bias weight.
    const expected = 1 - 1 / Math.sqrt(1.25);
    expect(up.embedding_distance).toBeCloseTo(expected);
    expect(GRADIENT_BIAS_WEIGHT).toBeGreaterThan(0);
  });

  it("an empty direction vector leaves ranking unbiased", () => {
    const ids = graph.query({ ...base, direction: [] }).map((c) => c.span.id);
    expect(ids).toEqual(["vec:down", "vec:up"]);
  });
});

describe("Query.filter — tag/archetype prefilter (§4.4 B3)", () => {
  const spans: GraphSpan[] = [
    { span: makeSpan("vec:origin"), embedding: [1, 0] },
    {
      span: makeSpan("vec:door", {
        archetype: "portal",
        semantic_tags: ["exit", "wood"],
      }),
      embedding: [0.99, 0.14],
    },
    {
      span: makeSpan("vec:rock", {
        archetype: "prop",
        semantic_tags: ["stone"],
      }),
      embedding: [0.95, 0.31],
    },
    {
      span: makeSpan("vec:gate", {
        archetype: "portal",
        semantic_tags: ["exit", "iron"],
      }),
      embedding: [0.9, 0.44],
    },
  ];
  const graph = createSubstrateGraph(spans);
  const base: Query = { origin: { vector_ref: "vec:origin" }, k: 10 };

  it("narrows the pool by archetype", () => {
    const ids = graph
      .query({ ...base, filter: { archetype: "portal" } })
      .map((c) => c.span.id);
    expect(ids).toEqual(["vec:door", "vec:gate"]);
  });

  it("narrows by tag membership (all tags must be present)", () => {
    const ids = graph
      .query({ ...base, filter: { tags: ["exit"] } })
      .map((c) => c.span.id);
    expect(ids).toEqual(["vec:door", "vec:gate"]);
  });

  it("combines archetype and tags conjunctively", () => {
    const ids = graph
      .query({ ...base, filter: { archetype: "portal", tags: ["iron"] } })
      .map((c) => c.span.id);
    expect(ids).toEqual(["vec:gate"]);
  });

  it("an unrecognized filter shape narrows nothing (INV-4)", () => {
    const ids = graph
      .query({ ...base, filter: "not-a-filter" })
      .map((c) => c.span.id);
    expect(ids).toEqual(["vec:door", "vec:rock", "vec:gate"]);
  });
});

describe("radius stays a raw-distance region cutoff under a gradient", () => {
  const spans: GraphSpan[] = [
    { span: makeSpan("vec:origin"), embedding: [1, 0] },
    { span: makeSpan("vec:near"), embedding: [1, 0.2] },
    { span: makeSpan("vec:far"), embedding: [-1, 0.2] },
  ];
  const graph = createSubstrateGraph(spans);

  it("drops a candidate beyond the radius even when the gradient favors it", () => {
    const ids = graph
      .query({
        origin: { vector_ref: "vec:origin" },
        k: 10,
        radius: 0.5,
        direction: [0, 1],
      })
      .map((c) => c.span.id);
    expect(ids).toContain("vec:near");
    expect(ids).not.toContain("vec:far");
  });
});
