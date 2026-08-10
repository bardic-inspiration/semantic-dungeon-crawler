# Changelog — @sdc/schema

All notable changes to the schema package are documented here. This package is
the single source of truth for the wire and rule schemas; every change follows
[`SPEC.md`](../../SPEC.md) §3.5 versioning (`INV-5`). Adding an `Archetype`/
`Affordance` literal is a MINOR bump; renaming or removing a field is a MAJOR
bump. A change to `src/*` must land its changelog entry in the same commit.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-08-10

### Added

- **Entity schema** (SPEC §3.1): `Entity`, `Archetype`, `Affordance`,
  `LayoutHint`, `EntityState` — the unified representation for rooms and objects.
- **Protocol schema** (SPEC §3.2–3.3, §4.6): `ResolvedRoomResponse`,
  `ResolvedExit`, `InteractRequest`, `InteractResponse`, `DebugTrace`.
- **Ruleset schema** (SPEC §3.4): `Ruleset`, `Layer`, `RuleBlock`, `Effect`,
  `ScopeCondition`.
- `isValidEntity()` — a structural type guard validating well-formedness only,
  never coherence (`INV-4`).
- `fixtures/entity.example.json`, validated against `Entity` by the test suite.
