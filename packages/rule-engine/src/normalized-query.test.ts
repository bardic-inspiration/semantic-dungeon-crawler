import { describe, it, expect } from "vitest";
import type { CoordinateRef } from "schema";
import type { Query } from "./query";
import {
  normalizeQuery,
  quantize,
  QUANTIZATION_DECIMALS,
} from "./normalized-query";

describe("quantize", () => {
  it("rounds to fixed precision so near-identical floats collapse", () => {
    expect(quantize(0.30000001)).toBe(quantize(0.29999999));
    expect(quantize(0.3)).toBe(0.3);
  });

  it("normalizes -0 to 0", () => {
    expect(Object.is(quantize(-0), 0)).toBe(true);
  });

  it("uses six decimal places of precision", () => {
    expect(QUANTIZATION_DECIMALS).toBe(6);
    // A difference below the grid vanishes; one above it survives.
    expect(quantize(1.0000001)).toBe(quantize(1.0000002));
    expect(quantize(1.000001)).not.toBe(quantize(1.000002));
  });
});

describe("normalizeQuery", () => {
  const origin: CoordinateRef = { vector_ref: "vec:00421" };

  it("two spellings of the same query normalize identically", () => {
    const a: Query = {
      origin,
      k: 8,
      radius: 0.30000001,
      direction: [0.10000001, -0.2],
      filter: { tags: ["mood:tense", "theme:decay"], archetype: "container" },
    };
    const b: Query = {
      // same query, different spelling: float drift + reordered filter keys/array
      origin: { vector_ref: "vec:00421" },
      k: 8,
      radius: 0.29999999,
      direction: [0.09999999, -0.2],
      filter: { archetype: "container", tags: ["theme:decay", "mood:tense"] },
    };
    expect(normalizeQuery(a)).toBe(normalizeQuery(b));
  });

  it("preserves direction order (a gradient vector, not a set)", () => {
    const a: Query = { origin, k: 4, direction: [1, 0, 0] };
    const b: Query = { origin, k: 4, direction: [0, 0, 1] };
    expect(normalizeQuery(a)).not.toBe(normalizeQuery(b));
  });

  it("a different origin ref changes the normalized query", () => {
    const a: Query = { origin, k: 4 };
    const b: Query = { origin: { vector_ref: "vec:99999" }, k: 4 };
    expect(normalizeQuery(a)).not.toBe(normalizeQuery(b));
  });

  it("a different k, radius, direction, or filter changes it", () => {
    const base: Query = { origin, k: 4, radius: 0.5 };
    expect(normalizeQuery(base)).not.toBe(normalizeQuery({ ...base, k: 5 }));
    expect(normalizeQuery(base)).not.toBe(
      normalizeQuery({ ...base, radius: 0.6 }),
    );
    expect(normalizeQuery(base)).not.toBe(
      normalizeQuery({ ...base, direction: [1, 0] }),
    );
    expect(normalizeQuery(base)).not.toBe(
      normalizeQuery({ ...base, filter: { tags: ["x"] } }),
    );
  });

  it("distinguishes an absent optional field from a present one", () => {
    const absent: Query = { origin, k: 4 };
    const present: Query = { origin, k: 4, radius: 0 };
    expect(normalizeQuery(absent)).not.toBe(normalizeQuery(present));
  });

  it("float-origin case: rounding a raw position to a vector_ref closes the hazard", () => {
    // The solver rounds the player's raw float position to the nearest STORED
    // index coordinate and passes it here BY REF (§4.5) — a raw float vector never
    // reaches the seed. This models that upstream rounding: two near-identical
    // raw positions round to the same stored coordinate, so their queries seed
    // identically; a materially different position rounds elsewhere.
    const GRID = 100; // stored index coordinates sit on a coarse grid
    const roundToStoredRef = (raw: number[]): CoordinateRef => ({
      vector_ref: "vec:" + raw.map((c) => Math.round(c * GRID)).join(","),
    });

    const rawA = [0.123456, 0.654321];
    const rawADrifted = [0.123457, 0.654319]; // float drift within a grid cell
    const rawFar = [0.9, 0.1];

    const q = (o: CoordinateRef): Query => ({ origin: o, k: 4 });

    expect(normalizeQuery(q(roundToStoredRef(rawA)))).toBe(
      normalizeQuery(q(roundToStoredRef(rawADrifted))),
    );
    expect(normalizeQuery(q(roundToStoredRef(rawA)))).not.toBe(
      normalizeQuery(q(roundToStoredRef(rawFar))),
    );
  });

  it("returns a hex SHA-256 digest, not the raw query", () => {
    const out = normalizeQuery({ origin, k: 4 });
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });
});
