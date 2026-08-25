// packages/rule-engine/src/graph.ts
//
// SPEC §4.4 / §0.10.0 (B3) — the substrate-query seam the solver (§4.1) composes
// against. `resolveMove`/`populate` never touch `graph.json` directly; they issue
// the unified §3.7.4 `Query` (`./query`) and receive ranked candidates back. This
// module defines that seam (`Graph`) plus a deterministic in-memory
// implementation over minted entity views — the shape a Phase 4 loader materializes
// from `graph.json` (INV-3: the raw embedding stays server-internal; only the
// resolved `Entity` view reaches this layer, never the client).
//
// INV-1: pure, headless — imports `schema` types only, never a renderer.
// INV-2: ranking is total and deterministic — cosine distance, ties broken by
// span declaration order (mirrors the Phase 2 `FlatIndex`), no wall-clock entropy.

import type { Query } from "./query";
import type { SubstrateSpanView } from "./interpretation";

/**
 * The substrate-query surface the solver depends on. One method — the unified
 * §3.7.4 / §4.4 `Query` in, ranked candidates (nearest first) out. The
 * §8-glossary nearest-neighbor / region / gradient kinds are parameterizations of
 * the one `Query` (`k` alone; `k` + `radius`; `k` + `direction`), not separate
 * calls, so one method covers `resolveMove`'s drift query and `populate`'s
 * zero-radius embedding-proximity query alike.
 */
export interface Graph {
  /**
   * Rank the substrate against `q`, returning at most `q.k` candidates nearest
   * first. Excludes the origin span itself (a query never returns its own
   * position). `q.radius`, when set, drops candidates beyond that cosine-distance
   * cutoff (the region / embedding-proximity query, §4.4). `q.filter`, when set,
   * prefilters the pool to spans matching an author tag/archetype filter, and
   * `q.direction`, when set, biases the ranking toward candidates displaced from
   * the origin ALONG that gradient (the gradient query, §4.4 B3). Never throws.
   */
  query(q: Query): SpanCandidate[];
  /**
   * The build-time embedding for a substrate coordinate, by its `vector_ref`, or
   * `null` when no span carries that ref. SERVER-INTERNAL (INV-3): the raw vector
   * lives behind this seam so per-turn trajectory math (§3.8 `trace_centroid` /
   * `momentum` / `path_coherence`) can read it; it never reaches an `Entity` or
   * the wire. Returns a defensive copy so a caller cannot mutate the index.
   */
  embeddingOf(vectorRef: string): number[] | null;
}

/**
 * One ranked substrate result: the span itself, UNINTERPRETED, plus its distance
 * from the query origin. The graph deals in substrate data only — turning a span
 * into an `Entity` is the interpretation lookup's job at resolution (§0.9.0 A13,
 * §3.7.1), so it happens in the solver, not here.
 */
export interface SpanCandidate {
  span: SubstrateSpanView;
  embedding_distance: number;
}

/**
 * One indexed substrate span for {@link createSubstrateGraph}: the span's own
 * data (its `id` is the `vector_ref` token a `Query.origin` addresses it by)
 * paired with the internal vector the ranking runs over. The vector is
 * build-artifact data (INV-3) — it lives here and never reaches an `Entity`.
 *
 * This shape maps 1:1 onto a `graph.json` span (`GRAPH_FORMAT.md`), which is the
 * point: the loader is a projection, not a translation with judgement in it.
 */
export interface GraphSpan {
  span: SubstrateSpanView;
  embedding: number[];
}

// Cosine distance `1 - cos(a,b)` over the two vectors, range [0,2], smaller =
// nearer (§0.10.0 B2). Reimplemented locally so the engine keeps its schema-only
// dependency boundary (the Phase 2 `FlatIndex` uses the same formula). A
// length-mismatched or zero-magnitude vector yields the far end (2), never throws.
function cosineDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 2;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  if (magA === 0 || magB === 0) return 2;
  return 1 - dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Cosine SIMILARITY `cos(a,b)` over two vectors, range [-1,1], larger = more
// aligned. Degenerate (length-mismatched or zero-magnitude) vectors yield 0
// (orthogonal), never throws — the gradient bias then contributes nothing.
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

/**
 * §4.4 (B3) — the weight the gradient bias carries in the ranking score
 * (`score = embedding_distance − GRADIENT_BIAS_WEIGHT · alignment`). A documented,
 * deterministic engine default; Phase 6 tunes it (§7, out of scope). It reorders
 * the radius-bounded pool toward the `direction` gradient WITHOUT changing the
 * region cutoff (which still bounds the raw cosine distance) or the reported
 * `embedding_distance` (still the raw distance predicates read).
 */
export const GRADIENT_BIAS_WEIGHT = 0.5;

/**
 * An author-supplied `Query.filter`, interpreted as a tag/archetype PREFILTER
 * (§4.4 B3). A span passes when — for whichever keys are present — its
 * `archetype` equals `filter.archetype` AND its `semantic_tags` contain every tag
 * in `filter.tags`. An absent, null, or unrecognized filter shape matches
 * everything (INV-4 — a malformed filter narrows nothing rather than throwing).
 */
function passesFilter(span: SubstrateSpanView, filter: unknown): boolean {
  if (filter === undefined || filter === null || typeof filter !== "object") {
    return true;
  }
  const f = filter as { archetype?: unknown; tags?: unknown };
  if (typeof f.archetype === "string" && span.archetype !== f.archetype) {
    return false;
  }
  if (Array.isArray(f.tags)) {
    for (const tag of f.tags) {
      if (typeof tag === "string" && !span.semantic_tags.includes(tag)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Build a deterministic in-memory {@link Graph} over `spans`. Ranking is exact
 * cosine k-NN with ties broken by span declaration order — identical semantics to
 * the Phase 2 `FlatIndex`, so a replay reproduces the same candidate pool
 * byte-for-byte (INV-2). An origin `vector_ref` that names no span ranks every
 * span at distance 0 (declaration order stands) rather than throwing (INV-4).
 */
export function createSubstrateGraph(spans: readonly GraphSpan[]): Graph {
  const byRef = new Map<string, GraphSpan>();
  for (const s of spans) byRef.set(s.span.id, s);

  return {
    query(q: Query): SpanCandidate[] {
      const originVec = byRef.get(q.origin.vector_ref)?.embedding;
      // §4.4 (B3) gradient bias — only when a direction is supplied AND we have an
      // origin to measure displacement from. `alignment` is the cosine of the
      // step `candidate − origin` with the gradient, so a candidate that lies
      // along the momentum scores a LOWER (better) rank while its reported
      // `embedding_distance` stays the raw cosine distance.
      const direction =
        q.direction && q.direction.length > 0 ? q.direction : undefined;
      const ranked = spans
        .map((span, declIndex) => {
          const distance = originVec
            ? cosineDistance(originVec, span.embedding)
            : 0;
          const alignment =
            direction && originVec
              ? cosineSimilarity(
                  subtractVectors(span.embedding, originVec),
                  direction,
                )
              : 0;
          return {
            span,
            declIndex,
            distance,
            score: distance - GRADIENT_BIAS_WEIGHT * alignment,
          };
        })
        .filter((r) => r.span.span.id !== q.origin.vector_ref)
        .filter((r) => passesFilter(r.span.span, q.filter))
        // The region cutoff bounds the RAW cosine distance (unchanged by the
        // gradient bias), so `radius` keeps its §4.4 embedding-proximity meaning.
        .filter((r) => q.radius === undefined || r.distance <= q.radius)
        .sort((a, b) =>
          a.score !== b.score ? a.score - b.score : a.declIndex - b.declIndex,
        );

      const k = Number.isFinite(q.k) ? Math.max(0, Math.floor(q.k)) : 0;
      return ranked.slice(0, k).map((r) => ({
        span: r.span.span,
        embedding_distance: r.distance,
      }));
    },
    embeddingOf(vectorRef: string): number[] | null {
      const embedding = byRef.get(vectorRef)?.embedding;
      // INV-3 — hand back a copy; the index vector never escapes for mutation.
      return embedding ? [...embedding] : null;
    },
  };
}

// Componentwise `a − b`, truncated to the shorter length (never throws, INV-4).
function subtractVectors(a: readonly number[], b: readonly number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = a[i]! - b[i]!;
  return out;
}
