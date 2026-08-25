// packages/rule-engine/src/trajectory.ts
//
// SPEC §3.8 / §0.10.0 (B5) — the session's per-turn TRAJECTORY state, the three
// `dynamic.*` fields §3.8 declares but nothing computed:
//
//   - `trace_centroid` — the running mean of the embedding vectors of the visited
//     positions (the "center of mass" of the trajectory). Vector, server-internal
//     (INV-3).
//   - `momentum` — a smoothed EMA of the recent step vectors (`v_now − v_prev`),
//     one documented decay constant. This is the gradient source `Query.direction`
//     draws from (§4.4 B3). Vector, server-internal (INV-3).
//   - `path_coherence ∈ [0,1]` — DIRECTIONAL CONSISTENCY of the recent steps: the
//     mean cosine alignment of consecutive step directions, mapped to `[0,1]`. A
//     straight, purposeful path scores high; wandering/backtracking scores low.
//     Distinct from a PLACE's `static.local_coherence` (§3.1/B5 — the rename
//     exists because the two collided). With `<2` steps it stays the init default
//     (`0`).
//
// All three are PURE FUNCTIONS of the replay inputs (the visited trajectory) and
// the build-time embeddings, so INV-2 holds: an identical input-log re-derives
// them byte-for-byte, with no wall-clock or unseeded entropy. They are recomputed
// from the whole trajectory each turn rather than mutated in place — the EMA fold
// over the ordered steps yields the identical result an incremental update would,
// and recomputation keeps the function a transparent map from (trajectory) to
// (triple) with no hidden accumulator to drift.
//
// The numeric constants (the EMA decay, the `[0,1]` mapping) are documented,
// deterministic DEFAULTS; tuning them is Phase 6 empirical work, out of scope
// (§7, issue #112). INV-1: pure, headless — `schema` + engine internals only.
// INV-4: never throws — a degenerate or empty trajectory yields the init triple.

import type { SessionState } from "schema";
import type { Graph } from "./graph";

/**
 * The EMA decay constant for {@link computeTrajectory}'s `momentum` — the weight
 * the previous smoothed momentum keeps when a new step folds in
 * (`momentum ← decay·momentum + (1−decay)·step`). `0.5` is a documented,
 * deterministic default (equal weight to history and the newest step); Phase 6
 * tunes it against a real corpus (§7, out of scope).
 */
export const MOMENTUM_DECAY = 0.5;

/** The three trajectory fields {@link computeTrajectory} produces (§3.8). */
export interface Trajectory {
  trace_centroid: number[] | null;
  momentum: number[] | null;
  path_coherence: number;
}

/** The init triple — the state a session with no completed steps holds (§3.8). */
export const INITIAL_TRAJECTORY: Trajectory = {
  trace_centroid: null,
  momentum: null,
  path_coherence: 0,
};

// Componentwise `a − b`, truncated to the shorter length so a ragged pair never
// throws (INV-4). Embeddings from one substrate share a dimension, so this is the
// equal-length case in practice.
function subtract(a: readonly number[], b: readonly number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a[i]! - b[i]!;
  return out;
}

// Cosine SIMILARITY `cos(a,b)` over two vectors, range `[-1,1]`, larger = more
// aligned. A length-mismatched or zero-magnitude vector yields `0` (orthogonal),
// never throws (INV-4) — mirrors `graph.ts`'s cosine-distance guard.
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// The mean of a non-empty list of equal-length vectors, componentwise.
function meanVector(vectors: readonly (readonly number[])[]): number[] {
  const dim = vectors[0]!.length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim && i < v.length; i++) sum[i]! += v[i]!;
  }
  return sum.map((c) => c / vectors.length);
}

/**
 * Compute the {@link Trajectory} triple from the CHRONOLOGICAL embeddings of the
 * positions the player has occupied — `[start, v0, v1, …]`, the start position
 * followed by each visited position in visit order (§3.8). Pure and total
 * (INV-2/INV-4):
 *
 *   - `trace_centroid` — the mean of the VISITED embeddings (`occupied` after the
 *     start); `null` before the first visit.
 *   - `momentum` — the EMA (decay {@link MOMENTUM_DECAY}) over the ordered step
 *     vectors `occupied[i] − occupied[i−1]`; `null` with no steps.
 *   - `path_coherence` — the mean cosine alignment of consecutive step
 *     directions, mapped from `[-1,1]` to `[0,1]`; the init default `0` with
 *     fewer than two steps.
 */
export function computeTrajectory(
  occupied: readonly (readonly number[])[],
): Trajectory {
  // The start position is where the player began, not a place they moved TO, so
  // the "visited positions" the centroid averages are `occupied` after it (§3.8).
  const visited = occupied.slice(1);
  const trace_centroid = visited.length === 0 ? null : meanVector(visited);

  // Step vectors between consecutive occupied positions, in order.
  const steps: number[][] = [];
  for (let i = 1; i < occupied.length; i++) {
    steps.push(subtract(occupied[i]!, occupied[i - 1]!));
  }

  // `momentum` — fold the EMA over the ordered steps. The first step seeds it;
  // each later step blends in at `1 − decay`. Recomputing the fold each turn is
  // identical to an incremental update, and keeps the function pure (no stored
  // accumulator to drift, INV-2).
  let momentum: number[] | null = null;
  for (const step of steps) {
    if (momentum === null) {
      momentum = step.slice();
    } else {
      const blended: number[] = new Array<number>(momentum.length);
      for (let i = 0; i < momentum.length; i++) {
        const s = i < step.length ? step[i]! : 0;
        blended[i] = MOMENTUM_DECAY * momentum[i]! + (1 - MOMENTUM_DECAY) * s;
      }
      momentum = blended;
    }
  }

  // `path_coherence` — the mean cosine alignment of consecutive step directions,
  // mapped `[-1,1] → [0,1]`. Needs at least two steps to have a pair to compare;
  // otherwise it stays the init default (§3.8, B5).
  let path_coherence = 0;
  if (steps.length >= 2) {
    let sum = 0;
    for (let i = 1; i < steps.length; i++) {
      sum += cosineSimilarity(steps[i]!, steps[i - 1]!);
    }
    const meanAlignment = sum / (steps.length - 1);
    // Map the mean cosine `[-1,1]` onto `[0,1]`, clamped against float drift.
    path_coherence = Math.min(1, Math.max(0, (meanAlignment + 1) / 2));
  }

  return { trace_centroid, momentum, path_coherence };
}

/**
 * The chronological embeddings of the positions a session has occupied —
 * `[start, v0, v1, …]` — resolved through the {@link Graph} accessor. The start
 * is the ROOT token's coordinate (the tree node with no parent, §0.9.0 A3); the
 * rest are the `visited_set` tokens' coordinates in visit order. A coordinate the
 * substrate has no embedding for is dropped (INV-4), so the trajectory stays a
 * clean vector list.
 */
export function trajectoryEmbeddings(
  state: SessionState,
  graph: Graph,
): number[][] {
  const refByToken = new Map(
    state.address_tokens.map((n) => [n.token, n.position.vector_ref]),
  );
  const refs: string[] = [];
  const root = state.address_tokens.find((n) => n.parent === null);
  if (root !== undefined) refs.push(root.position.vector_ref);
  for (const token of state.visited_set) {
    const ref = refByToken.get(token);
    if (ref !== undefined) refs.push(ref);
  }

  const embeddings: number[][] = [];
  for (const ref of refs) {
    const embedding = graph.embeddingOf(ref);
    if (embedding !== null) embeddings.push(embedding);
  }
  return embeddings;
}

/**
 * Recompute a session's trajectory triple in place (§3.8) — the per-turn update
 * the server runs after a transition (`recordVisit`). Reads the occupied
 * trajectory through the {@link Graph} accessor, computes the triple, and writes
 * `trace_centroid` / `momentum` / `path_coherence` back onto the state. Mutates
 * run-state; never throws (INV-4). Deterministic from the replay inputs (INV-2),
 * so it needs no logging — it re-derives on replay like `recordVisit` itself.
 */
export function updateTrajectory(state: SessionState, graph: Graph): void {
  const trajectory = computeTrajectory(trajectoryEmbeddings(state, graph));
  state.trace_centroid = trajectory.trace_centroid;
  state.momentum = trajectory.momentum;
  state.path_coherence = trajectory.path_coherence;
}
