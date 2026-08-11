# Decision Record 0001 — Three-Tier Data Model (bedrock / substrate / overlay)

`status: accepted`
`spec-amendment: 0.8.0`
`issue: #11`

This record resolves the open questions raised in the three-tier data model
proposal (issue #11) and fixes the design decisions that the `SPEC.md` §0.8.0
amendment implements. The proposal is the *why*; `SPEC.md` is the contract;
this record is the *decisions and rationale* that bridge them.

The proposal separated the world into three tiers with different guarantees:

| Tier | Name | Nature | Determinism guarantee |
|---|---|---|---|
| 1 | **Bedrock** | the corpus, ingested build-time | fixed, factual; never client-visible (`INV-3`) |
| 2 | **Substrate** | a continuous embedding space queried live | seed-relative (see D1/D-INV2) |
| 3 | **Overlay** | address book + primitive operations | fully deterministic, replayable (`INV-2`) |

The proposal flagged five open questions. The suggested next step was to
resolve #1 and #2 (widest blast radius) before rewriting the spec. All five are
resolved below — #1–#4 with a decision, #5 explicitly deferred with rationale,
per the proposal's own framing that it is an empirical parameter and not a
design-doc-level choice.

---

## D1 — Open Question 1: does a discrete "node" still exist as a build artifact?

**Decision.** No fixed node/edge table is produced at build time. `corpus-builder`
emits a **substrate index**, not a pre-clustered graph. "Nodes" become
*ephemeral substrate-query results* — `Entity` objects minted on demand at
runtime and resolved to the client per `INV-3`, never read from a frozen table.

**What `graph.json` contains under this model.** The build artifact keeps the
filename `graph.json` (a deliberately vestigial name, retained only to avoid
churning the ~25 cross-references in `SPEC.md`/`docs/`/`AGENTS.md`; §6.3 now
documents that the name no longer implies a node/edge graph). Its contents are
redefined to a substrate bundle:

- embedding vectors for source spans,
- an approximate-nearest-neighbor (ANN) index structure for live querying,
- a source-span provenance table (`source_refs`, unchanged in spirit from §6.3),
- a precomputed **local-coherence field** over the index (see D4),
- a build-provenance/version header (a substrate-build id, see D3).

It does **not** contain pre-computed nodes or edges. §6.3's exit criteria are
re-scoped accordingly: "produces a valid `graph.json`" now means "produces a
well-formed substrate index that answers queries," not "produces a fixed set of
nodes with edges."

**Consequence for `INV-2` (D-INV2, resolves the §4.5 tension).** The proposal
leaned toward weakening `INV-2` so substrate results need not be bit-identical
on replay. We take the **stronger, cheaper-to-reason-about** position instead:

- Substrate query randomness is drawn from a PRNG **seeded deterministically**
  from `(session_seed, turn_count, normalized_query)` — the same derivation rule
  §4.5 already mandates for `sample()`.
- Therefore, replaying an identical `(substrate-index, ruleset, session_seed,
  input-log)` reproduces every substrate result **byte-for-byte**. `INV-2` holds
  unchanged as a *replay* guarantee.
- The "re-approximable vibes" property the proposal wants is **seed-relative**,
  not a loss of determinism: it manifests across *different* invocations (a new
  turn advances `turn_count`, a new session changes `session_seed`) and across a
  corpus rebuild (a new substrate-build id), never within a replay of one log.

This keeps `INV-2` intact — the project's own `AGENTS.md` calls it one of the
two most important invariants and defines it as "byte-identical output" — while
still delivering "the same kind of place, not the identical place" between
plays. The §4.5 amendment states this precisely: the substrate sits one layer
below §4.5's solver-decision determinism, but its *seeded* results are still
replay-deterministic; only *re-derivation under a new seed or a rebuilt
substrate* re-approximates. This is a precision fix to `INV-2`, not a weakening.

## D2 — Open Question 2: is `Link` a separate record or a form of `composite`?

**Decision.** `Link` is a **separate, minimal relationship record**, not a form
of `composite`:

```
LinkRecord:
  from: string          // an address (tag) in the registry
  to: string            // an address (tag) in the registry
  kind: string          // open string — author/interpretation-defined
  provenance: "build" | "author_runtime" | "player"
```

**Rationale.** `composite` is an *unordered grouping* — a name for a set. `Link`
is a *directed, typed edge* between two addresses. Overloading `composite` to
carry direction and a `kind` would make the registry's defining "grouping, not
computation" property leaky, and force every consumer to disambiguate two
meanings from one shape. We accept the stated cost — a second record shape — in
exchange for keeping registry entries purely `address → reference` and links in
a parallel, equally inert `links[]` table. Both are deterministic overlay writes
that live in the same input-log as moves.

## D3 — Open Question 3: snapshot staleness

**Decision.** A `snapshot`-kind entry binds to a **substrate content-version**
and is never auto-invalidated:

- Each substrate build stamps a `substrate_version` (a content hash / build id
  in the `graph.json` header). A `snapshot` stores
  `{ substrate_version, resolved_payload }`.
- On a corpus rebuild that changes `substrate_version`, existing snapshots
  **remain valid and readable** — the frozen `resolved_payload` is
  self-contained, which is the entire point of a snapshot (it pins one
  re-approximation as canonical).
- Consumers get a `stale: boolean` derived by comparing the snapshot's
  `substrate_version` to the live one. The engine **surfaces** staleness but
  **never** auto-refreshes or auto-invalidates — doing so would violate both
  `INV-4` (no taste-policing: "your pin is out of date" is a judgement) and
  `INV-2` (silent re-resolution is hidden state). Re-resolution is an explicit
  author/player action via the `Snapshot` primitive.

This ties snapshot versioning to the existing §3.5 spec-versioning discipline
without inventing a parallel invalidation system.

## D4 — Open Question 4: where is local coherence computed?

**Decision.** **Precomputed at build time**, stored in the substrate bundle as a
coherence field over the index, and **read (interpolated) live** at query time.

**Rationale.** Local coherence is defined as a *fixed, measurable property of the
corpus* — how tightly source material clusters near a point. It is not runtime
state and does not change between queries, so computing it live per-query would
be both wasteful and a needless nondeterminism risk. Precomputing it keeps
queries cheap and keeps D-INV2's replay determinism trivially true for the
coherence component. This answers the sub-question directly: Tier 2 **does**
need build-time precomputation — the substrate index and its coherence field are
build artifacts; only *query resolution* is live. Tier 2 is "live query over a
build-time index," not "fully live from raw corpus."

## D5 — Open Question 5: re-approximation tolerance band

**Deferred, by decision.** The proposal explicitly frames "how similar is
similar enough" as an empirical/tunable parameter, not resolvable at the
design-doc level. We honor that: no value is chosen here. It is recorded as a
named, configurable parameter `substrate.reapproximation_tolerance` and added to
`SPEC.md` §7 (Open Questions for Iterative Refinement) so it is not lost, with
resolution assigned to Phase 6 empirical tuning against a real corpus. Deferring
it *is* the correct resolution of this question.

---

## Naming collision resolved

The proposal's Tier 3a was drafted as a "Tag Registry." `SPEC.md` §3.6.2 already
uses **Tag Registry** for the keys-only vocabulary tree of segment paths. These
are different things. The §0.8.0 amendment names the overlay's name→reference
map the **Address Registry** and keeps §3.6.2's Tag Registry as-is. The two
coexist: the Tag Registry constrains the *vocabulary* of tag strings; the
Address Registry maps *specific tag strings to substrate references*.

## Version impact

`spec-version` moves `0.7.0 → 0.8.0`. Pre-1.0, breaking conceptual changes bump
the minor. This amendment changes the *semantics* of `Entity.contains`,
redefines the contents of `graph.json`, and refines `INV-2`'s wording, so it is
a deliberate, versioned revision. No `packages/schema/*` code exists yet
(Phase 0), so no `packages/schema/CHANGELOG.md` entry is required by `INV-5`;
when Phase 1 implements the schema it must match the §0.8.0 shapes.
