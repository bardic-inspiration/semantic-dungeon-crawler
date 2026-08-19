// packages/rule-engine/src/layer-resolution.ts
//
// SPEC §4.3 — Layer Resolution Order. Two pure pieces the solver (§4.1) composes:
//
//   1. `resolutionOrder(layers)` — turn an active layer stack into the order the
//      solver walks (priority sort, `override`/`yield` insertion, §4.3.1–.2/.6).
//   2. `resolveLayers(ordered)` — walk that order and apply the hard/soft decision
//      rules (§4.3.3–.4): first hard decision wins unless a lower `override`
//      re-opens it; all `soft_reweight` factors stack regardless.
//
// This is where INV-4's "messy is allowed" escape hatch lives: two `override`
// layers with contradictory hard decisions resolve by declaration order, log a
// `warn`, and NEVER throw (§6.4 Exit case). The engine validates well-formedness,
// not coherence — a "bad" outcome is a valid outcome.
//
// Out of scope (their own issues): predicate/`scope` evaluation (which rules fire
// — the evaluator supplies the effects consumed here), and the candidate query /
// `sample()` / commit phase / `resolveMove`/`populate` entry points (the solver,
// which consumes this ordering). This module is a pure function of its inputs
// (INV-2) and imports `schema` types only (INV-1).

import type { Effect, Layer } from "schema";
import { NoopLogger, type Logger } from "./instrumentation";

/** The traversal-locking subset of `Effect` §4.3 resolves to a single winner. */
export type HardDecision = "hard_allow" | "hard_forbid";

// ── §4.3.1–.2/.6 — resolution order ───────────────────────────────────────────

function priorityOf(layer: Layer): number | null {
  return typeof layer.mode === "object" ? layer.mode.priority : null;
}

function isOverride(layer: Layer): boolean {
  return layer.mode === "override";
}

function isYield(layer: Layer): boolean {
  return layer.mode === "yield";
}

interface Entry {
  layer: Layer;
  declIndex: number;
}

/**
 * Order an active layer stack into the sequence the solver walks top-to-bottom
 * (top = evaluated first), per §4.3:
 *
 * - **Priority spine (§4.3.1).** Layers carrying `{priority:N}` sort by `N`
 *   descending; equal priorities keep declaration order (stable, §4.3.6).
 * - **Override insertion (§4.3.2).** Each `override` layer is lifted to sit
 *   immediately above its *enclosing global layer* — the nearest layer declared
 *   before it with `scope === "global"` — so a locally-scoped override beats the
 *   global layer it refines. Siblings sharing a parent keep declaration order
 *   (earlier = higher = evaluated first), which is what makes the two-conflicting-
 *   override tie resolve "by declaration order" (§4.3.3). An override with no
 *   enclosing global layer is unanchored and sits at the very top, in declaration
 *   order among such overrides.
 * - **Yield sinking (§4.3.2).** `yield` layers drop to the bottom, in declaration
 *   order — they apply only if no decision was made above them.
 *
 * `mode` is a closed union, so a layer is exactly one of prioritized / override /
 * yield; the three rules never contend for the same layer. Pure and stable — the
 * same input always yields the same order (INV-2). The input array is not mutated.
 */
export function resolutionOrder(layers: readonly Layer[]): Layer[] {
  const entries: Entry[] = layers.map((layer, declIndex) => ({
    layer,
    declIndex,
  }));

  const yields = entries.filter((e) => isYield(e.layer));

  // Priority spine — the base into which overrides are spliced.
  const ordered: Entry[] = entries
    .filter((e) => priorityOf(e.layer) !== null)
    .sort(
      (a, b) =>
        priorityOf(b.layer)! - priorityOf(a.layer)! ||
        a.declIndex - b.declIndex,
    );

  // Number of entries currently occupying the top block (unanchored overrides
  // and anything spliced above the spine). Keeps their declaration order intact.
  let topCursor = 0;

  const overrides = entries
    .filter((e) => isOverride(e.layer))
    .sort((a, b) => a.declIndex - b.declIndex);

  for (const o of overrides) {
    // Enclosing global layer: nearest layer declared before `o` with a global
    // scope. `reduce` keeps the greatest such declIndex (the nearest).
    const parent = entries
      .filter(
        (e) =>
          e.declIndex < o.declIndex &&
          e.layer.scope === "global" &&
          !isYield(e.layer),
      )
      .reduce<Entry | undefined>(
        (best, e) => (best && best.declIndex > e.declIndex ? best : e),
        undefined,
      );

    const parentIdx = parent ? ordered.findIndex((e) => e === parent) : -1;
    const insertIdx = parentIdx >= 0 ? parentIdx : topCursor;
    ordered.splice(insertIdx, 0, o);
    if (insertIdx <= topCursor) topCursor++;
  }

  return [...ordered, ...yields].map((e) => e.layer);
}

// ── §4.3.3–.4 — the hard/soft decision walk ───────────────────────────────────

/** A layer paired with the effects its fired rules produced, in rule order. */
export interface LayerEffects {
  /** Only `id`, `mode`, and `scope` are read; the full `Layer` is accepted. */
  layer: Layer;
  /**
   * Effects whose predicates fired for this layer (§4.1). Only the traversal
   * effects (`hard_allow`/`hard_forbid`/`soft_reweight`) matter to §4.3; commit-
   * phase effects (`write`/`primitive`/`emit`/`end`, §4.1 A5) are ignored here.
   */
  effects: readonly Effect[];
}

/** The resolved traversal decision the solver feeds to `sample()` (§4.1). */
export interface Resolution {
  /** The winning hard decision, or `null` when undecided → drift fallthrough. */
  decision: HardDecision | null;
  /** `id` of the layer whose hard decision won; `null` when undecided. */
  decidedBy: string | null;
  /** Product of every `soft_reweight` factor from every layer (§4.3.4); 1 if none. */
  softFactor: number;
}

/** The §4.3 conflict warning event — routed through the §2.1 `Logger` at `warn`. */
export const OVERRIDE_CONFLICT_EVENT = "layer_resolution.override_conflict";

/**
 * Walk an already-ordered stack (see {@link resolutionOrder}) and resolve the
 * traversal decision, per §4.3.3–.4:
 *
 * - The **first** hard decision encountered wins and is not overridden by lower
 *   layers — **except** a lower `override` layer re-opens it (§4.3.3). Once an
 *   `override` has decided, its decision is locked: a lower non-override cannot
 *   move it, and a lower `override` that *contradicts* it hits the INV-4 escape
 *   hatch — declaration order (the already-walked winner) stands, a `warn` is
 *   logged, and the function never throws.
 * - Within one layer, the first hard effect in rule order is that layer's decision.
 * - Every `soft_reweight` factor from every layer multiplies together regardless
 *   of hard-decision locking (§4.3.4) — soft effects always stack.
 *
 * Pure and total (INV-2/INV-4). `ordered` MUST already be in resolution order;
 * the solver evaluates predicates in that order (§4.1) before calling this.
 */
export function resolveLayers(
  ordered: readonly LayerEffects[],
  logger: Logger = new NoopLogger(),
): Resolution {
  let decision: HardDecision | null = null;
  let decidedBy: string | null = null;
  let lockedByOverride = false;
  let softFactor = 1;

  for (const { layer, effects } of ordered) {
    // First hard effect in rule order is this layer's decision; soft effects from
    // this layer always stack, even if its hard decision is ultimately ignored.
    let layerHard: HardDecision | null = null;
    for (const effect of effects) {
      if (effect.kind === "soft_reweight") {
        softFactor *= effect.factor;
      } else if (
        layerHard === null &&
        (effect.kind === "hard_allow" || effect.kind === "hard_forbid")
      ) {
        layerHard = effect.kind;
      }
      // Commit-phase effects (write/primitive/emit/end) are not §4.3's concern.
    }

    if (layerHard === null) continue;
    const override = isOverride(layer);

    if (decision === null) {
      // First hard decision wins.
      decision = layerHard;
      decidedBy = layer.id;
      lockedByOverride = override;
    } else if (layerHard !== decision) {
      if (lockedByOverride) {
        // A prior override already locked the decision. A lower override that
        // disagrees is the INV-4 "messy" case: declaration order stands (the
        // earlier override, already the winner), warn, never throw.
        if (override) {
          logger.log("warn", OVERRIDE_CONFLICT_EVENT, {
            kept: decidedBy,
            ignored: layer.id,
            decision,
          });
        }
        // A lower non-override is silently ignored (first decision wins).
      } else if (override) {
        // A lower override re-opens a non-override decision.
        decision = layerHard;
        decidedBy = layer.id;
        lockedByOverride = true;
      }
      // A lower non-override never re-opens: first decision wins (silent).
    }
    // Agreement (layerHard === decision) is a no-op.
  }

  return { decision, decidedBy, softFactor };
}
