// packages/rule-engine/src/debug-trace.ts
//
// SPEC §4.6 — the engine-side `DebugTrace`: a single resolution's candidate /
// layer / decision story, captured ONLY when the server debug flag is on. The
// wire shape is fixed in `schema` (`DebugTrace`, §3.2 / §4.6); this module owns
// the logic that fills it (the analogue of Phase 2's build-time `BuildTrace`,
// §6.3).
//
// Two §4.6 requirements shape the design:
//
//   1. **Server config, never client-supplied.** The flag lives in engine/server
//      config (`DebugConfig`), reached only through the solver's server-facing
//      options — a client's request shapes (§3.2/§3.3, INV-3) carry no debug
//      field, so a client cannot force debug-mode cost onto the engine.
//   2. **Zero overhead when disabled.** `createDebugTrace` is the gate: it
//      constructs a `DebugTraceRecorder` ONLY when the flag is on, else returns
//      `undefined`. The solver threads that `undefined` through its hot path, so
//      every recording call short-circuits and nothing is allocated or computed
//      for the trace — gate before construct, never construct-then-discard.
//
// INV-1: pure, headless — imports `schema` types only. INV-2: recording is a
// side channel; it never feeds back into resolution output, so a replay observes
// the same bytes with the flag on or off.

import type { DebugTrace, Effect } from "schema";

/**
 * The debug gate's config. SERVER-side only (§4.6): sourced from engine/server
 * configuration, never plumbed from a client request. `enabled` off is the hot
 * path; on constructs the recorder.
 */
export interface DebugConfig {
  readonly enabled: boolean;
}

// One layer's accumulating record. Fired rules are keyed by rule index so a rule
// that fires across several candidates collects its `matched_entities` in one
// entry; `build()` emits them in ascending rule-index order.
interface LayerRecord {
  layer_id: string;
  activated: boolean;
  fired: Map<number, { effect: Effect; matched: string[] }>;
}

/**
 * Accumulates one resolution's story as the solver's §4.1 loop runs, then emits
 * the §4.6 {@link DebugTrace}. Constructed ONLY behind the flag (see
 * {@link createDebugTrace}); its methods are the sole trace work on the hot path,
 * so when no recorder exists (flag off) none of them run.
 *
 * Every method is pure accumulation with no throw and no read-back into the
 * solver — recording cannot influence resolution output (INV-2).
 */
export class DebugTraceRecorder {
  private readonly candidatesInitial: string[] = [];
  private readonly layers = new Map<string, LayerRecord>();
  private readonly layerOrder: string[] = [];
  private readonly softScores: Record<string, number> = {};
  private hardSource: string | null = null;

  /** The initial candidate pool (entity ids), nearest-first, before filtering. */
  recordCandidates(ids: readonly string[]): void {
    for (const id of ids) this.candidatesInitial.push(id);
  }

  /**
   * Register a layer from the ruleset stack, in declaration order, with whether
   * its `scope` activated this resolution. A skipped layer (`activated: false`)
   * still appears in the trace, with no fired rules.
   */
  registerLayer(layerId: string, activated: boolean): void {
    if (this.layers.has(layerId)) return;
    this.layers.set(layerId, {
      layer_id: layerId,
      activated,
      fired: new Map(),
    });
    this.layerOrder.push(layerId);
  }

  /**
   * Note that layer `layerId`'s rule at `ruleIndex` (with `effect`) fired for the
   * candidate `entityId`. Appends to that rule's `matched_entities` in candidate
   * order. A no-op if the layer was never registered (defensive; the solver
   * always registers first).
   */
  recordRuleFired(
    layerId: string,
    ruleIndex: number,
    effect: Effect,
    entityId: string,
  ): void {
    const record = this.layers.get(layerId);
    if (record === undefined) return;
    let entry = record.fired.get(ruleIndex);
    if (entry === undefined) {
      entry = { effect, matched: [] };
      record.fired.set(ruleIndex, entry);
    }
    entry.matched.push(entityId);
  }

  /** Record a candidate's final stacked soft weight (§4.3.4), keyed by entity id. */
  recordSoftScore(entityId: string, weight: number): void {
    this.softScores[entityId] = weight;
  }

  /**
   * Record the layer that produced a hard decision. The FIRST such call wins, so
   * over candidate order this captures the source of the first hard decision the
   * resolution reached — for the single-hard-decision case (§4.6's fixture) that
   * is unambiguously the winning source.
   */
  recordHardDecision(source: string): void {
    if (this.hardSource === null) this.hardSource = source;
  }

  /** Emit the finished §4.6 trace. Deterministic: rules_fired sort by index. */
  build(): DebugTrace {
    const per_layer = this.layerOrder.map((id) => {
      const record = this.layers.get(id)!;
      const rules_fired = [...record.fired.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rule_index, { effect, matched }]) => ({
          rule_index,
          effect,
          matched_entities: matched,
        }));
      return {
        layer_id: record.layer_id,
        activated: record.activated,
        rules_fired,
      };
    });
    return {
      candidates_initial: this.candidatesInitial,
      per_layer,
      final_hard_decision_source: this.hardSource,
      final_soft_scores: this.softScores,
    };
  }
}

/**
 * The §4.6 flag gate. Returns a fresh {@link DebugTraceRecorder} ONLY when the
 * server debug flag is on; `undefined` for a disabled or absent config. This is
 * the "gate before construct" point — the heavy recorder is never allocated on
 * the hot path, so no trace work happens when debug mode is off.
 */
export function createDebugTrace(
  config?: DebugConfig,
): DebugTraceRecorder | undefined {
  return config?.enabled ? new DebugTraceRecorder() : undefined;
}
