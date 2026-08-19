// packages/corpus-builder/src/build-trace.ts
//
// SPEC §6.3 (Development transparency and testing) — `build-trace.json` is the
// build-time analogue of the runtime `DebugTrace` (§4.6). It is FLAG-GATED
// (`build --trace`), off by default, ZERO OVERHEAD when disabled (gate before
// construct, never construct-then-discard — the §4.6 rule).
//
// DETERMINISM NOTE (INV-2, §6.3 Exit "byte-identical build-trace.json"): the
// persisted trace MUST be byte-identical across two identical `--trace` runs, so
// it carries NO wall-clock. `duration_ms` is written as 0 in the artifact; real
// per-stage durations are emitted LIVE through the §2.1 `Metrics` channel (which
// is not persisted). Choosing determinism of the artifact over embedding a
// timestamp in it is the correct INV-2 tradeoff, and is documented in GRAPH_FORMAT.md.

export type BuildStageName =
  "embedding" | "index_construction" | "coherence_precompute" | "tagging";

export interface BuildStageTrace {
  stage: BuildStageName;
  input_count: number;
  output_count: number;
  duration_ms: number; // always 0 in the persisted artifact (see determinism note)
  warnings: string[];
}

export interface BuildTrace {
  stages: BuildStageTrace[];
  span_provenance: Record<string, string[]>; // source-span id -> source document ids
}

/** Accumulates stage records during a `--trace` build. */
export class BuildTraceRecorder {
  private readonly stages: BuildStageTrace[] = [];

  recordStage(
    stage: BuildStageName,
    inputCount: number,
    outputCount: number,
    warnings: string[] = [],
  ): void {
    this.stages.push({
      stage,
      input_count: inputCount,
      output_count: outputCount,
      duration_ms: 0, // deterministic artifact — see module header
      warnings,
    });
  }

  finish(spanProvenance: Record<string, string[]>): BuildTrace {
    return { stages: this.stages, span_provenance: spanProvenance };
  }
}
