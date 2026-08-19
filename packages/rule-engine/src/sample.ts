// packages/rule-engine/src/sample.ts
//
// SPEC §4.1 / §4.4 — `sample()`, the seeded weighted draw at the base of both
// `resolveMove` and `populate`. Draws one candidate weighted by its soft-score
// through a seeded PRNG (§4.5, `prng.ts`).
//
// §0.11.0 (C2) — the degenerate (empty) resolution: over an EMPTY candidate set
// `sample()` returns "no result" and NEVER throws. A zero-candidate query is a
// valid, well-formed resolution (an empty room), not a failure — the engine must
// not hard-lock or error at this layer (INV-4).

/** The result of a draw: a chosen candidate, or the no-result of an empty set. */
export type Draw<T> = { kind: "drawn"; value: T } | { kind: "no_result" };

/**
 * Draw one candidate weighted by `weightedBy` through the seeded `rng`.
 *
 * - Empty candidate set → `{ kind: "no_result" }`, never throws (§0.11.0 C2).
 * - Non-finite or non-positive weights are treated as 0 (a hard decision removes
 *   a candidate; a soft-score never does — INV-4 keeps this total-safe).
 * - All weights 0 → a uniform draw, so a well-formed candidate set never collapses
 *   to "no result" purely from its soft-scores (the relativistic-drift default).
 */
export function sample<T>(
  candidates: readonly T[],
  weightedBy: (candidate: T) => number,
  rng: () => number,
): Draw<T> {
  if (candidates.length === 0) {
    return { kind: "no_result" };
  }

  const scored = candidates.map((value) => {
    const weight = weightedBy(value);
    return {
      value,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 0,
    };
  });

  const total = scored.reduce((sum, s) => sum + s.weight, 0);

  if (total <= 0) {
    const index = Math.min(
      Math.floor(rng() * scored.length),
      scored.length - 1,
    );
    return { kind: "drawn", value: scored[index]!.value };
  }

  let target = rng() * total;
  for (const s of scored) {
    target -= s.weight;
    if (target < 0) {
      return { kind: "drawn", value: s.value };
    }
  }
  // Floating-point tail: the running subtraction can leave `target` at exactly 0.
  // The last candidate owns that boundary.
  return { kind: "drawn", value: scored[scored.length - 1]!.value };
}
