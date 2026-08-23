import { describe, expect, it } from "vitest";
import {
  evaluateBuild,
  formatEvalReport,
  parseRegistryText,
  reportEvalMetrics,
} from "./eval";
import { CollectingLogger, InMemoryMetrics } from "./instrumentation";
import { runBuild } from "./pipeline";
import type { ResolvedDocument } from "./sources/types";

// A coherent corpus: every paragraph shares vocabulary and theme, so spans have
// close neighbors (small nearest-neighbor distance).
const COHERENT: ResolvedDocument[] = [
  {
    source_id: "file:forest.txt",
    title: "forest",
    raw_text:
      "The forest was full of tall green trees and a winding river.\n\n" +
      "Trees lined the river, and the forest garden smelled of green leaves.\n\n" +
      "A river of green wound between the trees of the quiet forest.\n\n" +
      "Green trees, a forest garden, and the river under the trees.",
    metadata: {},
  },
];

// A shuffled-noise corpus: each paragraph draws disjoint, unrelated vocabulary,
// so nearest neighbors are far apart — the silent failure mode C4 names.
const NOISE: ResolvedDocument[] = [
  {
    source_id: "file:noise.txt",
    title: "noise",
    raw_text:
      "quartz velvet trombone glacier saffron.\n\n" +
      "pendulum marmalade turbine oyster comet.\n\n" +
      "lantern rhubarb magnet corridor walrus.\n\n" +
      "basalt cinnamon zeppelin thistle nucleus.",
    metadata: {},
  },
];

describe("evaluateBuild — build-quality reporting (C4)", () => {
  it("reports coherence distribution, tag coverage, orphan rate, and NN spread", async () => {
    const { bundle, registryYaml } = await runBuild({ documents: COHERENT });
    const report = evaluateBuild(bundle, parseRegistryText(registryYaml));
    expect(report.span_count).toBe(bundle.spans.length);
    expect(report.local_coherence.count).toBe(bundle.spans.length);
    expect(report.tag_coverage.total_spans).toBe(bundle.spans.length);
    expect(report.tag_orphan_rate.checked_against_registry).toBe(true);
    // Tags were seeded into the registry, so nothing is orphaned.
    expect(report.tag_orphan_rate.orphan_rate).toBe(0);
    expect(report.nearest_neighbor_spread.count).toBe(bundle.spans.length);
  });

  it("distinguishes a coherent corpus from shuffled noise on nearest-neighbor spread", async () => {
    const coherent = evaluateBuild(
      (await runBuild({ documents: COHERENT })).bundle,
    );
    const noise = evaluateBuild((await runBuild({ documents: NOISE })).bundle);
    expect(coherent.nearest_neighbor_spread.mean).toBeLessThan(
      noise.nearest_neighbor_spread.mean,
    );
  });

  it("never throws on a well-formed bundle (reporting, not gating)", async () => {
    const { bundle } = await runBuild({ documents: NOISE });
    expect(() => evaluateBuild(bundle)).not.toThrow();
    expect(() => formatEvalReport(evaluateBuild(bundle))).not.toThrow();
  });

  it("reports through the same Logger/Metrics as the build (§0.11.0 C4)", async () => {
    const { bundle } = await runBuild({ documents: COHERENT });
    const report = evaluateBuild(bundle);
    const logger = new CollectingLogger();
    const metrics = new InMemoryMetrics();
    reportEvalMetrics(report, logger, metrics);
    // A single `info`-level `eval.report` event, mirroring the build's stage events.
    const event = logger.entries.find((e) => e.event === "eval.report");
    expect(event?.level).toBe("info");
    expect(metrics.counters.get("eval.span_count")).toBe(report.span_count);
    expect(metrics.observations.has("eval.nearest_neighbor.mean")).toBe(true);
  });

  it("reports orphan tags when a registry lacks a produced path", async () => {
    const { bundle } = await runBuild({ documents: COHERENT });
    const emptyRegistry = parseRegistryText("substrate_version: sv_x\ntags:\n");
    const report = evaluateBuild(bundle, emptyRegistry);
    if (report.tag_orphan_rate.total_tags > 0) {
      expect(report.tag_orphan_rate.orphan_rate).toBeGreaterThan(0);
    }
  });
});
