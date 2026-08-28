// packages/corpus-builder/src/embedding.ts
//
// SPEC §6.3 (embedding step) / §0.10.0 B2 — the swappable embedding stage.
// Vectors are L2-NORMALIZED AT BUILD TIME, which fixes `static.embedding_distance`
// as COSINE DISTANCE, range [0, 2], smaller = nearer, provider-independent (§4.2).
// The provider is behind an interface selected by config — NOT hardcoded to one
// vendor. This module ships the deterministic, offline, dependency-free
// feature-hashing provider: a very lightweight TEST-MODE provider (identical text
// ⇒ identical vector; INV-2 build determinism, no network, no model download). It
// carries no real semantic signal, so it is for build-pipeline tests that do NOT
// concern the embedding space itself (segmentation, provenance, versioning, I/O).
// The pre-alpha DEFAULT is the real, model-based `MiniLmEmbeddingProvider`
// (minilm-embedding.ts), selected via config (`config.ts`). Remote/API providers
// (OpenAI, …) remain the deferred swap-in.
//
// The FAIL-LOUD gate (§0.11.0 C4) rejects a MALFORMED build — non-uniform
// dimension, non-finite values, zero norms, or degenerate spread — before it is
// written. This does NOT touch INV-4: rejecting a malformed *build* is not
// rejecting authored *content*; the runtime engine still never taste-polices.

/** A pinned embedding provider. `id` feeds `substrate_version`. */
export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  /** Embed each input text into a raw (un-normalized) vector of `dimensions`. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Thrown by the fail-loud gate when the embedding space is malformed (C4). */
export class EmbeddingSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingSpaceError";
  }
}

const DEFAULT_DIMENSIONS = 256;

/** FNV-1a 32-bit — a small, fast, deterministic string hash. */
function fnv1a(input: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic, offline TEST-MODE provider: hashes character n-grams and word
 * tokens into a fixed-dimension vector (the "hashing trick"). Varied text yields
 * a non-degenerate spread; identical text yields an identical vector. No model,
 * no network — a fast, reproducible provider for build-pipeline tests that do not
 * concern the embedding space (the model-based `MiniLmEmbeddingProvider` is the
 * pre-alpha default for real builds).
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;

  constructor(dimensions: number = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions;
    this.id = `hashing-embed-v1-d${dimensions}`;
  }

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.embedOne(t)));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const lowered = text.toLowerCase();

    const bump = (feature: string) => {
      const h = fnv1a(feature, 0);
      const index = h % this.dimensions;
      // A second hash bit decides the sign, reducing systematic collision bias.
      const sign = (fnv1a(feature, 0x9e3779b9) & 1) === 0 ? 1 : -1;
      vector[index] = vector[index]! + sign;
    };

    for (const m of lowered.matchAll(/[\p{L}\p{N}]+/gu)) bump("w:" + m[0]);
    // Character trigrams over the collapsed-whitespace form give sub-word signal
    // so short or rare-word spans still land somewhere sensible.
    const collapsed = lowered.replace(/\s+/g, " ").trim();
    for (let i = 0; i + 3 <= collapsed.length; i++)
      bump("t:" + collapsed.slice(i, i + 3));

    return vector;
  }
}

/** Euclidean (L2) norm of a vector. */
export function l2Norm(vector: number[]): number {
  let sum = 0;
  for (const v of vector) sum += v * v;
  return Math.sqrt(sum);
}

/** Return a unit-length copy of `vector`. Caller guarantees a non-zero norm. */
export function l2Normalize(vector: number[]): number[] {
  const norm = l2Norm(vector);
  return vector.map((v) => v / norm);
}

/** Dot product — cosine SIMILARITY for two L2-normalized vectors, in [-1, 1]. */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/**
 * COSINE DISTANCE for two L2-normalized vectors: `1 - cos_sim`, range [0, 2],
 * smaller = nearer (§4.2, §0.10.0 B2). Provider-independent by construction.
 */
export function cosineDistance(a: number[], b: number[]): number {
  return 1 - dot(a, b);
}

const SPREAD_EPSILON = 1e-9;

/**
 * FAIL-LOUD "well-formed embedding space" gate (§0.10.0 B2, §0.11.0 C4). Rejects:
 * non-uniform dimension, non-finite values, zero norms, and degenerate spread
 * (every vector identical — e.g. a corpus that embeds to one repeated vector).
 * Operates on the RAW (pre-normalization) vectors so a zero-norm span is caught.
 */
export function assertWellFormedEmbeddingSpace(
  vectors: number[][],
  expectedDimension: number,
): void {
  if (vectors.length === 0) {
    throw new EmbeddingSpaceError(
      "empty embedding space: no spans to embed (need source material for meaningful queries)",
    );
  }

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i]!;
    if (v.length !== expectedDimension) {
      throw new EmbeddingSpaceError(
        `non-uniform dimension: vector ${i} has length ${v.length}, expected ${expectedDimension}`,
      );
    }
    for (let j = 0; j < v.length; j++) {
      if (!Number.isFinite(v[j])) {
        throw new EmbeddingSpaceError(
          `non-finite value: vector ${i} component ${j} is ${v[j]}`,
        );
      }
    }
    if (l2Norm(v) <= SPREAD_EPSILON) {
      throw new EmbeddingSpaceError(`zero-norm vector at index ${i}`);
    }
  }

  // Degenerate spread: are all vectors identical to the first? Compare on the
  // raw vectors component-wise.
  const first = vectors[0]!;
  const allIdentical = vectors.every((v) =>
    v.every((component, j) => component === first[j]),
  );
  if (allIdentical) {
    throw new EmbeddingSpaceError(
      "degenerate spread: every vector is identical (corpus embeds to one repeated point)",
    );
  }
}

/**
 * The shared test-mode hashing provider instance. It backs the `hashing` registry
 * id and is the `runBuild` fallback used by tests that inject no provider — so unit
 * tests stay offline and fast. Real builds default to `minilm` (see `config.ts`).
 */
export const defaultEmbeddingProvider = new HashingEmbeddingProvider();
