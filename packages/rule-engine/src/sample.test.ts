import { describe, it, expect } from "vitest";
import { sample } from "./sample";
import { createPrng } from "./prng";

describe("sample", () => {
  it("returns no_result over an empty candidate set and never throws", () => {
    const rng = createPrng(1);
    expect(() => sample([], () => 1, rng)).not.toThrow();
    expect(sample([], () => 1, rng)).toEqual({ kind: "no_result" });
  });

  it("draws through the PRNG weighted by soft-scores", () => {
    // Fixed soft-scores; a fixed seed makes the draw fully determined.
    const candidates = ["a", "b", "c"];
    const weights: Record<string, number> = { a: 1, b: 1, c: 8 };
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const rng = createPrng(2024);
    for (let i = 0; i < 1000; i++) {
      const draw = sample(candidates, (c) => weights[c]!, rng);
      expect(draw.kind).toBe("drawn");
      if (draw.kind === "drawn") counts[draw.value]!++;
    }
    // "c" carries 80% of the weight; it must dominate.
    expect(counts["c"]!).toBeGreaterThan(counts["a"]! + counts["b"]!);
  });

  it("never draws a zero-weight candidate when positive weights exist", () => {
    const candidates = ["zero", "one"];
    const weights: Record<string, number> = { zero: 0, one: 1 };
    const rng = createPrng(7);
    for (let i = 0; i < 200; i++) {
      const draw = sample(candidates, (c) => weights[c]!, rng);
      expect(draw).toEqual({ kind: "drawn", value: "one" });
    }
  });

  it("draws uniformly (never no_result) when all weights are zero", () => {
    const candidates = ["a", "b"];
    const rng = createPrng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const draw = sample(candidates, () => 0, rng);
      expect(draw.kind).toBe("drawn");
      if (draw.kind === "drawn") seen.add(draw.value);
    }
    expect(seen.size).toBe(2);
  });

  it("treats non-finite or negative weights as zero without throwing", () => {
    const candidates = ["nan", "neg", "ok"];
    const weights: Record<string, number> = { nan: NaN, neg: -5, ok: 1 };
    const rng = createPrng(11);
    for (let i = 0; i < 100; i++) {
      const draw = sample(candidates, (c) => weights[c]!, rng);
      expect(draw).toEqual({ kind: "drawn", value: "ok" });
    }
  });
});
