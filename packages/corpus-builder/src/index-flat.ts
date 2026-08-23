// packages/corpus-builder/src/index-flat.ts
//
// SPEC §6.3 (index construction) / §0.10.0 B2 — the substrate index is behind an
// interface; the ALPHA DEFAULT is an EXACT FLAT k-NN index (deterministic; equal
// distances broken by CORPUS ORDER). A real ANN (HNSW, …) is a deferred,
// must-be-deterministic optimization gated by the C1 scale threshold (§6.7).
//
// The substrate is queried LIVE at runtime (§3.7 Tier 2); this build-time index
// is what makes that possible. Distance is cosine over L2-normalized vectors
// (§4.2, `./embedding`).

import { cosineDistance } from "./embedding";

export interface Neighbor {
  index: number; // position in the indexed corpus (also the tie-break key)
  distance: number; // cosine distance, [0, 2], smaller = nearer
}

export interface SubstrateIndex {
  readonly size: number;
  /** k nearest to `vector` (may include an exact match). */
  query(vector: number[], k: number): Neighbor[];
  /** k nearest to indexed item `i`, excluding `i` itself. */
  queryByIndex(i: number, k: number): Neighbor[];
}

/**
 * The §6.3 index stage behind an interface (§0.10.0 B2). An `IndexFactory` builds
 * a `SubstrateIndex` over a vector set; its `id` is a pinned stage identity that
 * feeds `substrate_version` (the local-coherence field is computed *through* the
 * index, so a different index implementation changes the bundle's contents — the
 * same reason `coherenceK` and the embedding provider are hashed). The alpha
 * default is the exact flat k-NN index; a deterministic ANN is the deferred swap-in.
 */
export interface IndexFactory {
  readonly id: string;
  build(vectors: number[][]): SubstrateIndex;
}

/** The alpha-default index stage: an exact flat k-NN index (§0.10.0 B2). */
export const defaultIndexFactory: IndexFactory = {
  id: "flat-v1",
  build: (vectors) => new FlatIndex(vectors),
};

/**
 * Exact flat k-NN over the full vector set. O(n·d) per query — fine at alpha
 * scale (C1: low-thousands of spans). Ties (equal distance) are broken by
 * ascending corpus index, making results fully deterministic (§0.10.0 B2).
 */
export class FlatIndex implements SubstrateIndex {
  private readonly vectors: number[][];

  constructor(vectors: number[][]) {
    this.vectors = vectors;
  }

  get size(): number {
    return this.vectors.length;
  }

  query(vector: number[], k: number): Neighbor[] {
    return this.rank(vector, k, -1);
  }

  queryByIndex(i: number, k: number): Neighbor[] {
    return this.rank(this.vectors[i]!, k, i);
  }

  private rank(vector: number[], k: number, exclude: number): Neighbor[] {
    const scored: Neighbor[] = [];
    for (let j = 0; j < this.vectors.length; j++) {
      if (j === exclude) continue;
      scored.push({
        index: j,
        distance: cosineDistance(vector, this.vectors[j]!),
      });
    }
    // Ascending distance; ties broken by ascending corpus index (deterministic).
    scored.sort((a, b) =>
      a.distance !== b.distance ? a.distance - b.distance : a.index - b.index,
    );
    return scored.slice(0, Math.max(0, k));
  }
}
