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
  `(graph.json, ruleset, session_seed, input-log)`, output is **byte-identical**
  across independent runs. Sampling uses a seeded PRNG derived from
  `(session_seed, normalized_query)` (SPEC §0.10.0 B3 — `normalized_query` is
  the canonicalized, hashed substrate query, so two spellings of one query seed
  identically; SPEC §0.13.0 — `turn_count` is not a seed component) — never
  wall-clock or unseeded randomness. This is tested at two levels, and both are
  required:
  - **Mechanism**, in-process (`packages/rule-engine/src/determinism.test.ts`,
    `solver.test.ts`): repeated `resolveMove`/`populate` calls over a hand-built
    graph agree, and the draw moves when a seed component does.
  - **Criterion**, end to end (`packages/server/src/replay.test.ts`): a real
    `graph.json` built by the `corpus-builder` CLI, a real
    `fixtures/rulesets/*.json` bundle bound through dev-mode
    `POST /session/new`, and the session's §3.9 `input_log` re-POSTed in order —
    the replay procedure §3.9 states — with the raw response bodies compared
    across two runs booted under a reset module registry (`vi.resetModules()` +
    dynamic `import()`), so no PRNG, cache, or counter is shared between them.
    "Byte-identical" is asserted over those raw bodies, never over a
    re-serialization of parsed objects, which would hide key-order drift.
- **Function identity** (SPEC §4.4): a test asserts `resolveMove` and `populate`
  call the *same* `evaluateLayers` reference — not merely equivalent output.
  Since TypeScript cannot compare the reference a function body closed over,
  `solver.test.ts` asserts it in three parts: `solverCore.evaluateLayers` **is**
  the exported `evaluateLayers` (`toBe`), a single spy planted on that property
  observes both entry points, and no call site in `solver.ts` reaches
  `evaluateLayers` outside that indirection (asserted over the module's source
  text, so the indirection cannot be quietly bypassed).
- **`INV-4` conformance** (SPEC §4.3): two `override`-mode layers with
  contradictory hard decisions **do not throw** — resolution is by declaration
  order with a logged warning. The null-ruleset case (`layers: []`) produces pure
  nearest-neighbor drift with no errors.
- **Import boundary** (`INV-3`, SPEC §6.5/§6.6): neither `packages/client-cli`
  nor `packages/client-threejs` imports anything from `packages/rule-engine` or
  `packages/corpus-builder`. The rule lands in **Phase 4** for `client-cli`
  (§6.5) and extends to `client-threejs` in Phase 5 (§6.6) — the terminal client
  is built first, so it is the first one the boundary must hold for. Enforced as
  a real ESLint rule and (optionally) an assertion test.

## Quality bar to merge

- The full Vitest suite is **green** — no skipped tests unless explicitly marked
  with a reason (`it.skip`/`it.todo` with a comment) and justified in the PR.
- New behavior ships with contemporaneous tests; bug fixes ship with a regression
  test that fails before the fix.
- Determinism and import-boundary tests, where applicable to the phase, pass.
- CI runs lint + typecheck + the test matrix; all must be green before merge.
  Exception: changes touching only Markdown skip this gate entirely — see
  [`docs-only-changes.md`](docs-only-changes.md).

This bar is **per PR**. It is not the phase-level **QA/QC pass** that gates a
milestone close: that pass re-runs these checks across the whole assembled phase
and walks the `SPEC.md` §6.x Exit checklist end to end
([`roadmap.md`](roadmap.md) "The phase cycle"). Green CI on every PR is necessary
for it, not sufficient.
