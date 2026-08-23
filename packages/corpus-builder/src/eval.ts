// packages/corpus-builder/src/eval.ts
//
// SPEC §6.3 (§0.11.0 C4 evaluation block) — `corpus-builder eval --graph G`
// REPORTS build quality; it NEVER gates a build (INV-4 untouched: an offline
// harness measuring the project's own build is not the runtime engine rejecting
// authored content). It is a sibling of `inspect`, reusing the same
// `Logger`/`Metrics`/`--verbosity` conventions.
//
// Named signal vocabulary (C4): LOCAL-COHERENCE DISTRIBUTION (spread of the B5
// field), TAG COVERAGE / ORPHAN RATE (fraction of spans the tagger reached;
// fraction of tags orphaned against `tag-registry.yaml`), and NEAREST-NEIGHBOR
// SPREAD (k-NN cosine-distance distribution — what makes a shuffled-noise corpus
// visibly distinguishable from a coherent one, the silent failure mode C4 names).
//
// ORPHAN RATE — a scope note (#107). The DEFAULT pipeline seeds
// `tag-registry.yaml` from the corpus's own tags (`pipeline.ts`), so a build's
// own registry can never orphan its own tags: the orphan rate is structurally 0
// for a matched (bundle, registry) pair. It is a DRIFT signal, not a build-quality
// signal: it only fires when `evaluateBuild` is handed a HAND-EDITED or STALE
// registry that no longer lists a path the substrate still produces (the C5
// "orphaned reference after a rebuild" case). `checked_against_registry` records
// whether any registry was supplied at all.

import { parseTag } from "schema";
import { FlatIndex } from "./index-flat";
import { parseTagRegistry, type ParsedRegistry } from "./tag-registry";
import { DETAIL_RANK, type Verbosity } from "./inspect";
import type { Logger, Metrics } from "./instrumentation";
import type { SubstrateBundle } from "./types";

/**
 * Default `k` for the nearest-neighbour spread (C4: "k-NN cosine-distance
 * distribution", #107). Each span contributes the MEAN cosine distance to its `k`
 * nearest neighbours; `k = 1` recovers the single-nearest spread. A small `k`
 * keeps the signal local (a coherent corpus keeps a tight neighbourhood, noise
 * does not) without averaging the whole corpus away.
 */
export const DEFAULT_NN_K = 5;

export interface Distribution {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface EvalReport {
  span_count: number;
  local_coherence: Distribution;
  tag_coverage: { tagged_spans: number; total_spans: number; coverage: number };
  tag_orphan_rate: {
    total_tags: number;
    orphan_tags: number;
    /**
     * Fraction of produced tags absent from the supplied registry. A DRIFT signal,
     * not a build-quality one (#107): structurally 0 for a matched (bundle,
     * registry) pair, since the default pipeline seeds the registry from the same
     * tags — it fires only against a hand-edited or stale registry.
     */
    orphan_rate: number;
    checked_against_registry: boolean;
  };
  nearest_neighbor_spread: Distribution;
}

function distribution(values: number[]): Distribution {
  if (values.length === 0)
    return { count: 0, min: 0, max: 0, mean: 0, median: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, v) => a + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
    median,
  };
}

/**
 * Compute the build-quality report. Pure and total on a well-formed bundle — it
 * never throws on legal input (reporting, not gating). Pass the parsed
 * `tag-registry.yaml` to compute an orphan rate against the vocabulary contract
 * (a drift signal — see the module header). `nnK` sets the nearest-neighbour
 * spread's `k` (C4's k-NN distribution); defaults to {@link DEFAULT_NN_K}.
 */
export function evaluateBuild(
  bundle: SubstrateBundle,
  registry?: ParsedRegistry,
  nnK: number = DEFAULT_NN_K,
): EvalReport {
  const spans = bundle.spans;

  const localCoherence = distribution(spans.map((s) => s.local_coherence));

  const taggedSpans = spans.filter((s) => s.semantic_tags.length > 0).length;

  const allTags = spans.flatMap((s) => s.semantic_tags);
  let orphanTags = 0;
  const checked = registry !== undefined;
  if (checked) {
    for (const tag of allTags) {
      const parsed = parseTag(tag);
      const path = parsed ? parsed.segments.join(":") : tag;
      if (!registry!.paths.has(path)) orphanTags++;
    }
  }

  // Nearest-neighbour spread: for each span, the MEAN cosine distance to its `k`
  // nearest neighbours (C4: "k-NN cosine-distance distribution", #107). One value
  // per span keeps the distribution's `count` equal to the span count; a coherent
  // corpus shows a smaller mean than shuffled noise (the silent failure mode C4
  // names). `k = 1` recovers the single-nearest spread. A span with fewer than `k`
  // neighbours available averages over what it has.
  const k = Math.max(1, Math.floor(nnK));
  const vectors = spans.map((s) => s.embedding);
  const nnDistances: number[] = [];
  if (vectors.length > 1) {
    const index = new FlatIndex(vectors);
    for (let i = 0; i < vectors.length; i++) {
      const neighbors = index.queryByIndex(i, k);
      if (neighbors.length === 0) continue;
      const mean =
        neighbors.reduce((sum, nb) => sum + nb.distance, 0) / neighbors.length;
      nnDistances.push(mean);
    }
  }

  return {
    span_count: spans.length,
    local_coherence: localCoherence,
    tag_coverage: {
      tagged_spans: taggedSpans,
      total_spans: spans.length,
      coverage: spans.length === 0 ? 0 : taggedSpans / spans.length,
    },
    tag_orphan_rate: {
      total_tags: allTags.length,
      orphan_tags: orphanTags,
      orphan_rate: allTags.length === 0 ? 0 : orphanTags / allTags.length,
      checked_against_registry: checked,
    },
    nearest_neighbor_spread: distribution(nnDistances),
  };
}

/** Parse a registry file's text into the structure `evaluateBuild` expects. */
export function parseRegistryText(text: string): ParsedRegistry {
  return parseTagRegistry(text);
}

function fmt(d: Distribution): string {
  return `n=${d.count} min=${d.min.toFixed(4)} mean=${d.mean.toFixed(4)} median=${d.median.toFixed(4)} max=${d.max.toFixed(4)}`;
}

/**
 * Emit the report through the SAME `Logger`/`Metrics` as the build (§0.11.0 C4:
 * `eval` is "a sibling of `corpus-builder inspect` reusing the same
 * `Logger`/`Metrics` and `--verbosity` conventions"). Side-channel only — it never
 * gates the build (INV-4) and its return value is ignored by callers.
 */
export function reportEvalMetrics(
  report: EvalReport,
  logger: Logger,
  metrics: Metrics,
): void {
  metrics.increment("eval.span_count", report.span_count);
  metrics.observe("eval.local_coherence.mean", report.local_coherence.mean);
  metrics.observe(
    "eval.nearest_neighbor.mean",
    report.nearest_neighbor_spread.mean,
  );
  logger.log("info", "eval.report", {
    span_count: report.span_count,
    tag_coverage: report.tag_coverage.coverage,
    orphan_rate: report.tag_orphan_rate.orphan_rate,
    nearest_neighbor_mean: report.nearest_neighbor_spread.mean,
  });
}

/** Human-readable report for the CLI. `eval` never fails a build — this only prints. */
export function formatEvalReport(
  report: EvalReport,
  verbosity: Verbosity = "warn",
): string {
  const cov = report.tag_coverage;
  const orphan = report.tag_orphan_rate;
  const lines = [
    `Build-quality report — ${report.span_count} span(s)`,
    `  local-coherence distribution:  ${fmt(report.local_coherence)}`,
    `  tag coverage:                  ${cov.tagged_spans}/${cov.total_spans} (${(cov.coverage * 100).toFixed(1)}%)`,
    `  tag orphan rate:               ${
      orphan.checked_against_registry
        ? `${orphan.orphan_tags}/${orphan.total_tags} (${(orphan.orphan_rate * 100).toFixed(1)}%)`
        : "(no registry supplied)"
    }`,
    `  nearest-neighbor spread:       ${fmt(report.nearest_neighbor_spread)}`,
  ];
  if (DETAIL_RANK[verbosity] >= DETAIL_RANK.debug) {
    lines.push(
      `  (a coherent corpus shows a smaller nearest-neighbor mean than shuffled noise — C4)`,
    );
  }
  lines.push("", "This report never gates the build (INV-4; C4).");
  return lines.join("\n");
}
