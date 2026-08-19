import { describe, expect, it } from "vitest";
import { runBuild, serializeBuildTrace, serializeBundle } from "./pipeline";
import { CollectingLogger } from "./instrumentation";
import type { ResolvedDocument } from "./sources/types";

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
