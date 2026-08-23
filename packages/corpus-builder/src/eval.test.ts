import { describe, expect, it } from "vitest";
import {
  DEFAULT_NN_K,
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

// ── C4 (#107) — nearest-neighbour spread is a k-NN distribution ────────────────

describe("nearest-neighbour spread uses a documented k-NN default (C4, #107)", () => {
  it("exports a sensible default k", () => {
    expect(DEFAULT_NN_K).toBeGreaterThanOrEqual(1);
  });

  it("keeps one value per span (count === span count) at the default k", async () => {
    const { bundle } = await runBuild({ documents: COHERENT });
    const report = evaluateBuild(bundle);
    expect(report.nearest_neighbor_spread.count).toBe(bundle.spans.length);
  });

  it("still distinguishes coherent from noise at k=1 and at a larger k", async () => {
    const coherent = (await runBuild({ documents: COHERENT })).bundle;
    const noise = (await runBuild({ documents: NOISE })).bundle;
    for (const k of [1, 3]) {
      expect(
        evaluateBuild(coherent, undefined, k).nearest_neighbor_spread.mean,
      ).toBeLessThan(
        evaluateBuild(noise, undefined, k).nearest_neighbor_spread.mean,
      );
    }
  });

  it("a degenerate k (< 1) is clamped, never throws", async () => {
    const { bundle } = await runBuild({ documents: COHERENT });
    expect(() => evaluateBuild(bundle, undefined, 0)).not.toThrow();
    expect(
      evaluateBuild(bundle, undefined, 0).nearest_neighbor_spread.count,
    ).toBe(bundle.spans.length);
  });
});

// ── C4 (#107) — orphan rate is a drift signal, not a build-quality one ─────────

describe("tag orphan rate reflects registry drift, not build quality (C4, #107)", () => {
  it("is structurally 0 for a build checked against its own registry", async () => {
    const { bundle, registryYaml } = await runBuild({ documents: COHERENT });
    const report = evaluateBuild(bundle, parseRegistryText(registryYaml));
    expect(report.tag_orphan_rate.checked_against_registry).toBe(true);
    expect(report.tag_orphan_rate.orphan_rate).toBe(0);
  });

  it("only fires against a stale/hand-edited registry missing a produced path", async () => {
    const { bundle } = await runBuild({ documents: COHERENT });
    const stale = parseRegistryText("substrate_version: sv_x\ntags:\n");
    const report = evaluateBuild(bundle, stale);
    // COHERENT produces tags, so an empty registry orphans all of them.
    expect(report.tag_orphan_rate.total_tags).toBeGreaterThan(0);
    expect(report.tag_orphan_rate.orphan_rate).toBeGreaterThan(0);
  });
});
