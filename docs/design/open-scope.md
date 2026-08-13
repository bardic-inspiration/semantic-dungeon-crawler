# Open Scope — Undefined and Under-Defined Areas of `SPEC.md`

`status: open (Tier A + B resolved)`
`spec-version reviewed: 0.8.0`

> **Update (spec 0.9.0).** All thirteen **Tier A** entries (A1–A13, #15–#27) are
> resolved together in [`0003-a-series-resolution.md`](0003-a-series-resolution.md)
> and amended into `SPEC.md` §0.9.0.
>
> **Update (spec 0.10.0).** All five **Tier B** entries (B1–B5, #28–#32) plus
> **B6** (#44, surfaced during the B-series resolution) are resolved together in
> [`0004-b-series-resolution.md`](0004-b-series-resolution.md) and amended into
> `SPEC.md` §0.10.0. Tier C remains open.

This is a **survey**, not a proposal. It names the places where
[`SPEC.md`](../../SPEC.md) is silent, inferred, or self-contradicting, so each one
can be decided deliberately instead of guessed at by whichever agent reaches it
first — the situation [`issue-standards.md`](../issue-standards.md) ("Open
questions & sub-issues that surface mid-work") tells agents to stop for.

Nothing here changes the spec. Each entry is tracked as a design-track GitHub
issue; resolving one means amending `SPEC.md` per
[`spec-guidelines.md`](../spec-guidelines.md), which is when the answer becomes
contract.

**Scope of the review.** Broad undefined areas only. Refinements that follow
naturally from iterative development — a missing helper, an unhandled edge case
inside a defined mechanism — are out of scope here and belong in the phase queue
([`roadmap.md`](../roadmap.md)). The bar for inclusion: *a competent
implementer could not derive the answer from the spec, and different reasonable
answers produce materially different engines.*

## How this list is used

- Entries are labeled `design`, `spec-revision`, `needs-discussion` and carry
  **no `phase:N` label**, so the scheduled build agents — which pull the
  lowest-numbered `phase:N` issue ([`AGENTS.md`](../../AGENTS.md) §5) — never
  claim an unresolved design question as build work.
- **Blocks** names the earliest SPEC §6 phase that cannot honestly complete while
  the entry is open. A phase should not be declared active over an unresolved
  entry that blocks it.
- Tier A entries are load-bearing: an implementer hits them and cannot proceed
  without inventing spec-defined behavior. Tier B decide whether the pipeline's
  output is meaningful. Tier C are cross-cutting.

## Index

| # | Entry | Blocks |
|---|---|---|
| [#15](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/15) | A1 — No corpus text ever reaches the player | Phase 1 |
| [#16](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/16) | A2 — `Entity.id` identity under the substrate model | Phase 1 |
| [#17](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/17) | A3 — Revisiting and backtracking | Phase 3 |
| [#18](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/18) | A4 — Exit derivation has no algorithm | Phase 3 |
| [#19](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/19) | A5 — Rules cannot change anything | Phase 3 |
| [#20](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/20) | A6 — Local interactions have no semantics | Phase 4 |
| [#21](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/21) | A7 — The engine/game boundary | Phase 3 |
| [#22](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/22) | A8 — Session state has no schema | Phase 1 |
| [#23](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/23) | A9 — The input-log has no definition | Phase 3 |
| [#24](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/24) | A10 — The overlay has no plumbing | Phase 4 |
| [#25](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/25) | A11 — The ruleset file format is undefined | Phase 3 |
| [#26](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/26) | A12 — Rulesets have no runtime lifecycle | Phase 4 |
| [#27](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/27) | A13 — Half of `Entity` has no producer | Phase 2 |
| [#28](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/28) | B1 — Corpus segmentation | Phase 2 |
| [#29](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/29) | B2 — Embedding and index parameters | Phase 2 |
| [#30](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/30) | B3 — What a substrate query *is* | Phase 2 |
| [#31](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/31) | B4 — Auto-tagging strategy | Phase 2 |
| [#32](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/32) | B5 — Three quantities called coherence | Phase 2 |
| [#44](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/44) | B6 — Span composition / discontinuous spans | Phase 2 |
| [#33](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/33) | C1 — No scale or performance budget | Phase 6 |
| [#34](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/34) | C2 — Degenerate-state semantics | Phase 3 |
| [#35](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/35) | C3 — Server trust model | Phase 6 |
| [#36](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/36) | C4 — No way to judge semantic quality | Phase 6 |
| [#37](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/37) | C5 — Cross-artifact compatibility | Phase 4 |
| [#38](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/38) | C6 — Design work has no queue; roadmap drift | Phase 0 |

---

## Tier A — blocks building or playing the engine

> **Resolved in spec 0.9.0** — every entry below (A1–A13) is decided in
> [`0003-a-series-resolution.md`](0003-a-series-resolution.md). The summaries are
> retained as the survey record of what was open; the decision record and
> `SPEC.md` §0.9.0 are now authoritative.

### A1 — No corpus text ever reaches the player (#15)

`Entity` (§3.1) carries ids, tags, enums, and numbers — no name, title,
description, or excerpt. The corpus is literature (§6.3.1, Project Gutenberg),
yet a `readable` archetype with a `read` affordance has nothing to read, and
`source_refs` are build-time-only by §6.3. Undefined: whether resolved text is a
client-facing field, how much of it, sourced from where, and how that squares
with `INV-3`.

**Touches** §3.1, §3.2, §5.1, §6.3 · **Blocks** Phase 1

### A2 — `Entity.id` identity under the substrate model (#16)

§3.1 documents `id` as "stable node id, matches graph.json node id". §0.8.0 and
decision D1 ([`0001`](0001-three-tier-data-model.md)) remove nodes: entities are
minted per query. Undefined: how an id is derived, whether the same place yields
the same id across turns, sessions, and rebuilds — and therefore what
`ResolvedExit.target_entity_id` (§3.2) denotes before the player arrives. This is
a contradiction in the current text, not only an omission.

**Touches** §3.1, §3.2, §4.1, §6.3 · **Blocks** Phase 1

### A3 — Revisiting and backtracking (#17)

`EntityState.visited` (§3.1) and `dynamic.visited_set` (§4.2) presume durable
places; a stochastic substrate re-approximates them. Undefined: whether a player
can return somewhere, what "the same room" means across turns, and whether
backtracking is a first-class mechanic, a `Bookmark`-only affordance (§3.7.4), or
deliberately absent. The `substrate.reapproximation_tolerance` entry in §7 is the
tuning parameter for this, not the navigational decision.

**Touches** §3.1, §4.2, §3.7.4, §7 · **Blocks** Phase 3 · **Depends on** A2

### A4 — Exit derivation has no algorithm (#18)

`ResolvedExit` requires `target_entity_id`, `affordance_required`,
`via_object_id`, and `weight` (§3.2). `resolveMove` (§4.1) returns a sampled
candidate and never binds transitions to objects. The project's central premise —
"movement is an emergent consequence of environmental interaction" (§1) — is
unimplemented in §4.

**Touches** §1, §3.2, §4.1, §4.4 · **Blocks** Phase 3

### A5 — Rules cannot change anything (#19)

`Effect` is `hard_allow | hard_forbid | soft_reweight` (§3.4): filter and weight
movement candidates, nothing else. No effect writes state, so no interaction can
have a persistent consequence, and authors have no mutable state to write —
`EntityState` holds two engine-owned fields. Undefined: whether the effect
taxonomy extends beyond traversal, and whether authored state exists at all.

**Touches** §3.1, §3.4, §4.1 · **Blocks** Phase 3 · **Depends on** A7

### A6 — Local interactions have no semantics (#20)

`InteractResponse.transition_occurred: false` names the case — "read a book, no
movement" (§3.3) — and stops there. Undefined: what `read`, `take`, `inspect`,
and `speak` do; what the response conveys when nothing moved; and whether `take`
implies an inventory, which does not exist anywhere in the spec.

**Touches** §3.1, §3.3, §5.1 · **Blocks** Phase 4 · **Depends on** A7

### A7 — The engine/game boundary for gameplay concepts (#21)

The spec is emphatic that this is an engine, not a game (§0, §1), then never
states which gameplay concepts the engine owns and which an author supplies:
goals, endings, failure, progression, inventory, score, time limits. A session
has no arc and no defined way to end. This is the broadest entry in the survey
and it constrains A5, A6, and A10.

**Touches** §0, §1, §3.3, §4 · **Blocks** Phase 3

### A8 — Session state has no schema (#22)

`state.position` is read throughout §4.1 and defined nowhere. The `dynamic.*`
properties (§4.2) imply a run-state object with no declared shape. §5.1 says
sessions are in-memory and never says what is in one. Undefined: a session-state
contract in `packages/schema`, and its relationship to the overlay registry
(per-session, per-world, or shared).

**Touches** §3, §4.1, §4.2, §5.1 · **Blocks** Phase 1

### A9 — The input-log has no definition (#23)

`INV-2` is stated as reproducibility from `(seed, ruleset-file, input-log)`, and
§5.4 replays one from a file, but the input-log has no schema, no producer, no
endpoint, and no persistence — while §5.1 sessions are in-memory and dropped on
restart. The determinism Exit criteria in §6.4 and §6.5 cannot be demonstrated
end-to-end as written.

**Touches** `INV-2`, §4.5, §5.1, §5.4, §6.4, §6.5 · **Blocks** Phase 3

### A10 — The overlay has no plumbing (#24)

§3.7 specifies `AddressRegistryEntry`, `LinkRecord`, and six primitives
completely as data, and connects none of it to the running system: no endpoints
in §5.1, no wire representation, no storage, and no path by which a player
invokes a primitive — the only client input is `{object_id, affordance}` (§3.3).
Tier 3 of the data model is currently unreachable at runtime.

**Touches** §3.7, §3.3, §5.1, §6.5 · **Blocks** Phase 4

### A11 — The ruleset file format is undefined (#25)

§3.4 gives a TypeScript data shape, §6 refers to `ruleset.dsl` text files, and
§4.2 defines a grammar for *predicate expressions only*. Undefined: the surface
syntax of the ruleset file itself, and where the modifier registry (§3.6.1) and
resolver overrides (§3.6.3) live — `Ruleset` has only `spec_version` and
`layers`.

**Touches** §3.4, §3.6.1, §3.6.3, §4.2, §6.4 · **Blocks** Phase 3

### A12 — Rulesets have no runtime lifecycle (#26)

`GET /session/new?seed={optional}` (§5.1) accepts no ruleset. Undefined: how a
ruleset is selected, supplied, or bound to a session; whether it is per-server or
per-session; and what "the unit an author shares/forks/versions" (§8) means
operationally.

**Touches** §5.1, §6.5, §8 · **Blocks** Phase 4

### A13 — Half of `Entity` has no producer (#27)

§6.3 has `corpus-builder` produce `semantic_tags` and `archetype` ("initial
heuristic assignment is acceptable for alpha"). Nothing produces `salience`,
`layout_hint`, or `state`. §3.7.1 says object types are interpretations applied
at render/rule-evaluation time "via the same `archetype` lookup keyed by tag" —
that lookup table is never specified, nor is its owner (engine, ruleset, or
build).

**Touches** §3.1, §3.7.1, §6.3 · **Blocks** Phase 2

---

## Tier B — pipeline definitions that decide whether the output is meaningful

> **Resolved in spec 0.10.0** — every entry below (B1–B6) is decided in
> [`0004-b-series-resolution.md`](0004-b-series-resolution.md). The summaries are
> retained as the survey record of what was open; the decision record and
> `SPEC.md` §0.10.0 are now authoritative.

### B1 — Corpus segmentation (#28)

Nothing states how a book becomes source spans: chunk unit, target size, overlap,
boundary handling. §6.3.1's `restructure` field is explicitly reserved and
deferred, but a default segmentation still has to exist, and does not.

**Touches** §6.3, §6.3.1 · **Blocks** Phase 2

### B2 — Embedding and index parameters (#29)

§6.3 mandates a swappable provider and picks no default (§7 defers the choice to
Phase 6). Separately undefined: dimensionality expectations, normalization,
distance metric, and ANN algorithm/parameters. `static.embedding_distance` (§4.2)
has no metric, range, or direction, so a predicate written against it is not
portable across providers.

**Touches** §4.2, §6.3, §7 · **Blocks** Phase 2

### B3 — What a substrate query *is* (#30)

§0.8.0 rests on the "live substrate query" (§3.7.4 `Query`, §4.4, and
`normalized_query` in §4.5) without defining the query type, its parameters (k,
radius, gradient), its normalization rule, or how one result set becomes a room
plus its objects.

**Touches** §3.7.4, §4.4, §4.5, §6.3 · **Blocks** Phase 2

### B4 — Auto-tagging strategy (#31)

The tag *machinery* is thoroughly designed (§3.6,
[`tag-system-design.md`](../tag-system-design.md)). What decides which tags a
passage of Darwin receives is one sentence in §6.3 plus "heuristic is acceptable
for alpha". Includes a question the spec never puts either way: is a model or LLM
part of the build pipeline at all?

**Touches** §3.6, §6.3, §7 · **Blocks** Phase 2

### B5 — Three different things are called coherence (#32)

Decision D4 fixes *where* local coherence is computed (build time) without
defining what it measures, its range, or which consumers read it. Meanwhile
`EntityState.coherence` (§3.1) and `dynamic.coherence` (§4.2) are separately
declared author-defined. Three quantities share one name across the spec.

**Touches** §3.1, §4.2, §6.3, [`0001` D4](0001-three-tier-data-model.md) ·
**Blocks** Phase 2

### B6 — Span composition / discontinuous spans (#44)

Segmentation (B1) produces continuous, linear, position-ordered spans. Nothing
provides for a *discontinuous* span — an aggregate of non-adjacent strings, or a
slice grouped by semantic proximity or thematic relevance rather than position —
though such constructions are legal (`INV-4`) and useful. Because grouping by
meaning needs embeddings and tags, it cannot live in the pre-embedding
segmentation stage; it belongs at a distinct composition stage, the `restructure`
slot §6.3.1 reserves but never shapes. Undefined: that stage's interface, a
composite span's provenance/embedding/index representation, and how one resolves
to a room. A later addition to this survey, not part of the original 0.8.0 pass.

**Touches** §6.3, §6.3.1, §3.1, §3.7 · **Blocks** Phase 2

---

## Tier C — cross-cutting

### C1 — No scale or performance budget (#33)

`MAX_ROOM_OBJECTS` is used in §4.4 and never given a value. There is no corpus
size target, no move-resolution latency budget, and no index size expectation —
yet §5.1 justifies request/response movement on pacing grounds and §7 defers
sharding with no number to defer against.

**Touches** §4.4, §5.1, §6.7, §7 · **Blocks** Phase 6

### C2 — Degenerate-state semantics (#34)

Undefined: a query returning zero candidates, a room whose rules forbid every
exit, an empty room, a substrate region with no neighbors. §4.1 falls through to
`graph.neighbors`, which can itself be empty. `INV-4` makes being stuck legal —
the spec should still say what the player and the protocol see when it happens.

**Touches** §4.1, §4.4, §5.1 · **Blocks** Phase 3

### C3 — Server trust model (#35)

No auth, no rate limits, no request size limits, no session eviction (unbounded
in-memory growth per §5.1), and no cost bound on evaluating author-supplied DSL
against author-supplied tag arrays. Scoping this out for alpha is a reasonable
answer — it should be a decision on the record rather than an omission.

**Touches** §5.1, §6.7, §6.8 · **Blocks** Phase 6

### C4 — No way to judge whether the semantic space is any good (#36)

`INV-4` correctly keeps taste-policing out of the engine. Nothing establishes how
the *project* evaluates a built substrate — whether rooms feel related, tags are
sensible, or drift is interesting. §6.7's "small enough to sanity-check by hand"
is the only mechanism, and it is one person's eyes on one corpus.

**Touches** `INV-4`, §6.3, §6.7 · **Blocks** Phase 6

### C5 — Cross-artifact compatibility (#37)

`spec_version` (§3.5) and `substrate_version` (§3.7.3) each version one artifact.
Undefined: what happens when a ruleset references tags a rebuilt substrate no
longer produces, whether `tag-registry.yaml` is versioned at all, and whether a
session may outlive a rebuild.

**Touches** §3.5, §3.6.2, §3.7.3, §6.3 · **Blocks** Phase 4

### C6 — Design work has no queue, and roadmap state has drifted (#38)

[`AGENTS.md`](../../AGENTS.md) §5 and [`roadmap.md`](../roadmap.md) route agents
to `phase:N` issues only, so design-track issues (#11 is the precedent) have no
owner and no ordering. Separately, issues #1 (Phase 0 scaffold) and #2 (Phase 1
schema) are closed as completed with no PR and no code in the tree, so the issue
record claims work that does not exist.

**Touches** [`AGENTS.md`](../../AGENTS.md) §5, [`roadmap.md`](../roadmap.md),
[`issue-standards.md`](../issue-standards.md) · **Blocks** Phase 0

> Partly addressed: [`roadmap.md`](../roadmap.md) has been cleared to a
> placeholder that declares no active phase, states the design-gate rule, and
> points here. Still open — who works design-track issues and in what order, and
> reconciling the closed-but-unbuilt state of issues #1 and #2.
