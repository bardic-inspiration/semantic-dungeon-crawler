# Testing Standards

Test-Driven Development is **required**. Write a failing test before the code that
makes it pass.

## Core workflow

- **Red → Green → Refactor**, applied incrementally **per behavior**, not per
  module. Write the smallest failing test that encodes an acceptance criterion,
  make it pass with minimal code, then refactor with the test as a safety net.
- An issue's **acceptance criteria are your pre-written failing tests** — encode
  each as a test before implementing.
- Runner: **[Vitest](https://vitest.dev/)**.

## Test organization

- Tests mirror the source structure within each package: co-locate as
  `src/foo.ts` → `src/foo.test.ts`, or under a package-local `test/` directory —
  be consistent within a package.
- Use descriptive test names that state the behavior
  (`resolveMove returns nearest-neighbor drift when layers is empty`).
- **Fixtures live in `fixtures/`** (SPEC §6.5) and are engine-agnostic — no
  Three.js-specific assumptions. Provide a **minimal**, a **typical**, and a
  **maxed-out** fixture for each surface to exercise edge cases.

## Required test categories (by phase — see SPEC §6)

- **Schema validation** (Phase 1): required/optional fields, type guards, that
  `fixtures/entity.example.json` validates against `Entity` (SPEC §6.2 Exit).
- **Determinism** (`INV-2`, SPEC §4.5): given identical
  `(graph.json, ruleset.dsl, session_seed, input-log)`, `resolveMove` and
  `populate` produce **byte-identical** output across independent runs. Sampling
  uses a seeded PRNG derived from `(session_seed, turn_count)` — never wall-clock
  or unseeded randomness.
- **Function identity** (SPEC §4.4): a test asserts `resolveMove` and `populate`
  call the *same* `evaluateLayers` reference — not merely equivalent output.
- **`INV-4` conformance** (SPEC §4.3): two `override`-mode layers with
  contradictory hard decisions **do not throw** — resolution is by declaration
  order with a logged warning. The null-ruleset case (`layers: []`) produces pure
  nearest-neighbor drift with no errors.
- **Import boundary** (`INV-3`, SPEC §6.6): `packages/client-threejs` imports
  nothing from `packages/rule-engine` or `packages/corpus-builder`. Enforced as a
  real ESLint rule and (optionally) an assertion test.

## Quality bar to merge

- The full Vitest suite is **green** — no skipped tests unless explicitly marked
  with a reason (`it.skip`/`it.todo` with a comment) and justified in the PR.
- New behavior ships with contemporaneous tests; bug fixes ship with a regression
  test that fails before the fix.
- Determinism and import-boundary tests, where applicable to the phase, pass.
- CI runs lint + typecheck + the test matrix; all must be green before merge.
  Exception: changes touching only Markdown skip this gate entirely — see
  [`docs-only-changes.md`](docs-only-changes.md).
