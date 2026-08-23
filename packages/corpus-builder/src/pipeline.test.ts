import { describe, expect, it } from "vitest";
import { runBuild, serializeBuildTrace, serializeBundle } from "./pipeline";
import { CollectingLogger } from "./instrumentation";
import { inspectNode } from "./inspect";
import { FlatIndex, type IndexFactory } from "./index-flat";
import type { CompositionStrategy } from "./composition";
import type { Tagger, TagResult } from "./tagging";
import type { ResolvedDocument } from "./sources/types";
import type { SubstrateSpan } from "./types";

const CORPUS: ResolvedDocument[] = [
  {
    source_id: "file:alice.txt",
    title: "alice",
    raw_text:
      "Alice walked into the forest and saw a white rabbit.\n\n" +
      "The rabbit said it was late and ran toward the river.\n\n" +
      "She followed it past the trees and down a garden path.",
    metadata: {},
  },
  {
    source_id: "file:market.txt",
    title: "market",
    raw_text:
      "The market set prices for gold and other goods.\n\n" +
      "Trade in the town depended on the value of labour and capital.",
    metadata: {},
  },
];

describe("runBuild — end-to-end substrate pipeline (§6.3)", () => {
  it("produces a bundle with a header, spans, and non-empty source_refs on every span", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    expect(bundle.header.substrate_version).toMatch(/^sv_[0-9a-f]{32}$/);
    expect(bundle.header.dimensions).toBeGreaterThan(0);
    expect(bundle.header.distance).toBe("cosine");
    expect(bundle.header.distance_range).toEqual([0, 2]);
    expect(bundle.spans.length).toBeGreaterThan(0);
    for (const span of bundle.spans) {
      expect(span.source_refs.length).toBeGreaterThan(0);
      // source_refs resolve to a real input document
      expect(CORPUS.some((d) => span.source_refs.includes(d.source_id))).toBe(
        true,
      );
      expect(span.embedding.length).toBe(bundle.header.dimensions);
      expect(span.local_coherence).toBeGreaterThanOrEqual(0);
      expect(span.local_coherence).toBeLessThanOrEqual(1);
    }
  });

  it("L2-normalizes every embedding vector (norm ≈ 1)", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    for (const span of bundle.spans) {
      const norm = Math.sqrt(span.embedding.reduce((a, v) => a + v * v, 0));
      expect(norm).toBeCloseTo(1, 10);
    }
  });

  it("stamps a rebuild-stable substrate_version and byte-identical graph.json (INV-2)", async () => {
    const a = await runBuild({ documents: CORPUS });
    const b = await runBuild({ documents: CORPUS });
    expect(a.bundle.substrate_version).toBe(b.bundle.substrate_version);
    expect(serializeBundle(a.bundle)).toBe(serializeBundle(b.bundle));
  });

  it("changes substrate_version when the corpus changes", async () => {
    const a = await runBuild({ documents: CORPUS });
    const changed = [
      {
        ...CORPUS[0]!,
        raw_text: CORPUS[0]!.raw_text + "\n\nAn extra paragraph.",
      },
      CORPUS[1]!,
    ];
    const b = await runBuild({ documents: changed });
    expect(a.bundle.substrate_version).not.toBe(b.bundle.substrate_version);
  });

  it("seeds tag-registry.yaml stamped with the same substrate_version", async () => {
    const { bundle, registryYaml } = await runBuild({ documents: CORPUS });
    expect(registryYaml).toContain(
      `substrate_version: ${bundle.substrate_version}`,
    );
    expect(registryYaml).toContain("environment");
  });

  it("emits per-stage instrumentation through the Logger", async () => {
    const logger = new CollectingLogger();
    await runBuild({ documents: CORPUS }, { logger });
    const events = logger.entries.map((e) => e.event);
    expect(events).toContain("stage.embedding.end");
    expect(events).toContain("stage.tagging.end");
    expect(events).toContain("stage.coherence_precompute.end");
  });

  it("writes a byte-identical build-trace.json across identical --trace runs", async () => {
    const a = await runBuild({ documents: CORPUS, trace: true });
    const b = await runBuild({ documents: CORPUS, trace: true });
    expect(a.buildTrace).not.toBeNull();
    expect(a.buildTrace!.stages.map((s) => s.stage)).toEqual([
      "embedding",
      "index_construction",
      "tagging",
      "coherence_precompute",
    ]);
    // span_provenance maps every span id to its source doc ids
    for (const [id, refs] of Object.entries(a.buildTrace!.span_provenance)) {
      expect(id.length).toBeGreaterThan(0);
      expect(refs.length).toBeGreaterThan(0);
    }
    expect(serializeBuildTrace(a.buildTrace!)).toBe(
      serializeBuildTrace(b.buildTrace!),
    );
  });

  it("is off by default: no build trace unless --trace", async () => {
    const { buildTrace } = await runBuild({ documents: CORPUS });
    expect(buildTrace).toBeNull();
  });
});

// ── §6.3 / §3.7.3 — every content-determining input is in the build id ───────
//
// "`substrate_version` absorbs the identity of every pinned model/tokenizer, so
// any of them changing is a visible new build id … not a silent drift" (§6.3).
// §3.7.3 keys snapshot staleness off this id, so an input that changes the
// bundle's contents without changing the id makes a stale snapshot report itself
// fresh. A conformance audit found `coherenceK` in exactly that position.

describe("substrate_version covers every content-determining build input (§6.3)", () => {
  const documents = [
    {
      source_id: "file:a.txt",
      title: "a",
      raw_text: "Alpha one.\n\nAlpha two.\n\nAlpha three.\n\nAlpha four.",
      metadata: {},
    },
    {
      source_id: "file:b.txt",
      title: "b",
      raw_text: "Beta one.\n\nBeta two.\n\nBeta three.\n\nBeta four.",
      metadata: {},
    },
  ];

  it("changes when coherenceK changes, because local_coherence changes with it", async () => {
    const a = await runBuild({ documents }, { coherenceK: 1 });
    const b = await runBuild({ documents }, { coherenceK: 3 });

    // Precondition: the two builds really do differ in content. Without this the
    // id assertion below could pass for the wrong reason.
    const coherenceA = a.bundle.spans.map((s) => s.local_coherence);
    const coherenceB = b.bundle.spans.map((s) => s.local_coherence);
    expect(coherenceA).not.toEqual(coherenceB);

    expect(a.bundle.substrate_version).not.toBe(b.bundle.substrate_version);
  });

  it("is unchanged when coherenceK is the same — rebuild stability still holds", async () => {
    const a = await runBuild({ documents }, { coherenceK: 3 });
    const b = await runBuild({ documents }, { coherenceK: 3 });

    expect(a.bundle.substrate_version).toBe(b.bundle.substrate_version);
    expect(serializeBundle(a.bundle)).toBe(serializeBundle(b.bundle));
  });
});

// ── §6.3 (C8/C9/C10) — index and composition are swappable, both actually run ──
//
// The §6.3 stage contract is "every stage is a swappable interface with a
// deterministic default". Before this the built index was discarded and the
// composition stage received no way to embed a composite; these prove the seams
// are wired — a stub index is queried, a stub strategy emits a real composite.

/** A flat index wrapped to count queries, so a test can prove it is actually used. */
function countingIndexFactory(id: string): {
  factory: IndexFactory;
  queryCount: () => number;
} {
  let queries = 0;
  const factory: IndexFactory = {
    id,
    build(vectors) {
      const inner = new FlatIndex(vectors);
      return {
        get size() {
          return inner.size;
        },
        query: (v, k) => (queries++, inner.query(v, k)),
        queryByIndex: (i, k) => (queries++, inner.queryByIndex(i, k)),
      };
    },
  };
  return { factory, queryCount: () => queries };
}

/** A stub strategy that merges the first two spans into one composite via the ctx. */
const mergeFirstTwo: CompositionStrategy = {
  id: "stub-merge-v1",
  async restructure(spans, ctx) {
    if (spans.length < 2) return spans;
    const [a, b] = [spans[0]!, spans[1]!];
    const prose = `${a.prose}\n\n${b.prose}`;
    const [embedding] = await ctx.embed([prose]);
    const composite: SubstrateSpan = {
      id: `composite:${a.id}+${b.id}`,
      source_refs: [...new Set([...a.source_refs, ...b.source_refs])],
      source_span: {
        source: a.source_span.source,
        char_ranges: `${a.source_span.char_ranges},${b.source_span.char_ranges}`,
        members: [a.id, b.id],
      },
      prose,
      embedding: embedding!,
      semantic_tags: [...new Set([...a.semantic_tags, ...b.semantic_tags])],
      archetype: a.archetype,
      local_coherence: ctx.scoreCoherence(embedding!),
    };
    return [...spans, composite];
  },
};

describe("runBuild — swappable index & composition seams (§6.3 C8/C9/C10)", () => {
  it("names the index impl in the header (built on load, not serialized)", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    expect(bundle.header.index).toBe("flat-v1");
    // The bundle carries vectors, not an index structure (C8 decision).
    expect(bundle.spans[0]).not.toHaveProperty("index");
    expect(Array.isArray(bundle.spans[0]!.embedding)).toBe(true);
  });

  it("uses the injected index for the coherence field (it is not discarded)", async () => {
    const { factory, queryCount } = countingIndexFactory("counting-flat-v1");
    const { bundle } = await runBuild(
      { documents: CORPUS },
      { index: factory },
    );
    expect(queryCount()).toBeGreaterThan(0); // coherence queried the injected index
    expect(bundle.header.index).toBe("counting-flat-v1");
  });

  it("drives an injected composition strategy end-to-end, emitting a real composite", async () => {
    const { bundle } = await runBuild(
      { documents: CORPUS },
      { composition: mergeFirstTwo },
    );
    const composite = bundle.spans.find((s) => s.id.startsWith("composite:"));
    expect(composite).toBeDefined();
    // A real composite: populated members, a full-dimension embedding, coherence.
    expect(composite!.source_span.members).toHaveLength(2);
    expect(composite!.embedding).toHaveLength(bundle.header.dimensions);
    expect(composite!.local_coherence).toBeGreaterThanOrEqual(0);
    expect(composite!.local_coherence).toBeLessThanOrEqual(1);

    // Maxed case: the emitted span round-trips through `inspect --node`.
    const rendered = inspectNode(bundle, composite!.id);
    expect(rendered).toContain("composite of:");
    for (const m of composite!.source_span.members!) {
      expect(rendered).toContain(m);
    }
  });

  it("restructure:null stays the default and stays identity/passthrough", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    expect(bundle.header.restructure).toBeNull();
    expect(bundle.spans.some((s) => s.id.startsWith("composite:"))).toBe(false);
  });
});

describe("substrate_version covers the newly-injectable identities (§6.3 C9, criterion 4)", () => {
  it("changes when the index implementation changes (same behavior, different id)", async () => {
    const base = await runBuild({ documents: CORPUS });
    const swapped = await runBuild(
      { documents: CORPUS },
      { index: countingIndexFactory("other-flat-v1").factory },
    );
    expect(base.bundle.substrate_version).not.toBe(
      swapped.bundle.substrate_version,
    );
  });

  it("changes when the composition strategy changes", async () => {
    const base = await runBuild({ documents: CORPUS });
    const swapped = await runBuild(
      { documents: CORPUS },
      { composition: mergeFirstTwo },
    );
    expect(base.bundle.substrate_version).not.toBe(
      swapped.bundle.substrate_version,
    );
  });

  it("stays rebuild-stable and byte-identical with injected deps held fixed (INV-2)", async () => {
    const deps = {
      index: countingIndexFactory("fixed-flat-v1").factory,
      composition: mergeFirstTwo,
    };
    const a = await runBuild({ documents: CORPUS }, deps);
    const b = await runBuild({ documents: CORPUS }, deps);
    expect(a.bundle.substrate_version).toBe(b.bundle.substrate_version);
    expect(serializeBundle(a.bundle)).toBe(serializeBundle(b.bundle));
  });
});

// ── §6.3.1 (#107) — the tagger receives document metadata (incl. title) ────────

describe("runBuild passes document metadata through to the tagger (§6.3.1, #107)", () => {
  it("hands each span its document's metadata with the title folded in", async () => {
    const seen: (Record<string, unknown> | undefined)[] = [];
    const spyTagger: Tagger = {
      id: "spy-tagger-v1",
      tag(_text: string, metadata?: Record<string, unknown>): TagResult {
        seen.push(metadata);
        return { tags: [], archetype: "prop" };
      },
    };

    const documents: ResolvedDocument[] = [
      {
        source_id: "file:doc.txt",
        title: "The Real Title",
        raw_text:
          "A winding river ran through the green forest.\n\n" +
          "Gold coins set the market price of every traded good.",
        metadata: { author: "Ada", subjects: ["fiction"] },
      },
    ];

    await runBuild({ documents }, { tagger: spyTagger });

    expect(seen.length).toBeGreaterThan(0);
    for (const meta of seen) {
      expect(meta).toMatchObject({
        title: "The Real Title",
        author: "Ada",
        subjects: ["fiction"],
      });
    }
  });

  it("the document's title field wins over a metadata.title key", async () => {
    let captured: Record<string, unknown> | undefined;
    const spyTagger: Tagger = {
      id: "spy-tagger-v2",
      tag(_text: string, metadata?: Record<string, unknown>): TagResult {
        captured = metadata;
        return { tags: [], archetype: "prop" };
      },
    };

    const documents: ResolvedDocument[] = [
      {
        source_id: "file:doc.txt",
        title: "Canonical",
        raw_text:
          "A winding river ran through the green forest.\n\n" +
          "Gold coins set the market price of every traded good.",
        metadata: { title: "Stale" },
      },
    ];

    await runBuild({ documents }, { tagger: spyTagger });
    expect(captured?.title).toBe("Canonical");
  });
});
