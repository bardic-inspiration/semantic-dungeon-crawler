import { describe, expect, it } from "vitest";
import { computeLocalCoherence } from "./coherence";
import { l2Normalize } from "./embedding";

describe("computeLocalCoherence", () => {
  it("returns values in [0,1]", () => {
    const vectors = [
      l2Normalize([1, 0, 0]),
      l2Normalize([0, 1, 0]),
      l2Normalize([0, 0, 1]),
      l2Normalize([1, 1, 0]),
    ];
    for (const c of computeLocalCoherence(vectors, 2)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("scores a tight cluster higher than a dispersed set (ordering)", () => {
    // Cluster: three nearly-identical vectors. Dispersed: three orthogonal.
    const tight = [
      l2Normalize([1, 0.01, 0]),
      l2Normalize([1, 0.02, 0]),
      l2Normalize([1, 0.0, 0.01]),
    ];
    const dispersed = [
      l2Normalize([1, 0, 0]),
      l2Normalize([0, 1, 0]),
      l2Normalize([0, 0, 1]),
    ];
    const tightMean = mean(computeLocalCoherence(tight, 2));
    const dispersedMean = mean(computeLocalCoherence(dispersed, 2));
    expect(tightMean).toBeGreaterThan(dispersedMean);
  });

  it("a single point has coherence 1.0 (no neighborhood)", () => {
    expect(computeLocalCoherence([l2Normalize([1, 2, 3])])).toEqual([1]);
  });

  it("empty input yields an empty field", () => {
    expect(computeLocalCoherence([])).toEqual([]);
  });
});

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
