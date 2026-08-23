// packages/corpus-builder/src/inspect.ts
//
// SPEC §6.3 / §6.3.1 — `corpus-builder inspect` is the build-time developer
// transparency surface (the analogue of runtime `client-cli`/`DebugTrace`, scoped
// to `corpus-builder` because a client seeing graph/corpus internals would break
// INV-3). `inspect --node ID` prints a span's fields plus its `source_refs` chain
// back to the raw documents; `inspect --trace` prints the `BuildTrace`. Both honor
// `--verbosity` levels for one consistent developer experience across build/inspect/eval.

import type { BuildTrace } from "./build-trace";
import type { LogLevel } from "./instrumentation";
import type { SubstrateBundle, SubstrateSpan } from "./types";

// §6.3.1 / §5.4 — `corpus-builder` and `client-cli` share ONE verbosity
// vocabulary: the §2.1 `Logger` levels. `--verbosity` is not a private scale, it
// is the `Logger`'s `minLevel` (§5.4: "the CLI does not reimplement logging …, it
// is a display surface for them"). Higher rank = more output, so `debug` shows the
// most and `error` the least — the inverse of the severity order the `Logger` gates
// on, because a request for `debug` output is a request for *maximum* transparency.
export type Verbosity = LogLevel;

export const VERBOSITY_LEVELS: readonly LogLevel[] = [
  "error",
  "warn",
  "info",
  "debug",
];

/** §5.4 default: `warn`. */
export const DEFAULT_VERBOSITY: LogLevel = "warn";

/** Display-detail rank shared by every `--verbosity`-aware formatter (higher = more). */
export const DETAIL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function isVerbosity(value: string): value is LogLevel {
  return (VERBOSITY_LEVELS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `--verbosity` value onto a §5.4 level. `undefined` (flag absent)
 * takes the default; an *unrecognized* value returns `null` so the caller can
 * surface it (§ acceptance: "rather than silently downgraded") instead of the old
 * behavior of quietly falling back — which, combined with the Logger wiring, meant
 * `--verbosity=debug` produced the *least* output.
 */
export function parseVerbosity(value: string | undefined): LogLevel | null {
  if (value === undefined) return DEFAULT_VERBOSITY;
  return isVerbosity(value) ? value : null;
}

/** Format a single span for `inspect --node`, detail scaled by verbosity. */
export function inspectNode(
  bundle: SubstrateBundle,
  id: string,
  verbosity: Verbosity = DEFAULT_VERBOSITY,
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
  const rank = DETAIL_RANK[verbosity];
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
  // §5.4: `info` "adds full entity fields as pretty JSON".
  if (rank >= DETAIL_RANK.info) {
    const preview =
      span.prose.length > 200 ? span.prose.slice(0, 200) + "…" : span.prose;
    lines.push(`prose:           ${JSON.stringify(preview)}`);
  }
  // §5.4: `debug` "adds the raw …" — here, the raw embedding vector.
  if (rank >= DETAIL_RANK.debug) {
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
  verbosity: Verbosity = DEFAULT_VERBOSITY,
): string {
  const rank = DETAIL_RANK[verbosity];
  const lines: string[] = ["Build trace — stages:"];
  for (const stage of trace.stages) {
    lines.push(
      `  ${stage.stage}: in=${stage.input_count} out=${stage.output_count}` +
        (stage.warnings.length ? ` warnings=${stage.warnings.length}` : ""),
    );
    if (rank >= DETAIL_RANK.info) {
      for (const w of stage.warnings) lines.push(`    ⚠ ${w}`);
    }
  }
  const provenanceCount = Object.keys(trace.span_provenance).length;
  lines.push(
    `span_provenance: ${provenanceCount} span(s) mapped to source documents`,
  );
  if (rank >= DETAIL_RANK.debug) {
    for (const [id, refs] of Object.entries(trace.span_provenance)) {
      lines.push(`  ${id} <- ${refs.join(", ")}`);
    }
  }
  return lines.join("\n");
}
