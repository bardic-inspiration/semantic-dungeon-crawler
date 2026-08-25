// packages/rule-engine/src/solver.ts
//
// SPEC §4.1 (`resolveMove`) / §4.4 (`populate`) — the shared resolution core, the
// composition point where the determinism spine (#71), the DSL parser (#72), the
// evaluator (#73), and layer resolution (#74) come together. The normative
// requirement: `resolveMove` and `populate` MUST both call the **identical**
// `evaluateLayers()` (§4.4 / §6.4 Exit) — asserted by a function-identity test,
// not merely equal output. Both route through `solverCore.evaluateLayers` for
// exactly that reason.
//
// Control flow matches the §4.1/§4.4 pseudocode normatively:
//   1. gather candidates via a substrate `Query` (`graph.query`);
//   2. filter active layers by `scope` (global, or `evaluate(scope, state)`);
//   3. order them (§4.3, `resolutionOrder`);
//   4. per candidate, apply the fired hard/soft effects (`resolveLayers`);
//   5. drift fallthrough when no hard decision was made anywhere;
//   6. seeded `sample()` (§4.5) — one draw for a move, `n` for a population;
//   7. the post-decision commit phase (A5) — write/primitive/emit/end, in
//      declaration order, last-write-wins, never throwing.
//
// INV-1: pure, headless (schema + engine internals only). INV-2: every draw is
// seeded from `(session_seed, turn_count, normalized_query)`; identical inputs ⇒
// byte-identical output. INV-4: nothing here throws on a contradictory or
// malformed ruleset — a "bad" resolution is a valid resolution.

import type {
  Affordance,
  DebugTrace,
  Effect,
  Entity,
  InterpretationLookup,
  Layer,
  ResolutionStatus,
  ResolvedExit,
  SessionState,
} from "schema";
import { parse, ParseError, type Expression } from "./parser";
import {
  evaluate,
  evaluateValueExpression,
  type EntityCandidate,
} from "./evaluate";
import {
  resolutionOrder,
  resolveLayers,
  OVERRIDE_CONFLICT_EVENT,
  type HardDecision,
} from "./layer-resolution";
import { createDebugTrace, type DebugConfig } from "./debug-trace";
import { NoopLogger, type Logger } from "./instrumentation";
import type { Query } from "./query";
import { mintEntity } from "./interpretation";
import { visitedCoordinateRefs } from "./address-token";
import { seededRng } from "./prng";
import { sample } from "./sample";
import type { Graph } from "./graph";

// ── Engine defaults (§4.4 C1, §0.9.0 A4/A11) ──────────────────────────────────

/**
 * §0.11.0 (C1) — the alpha-scale sampling TARGET, not a hard cap: a room's object
 * count is `round(density * MAX_ROOM_OBJECTS)`. Tunable in Phase 6; per-room
 * `density` scales it down.
 */
export const MAX_ROOM_OBJECTS = 12;

/**
 * Default candidate-pool size for a substrate query (§4.4 B3 `k`; ruleset-tunable).
 *
 * DECOUPLED from {@link MAX_ROOM_OBJECTS} (#107). The query `k` must exceed the
 * population target, or weighted sampling degenerates: at `density = 1.0` the
 * target is `round(1.0 * MAX_ROOM_OBJECTS) = 12`, so a `k` of 12 makes the draw a
 * *permutation* of the whole candidate pool rather than a *selection* from it, and
 * §4.4/B3's "the nearest span becomes the room, the remaining k−1 are the
 * candidate pool" accounting no longer holds. The headroom keeps `populate` a
 * genuine weighted draw at every density.
 */
export const DEFAULT_QUERY_K = 32;

/**
 * Default cosine-distance cutoff for the §4.4 zero-radius embedding-proximity
 * query (§4.4 B3 `radius`; ruleset-tunable).
 *
 * B3 names the default radius as "ruleset config with engine defaults"; this is
 * that engine default (#107). Without it `populate`'s "radius bounded by embedding
 * proximity" is an unbounded k-NN in practice — every span is a candidate,
 * however unrelated. Cosine distance is `[0, 2]` (§0.10.0 B2); `1.0` is
 * orthogonality, so spans in the same or a positively correlated direction as the
 * origin survive while the unrelated far tail is bounded out. An explicit
 * `PopulateOptions.radius` (including `0`) overrides it — only an *absent* radius
 * takes this default.
 */
export const DEFAULT_QUERY_RADIUS = 1.0;

/**
 * §0.9.0 (A4) — the engine-default movement affordances. An object contributes a
 * `ResolvedExit` when its affordance set intersects these (plus the `portal`
 * archetype, always traversal-capable). A ruleset overrides via
 * `Ruleset.movement_affordances`.
 */
export const DEFAULT_MOVEMENT_AFFORDANCES: readonly Affordance[] = [
  "enter",
  "traverse",
];

// ── Public result shapes ──────────────────────────────────────────────────────

/** A candidate that survived layer resolution, with its resolved soft weight. */
export interface WeightedCandidate {
  candidate: EntityCandidate;
  /** Product of every `soft_reweight` factor that fired for it (§4.3.4); ≥ 0. */
  weight: number;
  /** Its winning hard decision, or `null` when undecided (drift-eligible). */
  decision: HardDecision | null;
  /** `id` of the layer whose hard decision won; `null` when undecided. */
  decidedBy: string | null;
}

/** What {@link evaluateLayers} produces before the caller samples (§4.1 loop). */
export interface EvaluateLayersResult {
  /** Surviving candidates (every non-`hard_forbid` candidate), weighted (§4.3). */
  pool: WeightedCandidate[];
  /** True iff at least one candidate resolved to a hard decision (§4.1). */
  anyHardDecision: boolean;
  /** Active layers in original declaration order — the commit phase walks these (A5). */
  activeLayers: PreparedLayer[];
  /** The seeded PRNG for this query (§4.5) — the caller draws from it. */
  rng: () => number;
  /**
   * The §4.6 debug trace for this evaluation — present ONLY when the server debug
   * flag was on (`debug.enabled`), absent (and unbuilt) otherwise. Zero overhead
   * when off: the recorder is never constructed, so nothing here is computed.
   */
  debug?: DebugTrace;
}

/** The deterministic outcome of the post-decision commit phase (§4.1 A5). */
export interface CommitResult {
  /** `dynamic.vars.*` after applying `write` effects, last-write-wins. */
  vars: Record<string, string>;
  /** `emit` effects (§3.3 A6), in declaration order. */
  emits: { text?: string; reveal?: string[] }[];
  /** `primitive` invocations (§3.7.4), in declaration order. */
  primitives: { primitive: string; args?: Record<string, string> }[];
  /**
   * §3.3 (A6) `InteractionResult.effects_summary` — a human-readable summary of
   * this commit phase's writes, auto-derived for debug/UX. Operator-safe: author
   * keys and values only, never candidates, rule text, or embeddings (INV-3).
   */
  effects_summary: string[];
  /** True once an `end` effect fired (§3.3 A7). */
  ended: boolean;
}

/** The resolved destination of a move (§4.1). */
export interface MoveResolution {
  /** The chosen next position, or `null` when no legal move exists (stuck). */
  destination: EntityCandidate | null;
  /** `"stuck"` when a well-formed resolution left no legal move, else `"resolved"` (C2). */
  resolution_status: ResolutionStatus;
  /** Commit-phase output for this move (A5). */
  commit: CommitResult;
  /** The §4.6 debug trace, present only when server debug mode is on (§4.6). */
  debug?: DebugTrace;
}

/** A resolved room: sampled objects, derived exits, status (§4.4 / §3.2). */
export interface RoomResolution {
  objects: Entity[];
  exits: ResolvedExit[];
  /** `"stuck"` iff the resolution left no legal exit (§0.11.0 C2), else `"resolved"`. */
  resolution_status: ResolutionStatus;
  commit: CommitResult;
  /** The §4.6 debug trace, present only when server debug mode is on (§4.6). */
  debug?: DebugTrace;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface ResolveMoveOptions {
  /**
   * §0.9.0 (A4) exit-anchoring — a move initiated through a traversal-capable
   * object. When set, `candidates` anchor to that object's seeded query (the
   * exit's `target_entity_id`, a substrate coordinate token) rather than sampling
   * all neighbors. Omit for the null/relativistic-drift path (unchanged).
   */
  anchor?: { target_ref: string };
  /** Candidate-pool size for the query; defaults to {@link DEFAULT_QUERY_K}. */
  k?: number;
  /**
   * §4.4 (B3) — the gradient bias for the movement query, sourced from the
   * session's `dynamic.momentum` (§3.8) when the ruleset's `substrate.gradient_source`
   * opts in. Omitted (the engine default), the move stays pure relativistic drift
   * (§0/§1). The value is quantized in `normalized_query` (§4.5) so float drift
   * cannot fork a replay (INV-2).
   */
  direction?: number[];
  logger?: Logger;
  /**
   * §0.9.0 (A13) — the author's `Ruleset.interpretation_lookup`. Applied to every
   * span the substrate returns, before predicates see it. Absent means engine
   * defaults only.
   */
  interpretation?: InterpretationLookup;

  /**
   * §4.6 debug trace flag — SERVER config, never sourced from a client request
   * (INV-3). When `enabled`, the returned {@link MoveResolution} carries a
   * `debug` trace; off (or omitted) is the zero-overhead hot path.
   */
  debug?: DebugConfig;
}

export interface PopulateOptions {
  /**
   * Region cutoff for the zero-radius embedding-proximity query (§4.4). Defaults
   * to {@link DEFAULT_QUERY_RADIUS} when omitted; an explicit value (including 0)
   * overrides the engine default.
   */
  radius?: number;
  /** Candidate-pool size for the query; defaults to {@link DEFAULT_QUERY_K}. */
  k?: number;
  /** Movement affordances; defaults to {@link DEFAULT_MOVEMENT_AFFORDANCES} (+ `portal`). */
  movementAffordances?: readonly Affordance[];
  logger?: Logger;
  /**
   * §0.9.0 (A13) — the author's `Ruleset.interpretation_lookup`. Applied to every
   * span the substrate returns, before predicates see it. Absent means engine
   * defaults only.
   */
  interpretation?: InterpretationLookup;

  /**
   * §4.6 debug trace flag — SERVER config, never client-supplied (INV-3). When
   * `enabled`, the returned {@link RoomResolution} carries a `debug` trace; off
   * (or omitted) is the zero-overhead hot path.
   */
  debug?: DebugConfig;
}

// ── Prepared (parse-once) layer view ──────────────────────────────────────────

/** One active rule with its predicate parsed once (§4.2). */
export interface PreparedRule {
  effect: Effect;
  /** Parsed predicate, or `null` when the DSL string is malformed (never fires — INV-4). */
  predicate: Expression | null;
}

/** An active layer whose rule predicates are parsed — the commit phase walks these. */
export interface PreparedLayer {
  layer: Layer;
  rules: PreparedRule[];
}

/**
 * A malformed §4.2 predicate string, surfaced through the §2.1 `Logger` at `warn`
 * (#107). INV-4 keeps such a rule running (the predicate never fires) rather than
 * rejecting the ruleset; the §3.6.2/C5 "surface, never reject" stance means the
 * divergence is still visible, not silently swallowed.
 */
export const MALFORMED_PREDICATE_EVENT = "solver.malformed_predicate";

/**
 * A malformed §4.2 scope string, surfaced through the §2.1 `Logger` at `warn`
 * (#107). The layer stays out of the active stack for this resolution (its scope
 * cannot be evaluated), but that deactivation is surfaced rather than silent.
 */
export const MALFORMED_SCOPE_EVENT = "solver.malformed_scope";

// Parse a §4.2 DSL string, tolerating a malformed one as "absent" (INV-4: the
// solver never throws mid-resolution — a bad predicate simply never fires, a bad
// scope leaves its layer inactive). A non-`ParseError` throw is a real bug and
// still propagates. Surfacing the malformed string is the caller's job (it holds
// the layer/rule context for a useful `warn`), per "surface, never reject".
function parseOrNull(source: string): Expression | null {
  try {
    return parse(source);
  } catch (err) {
    if (err instanceof ParseError) return null;
    throw err;
  }
}

// Filter the stack to the layers active this move — `scope === "global"`, or the
// scope predicate holds against run state alone (§4.1; no candidate is bound to a
// `scope`) — and parse each active layer's rule predicates once. Declaration
// order is preserved, which is what the commit phase (A5) and the override-tie
// rule (§4.3.3) both rely on.
function prepareActiveLayers(
  layers: readonly Layer[],
  state: SessionState,
  logger: Logger,
): PreparedLayer[] {
  const active: PreparedLayer[] = [];
  for (const layer of layers) {
    if (layer.scope !== "global") {
      const scopeAst = parseOrNull(layer.scope);
      if (scopeAst === null) {
        // INV-4: a malformed scope leaves its layer inactive rather than being
        // rejected — but surface it, don't swallow it (§3.6.2/C5, #107).
        logger.log("warn", MALFORMED_SCOPE_EVENT, {
          layer: layer.id,
          scope: layer.scope,
        });
        continue;
      }
      if (!evaluate(scopeAst, { state })) continue;
    }
    const rules: PreparedRule[] = layer.rules.map((rule, ruleIndex) => {
      const predicate = parseOrNull(rule.predicate);
      if (predicate === null) {
        // INV-4: a malformed predicate never fires — but surface it (#107).
        logger.log("warn", MALFORMED_PREDICATE_EVENT, {
          layer: layer.id,
          rule: ruleIndex,
          predicate: rule.predicate,
        });
      }
      return { effect: rule.effect, predicate };
    });
    active.push({ layer, rules });
  }
  return active;
}

/**
 * Wrap a `Logger` so the §4.3 override-conflict warning surfaces once per
 * resolution rather than once per candidate (#107). A conflict between two
 * `override` layers is an AUTHORING property of the layer stack, not of any single
 * candidate, but `resolveLayers` runs per candidate (§4.1 loop) and so re-emits
 * the same warning N times. This suppresses the repeats — keyed by the conflict's
 * identity (which layer was kept, which ignored, the decision) — while every other
 * event passes straight through unchanged. Logging stays a pure side channel
 * (INV-2): dropping duplicates changes nothing a replay observes.
 */
function dedupeOverrideConflicts(logger: Logger): Logger {
  const seen = new Set<string>();
  return {
    log(level, event, fields) {
      if (event === OVERRIDE_CONFLICT_EVENT) {
        const key = JSON.stringify([
          fields?.kept,
          fields?.ignored,
          fields?.decision,
        ]);
        if (seen.has(key)) return;
        seen.add(key);
      }
      logger.log(level, event, fields);
    },
  };
}

// ── The shared core (§4.1 loop) ───────────────────────────────────────────────

/**
 * The §4.1 evaluation loop, shared verbatim by {@link resolveMove} and
 * {@link populate} (§4.4 / §6.4 Exit — same function reference). Gathers the
 * candidate pool from the substrate query, resolves each candidate's hard/soft
 * decision through the ordered active layers (§4.3), and returns the surviving,
 * weighted pool plus the seeded PRNG the caller draws from.
 *
 * Per INV-4 it NEVER throws: contradictory `override` hard decisions resolve by
 * declaration order with a logged warning (`resolveLayers`), and a malformed
 * predicate simply never fires. The drift fallthrough (§4.1) is the caller's, so
 * the loop itself stays the single shared primitive.
 */
export interface EvaluateLayersOptions {
  /** §2.1 sink for solver warnings (notably §4.3's override conflict). */
  logger?: Logger;
  /** §4.6 trace config; absent means the recorder is never constructed. */
  debug?: DebugConfig;
  /**
   * §0.9.0 (A13) — the author's interpretation lookup. Applied to every span the
   * substrate returns, BEFORE predicates see it, so `static.archetype` reads the
   * interpreted archetype rather than the tagger's build-time default. Absent
   * means engine defaults only (§3.4: "engine ships defaults").
   */
  interpretation?: InterpretationLookup;
}

export function evaluateLayers(
  graph: Graph,
  query: Query,
  state: SessionState,
  layers: readonly Layer[],
  options: EvaluateLayersOptions = {},
): EvaluateLayersResult {
  const logger = options.logger ?? new NoopLogger();
  // The override-conflict warning is per-authoring-conflict, but the resolution
  // loop below evaluates it per candidate; dedupe so it surfaces once (#107).
  const conflictLogger = dedupeOverrideConflicts(logger);
  const debug = options.debug;
  // §0.9.0 (A13) / §3.7.1 — a substrate query returns UNINTERPRETED spans; an
  // `Entity` is minted here, per resolution, through the interpretation lookup.
  // This is the ordering the spec requires: interpretation precedes predicate
  // evaluation, so a rule reading `static.archetype` sees what the author's
  // lookup produced, not what the tagger guessed at build time.
  // §3.1 (A3) — `visited` is derived over the durable address-token, not the
  // ephemeral id: a candidate at coordinate `X` is visited iff a token in
  // `visited_set` names `X`. Candidates carry no `ownToken` (they are potential
  // destinations, not recorded places), so their `contains` stays empty.
  const visitedCoordinates = visitedCoordinateRefs(
    state.visited_set,
    state.address_tokens,
  );
  const candidates: EntityCandidate[] = graph.query(query).map((sc) => ({
    entity: mintEntity(sc.span, options.interpretation, { visitedCoordinates }),
    embedding_distance: sc.embedding_distance,
  }));
  const rng = seededRng(state.session_seed, state.turn_count, query);
  const activeLayers = prepareActiveLayers(layers, state, logger);
  const ordered = resolutionOrder(activeLayers.map((a) => a.layer));

  // Index prepared rules by layer id so the resolution-ordered walk can pull each
  // layer's fired effects for the current candidate.
  const rulesById = new Map<Layer, PreparedRule[]>();
  for (const a of activeLayers) rulesById.set(a.layer, a.rules);

  // §4.6 debug trace — gate BEFORE construct: the recorder exists only when the
  // server flag is on, so with it off every `recorder?.…` below short-circuits
  // and the hot path does no trace work. Recording is a pure side channel; it
  // never feeds back into resolution (INV-2).
  const recorder = createDebugTrace(debug);
  if (recorder) {
    recorder.recordCandidates(candidates.map((c) => c.entity.id));
    const activeSet = new Set(activeLayers.map((a) => a.layer));
    // Every layer in the stack, declaration order — a skipped (inactive) layer is
    // recorded too, marked `activated: false`.
    for (const layer of layers)
      recorder.registerLayer(layer.id, activeSet.has(layer));
  }

  const pool: WeightedCandidate[] = [];
  let anyHardDecision = false;

  for (const candidate of candidates) {
    // Per candidate, collect the effects each ordered layer's rules fire, then
    // resolve the hard/soft decision (§4.3). `static.*` binds to this candidate;
    // `dynamic.*` to run state.
    const layerEffects = ordered.map((layer) => {
      const effects: Effect[] = [];
      const rules = rulesById.get(layer) ?? [];
      for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
        const rule = rules[ruleIndex]!;
        if (
          rule.predicate !== null &&
          evaluate(rule.predicate, { candidate, state })
        ) {
          effects.push(rule.effect);
          recorder?.recordRuleFired(
            layer.id,
            ruleIndex,
            rule.effect,
            candidate.entity.id,
          );
        }
      }
      return { layer, effects };
    });

    const resolution = resolveLayers(layerEffects, conflictLogger);
    if (recorder) {
      // Soft scores stack regardless of the hard decision (§4.3.4), so record
      // every candidate's — even one about to be hard_forbidden out of the pool.
      recorder.recordSoftScore(candidate.entity.id, resolution.softFactor);
      if (resolution.decidedBy !== null) {
        recorder.recordHardDecision(resolution.decidedBy);
      }
    }
    if (resolution.decision !== null) anyHardDecision = true;
    // A hard_forbid drops the candidate; hard_allow and undecided both survive,
    // weighted by the stacked soft factor (§4.3.4). sample() reads the weight.
    if (resolution.decision === "hard_forbid") continue;
    pool.push({
      candidate,
      weight: resolution.softFactor,
      decision: resolution.decision,
      decidedBy: resolution.decidedBy,
    });
  }

  return {
    pool,
    anyHardDecision,
    activeLayers,
    rng,
    ...(recorder ? { debug: recorder.build() } : {}),
  };
}

/**
 * Indirection holder that makes the identical-`evaluateLayers` requirement (§4.4)
 * testable: both entry points call `solverCore.evaluateLayers`, so a spy planted
 * on this one property observes both — proving same reference, not just same
 * output (§6.4 Exit).
 */
export const solverCore = { evaluateLayers };

// ── The post-decision commit phase (§4.1 A5) ──────────────────────────────────

// Apply the write/primitive/emit/end effects fired by active layers, in
// declaration order, last-write-wins, never throwing (A5). Runs AFTER sample()
// returns, so writes cannot influence this move's candidate filtering. `subject`
// is the chosen candidate (a move's destination) so effect predicates that read
// `static.*` bind against it; `null` for a population, where commit effects fire
// on state alone.
function runCommitPhase(
  activeLayers: readonly PreparedLayer[],
  state: SessionState,
  subject: EntityCandidate | null,
): CommitResult {
  const vars: Record<string, string> = { ...state.vars };
  const emits: CommitResult["emits"] = [];
  const primitives: CommitResult["primitives"] = [];
  // §3.3 (A6) — auto-derived from the commit-phase writes, for debug/UX. Human
  // -readable and operator-safe: keys and values the author wrote, never engine
  // internals (INV-3).
  const effects_summary: string[] = [];
  let ended = false;

  for (const { rules } of activeLayers) {
    for (const rule of rules) {
      const isCommit =
        rule.effect.kind === "write" ||
        rule.effect.kind === "primitive" ||
        rule.effect.kind === "emit" ||
        rule.effect.kind === "end";
      if (!isCommit) continue;
      if (rule.predicate === null) continue;
      const bindings =
        subject === null ? { state } : { candidate: subject, state };
      if (!evaluate(rule.predicate, bindings)) continue;

      switch (rule.effect.kind) {
        case "write": {
          // §3.4 — the value is an EVALUATED §4.2 expression/literal, not a raw
          // string. Reads see writes made earlier in this same commit phase, so
          // declaration order composes.
          const key = normalizeVarTarget(rule.effect.target);
          const value = evaluateValueExpression(rule.effect.value, {
            ...bindings,
            state: { ...state, vars },
          });
          // last-write-wins: a later declaration to the same target overwrites.
          vars[key] = value;
          effects_summary.push(`write ${key}=${value}`);
          break;
        }
        case "emit":
          effects_summary.push("emit");
          emits.push({
            ...(rule.effect.text !== undefined
              ? { text: rule.effect.text }
              : {}),
            ...(rule.effect.reveal !== undefined
              ? { reveal: rule.effect.reveal }
              : {}),
          });
          break;
        case "primitive":
          effects_summary.push(`primitive ${rule.effect.primitive}`);
          primitives.push({
            primitive: rule.effect.primitive,
            ...(rule.effect.args !== undefined
              ? { args: rule.effect.args }
              : {}),
          });
          break;
        case "end":
          effects_summary.push("end");
          ended = true;
          break;
      }
    }
  }

  return { vars, emits, primitives, effects_summary, ended };
}

/**
 * §3.4 calls a `write` target "a scratch key (`dynamic.vars.<key>`)", which reads
 * two ways: the key alone, or the full DSL path. The reader (`bindDynamic`) takes
 * the path *after* `vars`, so accepting only the full form silently created keys
 * nothing could read. Both spellings normalize to the same key.
 */
function normalizeVarTarget(target: string): string {
  return target.startsWith("dynamic.vars.")
    ? target.slice("dynamic.vars.".length)
    : target;
}

// ── §4.1 — resolveMove ─────────────────────────────────────────────────────────

/**
 * Resolve one move (§4.1). Gathers candidates via the substrate query — anchored
 * to the interacted object's seeded query when a move came through a
 * traversal-capable object (A4), else the null/relativistic drift query at the
 * player's position — runs the shared {@link evaluateLayers}, applies the drift
 * fallthrough (no hard decision anywhere ⇒ re-resolve against plain neighbors),
 * draws the destination with the seeded PRNG (§4.5), and runs the commit phase
 * (A5). Never throws (INV-4); `"stuck"` when no legal destination remains (C2).
 */
export function resolveMove(
  state: SessionState,
  graph: Graph,
  layers: readonly Layer[],
  options: ResolveMoveOptions = {},
): MoveResolution {
  const logger = options.logger ?? new NoopLogger();
  const k = options.k ?? DEFAULT_QUERY_K;

  // §4.4 (B3) gradient bias — an empty/absent momentum contributes no direction,
  // so the query stays a pure nearest-neighbor drift (the zero-config default).
  const direction =
    options.direction && options.direction.length > 0
      ? options.direction
      : undefined;
  const driftQuery: Query = {
    origin: state.position,
    k,
    ...(direction ? { direction } : {}),
  };
  const query: Query = options.anchor
    ? {
        origin: { vector_ref: options.anchor.target_ref },
        k,
        ...(direction ? { direction } : {}),
      }
    : driftQuery;

  let result = solverCore.evaluateLayers(graph, query, state, layers, {
    logger,
    ...(options.debug ? { debug: options.debug } : {}),
    ...(options.interpretation
      ? { interpretation: options.interpretation }
      : {}),
  });

  // Drift fallthrough (§4.1): when no hard decision engaged an anchored move,
  // fall back to plain nearest-neighbor drift from the player's position. The
  // re-resolve produces a fresh trace, so `debug` reflects the drift resolution.
  if (options.anchor && !result.anyHardDecision) {
    result = solverCore.evaluateLayers(graph, driftQuery, state, layers, {
      logger,
      ...(options.debug ? { debug: options.debug } : {}),
      ...(options.interpretation
        ? { interpretation: options.interpretation }
        : {}),
    });
  }

  const draw = sample(result.pool, (wc) => wc.weight, result.rng);
  const destination = draw.kind === "drawn" ? draw.value.candidate : null;
  const commit = runCommitPhase(result.activeLayers, state, destination);

  return {
    destination,
    resolution_status: destination === null ? "stuck" : "resolved",
    commit,
    ...(result.debug !== undefined ? { debug: result.debug } : {}),
  };
}

// ── §4.4 — populate (the zero-radius query) ───────────────────────────────────

/**
 * Populate a room's `objects[]` (§4.4) — the identical solver as movement, called
 * with the room as origin and radius bounded by embedding proximity rather than
 * graph edges. Gathers candidates via {@link evaluateLayers}, samples
 * `round(density * MAX_ROOM_OBJECTS)` distinct objects with the seeded PRNG, and
 * derives `exits[]` (A4) from the populated objects whose affordance set includes
 * a movement affordance. `"stuck"` iff no legal exit results (C2). Never throws.
 */
export function populate(
  room: Entity,
  state: SessionState,
  graph: Graph,
  layers: readonly Layer[],
  options: PopulateOptions = {},
): RoomResolution {
  const logger = options.logger ?? new NoopLogger();
  const k = options.k ?? DEFAULT_QUERY_K;
  const movementAffordances =
    options.movementAffordances ?? DEFAULT_MOVEMENT_AFFORDANCES;

  // §4.4 B3 — supply the engine-default radius when the caller omits one, so the
  // "radius bounded by embedding proximity" query is bounded rather than an
  // unbounded k-NN (#107). An explicit `radius` (including 0) overrides it.
  const radius = options.radius ?? DEFAULT_QUERY_RADIUS;
  const query: Query = {
    origin: { vector_ref: room.embedding_ref },
    k,
    radius,
  };

  const result = solverCore.evaluateLayers(graph, query, state, layers, {
    logger,
    ...(options.debug ? { debug: options.debug } : {}),
    ...(options.interpretation
      ? { interpretation: options.interpretation }
      : {}),
  });

  const n = Math.round(room.layout_hint.density * MAX_ROOM_OBJECTS);
  const chosen = sampleDistinct(result.pool, n, result.rng);
  const objects = chosen.map((wc) => wc.candidate.entity);
  const exits = deriveExits(chosen, movementAffordances);
  const commit = runCommitPhase(result.activeLayers, state, null);

  return {
    objects,
    exits,
    resolution_status: exits.length === 0 ? "stuck" : "resolved",
    commit,
    ...(result.debug !== undefined ? { debug: result.debug } : {}),
  };
}

// Draw up to `n` DISTINCT candidates, weighted, through the seeded PRNG — a room
// holds distinct objects (without replacement). Deterministic: sequential draws
// consume the PRNG in order (§4.5). Over an empty pool this yields `[]` — the
// degenerate resolution, never a throw (C2).
function sampleDistinct(
  pool: readonly WeightedCandidate[],
  n: number,
  rng: () => number,
): WeightedCandidate[] {
  const chosen: WeightedCandidate[] = [];
  const remaining = [...pool];
  const target = Math.max(0, Math.min(n, remaining.length));
  for (let i = 0; i < target; i++) {
    const draw = sample(remaining, (wc) => wc.weight, rng);
    if (draw.kind !== "drawn") break;
    chosen.push(draw.value);
    remaining.splice(remaining.indexOf(draw.value), 1);
  }
  return chosen;
}

// Derive `exits[]` (§0.9.0 A4) from the populated objects: each object whose
// affordance set includes a movement affordance (or is a `portal`) yields a
// `ResolvedExit` bound to it, seeded query token (`target_entity_id`) taken from
// its substrate coordinate (`embedding_ref`), and its soft-score as `weight`.
function deriveExits(
  objects: readonly WeightedCandidate[],
  movementAffordances: readonly Affordance[],
): ResolvedExit[] {
  const exits: ResolvedExit[] = [];
  for (const wc of objects) {
    const entity = wc.candidate.entity;
    const affordance = movementAffordanceOf(entity, movementAffordances);
    if (affordance === null) continue;
    exits.push({
      target_entity_id: entity.embedding_ref,
      affordance_required: affordance,
      via_object_id: entity.id,
      weight: wc.weight,
    });
  }
  return exits;
}

// The movement affordance an object exposes, or `null` if none — the first of the
// object's affordances that is a movement affordance, with `portal` archetypes
// always traversal-capable (§0.9.0 A4).
function movementAffordanceOf(
  entity: Entity,
  movementAffordances: readonly Affordance[],
): Affordance | null {
  for (const affordance of entity.affordances) {
    if (movementAffordances.includes(affordance)) return affordance;
  }
  if (entity.archetype === "portal") return "traverse";
  return null;
}
