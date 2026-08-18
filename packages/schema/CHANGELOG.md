# Changelog — `schema`

All notable changes to the `schema` package are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the package is
versioned under [Semantic Versioning](https://semver.org/) — every
schema/protocol surface is versioned and no surface mutates silently
(`INV-5`, SPEC §3.5).

## [Unreleased]

_Nothing yet._

## [0.1.0] — 2026-08-18

Initial Section 3 schema — the shared contract every other package imports
(SPEC §6.2 Phase 1). Types and well-formedness helpers only; no runtime engine
logic. This is the first versioned surface, so there is no prior release to
break — the entries below record what the surface now contains.

### Added

- **Entity schema (§3.1)** — `Entity`, `SourceSpan` (incl. `members` for
  discontinuous composite spans, §0.10.0 B6), `Archetype`, `Affordance`,
  `LayoutHint`, `EntityState`, all with the `§0.9.0` additions (`prose`,
  `source_span`, `contains`, and `EntityState.local_coherence`).
- **Structured tag grammar (§3.6)** — `ParsedTag`, `ModifierConfig`, plus
  `parseTag()` / `isWellFormedTag()` validating tag *syntax* only (`INV-4`).
- **`isValidEntity()` type guard** — structural well-formedness of an `Entity`;
  makes no coherence/taste judgement (`INV-4`).
- **`fixtures/entity.example.json`** — a hand-written entity that validates
  against `Entity` (SPEC §6.2 Exit).
- **Overlay types (§3.7)** — `AddressRegistryEntry`, `Provenance`,
  `EntryReference`, `Snapshot`, `LinkRecord`, `PrimitiveExposure`, and the
  client-facing `AddressLabel` projection (§5.1 A10).
- **Ruleset data shape (§3.4)** — `Ruleset` (with the §0.9.0 bundle:
  `authored_against?`, `modifier_registry?`, `resolvers?`,
  `interpretation_lookup?`, `primitive_exposure?`, `movement_affordances?`),
  `Layer`, `RuleBlock`, `ScopeCondition`, `Effect` (traversal-control plus
  `write`/`primitive`/`emit`/`end`), `InterpretationLookup`,
  `InterpretationEntry`.
- **Protocol shapes (§3.2/§3.3)** — `ResolvedRoomResponse`, `ResolvedExit`, the
  open-union `ResolutionStatus` (§0.11.0 C2), `InteractRequest`,
  `InteractResponse`, and `InteractionResult`; plus the `DebugTrace` (§4.6) wire
  shape `ResolvedRoomResponse.debug` carries when server debug mode is on (the
  solver that fills it is Phase 3).
- **Session state & input log (§3.8/§3.9)** — `SessionState`, `CoordinateRef`,
  `InputLogEntry` — the determinism-replay surface (`INV-2`).

[Unreleased]: https://github.com/bardic-inspiration/semantic-dungeon-crawler/compare/schema-v0.1.0...HEAD
[0.1.0]: https://github.com/bardic-inspiration/semantic-dungeon-crawler/releases/tag/schema-v0.1.0
