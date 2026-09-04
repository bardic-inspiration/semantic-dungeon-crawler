# Decision Record 0003 — A-series Resolution (player-facing runtime & engine semantics)

`status: accepted`
`spec-amendment: 0.9.0`
`issues: #15–#27 (A1–A13)`
`supersedes: nothing; extends 0001 (three-tier data model)`

The spec-gap survey ([`open-scope.md`](open-scope.md)) filed thirteen Tier-A
entries: the places where `SPEC.md` was silent, inferred, or self-contradicting
on the **player-facing runtime and engine semantics**. Unlike a scatter of
unrelated omissions, the thirteen turned out to be one interdependent design
question answered from several angles. This record resolves all of them together
and fixes the decisions the `SPEC.md` §0.9.0 amendment implements.

Read [`0001`](0001-three-tier-data-model.md) first: this record builds directly
on the three-tier model (bedrock / substrate / overlay) and its decisions D1–D5,
which stand unchanged.

---

## The unified model (why these are one decision, not thirteen)

The three-tier model (0001) left the *runtime* underspecified. Resolving the
A-series produced a single coherent model:

- **Live navigational state is a substrate coordinate** (Tier 2). Durable memory
  is an **append-only tree of opaque, engine-minted tokens** in the overlay
  (Tier 3). A parent token grouping its children *is* the exploration history
  *and* is exactly an `Entity.contains` composite.
- **Identity is two-level:** an `Entity.id` is ephemeral (valid within one
  resolution, replay-stable via the seed); the *durable* handle for a place is
  its overlay address-token.
- **Meaning is authored, mechanism is engine.** The engine ships traversal,
  interaction, the overlay primitives, and a deterministic rule pipeline. Goals,
  endings, score, inventory, and the meaning of every affordance are author
  content. This is the §0/§1 "engine, not a game" stance made concrete.
- **The corpus reaches the player as data.** Resolved entities carry verbatim
  prose plus positional provenance; the developer decides how it is used.

Everything below is an application of that model.

---

## A1 (#15) — Corpus text reaches the player as resolved data

**Decision.** A resolved entity carries the **verbatim source-span prose** as a
client-facing string, together with **positional metadata**: a string source id
and CSV character range(s) locating the excerpt in its source document. The
prose is "just data" — the DSL and the front-end treat it like any other string,
and the DSL grammar may grow string tooling over time (versioned, §4.2).

**INV-3 refinement.** Resolved prose and its source-position metadata *are*
client-facing resolved output. INV-3 continues to hide graph internals —
embedding vectors, the ANN index, rule definitions, and internal span/token ids —
but a resolved excerpt and a public "where in the source" pointer are output, not
internals. This is stated as an explicit carve-out in `SPEC.md` §0 (`INV-3`).

**Rationale.** A player-facing engine built on a literature corpus that never
shows text is a different, weaker product; the `readable` archetype and `read`
affordance presuppose text. Verbatim excerpts (not summaries) keep Phase 2 free
of a generative model in the build pipeline (see B4) and keep provenance exact.

## A2 (#16) — `Entity.id` is two-level; exits name a resolvable query

**Decision.** Resolve the standing contradiction ("stable node id, matches
graph.json node id" vs. D1's node-free substrate) with **two-level identity**:

- An `Entity.id` is an **ephemeral, per-resolution** id — replay-stable because
  it is derived under the seeded PRNG (`session_seed, turn_count, query`, §4.5),
  but *not* a durable address.
- **Durable identity is the overlay address-token** (A3). Places you can return
  to are places that have a token.
- **`ResolvedExit.target_entity_id` denotes a resolvable query/address token**,
  not a pre-materialized destination. Taking the exit re-runs that query on
  arrival (seeded, hence a re-approximation unless snapshotted).
- Ids are **per-build**: a new `substrate_version` invalidates live ids;
  snapshots (D3) remain readable because they are self-contained.

**Rationale.** Under D1 there is no node table to be "stable" against. Making
`id` ephemeral and pushing durability into the overlay is the only story
consistent with "entities are minted per query." It also makes exits honest:
an exit names *where a query will point*, resolved when the player commits to it.

## A3 (#17) — Backtracking is address-token truncation; re-approximate on return

**Decision.**

- `state.position` is a **substrate coordinate** (Tier 2 live state), never sent
  to the client (INV-3).
- Durable memory is an **append-only tree of opaque minted tokens** in the
  overlay Address Registry. Each token *points to associated data elsewhere* —
  a `coordinate` reference, a `snapshot`, or a `composite` of child tokens. The
  parent→children grouping is the exploration tree and is exactly
  `Entity.contains`.
- **Backtracking = truncating the token path to an ancestor**, then re-resolving
  that ancestor's associated query **fresh** (seeded per §4.5 — "the same kind of
  place," not byte-identical). A subsequent move mints a **sibling** token under
  the ancestor; old branches remain addressable (the tree is monotonic). **Exact**
  return requires an explicit `Snapshot`.
- `EntityState.visited` and `dynamic.visited_set` hold **overlay address-tokens**
  (not ephemeral ids). `visited` is true when an entity's token is in the set.

**Rationale.** Ephemeral ids cannot mean "the same place," so `visited` has to be
defined over the durable handle. Truncation-and-rebranch gives a concrete,
deterministic backtracking mechanic without an engine-owned map, and reuses the
composite/`contains` structure already in the spec. D5's
`reapproximation_tolerance` remains the (deferred) knob for "how similar counts
as the same."

## A4 (#18) — Traversal-capable objects *are* the exits

**Decision.** The signature "movement is an emergent consequence of environmental
interaction" mechanic is realized directly:

- During room resolution, any populated object whose (author-lookup, A13)
  affordance set includes a **movement affordance** becomes a `ResolvedExit`:
  `via_object_id` = that object, `affordance_required` = that affordance,
  `target_entity_id` = a query/address token seeded from that object, `weight` =
  its soft-score/salience. There is no separate exit graph.
- **Which affordances trigger movement is author-configurable**, with engine
  defaults `enter` / `traverse` (and the `portal` archetype).
- §4.1 is amended: the player's chosen traversal object **anchors** the candidate
  set for `resolveMove`; `sample()` remains seeded, so determinism (§4.5) holds.

**Rationale.** This is the one mechanic §1 calls central and §4 never implemented.
Binding exits to traversal-capable objects (rather than a parallel edge table)
keeps population and movement on the same solver (§4.4) and needs no new concept.

## A5 (#19) — Effects can write, in a post-decision commit phase

**Decision.** The `Effect` taxonomy gains a **write capability** (this is the
`A7` "both channels" decision made concrete):

- A write-effect may target **(a) the per-session scratch store**
  (`dynamic.vars.*`, A8) and **(b) an overlay primitive invocation** (Pin,
  Bookmark, Snapshot, Link, Query, Compose). `EntityState` stays engine-owned.
- Write-effects apply in a **separate, deterministic commit phase *after* the
  §4.3 traversal decision** — collected across active layers and applied in
  declaration order, **last-write-wins, never throwing** (INV-4). The hard/soft
  decision logic of §4.3 is unchanged; writes cannot influence the same move's
  candidate filtering.

**Consequence.** Overlay primitives now have **two callers**: the player (A10)
and the rules. Adding a state-writing effect kind is a MAJOR schema change.

**Rationale.** "Rules that can only bias where you go next" is a narrow engine.
The commit-phase design buys expressive authored state while keeping INV-2
(determinism) and INV-4 (messy-is-legal) trivially intact — writes are a pure
function of the already-decided move, seed, and ruleset.

## A6 (#20) — Local interactions are pure author-rules; structured result

**Decision.**

- A local (non-movement) interaction runs the **same** `evaluateLayers` +
  commit-phase pipeline for `(object, affordance)`. The engine assigns **no
  intrinsic meaning** to `read`/`take`/`inspect`/`speak`; they are **engine
  *defaults*, not hard-coded behavior**, and the affordance vocabulary is
  author-extensible (the open-string `Affordance` type already allows this).
- If **no rule matches**, the interaction is a **no-op** returning the unchanged
  room (`transition_occurred: false`).
- `InteractResponse` gains a structured **`interaction_result`**
  (`{ text?, revealed?, effects_summary? }`). It is populated by author rules via
  a small **`emit` effect**, with `effects_summary` auto-derived from the
  commit-phase writes for debug/UX.
- `take` implies no engine inventory: an author wires `take` to an overlay
  primitive (e.g. `Compose`/`Bookmark`); "inventory" is an interpretation of the
  registry (A7).

**Rationale.** Four of six affordances are non-movement; leaving them undefined
made the verb vocabulary decorative. Making them author-driven with a structured
result channel gives interactions real consequence while keeping the engine free
of gameplay semantics.

## A7 (#21) — The engine/game boundary: pure mechanism

**Decision.** The engine is **pure mechanism and ships no gameplay semantics** —
no built-in goals, endings, failure, progression, or score. It provides
traversal, interaction, the overlay primitives, the rule pipeline, and:

- **Two author-state channels** (A5): the durable overlay registry, and a
  per-session `dynamic.vars.*` scratch store that effects can write.
- An **engine-surfaced `ended` flag** — an author-*triggered* terminal signal the
  protocol carries; the engine owns the mechanism, the author owns the trigger.
- **Inventory** modeled via the overlay, not an engine type.

This boundary is stated explicitly in `SPEC.md` §1/§4 (mechanism yes, meaning no).

**Rationale.** "Engine, not game" is only honest if the boundary is written down.
Shipping *mechanism* for state and termination while shipping *no meaning* for
them is exactly the line: authors get the tools, the engine imposes no game.

## A8 (#22) — Session state schema

**Decision.** Add a server-internal, versioned session-state type in
`packages/schema` (never sent to the client except the `ended` signal — INV-3):

- `session_seed`, `position` (coordinate), and the `dynamic.*` run state:
  `turn_count`, `trace_centroid`, `momentum`, `coherence`, `visited_set`
  (address-tokens).
- A **namespaced key/value scratch** `dynamic.vars.*` (write target for A5;
  readable in the DSL — extends §4.2's reserved `dynamic.*`).
- The **`ended`** flag; the accumulating **input-log** (A9).
- **Registry scope is layered:** build- and author_runtime-provenance entries are
  shared per-world (from substrate/ruleset) and immutable during play;
  player-provenance writes live in a per-session overlay; reads see the merge.

**Rationale.** `state` is an argument to the engine's central function and every
DSL predicate; it needed a source of truth. Layering the registry matches the
`Provenance` enum and keeps sessions isolated while sharing authored structure.

## A9 (#23) — Input-log schema, producer, endpoint

**Decision.**

- An input-log is an ordered list of **player/author inputs**: an interact action
  (`{object_id, affordance}`) or a player-invoked overlay primitive
  (`{primitive, args}`). **Rule-driven writes are not logged** — they are
  deterministic consequences replayed from `(seed, ruleset, input-log)`.
- The **server accumulates** each session's log in memory and **exports it** via
  `GET /session/{id}/log`. **Replay** = create a session with the same seed and
  re-POST the logged actions through `/interact`; no dedicated replay endpoint and
  no durable storage (consistent with in-memory sessions, §5.1). It is a new
  `packages/schema` type, author/tester-facing, not part of `ResolvedRoomResponse`.

**Rationale.** INV-2 is *defined* in terms of an artifact that did not exist.
Logging only inputs is exactly sufficient for byte-identical replay and keeps the
log minimal; a server export endpoint is what lets the Phase 3/4 determinism exit
criteria be demonstrated end-to-end.

## A10 (#24) — Overlay runtime plumbing

**Decision.**

- **Players invoke primitives via affordances through `POST /interact`**: an
  author rule maps an affordance to a primitive effect (A5), and §3.7.4 exposure
  gating governs whether the player may. No new client input shape; primitives are
  in-world actions. Rules invoke the same primitives directly (A5).
- Storage/ownership is the layered, in-memory registry (A8).
- Add a **client-facing registry-read endpoint** (e.g.
  `GET /session/{id}/registry`) exposing **player-provenance names/labels only**,
  so an adapter can render bookmarks/map UI. **INV-3 carve-out:** registry
  names/labels are output; vectors, build entries, and raw payloads stay hidden.

**Rationale.** Tier 3 was an interface with no callers. Routing player invocation
through the existing interaction path (rather than a parallel permission system +
new verbs) keeps the wire surface small; the read endpoint is the minimum needed
to make named places navigable in a UI.

## A11 (#25) — Ruleset file format

**Decision.**

- A ruleset file is **structured data (JSON/YAML)** matching the `Ruleset`
  interface; **only** `predicate`/`scope`/value fields are DSL expression strings
  (the exact scope of §4.2). `parser.ts` parses those expressions, not a
  file-level grammar. `fixtures/rulesets/*.dsl` become data files (extension
  updated in the amendment).
- **The ruleset is one bundle.** `Ruleset` is extended beyond `spec_version` +
  `layers` to carry: the **modifier registry** (§3.6.1), **resolver overrides**
  (§3.6.3), the **archetype/interpretation lookup** (A13), **primitive exposure**
  config (§3.7.4), and the **movement-affordance designation** (A4). This is the
  "unit an author shares/forks/versions" (§8) made literal.

**Rationale.** Three partial descriptions (TS shape, `.dsl` text, predicate
grammar) had to collapse to one. §4.2 explicitly scopes the grammar to
expressions only, which points at a data container with embedded expressions
rather than a whole new language to build now.

## A12 (#26) — Ruleset runtime lifecycle

**Decision.**

- Ruleset binding is **gated by a developer-mode server flag** (aligned with the
  existing §2.1/§4.6 config + debug-flag convention): **dev mode on → per-session
  ruleset**, supplied at session creation (**by reference** to a server-registered
  ruleset **or by value** as a POST body) for tight authoring/testing; **dev mode
  off (a shipped game) → server-wide ruleset** fixed at boot, no switch without
  restart.
- The **substrate bundle (`graph.json`) is a server-wide startup config**
  (`--graph`); a rebuild means a restart. Sessions are in-memory over one world.

**Rationale.** The Phase-4 exit criteria require round-tripping *each* fixture
ruleset through the server, which server-wide-only binding cannot do; a shipped
game must not swap rulesets under players' feet. The dev-mode gate serves both
without two products. A server-wide substrate matches the in-memory,
one-world-per-server session model and keeps determinism simple.

## A13 (#27) — Producers for the rest of `Entity`

**Decision.**

- The **archetype/interpretation lookup is author content with engine defaults**
  (same pattern as the modifier registry §3.6.1 and resolvers §3.6.3), keyed by
  archetype/tags. It supplies `layout_hint`, the `salience` default, and the
  default affordance set. It lives in the ruleset bundle (A11), so it is versioned
  as author content, not engine schema.
- `salience` and `layout_hint` are produced **from that lookup at resolution**
  (static with respect to the query — same archetype/tags yield the same hints).
- `state.visited` is **runtime-derived** from `visited_set` (A3).
- `state.coherence`'s *producer* is the D4 build-time coherence field; its
  *semantics/naming* are deferred to **B5 (#32)**, which owns the "three things
  called coherence" disambiguation.

**Rationale.** `density` drives population size and `salience` drives prominence —
load-bearing, not cosmetic. Putting their source in the author lookup keeps the
"engine = mechanism, author = meaning" line and matches the §3.7.1 statement that
object types are interpretations applied via the archetype lookup.

---

## Cross-cutting consequences

### INV-3 refinement (invariant change — reflected in `SPEC.md` §0)
Two classes of resolved output are now explicitly client-facing: **(A1)** source
prose + source-position metadata, and **(A10)** overlay registry names/labels.
INV-3 still forbids the client from receiving embeddings, the ANN index, rule
definitions, and internal ids. This is a *precision* to INV-3, not a weakening —
it distinguishes "resolved output" from "engine internals" at two points the
original wording left ambiguous.

### New `Effect` kinds and the `emit` effect
The taxonomy grows from `{hard_allow | hard_forbid | soft_reweight}` to also
include a **write** effect (scratch key ← expression, and/or primitive
invocation) and an **`emit`** effect (append to `interaction_result`). All new
effects run in the post-decision commit phase (A5) and never throw.

### Developer-mode server flag
A single config flag gates ruleset lifecycle (A12) and is a natural sibling of the
existing debug flag (§2.1, §4.6).

### Version impact
`spec-version` moves **0.8.0 → 0.9.0**. This is a MAJOR, breaking revision:
`Entity`, `ResolvedRoomResponse`/`ResolvedExit`, `InteractResponse`, and `Ruleset`
all change shape; two new schema types (session-state, input-log) appear; the
`Effect` taxonomy expands; §4.1/§4.3/§4.4 pseudocode is amended; new REST
endpoints and a changed session-creation contract are added; and INV-3 is
refined. No `packages/schema/*` code exists yet (Phase 0 is unbuilt), so no
`packages/schema/CHANGELOG.md` entry is required by INV-5 — when Phase 1
implements the schema it must match the §0.9.0 shapes. Conformance fixtures
(§6.5) do not yet exist and will be authored to the 0.9.0 contract.

### What stays out of scope
Decisions D1–D5 (0001) stand. B-series and C-series entries are untouched except
where noted (A13 defers coherence semantics to B5; A2/A10's rebuild behavior
hands the broader compatibility story to C5). The `reapproximation_tolerance`
tuning value (D5) remains deferred to Phase 6.
