import { describe, it, expect } from "vitest";
import { deriveSeed, createPrng } from "./prng";

describe("deriveSeed", () => {
  it("is deterministic for identical inputs", () => {
    expect(deriveSeed(42, "abc")).toBe(deriveSeed(42, "abc"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const seed = deriveSeed(42, "abc");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });

  it("changes when session_seed or normalized_query changes", () => {
    const base = deriveSeed(42, "abc");
    expect(deriveSeed(43, "abc")).not.toBe(base);
    expect(deriveSeed(42, "abd")).not.toBe(base);
  });
});

describe("createPrng", () => {
  it("yields a fixed sequence for a given seed", () => {
    const a = createPrng(12345);
    const b = createPrng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = createPrng(999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds yield different sequences", () => {
    const a = createPrng(1);
    const b = createPrng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});
