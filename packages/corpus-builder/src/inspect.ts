// packages/corpus-builder/src/inspect.ts
//
// SPEC §6.3 / §6.3.1 — `corpus-builder inspect` is the build-time developer
// transparency surface (the analogue of runtime `client-cli`/`DebugTrace`, scoped
// to `corpus-builder` because a client seeing graph/corpus internals would break
// INV-3). `inspect --node ID` prints a span's fields plus its `source_refs` chain
// back to the raw documents; `inspect --trace` prints the `BuildTrace`. Both honor
// `--verbosity` levels for one consistent developer experience across build/inspect/eval.

import type { BuildTrace } from "./build-trace";
import type { SubstrateBundle, SubstrateSpan } from "./types";

export type Verbosity = "quiet" | "normal" | "verbose";

const VERBOSITY_RANK: Record<Verbosity, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
};

export function parseVerbosity(value: string | undefined): Verbosity {
  if (value === "quiet" || value === "normal" || value === "verbose")
    return value;
  return "normal";
}

/** Format a single span for `inspect --node`, detail scaled by verbosity. */
export function inspectNode(
  bundle: SubstrateBundle,
  id: string,
  verbosity: Verbosity = "normal",
): string {
  const span = bundle.spans.find((s) => s.id === id);
  if (!span) {
    throw new Error(
      `no span with id "${id}" in this graph (${bundle.spans.length} spans)`,
    );
  }
  return formatNode(span, verbosity).join("\n");
}

function formatNode(span: SubstrateSpan, verbosity: Verbosity): string[] {
  const rank = VERBOSITY_RANK[verbosity];
  const lines: string[] = [
    `id:              ${span.id}`,
    `archetype:       ${span.archetype}`,
    `semantic_tags:   ${span.semantic_tags.length ? span.semantic_tags.join(", ") : "(none — orphan span)"}`,
    `local_coherence: ${span.local_coherence.toFixed(4)}`,
    `source_refs:     ${span.source_refs.join(", ")}`,
    `source_span:     ${span.source_span.source} @ ${span.source_span.char_ranges}`,
  ];
  if (span.source_span.members && span.source_span.members.length > 0) {
    lines.push(`composite of:    ${span.source_span.members.join(", ")}`);
  }
  if (rank >= VERBOSITY_RANK.normal) {
    const preview =
      span.prose.length > 200 ? span.prose.slice(0, 200) + "…" : span.prose;
    lines.push(`prose:           ${JSON.stringify(preview)}`);
  }
  if (rank >= VERBOSITY_RANK.verbose) {
    const head = span.embedding
      .slice(0, 8)
      .map((v) => v.toFixed(4))
      .join(", ");
    lines.push(
      `embedding[0..8]: [${head}${span.embedding.length > 8 ? ", …" : ""}]`,
    );
  }
  return lines;
}

/** Format a `BuildTrace` for `inspect --trace`. */
export function inspectTrace(
  trace: BuildTrace,
  verbosity: Verbosity = "normal",
): string {
  const lines: string[] = ["Build trace — stages:"];
  for (const stage of trace.stages) {
    lines.push(
      `  ${stage.stage}: in=${stage.input_count} out=${stage.output_count}` +
        (stage.warnings.length ? ` warnings=${stage.warnings.length}` : ""),
    );
    if (VERBOSITY_RANK[verbosity] >= VERBOSITY_RANK.normal) {
      for (const w of stage.warnings) lines.push(`    ⚠ ${w}`);
    }
  }
  const provenanceCount = Object.keys(trace.span_provenance).length;
  lines.push(
    `span_provenance: ${provenanceCount} span(s) mapped to source documents`,
  );
  if (VERBOSITY_RANK[verbosity] >= VERBOSITY_RANK.verbose) {
    for (const [id, refs] of Object.entries(trace.span_provenance)) {
      lines.push(`  ${id} <- ${refs.join(", ")}`);
    }
  }
  return lines.join("\n");
}
