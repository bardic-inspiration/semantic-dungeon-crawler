// packages/corpus-builder/src/coherence.ts
//
// SPEC §6.3 (local-coherence precompute, decision D4) / §0.10.0 B5 —
// `local_coherence` is EMBEDDING-NEIGHBORHOOD TIGHTNESS: the mean cosine
// SIMILARITY of a point to its k nearest neighbors, normalized to [0,1]. It is a
// FIXED property of the corpus, computed ONCE here (not per-query, D4), and
// ENGINE-PRODUCED — never author-defined (§3.1). The runtime interpolates it at a
// resolved point (`EntityState.local_coherence`, `static.local_coherence`); that
// interpolation is Phase 3, not here.

import { dot } from "./embedding";
import { FlatIndex } from "./index-flat";

/** Default neighborhood size for the coherence field. */
export const DEFAULT_COHERENCE_K = 8;

/**
 * Precompute the local-coherence field over `vectors` (assumed L2-normalized).
 * For each point: take its `k` nearest neighbors (by cosine distance), average
 * the cosine SIMILARITY to them (similarity = 1 - distance for normalized
 * vectors), then map [-1,1] → [0,1] via `(s + 1) / 2`. A tightly-clustered point
 * scores high; a dispersed one scores low.
 *
 * A lone point (no neighbors) has a trivially tight neighborhood → 1.0.
 */
export function computeLocalCoherence(
  vectors: number[][],
  k: number = DEFAULT_COHERENCE_K,
): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const index = new FlatIndex(vectors);
  const effectiveK = Math.min(k, n - 1);
  const field: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const neighbors = index.queryByIndex(i, effectiveK);
    let simSum = 0;
    for (const neighbor of neighbors) {
      simSum += dot(vectors[i]!, vectors[neighbor.index]!);
    }
    const meanSim = simSum / neighbors.length;
    // Clamp guards against tiny floating-point overshoot outside [-1,1].
    field[i] = Math.min(1, Math.max(0, (meanSim + 1) / 2));
  }

  return field;
}
