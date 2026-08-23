# Changelog — `schema`

All notable changes to the `schema` package are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the package is
versioned under [Semantic Versioning](https://semver.org/) — every
schema/protocol surface is versioned and no surface mutates silently
(`INV-5`, SPEC §3.5).

## [Unreleased]

### Added

- **`AddressToken` and `SessionState.address_tokens` / `current_token` (§3.8,
  SPEC §0.9.0 A3)** — the append-only overlay address-token tree, realized as
  concrete run-state. `AddressToken` is `{ token, parent, position }`: an opaque,
  engine-minted, replay-deterministic handle (`token`), its place in the
  parent→children exploration tree (`parent`), and the substrate coordinate it
  names (`position`). `SessionState` gains `address_tokens` (the tree) and
  `current_token` (the token at the player's current place — the parent of the
  next mint and the ancestor backtracking truncates to; `null` before the first
  place is minted).

  It exists because §3.8 says `visited_set` holds "overlay ADDRESS-TOKENS (A3),
  not ephemeral ids", but the engine had no token to hold — `packages/server`
  was pushing the destination's substrate `embedding_ref` (a `vector_ref`) into
  `visited_set`, collapsing the three-way `Entity.id` / address-token / substrate
  `position` distinction the whole A-series rests on. With no token tree there was
  nothing for backtracking (A3) to truncate and no source for `Entity.contains`
  (§3.1), which no code path populated. These fields give the token a home.

  Additive, and **not a spec-version bump**: `SessionState` is server-internal
  (INV-3, never on the wire), so it is not one of the versioned wire surfaces
  (`Entity`, `ResolvedRoomResponse`, `Ruleset`, the DSL) `X-Spec-Version` guards
  for adapters (`docs/spec-guidelines.md`). The SPEC §3.8 block is updated to
  match. Surfaced by the Conformance Audit 1 overlay sequence (issue #108).

- **`InteractResponse.movement_blocked?` (§3.3, SPEC §0.12.0)** — optional
  boolean, true iff a movement affordance was invoked and resolution yielded no
  destination. Additive, so nothing breaks.

  It exists because the signal had nowhere to live: `transition_occurred: false`
  also means "this was a local interaction", so `packages/server` had been
  overwriting `new_room.resolution_status` to `"stuck"` to report a blocked
  move. That made `POST /interact` and an immediately-following
  `GET /room/current` report different statuses for the same room, contradicting
  §3.3's "full re-resolution, same shape as `GET /room/current`".
  `resolution_status` now describes the room and only the room.

- **`SPEC_VERSION` (§3.5)** — the running protocol version as one engine-owned
  constant, in a new `src/version.ts`. §5.1's `X-Spec-Version` header echoes it.
  It exists because the package previously had no version of its own: the only
  `spec_version` here was the `Ruleset` field (§3.4), which is *author-supplied
  content*, so `packages/server` sourced the protocol header from whatever
  ruleset it loaded. `INV-4` requires running a ruleset whose version disagrees
  rather than rejecting it, so validation could not fix that — the engine needed
  its own value. Surfaced by the Conformance Audit 1 pass.

  Keep this constant in step with `SPEC.md`'s `spec-version` header;
  `src/version.test.ts` pins the two together so a bump to one without the other
  fails the suite.

### Changed

- **`SPEC.md` is now at `0.12.0`** (from `0.11.0`). No type in this package
  changed shape, so no surface here breaks. Two spec changes land as future work
  against these types rather than edits to them: `InteractResponse` gains an
  optional `movement_blocked?` field (§3.3), and §3.6.3's resolver dispatch is
  assigned to `packages/rule-engine`.

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
