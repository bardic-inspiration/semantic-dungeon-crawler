# Invariant Implementation Notes

Implementation-level guidance for upholding the invariants `INV-1`..`INV-5`. The
invariants themselves live in [`AGENTS.md`](../AGENTS.md) §2 and are the stable,
timeless statements — this file holds the churn-prone mechanics (seed
derivation, which ESLint rule enforces what, which phase added it) so a phase
update can revise the mechanics here without diffing the constitution.

## The two easiest to break by accident

- **`INV-2` (determinism).** Reach for a seeded PRNG derived from
  `(session_seed, normalized_query)` (SPEC §0.13.0 — `normalized_query` carries
  the position; `turn_count` is not a seed component), never `Math.random()` or
  `Date.now()`. Under the §0.8.0 three-tier model this is a *replay* guarantee:
  substrate queries (Tier 2) are stochastic across seeds by design but seeded
  from `(session_seed, normalized_query)`, so replaying one input-log reproduces
  byte-identical output; overlay state (Tier 3) is deterministic outright
  (SPEC §3.7, §4.5).

- **`INV-3` (import boundary).** Enforced by an ESLint rule (added in Phase 4 for
  `client-cli`, SPEC §6.5; extended to `client-threejs` in Phase 5, SPEC §6.6).
  That rule guards `client-cli` via a shared, parameterized factory in
  `eslint/`, so a forbidden engine import fails `npm run lint` — respect the
  boundary from day one. The line the rule enforces is *resolved output vs.
  engine internals* (`INV-3` in `AGENTS.md` §2, and
  `docs/design/0003-a-series-resolution.md`), not *text vs. no-text*.
