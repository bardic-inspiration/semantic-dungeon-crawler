# Changelog — `schema`

All notable changes to the `schema` package are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the package is
versioned under [Semantic Versioning](https://semver.org/) — every
schema/protocol surface is versioned and no surface mutates silently
(`INV-5`, SPEC §3.5).

## [Unreleased]

### Changed

- **`SPEC_VERSION` is now `0.13.1`, in step with SPEC.md's `spec-version`
  header (§3.5, INV-5)** — the constant (and the `X-Spec-Version` header §5.1
  echoes from it) had been left at `0.12.0` when SPEC.md advanced to `0.13.0`
  and `0.13.1`; those two amendments carried no schema/protocol **surface**
  change (turn_count decoupled from the seed, §0.13.0; tokenizer default named,
  §0.13.1), so no type here breaks, but the version this build advertises must
  still track the document header the constant is defined to mirror. Bringing it
  in line closes the drift. `version.test.ts` now reads the header out of
  SPEC.md and asserts equality rather than pinning a literal, so a future
  SPEC.md-only bump fails the suite the way its comment always claimed — the
  hardcoded expectation could not catch a document-only bump, which is how this
  drift slipped through.

- **`SessionState.registry` / `links` are the PER-SESSION overlay layer, not a
  player-only layer (§3.8, SPEC §0.9.0 A8)** — a documentation/semantics
  clarification, no type change. The overlay primitives now execute,
  and a rule-driven (`author_runtime`) write and an exposed player
  (`player`) write both live in this per-session layer, distinguished by their
  `provenance` field; a read merges the layer over the shared build base (empty
  for alpha), session winning, and the §5.1 client view filters to `player`
  (INV-3). The field comments and the SPEC §3.8 layering paragraph are updated to
  match (`Provenance` and the field types are unchanged). Server-internal
  (INV-3), so **not a spec-version bump**.

### Added

- **Protocol-boundary error taxonomy — `ProtocolBoundaryError` +
  `MalformedRulesetError` / `UnknownSessionError` / `MalformedRequestError` /
  `NetworkFailureError`, `ProtocolErrorCode`, `isProtocolBoundaryError`
  (`errors.ts`), and `isWellFormedRuleset` (`ruleset.ts`) (§2.1, §6.7)** — the
  one shared, typed taxonomy §2.1 ("Config & errors") calls for, replacing the
  ad hoc throws at protocol edges. Each server-emitted member owns a stable wire
  `code` and the HTTP status the server maps it to (`malformed_ruleset` 400,
  `unknown_session` 404, `malformed_request` 400); `network_failure` is
  client-only (no HTTP status — no response arrived) and both clients raise it on
  a transport failure instead of leaking a raw `fetch` throw. Lives in `schema`
  because every package imports it (server maps members to responses; clients
  raise/receive them), the same reason the Section 3 types do.

  Additive and **not a spec-version bump**. The §5.1 envelope shape
  (`{ error: { code, message } }`) is unchanged — only the `code` tokens for
  these boundary cases are now drawn from a documented taxonomy rather than an
  ad hoc `bad_request`. §5.1 does not enumerate the `code` tokens (it types
  `code` as "a stable machine token"), no in-repo adapter switches on the old
  literals, and INV-4 is preserved: `isWellFormedRuleset` /
  `MalformedRulesetError` judge SHAPE only, so a well-formed-but-incoherent
  ruleset still runs and is never rejected.

- **`Ruleset.substrate` / `SubstrateRulesetConfig` / `GradientSource` (§3.4,
  SPEC §0.10.0 B3)** — the substrate-query knobs B3 names as "ruleset config with
  engine defaults". For now the block carries `gradient_source` (`"none"` |
  `"momentum"`): `"momentum"` feeds the session's `dynamic.momentum` (§3.8) into
  the movement `Query.direction` so drift is biased along the recent trajectory,
  and `"none"` (the engine default) issues no direction. Every field is optional
  with an engine default, so a ruleset omitting the block — and therefore every
  existing ruleset — resolves exactly as before: pure relativistic drift (§0/§1).

  Additive and **not a spec-version bump**: the field is optional author content
  (§3.5 — "adding/removing entries is not an engine version bump"), and the
  zero-config wire behavior is unchanged; only a ruleset that opts in gains the
  gradient query B3 already reserved.

- **`AddressToken` and `SessionState.address_tokens` / `current_token` (§3.8,
  SPEC §0.9.0 A3)** — the append-only overlay address-token tree, realized as
  concrete run-state. `AddressToken` is `{ token, parent, position }`: an opaque,
  engine-minted, replay-deterministic handle (`token`), its place in the
  parent→children exploration tree (`parent`), and the substrate coordinate it
  names (`position`). `SessionState` gains `address_tokens` (the tree) and
  `current_token` (the token at the player's current place — the parent of the
  next mint and the ancestor backtracking truncates to; `null` before the first
  place is minted).

  `visited_set` holds overlay address-tokens (A3), not ephemeral ids, keeping
  the three-way `Entity.id` / address-token / substrate `position` distinction
  the whole A-series rests on. The token tree gives backtracking (A3) an
  ancestor to truncate to and a source for `Entity.contains` (§3.1).

  Additive, and **not a spec-version bump**: `SessionState` is server-internal
  (INV-3, never on the wire), so it is not one of the versioned wire surfaces
  (`Entity`, `ResolvedRoomResponse`, `Ruleset`, the DSL) `X-Spec-Version` guards
  for adapters (`docs/spec-guidelines.md`). The SPEC §3.8 block is updated to
  match.

- **`InteractResponse.movement_blocked?` (§3.3, SPEC §0.12.0)** — optional
  boolean, true iff a movement affordance was invoked and resolution yielded no
  destination. Additive, so nothing breaks. `resolution_status` now describes
  the room and only the room; it no longer doubles as the movement-blocked
  signal, so `POST /interact` and an immediately-following `GET /room/current`
  report the same status for the same room, per §3.3's "full re-resolution,
  same shape as `GET /room/current`".

- **`SPEC_VERSION` (§3.5)** — the running protocol version as one engine-owned
  constant, in a new `src/version.ts`. §5.1's `X-Spec-Version` header echoes it,
  independent of whatever `spec_version` an author's `Ruleset` (§3.4) declares —
  `INV-4` requires running a ruleset whose version disagrees rather than
  rejecting it, so the protocol header cannot be sourced from ruleset content.

  Keep this constant in step with `SPEC.md`'s `spec-version` header;
  `src/version.test.ts` pins the two together so a bump to one without the other
  fails the suite.

### Changed

- **`SPEC.md` is now at `0.13.1`** (from `0.11.0`). No type in this package
  changed shape, so no surface here breaks. `SPEC.md` §0.12.0 assigns
  §3.6.3's resolver dispatch to `packages/rule-engine`; §0.13.0 removes
  `turn_count` from the substrate seed derivation (§4.5) — a
  `packages/server`/`packages/rule-engine` change, not a type change here;
  §0.13.1 names the shipped tokenizer as the alpha default with no
  schema/protocol surface change.

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
