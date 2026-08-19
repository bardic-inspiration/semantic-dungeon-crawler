import { describe, expect, it } from "vitest";
import {
  assertWellFormedEmbeddingSpace,
  cosineDistance,
  EmbeddingSpaceError,
  HashingEmbeddingProvider,
  l2Norm,
  l2Normalize,
} from "./embedding";

const provider = new HashingEmbeddingProvider(64);

describe("HashingEmbeddingProvider", () => {
  it("is deterministic: identical text ⇒ identical vector", async () => {
    const [a] = await provider.embed(["the quick brown fox"]);
    const [b] = await provider.embed(["the quick brown fox"]);
    expect(a).toEqual(b);
  });

  it("declares its dimensionality and a pinned identity", () => {
    expect(provider.dimensions).toBe(64);
    expect(provider.id).toBe("hashing-embed-v1-d64");
  });

  it("produces different vectors for clearly different text", async () => {
    const [a, b] = await provider.embed([
      "forests rivers mountains valleys",
      "commerce markets prices trade",
    ]);
    expect(a).not.toEqual(b);
  });
});

describe("L2 normalization and cosine distance", () => {
  it("normalizes to unit length", () => {
    const unit = l2Normalize([3, 4]);
    expect(l2Norm(unit)).toBeCloseTo(1, 12);
  });

  it("cosine distance of identical normalized vectors is 0", () => {
    const v = l2Normalize([1, 2, 3]);
    expect(cosineDistance(v, v)).toBeCloseTo(0, 12);
  });

  it("cosine distance of opposite vectors is 2 (range [0,2])", () => {
    const a = l2Normalize([1, 0]);
    const b = l2Normalize([-1, 0]);
    expect(cosineDistance(a, b)).toBeCloseTo(2, 12);
  });

  it("orthogonal vectors have distance 1", () => {
    expect(
      cosineDistance(l2Normalize([1, 0]), l2Normalize([0, 1])),
    ).toBeCloseTo(1, 12);
  });
});

describe("assertWellFormedEmbeddingSpace — fail-loud gate (C4)", () => {
  it("accepts a well-formed, varied space", () => {
    expect(() =>
      assertWellFormedEmbeddingSpace(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        3,
      ),
    ).not.toThrow();
  });

  it("rejects non-uniform dimension", () => {
    expect(() =>
      assertWellFormedEmbeddingSpace(
        [
          [1, 0, 0],
          [0, 1],
        ],
        3,
      ),
    ).toThrow(EmbeddingSpaceError);
  });

  it("rejects a non-finite (NaN) value", () => {
    expect(() =>
      assertWellFormedEmbeddingSpace(
        [
          [1, 0, 0],
          [NaN, 1, 0],
        ],
        3,
      ),
    ).toThrow(/non-finite/);
  });

  it("rejects a zero-norm vector", () => {
    expect(() =>
      assertWellFormedEmbeddingSpace(
        [
          [1, 0, 0],
          [0, 0, 0],
        ],
        3,
      ),
    ).toThrow(/zero-norm/);
  });

  it("rejects degenerate spread (all vectors identical)", () => {
    expect(() =>
      assertWellFormedEmbeddingSpace(
        [
          [1, 1],
          [1, 1],
          [1, 1],
        ],
        2,
      ),
    ).toThrow(/degenerate spread/);
  });

  it("rejects an empty space", () => {
    expect(() => assertWellFormedEmbeddingSpace([], 3)).toThrow(/empty/);
  });
});
