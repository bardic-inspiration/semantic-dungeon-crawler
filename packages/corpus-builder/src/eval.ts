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

import { parseTag } from "schema";
import { FlatIndex } from "./index-flat";
import { parseTagRegistry, type ParsedRegistry } from "./tag-registry";
import type { Verbosity } from "./inspect";
import type { SubstrateBundle } from "./types";

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
 * `tag-registry.yaml` to compute an orphan rate against the vocabulary contract.
 */
export function evaluateBuild(
  bundle: SubstrateBundle,
  registry?: ParsedRegistry,
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

  // Nearest-neighbor spread: distance to each span's single nearest neighbor.
  const vectors = spans.map((s) => s.embedding);
  const nnDistances: number[] = [];
  if (vectors.length > 1) {
    const index = new FlatIndex(vectors);
    for (let i = 0; i < vectors.length; i++) {
      const nearest = index.queryByIndex(i, 1)[0];
      if (nearest) nnDistances.push(nearest.distance);
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

/** Human-readable report for the CLI. `eval` never fails a build — this only prints. */
export function formatEvalReport(
  report: EvalReport,
  verbosity: Verbosity = "normal",
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
  if (verbosity === "verbose") {
    lines.push(
      `  (a coherent corpus shows a smaller nearest-neighbor mean than shuffled noise — C4)`,
    );
  }
  lines.push("", "This report never gates the build (INV-4; C4).");
  return lines.join("\n");
}
