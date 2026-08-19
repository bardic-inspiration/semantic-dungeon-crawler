import { describe, expect, it } from "vitest";
import { l2Normalize } from "./embedding";
import { FlatIndex } from "./index-flat";

describe("FlatIndex", () => {
  const vectors = [
    l2Normalize([1, 0]),
    l2Normalize([0.9, 0.1]),
    l2Normalize([0, 1]),
  ];
  const index = new FlatIndex(vectors);

  it("returns nearest neighbors in ascending distance order", () => {
    const result = index.query(l2Normalize([1, 0]), 2);
    expect(result[0]!.index).toBe(0);
    expect(result[1]!.index).toBe(1);
    expect(result[0]!.distance).toBeLessThan(result[1]!.distance);
  });

  it("queryByIndex excludes the item itself", () => {
    const result = index.queryByIndex(0, 3);
    expect(result.map((n) => n.index)).not.toContain(0);
    expect(result[0]!.index).toBe(1); // [0.9,0.1] is nearest to [1,0]
  });

  it("breaks equal distances by ascending corpus index (deterministic)", () => {
    // Two vectors equidistant from the query, placed out of index order.
    const tied = new FlatIndex([
      l2Normalize([1, 1]), // index 0
      l2Normalize([1, -1]), // index 1 — same distance from [1,0]
    ]);
    const result = tied.query(l2Normalize([1, 0]), 2);
    expect(result[0]!.distance).toBeCloseTo(result[1]!.distance, 12);
    expect(result.map((n) => n.index)).toEqual([0, 1]);
  });
});
