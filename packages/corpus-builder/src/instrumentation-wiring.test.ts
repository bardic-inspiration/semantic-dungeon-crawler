// SPEC §2.1 / §6.3 — the build pipeline's `Logger`/`Metrics` reporting.
//
// §6.3 requires that "embedding, index-construction, coherence-precompute, and
// tagging each report through the §2.1 `Logger` (start/end, input/output counts,
// warnings) and `Metrics` (duration, counts)", and §2.1 names the build-time
// metrics as "corpus size, build duration, embedding-call count".
//
// A conformance audit found this half-delivered: two stages emitted no `.start`
// event, no duration was ever measured, `embedding.call_count` counted texts
// rather than provider calls, and — because `runBuild` instantiated its own
// `InMemoryMetrics` and discarded it — nothing a caller passed was ever read.

import { describe, it, expect } from "vitest";
import { runBuild } from "./pipeline";
import { CollectingLogger, InMemoryMetrics } from "./instrumentation";
import type { ResolvedDocument } from "./sources/types";

function docs(): ResolvedDocument[] {
  return [
    {
      source_id: "file:a.txt",
      title: "a",
      raw_text: "The forest was full of tall green trees.\n\nA river ran cold.",
      metadata: {},
    },
    {
      source_id: "file:b.txt",
      title: "b",
      raw_text:
        "The market was loud with traders.\n\nStone walls held the square.",
      metadata: {},
    },
  ];
}

describe("§6.3 per-stage instrumentation reaches an injected sink (§2.1)", () => {
  it("emits a start and an end event for every named stage", async () => {
    const logger = new CollectingLogger();
    await runBuild({ documents: docs() }, { logger });

    const events = logger.entries.map((e) => e.event);
    for (const stage of [
      "segmentation",
      "embedding",
      "index_construction",
      "coherence_precompute",
      "tagging",
    ]) {
      expect(events, `${stage}.start`).toContain(`stage.${stage}.start`);
      expect(events, `${stage}.end`).toContain(`stage.${stage}.end`);
    }
  });

  it("records the §2.1 build-time metrics into a caller-supplied sink", async () => {
    const metrics = new InMemoryMetrics();
    await runBuild({ documents: docs() }, { metrics });

    const keys = [...metrics.counters.keys(), ...metrics.observations.keys()];

    // "corpus size" — documents in, spans out.
    expect(keys.some((k) => /corpus|document/.test(k))).toBe(true);
    // "build duration".
    expect(keys.some((k) => /build.*duration|duration.*build/.test(k))).toBe(
      true,
    );
    // "embedding-call count" — PROVIDER CALLS, not texts. One batched `embed()`
    // call covers every span, so counting texts here reported 4 where the answer
    // is 1, which is the number the metric is named for.
    expect(metrics.counters.get("embedding.call_count")).toBe(1);
  });

  it("observes a duration for each stage, not just the build as a whole", async () => {
    const metrics = new InMemoryMetrics();
    await runBuild({ documents: docs() }, { metrics });

    const keys = [...metrics.observations.keys()];
    expect(keys.some((k) => /stage\..*duration/.test(k))).toBe(true);
  });
});
