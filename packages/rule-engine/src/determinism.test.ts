// SPEC §4.5 (INV-2) / §0.13.0 — the replay guarantee, stated in terms of the
// seeding chain this issue defines: the same `(session_seed, query)` yields
// byte-identical `sample()` draws across two independent runs, and any change to
// `session_seed` or the query changes the draw. `turn_count` is NOT a seed
// component (§0.13.0), so it cannot enter the draw at all.

import { describe, it, expect } from "vitest";
import type { Query } from "./query";
import { seededRng } from "./prng";
import { sample } from "./sample";

const CANDIDATES = ["a", "b", "c", "d", "e", "f"] as const;
const WEIGHTS: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };

/** Run one seeded resolution: N weighted draws from a fresh PRNG. */
function draws(sessionSeed: number, query: Query): string[] {
  const rng = seededRng(sessionSeed, query);
  const out: string[] = [];
  for (let i = 0; i < 25; i++) {
    const d = sample(CANDIDATES, (c) => WEIGHTS[c]!, rng);
    out.push(d.kind === "drawn" ? d.value : "<none>");
  }
  return out;
}

describe("determinism (§4.5, INV-2)", () => {
  const query: Query = {
    origin: { vector_ref: "vec:00421" },
    k: 6,
    radius: 0.25,
    direction: [0.1, -0.3],
    filter: { tags: ["mood:tense"] },
  };

  it("same (session_seed, query) yields byte-identical draws across runs", () => {
    const run1 = draws(1234, query);
    const run2 = draws(1234, query);
    expect(run1).toEqual(run2);
  });

  it("a different session_seed changes the draw", () => {
    expect(draws(1234, query)).not.toEqual(draws(9999, query));
  });

  it("a different origin (position) changes the draw", () => {
    const elsewhere: Query = { ...query, origin: { vector_ref: "vec:00099" } };
    expect(draws(1234, query)).not.toEqual(draws(1234, elsewhere));
  });

  it("two equivalent query spellings reproduce identical draws", () => {
    const spelled: Query = {
      origin: { vector_ref: "vec:00421" },
      k: 6,
      radius: 0.25000001, // float drift within precision
      direction: [0.1, -0.3],
      filter: { tags: ["mood:tense"] },
    };
    expect(draws(1234, query)).toEqual(draws(1234, spelled));
  });
});
