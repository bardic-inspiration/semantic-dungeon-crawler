# Semantic Dungeon Crawler Engine — Build Specification

`spec-version: 0.13.1`
`status: draft`
`audience: coding-agent + human-maintainer`

> **§0.8.0 — three-tier data model.** The world is framed as three tiers with
> different guarantees: **Bedrock** (the corpus, build-time only), **Substrate**
> (a live-queried embedding surface, not a fixed node/edge graph), and
> **Overlay** (an inert Address Registry plus a small closed set of primitive
> operations). See §3.7 for the overlay contract, §4.5 for how determinism
> splits across the tiers, and `docs/design/0001-three-tier-data-model.md` for
> the decisions behind it (resolves issue #11).

> **§0.9.0 — A-series resolution (player-facing runtime & engine semantics).**
> Resolves the thirteen Tier-A spec gaps (issues #15–#27) as one interdependent
> model; see `docs/design/0003-a-series-resolution.md` for the decisions and
> rationale. Summary of what this amendment changes:
> - **Identity & navigation.** `state.position` is a substrate coordinate;
>   durable memory is an append-only tree of opaque overlay **address-tokens**
>   (parent→children grouping = `Entity.contains`). `Entity.id` is ephemeral
>   per-resolution; the durable handle is the address-token. Backtracking =
>   truncate to an ancestor token and re-resolve fresh; `visited_set` holds
>   address-tokens (A2/A3/A8).
> - **Corpus text reaches the player.** `Entity` gains client-facing `prose` +
>   `source_span` metadata (A1). INV-3 is refined (below) to name these, and
>   overlay registry names/labels, as *output* rather than internals.
> - **Interaction has consequence.** Traversal-capable objects *are* the exits
>   (A4); the `Effect` taxonomy gains **write** and **emit** kinds applied in a
>   deterministic post-decision commit phase (A5); local interactions are pure
>   author-rules with a structured `interaction_result` (A6).
> - **Authoring surface.** The ruleset is one JSON/YAML bundle (DSL only in
>   expression strings) carrying layers + registries + interpretation lookup +
>   primitive exposure + movement affordances (A11/A13); primitives are invoked
>   via affordances through `POST /interact` plus a client-facing registry read
>   (A10); ruleset binding is developer-mode-gated, substrate is server-wide
>   (A12). New schema types: **session state** (A8) and **input-log** (A9).
> - **Boundary.** The engine ships *mechanism*, not gameplay *meaning*: no
>   built-in goals/score/inventory; an author-triggered `ended` flag; state via
>   the overlay and a per-session scratch store (A7).

> **§0.10.0 — B-series resolution (the corpus-builder pipeline).** Resolves the
> five Tier-B spec gaps (issues #28–#32) plus one that surfaced during it
> (#44, B6) as one pipeline definition; see
> `docs/design/0004-b-series-resolution.md` for the decisions and rationale.
> Summary of what this amendment changes:
> - **Every build stage is a swappable interface with a deterministic default**
>   (the §6.3 `CorpusSource`/embedding convention, extended to segmentation,
>   tokenization, indexing, tagging, and composition): ship the interface + one
>   default now, defer richer implementations (B1/B2/B4/B6).
> - **Segmentation** is a partition stage over two axes — `unit`
>   (char/word/sentence/token) × `grouping` (boundary/fixed with overlap);
>   default paragraphs, no overlap; `unit: token` loads a pinned `Tokenizer`
>   whose identity feeds `substrate_version` (B1).
> - **Embedding & index.** Vectors are L2-normalized at build time;
>   `static.embedding_distance` is fixed as cosine distance `[0,2]`, smaller =
>   nearer, provider-independent; the index is an interface with an exact
>   flat-k-NN default; degenerate embedding spaces fail loud (B2).
> - **Substrate query** is one `Query{origin,k,radius?,direction?,filter?}`
>   primitive; `normalized_query` canonicalizes to the stored coordinate +
>   quantized params before seeding, so float drift cannot fork a replay (B3).
> - **Tagging** default is a deterministic, offline lexicon that also seeds
>   `tag-registry.yaml` and assigns `archetype`; models are permitted at build
>   under pin+cache discipline but the default ships none (B4).
> - **Coherence** is two engine quantities: `local_coherence` (place;
>   `EntityState.local_coherence`, `static.local_coherence`) and `path_coherence`
>   (session; `dynamic.path_coherence`) — renamed from the colliding
>   `coherence`; author-custom scalars use `dynamic.vars.*` (B5).
> - **Span composition** (`restructure`, §6.3.1) is a post-embedding stage
>   producing discontinuous composite spans; the seam is defined, strategies
>   deferred (B6).

> **§0.11.0 — C-series resolution (operational envelope & process).** Resolves the
> six Tier-C spec gaps (issues #33–#38) as one cross-cutting envelope; see
> `docs/design/0005-c-series-resolution.md` for the decisions and rationale. The
> unifying move is that **`INV-4`'s "surface, never reject" discipline generalizes
> from the ruleset to the whole operational surface.** Summary of what this
> amendment changes:
> - **Scale/latency budget (C1).** Named alpha-scale reference defaults, tunable in
>   Phase 6, never enforced ceilings: `MAX_ROOM_OBJECTS = 12` (§4.4), ~10–50
>   corpus documents / low-thousands of spans, move-resolution p95 < ~200 ms,
>   single-digit concurrent sessions — the thresholds §7's deferred ANN/sharding
>   work becomes due at (§4.4, §5.1, §6.7, §7).
> - **Degenerate state (C2).** A resolution yielding nothing is a valid `200`
>   `ResolvedRoomResponse`, never an error; `sample()` never throws on an empty
>   candidate set; `ResolvedRoomResponse` gains **`resolution_status`** (open
>   union, `"resolved" | "stuck"`) so a rules-produced dead-end is surfaced, not
>   guessed from an empty array (§3.2, §4.1, §4.4, §5.1). *(The "rules-produced"
>   qualifier is superseded by §0.12.0 S5: the `"stuck"` test is mechanical — no
>   legal exit — never causal. §4.1 is normative.)*
> - **Trust model (C3).** On the record: a **local, single-user, trusted-operator**
>   alpha (localhost-bound default, no auth, author ruleset trusted, `INV-4`);
>   auth/multiplayer/remote stay post-alpha (§6.8). Phase-6 hardening adds bounded
>   sessions with idle-TTL eviction and a request body-size cap — not an auth
>   system (§5.1, §6.7, §6.8).
> - **Semantic-quality evaluation (C4).** An offline **`corpus-builder eval`**
>   report that never gates the engine (`INV-4` untouched); a named signal
>   vocabulary (local-coherence distribution, tag coverage/orphan rate,
>   nearest-neighbor spread so shuffled noise is distinguishable), cheapest signals
>   shipped now, richer/model metrics deferred; §6.3's "fail loud on degenerate
>   output" made concrete (§6.3, §6.7).
> - **Cross-artifact compatibility (C5).** Mirrors the §3.7.3 snapshot-staleness
>   stance — surface, never auto-invalidate/reject: `tag-registry.yaml` gains a
>   version header; `Ruleset` gains optional advisory **`authored_against?`**; an
>   orphaned tag reference after a rebuild is a load-time warning, never a
>   rejection; a session may not outlive a substrate rebuild (server-wide config,
>   A12) (§3.4, §3.6.2, §3.7.3, §6.3).
> - **Process (C6).** An explicit design-track queue: with no phase active the
>   queue is the design track — lowest-numbered open `design` issue whose
>   dependencies are resolved, one tier at a time (A → B → C). Issues #1/#2 (closed
>   unbuilt) are left closed; fresh Phase-0/1 issues are opened at gate-lift per
>   `docs/roadmap.md` (`AGENTS.md` §4/§5, `docs/roadmap.md`, `docs/issue-standards.md`).

> **§0.12.0 — conformance-audit amendment (internal consistency).** Resolves seven
> places where this document contradicted *itself*, found by a conformance audit of
> the Phase 0–4 build against spec 0.11.0. It adds no new mechanism and changes no
> invariant; it makes the contract say one thing where it previously said two, so
> the code findings filed alongside it can be adjudicated. Summary:
> - **§1 rewritten in substrate terms (S1).** §1 still described the pre-§0.8.0
>   "weighted graph… nodes are clusters… edges represent relatedness" that decision
>   D1 removed — and §0's read order sends a cold-starting agent to §1 *first*, so
>   this was the most-read stale paragraph in the spec. §2's reconciliation note is
>   now stated in §1 itself.
> - **§3.6.2 registry file layout (S3).** §3.6.2 forbade any YAML value; §0.11.0 C5
>   then required a version header, which *is* a value. Fixed by defining the file
>   as a `substrate_version:` header plus the vocabulary tree under `tags:`, scoping
>   the "no values" rule to that tree, and naming `corpus-builder` as the validator's
>   owner.
> - **§6.3 composition ordering (S4).** The §6.3 Build list ran composition before
>   coherence and tagging; B6 prose ran it after embedding and tagging. B6 wins and
>   the Build list is reordered.
> - **§4.1/C2 `"stuck"` (S5).** C2 defined `"stuck"` mechanically ("no legal exit")
>   *and* causally ("a rules-produced dead-end, never the absence of authored
>   structure"). A neighbour-less substrate region satisfies the first and violates
>   the second. The mechanical test is now the whole definition; what the causal
>   clause protected is stated directly instead.
> - **§6.3 corpus size (S6).** Three different figures (§6.3 Exit's "~20 documents",
>   C1's "~10–50", the 8-entry fixture). C1's range is now the single reference.
> - **§4.2 EBNF (S7).** `property := "static." IDENT` was single-segment, but the
>   same section's prose requires `dynamic.vars.<key>`. The production now admits a
>   multi-segment `PATH`.
> - **§8 glossary "Ruleset" (S2).** Still `spec_version` + `layers[]`; now the full
>   §3.4 A11 bundle.
>
> Two additions rather than corrections, both additive (MINOR-class under this
> project's 0.x convention, §3.5 — which is why this is `0.12.0` and not a patch):
> - **`InteractResponse.movement_blocked?` (§3.3).** The server had no way to say "a
>   movement affordance resolved nowhere" — `transition_occurred: false` also means
>   "this was a local interaction" — so it overloaded `new_room.resolution_status`,
>   making `POST /interact` and `GET /room/current` disagree about the same room.
>   The signal now has its own optional field and the room's status describes the
>   room only.
> - **§3.6.3 resolver ownership.** The spec guaranteed the three default resolvers
>   "exist at startup" while no §6.x Build list claimed them, so none was ever
>   built. They are now `packages/rule-engine`'s, listed in §6.4.

> **§0.13.0 — turn_count decoupled from resolution (issue #118).** Resolves the
> gap surfaced during #104: §3.8 declared `turn_count` with no semantics and §4.5
> made it a **seed component**, so whatever advanced it silently re-sampled every
> room. #104 had to freeze `turn_count` while the player stood still to keep §3.3
> (A6) true ("a local interaction returns the unchanged room"). This amendment
> removes that coupling instead of leaving it inferred:
> - **`turn_count` is a pure runtime metric**, not a seed component. It is a
>   game-state counter readable as `dynamic.turn_count` (§3.8, §4.2) and nothing
>   more. The substrate seed no longer includes it (§4.5).
> - **A room is a deterministic function of `(session_seed, normalized_query)`**,
>   and `normalized_query` already carries the player's position (`origin`, §4.4 /
>   §0.10.0 B3). So A6 now holds **structurally**: a stationary player issues the
>   same normalized query and the room re-resolves byte-identically no matter how
>   many turns have passed — the freeze-while-still workaround is unnecessary.
> - **Turn advancement is a game event.** By default `turn_count` advances once per
>   resolved interaction (`POST /interact`), independent of whether the player moved
>   or the move was blocked — it measures turns taken, the "how long have I been
>   playing" meaning an author expects. Making its advancement *conditions*
>   author-configurable is a natural extension left to a future versioned amendment;
>   the machinery is not defined here.
> - **The §0.8.0 "similar-but-not-identical place" property is now
>   position/session-relative**, not turn-relative: it appears across *different*
>   positions, *different* sessions (`session_seed`), and corpus rebuilds
>   (`substrate_version`, §3.7.3/§6.3) — never on returning to the same coordinate
>   within a replay, where the room is stable by design (what A6 and the §0.9.0 (A3)
>   address-token backtracking model both want).
>
> `INV-2` is untouched: given `(graph.json, ruleset, session_seed, input-log)`,
> output stays byte-identical — only the seed's *components* change. Additive/
> corrective at the 0.x level (MINOR under §3.5's convention), hence `0.13.0`.

> **§0.13.1 — tokenizer default named (issue #107).** A conformance audit found
> §0.10.0 B1 (and `docs/design/0004`) naming `cl100k_base` as the pinned default
> `Tokenizer` for `unit: token`, while the pipeline ships a zero-dependency,
> deterministic approximate tokenizer (`approx-token-v1`). Rather than pull a BPE
> dependency into the otherwise model-free, byte-identical default build, this
> amendment **names the shipped approximate tokenizer as the alpha default** and
> records `cl100k_base` (and other production BPE tokenizers) as the deferred
> richer swap-in behind the same `Tokenizer` interface — the B-series "interface +
> one default now, richer impl later" pattern, and the reason token-counting is
> defined as *approximate sizing* (B1). The tokenizer's pinned `id` still feeds
> `substrate_version`, so swapping in a production tokenizer stays a visible new
> build id, never a silent drift. No schema/protocol surface changes; a
> documentation/decision correction (PATCH under §3.5's convention), hence
> `0.13.1`.
> Cross-referenced from §3.3 (A6), §3.8, §4.5. **Making the code conform (removing
> `turn_count` from the seed derivation and updating when the server advances it) is
> a follow-on code issue, out of scope here** — the spec is the contract; code
> conforms to it.

## 0. Purpose and Reading Order

This document is the authoritative build specification for an **authoring engine for semantic-space games** — not a single game. It is written to drive a phased, iterative Claude Code development process. Each phase in Section 6 is independently checkable: it lists file paths to create, exact schemas to implement, and pass/fail done-criteria.

**Read order for a coding agent starting fresh:** Section 1 (concepts) → Section 2 (architecture) → Section 3 (schema, verbatim) → Section 6 (phase you are on). Sections 4–5 are reference material to consult when a phase requires them, not sequential reading.

**Non-negotiable invariants** (referenced throughout as `INV-n`, must hold at every phase boundary):

- `INV-1`: The traversal/rule engine (Section 4) never imports a rendering library. It is pure, headless, testable with no client attached.
- `INV-2`: A game session is fully reproducible from `(seed, ruleset-file, input-log)`. No hidden state, no wall-clock dependence, no non-seeded randomness in backend logic. Substrate queries (§3.7 Tier 2) are *stochastic across seeds* by design, but their randomness is drawn from a PRNG seeded from `(session_seed, normalized_query)` — `normalized_query` carries the discretized position (§0.10.0 B3), and `turn_count` is **not** a seed component (§0.13.0) — so replaying an identical input-log reproduces every result byte-for-byte — determinism is a replay guarantee, not a same-question-twice guarantee (§4.5).
- `INV-3`: The client (Three.js and terminal reference adapters, Section 5) never receives the graph, embeddings, or rule definitions. It receives only resolved JSON matching the Entity Schema (Section 3). **(§0.9.0 refinement.)** "Resolved output" explicitly includes two things the client *does* receive: an entity's resolved `prose` and its `source_span` positional metadata (§3.1, A1), and overlay Address Registry **names/labels** of player-provenance entries (§3.7, §5.1, A10). INV-3 still forbids the client from receiving embedding vectors, the ANN index, rule definitions, internal ids, or raw snapshot payloads beyond their resolved entities. The line is *resolved output vs. engine internals*, not *text vs. no-text*.
- `INV-4`: The engine does not validate ruleset *coherence* or *taste*. It validates ruleset *well-formedness* (parses, references exist, types match). Contradictory or "bad" rules are legal and must run, not be rejected.
- `INV-5`: Every schema and protocol surface is versioned (Section 3.5). Breaking changes require a version bump and a changelog entry, not silent mutation.

---

## 1. Concept Summary

For a coding agent with no prior context:

The engine takes a text corpus, segments it into **source spans**, embeds those spans, and builds a **substrate index** — a continuous embedding surface the runtime queries live. There is no fixed node/edge graph and no build-time clustering step (§0.8.0, decision D1): a player occupies a *coordinate* in that embedding space (§3.8), and each query resolves on demand into an ephemeral "room" — an `Entity` (§3.1) populated with interactive objects drawn from the spans nearest that coordinate. Interacting with objects in the room is how the player moves through the space — there is no separate "pick an exit" menu; movement is an *emergent consequence* of environmental interaction, mediated by an authored rule layer.

Because a room is minted per resolution rather than read from a build-time table, asking the same question twice yields a similar-but-not-identical place. That re-approximation is seed-controlled, not loose: replaying one input-log reproduces every result byte-for-byte (`INV-2`, §4.5). What makes such a place *nameable* and *returnable-to* is the **overlay** (§3.7) — a deterministic address book layered over the stochastic substrate. The three tiers this gives — corpus, substrate, overlay — are summarized in §0.8.0 and specified in §3.7 and §4.5.

The engine ships two things:

1. **A backend** that owns the corpus, substrate index, embeddings, overlay, and rule evaluation, and exposes a REST API (Section 5.1) any frontend can be built against.
2. **A reference Three.js client** — the first of potentially several graphical frontends — that renders whatever the backend sends, and nothing else.

The default behavior with zero authored rules is **relativistic drift**: the player moves to nearest-neighbor spans in embedding space with no imposed structure. This is a valid, deliberate mode, not a fallback. All authored structure (Section 4) is opt-in refinement layered on top of this default.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BUILD-TIME (offline, run once or incrementally, cached)         │
│                                                                   │
│  Corpus ──▶ Embedding ──▶ Index + coherence ──▶ Tagging          │
│                                  │                               │
│                                  ▼                               │
│                    graph.json — substrate index (cached)         │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME BACKEND (deterministic, pure, headless — INV-1)         │
│                                                                   │
│   graph.json + ruleset.dsl + session(seed, input-log)            │
│                    │                                              │
│                    ▼                                              │
│         Rule Solver (Section 4) ── layered constraint eval        │
│                    │                                              │
│                    ▼                                              │
│         Resolved Entity Tree (Section 3 schema)                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                              REST API (Section 5.1)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (swappable — Three.js ships first, others build on 5.1)  │
│                                                                   │
│   Resolved JSON ──▶ ECS sync ──▶ Mesh resolution ──▶ Scene       │
│                                                          │        │
│                                          Player interaction       │
│                                                          │        │
│                                          POST /interact ─┘        │
└─────────────────────────────────────────────────────────────────┘
```

Under the §0.8.0 three-tier model, build-time no longer clusters the corpus into
a fixed node/edge graph: it constructs a **substrate index** (embeddings + ANN
index + local-coherence field) that the runtime queries live. The artifact keeps
the filename `graph.json` for continuity (§6.3), but its contents are the
substrate index, not a precomputed graph; the "nodes" the runtime resolves are
ephemeral query results (§3.1, §3.7).

**Directory-to-layer mapping** (see Section 6.1 for full repo layout):

| Layer | Package | Owns |
|---|---|---|
| Build-time pipeline | `packages/corpus-builder` | Embedding, substrate-index construction, local-coherence precompute, tagging |
| Rule DSL + solver | `packages/rule-engine` | Parser, layered constraint evaluator, DSL grammar |
| Runtime backend | `packages/server` | REST API (5.1), session state, calls rule-engine |
| Shared contract | `packages/schema` | TypeScript types for Entity Schema, imported by server AND client |
| Three.js reference client | `packages/client-threejs` | First graphical reference adapter — ECS, mesh resolution, interaction capture |
| Terminal reference client | `packages/client-cli` | REPL adapter against the same REST API — text rendering, scripted input-log replay, testing/debug interface |
| Authoring tool | `packages/rule-editor` | Visual flowchart UI, compiles to DSL text |

### 2.1 Supporting Systems (Developer Toolkit)

Cross-cutting infrastructure every package needs — not a phase of its own. Wired in as each package is built; hardened in Phase 6 (§6.7).

- **Logging** — structured, leveled (`debug`/`info`/`warn`/`error`) events via a small `Logger` interface (`log(level, event, fields)`), one instance per package. Pluggable sink; console-only is an acceptable default pre-alpha, same swappability convention as the embedding provider (§6.3). Logging is a side channel: it MUST NOT influence control flow (`INV-2`) and MUST NOT be a path by which graph/rule/embedding internals reach the client (`INV-3`) — it is a server-operator-only surface, never wire-protocol output. The §4.3 "messy resolution" warning (conflicting `override` layers) is emitted through this system at `warn`.
- **Metrics** — counters/gauges/histograms behind a small `Metrics` interface (`increment`/`observe`), in-memory default. Build-time: corpus size, build duration, embedding-call count (`corpus-builder`). Runtime: request latency, active session count, rule-evaluation duration per move (`server`). Diagnostic only — `resolveMove`/`populate` (§4.1/§4.4) MUST NOT read metrics state; letting output depend on prior instrumentation would violate `INV-2`.
- **Debug** — one server-side flag gates both `DebugTrace` construction/exposure (§4.6, `GET /debug/trace`) and elevated log verbosity. The zero-overhead-when-disabled requirement in §4.6 extends to debug-level logging: gate before construct, never construct-then-discard.
- **Config & errors** — swappable components (embedding provider, log sink, metrics backend) are selected through one environment-driven config convention rather than being hardcoded per package. Protocol-boundary errors (malformed ruleset, missing session, network failure) get a typed error taxonomy instead of ad hoc throws; built out in Phase 6 hardening (§6.7).
- **Corpus↔graph traceability** — the build-time pipeline (`corpus-builder`, §6.3) is a supporting-systems consumer too, not just the runtime `server`. Every graph node carries `source_refs` back to the raw corpus documents it was built from, and each pipeline stage reports through the same `Logger`/`Metrics` interfaces above (input/output counts, duration, warnings) — build-time transparency and runtime transparency are the same mechanism, not two. This surfaces through `corpus-builder inspect` (§6.3), not `client-cli`: a client speaking the wire protocol has no business seeing graph/corpus internals (`INV-3`), so build-time inspection stays a `corpus-builder`-owned tool, structurally separate from the runtime testing interface in §5.4 even though the two share verbosity conventions.

None of this introduces a new invariant — it operates entirely inside `INV-1`..`INV-5` as already stated.

---

## 3. Core Data Schemas

These are the literal contracts. Implementations must match field names and types exactly. All schemas live in `packages/schema/src/` as the single source of truth, imported (not duplicated) by every other package. Field names below are `snake_case` by design — see `docs/naming-conventions.md` for the full split between wire-data casing and TypeScript-identifier casing used everywhere else in this spec.

### 3.1 Entity Schema

The unified representation for both "rooms" and "objects" — there is no structural distinction between them. A room is simply an entity whose `archetype` implies containment.

Under the three-tier model (§0.8.0, §3.7), an `Entity` is an **interpretation-tier**
artifact: it is what a resolved substrate query or Address Registry entry *looks
like* once `archetype`, `semantic_tags`, `layout_hint`, and `salience` have been
applied to it. It is minted on demand, not read from a fixed build-time node
table (§6.3). The fields below remain the literal client-facing contract (`INV-3`);
what changed is that they describe a resolved view, not a permanent structural node.

```typescript
// packages/schema/src/entity.ts

interface Entity {
  id: string;                          // §0.9.0 (A2): EPHEMERAL per-resolution id, replay-stable via the seed
                                       // (§4.5) — NOT a durable/graph node id (nodes were removed in §0.8.0/D1).
                                       // The durable handle for a place is its overlay address-token (§3.7, A3).
  archetype: Archetype;                // determines renderer interpretation; default set supplied by the
                                       // author interpretation lookup at resolution (§3.4, A13)
  semantic_tags: string[];             // structured tags — grammar in Section 3.6
  embedding_ref: string;               // pointer to vector in graph.json, NEVER the raw vector
  affordances: Affordance[];           // legal interaction verbs; default set from the interpretation lookup (A13)
  salience: number;                    // 0.0–1.0, render prominence / population weight; produced by the
                                       // interpretation lookup at resolution (§3.4, A13)
  prose: string;                       // §0.9.0 (A1): verbatim source-span excerpt — CLIENT-FACING resolved
                                       // output (INV-3 refinement). "Just data": DSL/front-end treat it as a
                                       // string. Empty string if the resolved entity has no source text.
  source_span: SourceSpan;             // §0.9.0 (A1): positional provenance for `prose` — CLIENT-FACING
  contains: string[];                  // §0.9.0 (A3): the child address-tokens of this entity's `composite`
                                       // Address Registry entry (§3.7), resolved to concrete entities at
                                       // interpretation time. This is exactly the exploration/history tree's
                                       // parent→children grouping — NOT a structural substrate property
                                       // (empty for leaf/prop entities).
  layout_hint: LayoutHint;             // produced by the interpretation lookup at resolution (§3.4, A13)
  state: EntityState;
}

interface SourceSpan {                 // §0.9.0 (A1) — client-facing positional provenance
  source: string;                      // human/machine-legible source id (e.g. "gutenberg:11"). §0.10.0 (B6): for a
                                       // COMPOSITE span (discontinuous, §6.3) this may name multiple sources; the
                                       // authoritative provenance is `members` below and `char_ranges` is their union.
  char_ranges: string;                 // CSV of character range(s) in the source document, e.g. "1024-1330,1450-1502".
                                       // §0.10.0 (B6): overlapping ranges (segmentation overlap) and multi-source
                                       // unions (composites) are both expressed here.
  members?: string[];                  // §0.10.0 (B6): for a composite span, its member span ids (mirrors
                                       // Entity.contains); absent/empty for a contiguous leaf span, which carries
                                       // only raw ranges. See docs/design/0004-b-series-resolution.md.
}

type Archetype =
  | "container"      // room-like; implies "enter"/"traverse" affordances typically present
  | "readable"
  | "actor"
  | "portal"
  | "prop"
  | string;           // open extension point — see 3.5 versioning rules for adding archetypes

type Affordance =
  | "enter" | "traverse" | "read" | "take" | "inspect" | "speak" | string;

interface LayoutHint {
  scale: "small" | "medium" | "large";
  density: number;        // 0.0–1.0, target population density if this entity is a container
  shape_bias: string;     // open string — adapter-interpreted, e.g. "vertical", "radial"
}

interface EntityState {
  local_coherence: number; // 0.0–1.0; §0.10.0 (B5): the D4 build-time local-coherence field interpolated at the
                           // resolved point — embedding-neighborhood tightness (§6.3). ENGINE-produced, not
                           // author-defined (the old "coherence"/"author-defined scalar" is renamed and reassigned;
                           // author-custom scalars use dynamic.vars.*, §3.8). Readable in the DSL as
                           // `static.local_coherence` (§4.2). Distinct from the session's `dynamic.path_coherence`.
  visited: boolean;        // §0.9.0 (A3): runtime-derived — true iff this entity's overlay address-token is in
                           // `dynamic.visited_set`. Engine-owned; not a stored per-entity field.
}
```

### 3.2 Resolved Room Response

What `GET /room/current` returns. This is the *only* shape the client ever sees (INV-3). Population is fully resolved server-side per the zero-radius-query rule (Section 4.4) — the client never receives candidates or rules.

```typescript
// packages/schema/src/protocol.ts

interface ResolvedRoomResponse {
  room: Entity;                 // archetype: "container", the current node
  objects: Entity[];            // fully resolved, filtered, sampled — final list, no further logic required
  exits: ResolvedExit[];        // pre-computed legal transitions, NOT raw graph edges
  resolution_status: ResolutionStatus;  // §0.11.0 (C2): "resolved" normally; "stuck" when a well-formed
                                        // resolution leaves no legal exit. Always a 200; a stuck player is a
                                        // valid game state, NOT a protocol error. See §4.1/§4.4 and §5.1.
  debug?: DebugTrace;           // present only if debug mode enabled server-side, see 4.6
}

// §0.11.0 (C2) — an OPEN string union (like Archetype/Affordance, §3.1): adding a value is a MINOR bump (§3.5),
// so further degenerate kinds (e.g. a future "empty" distinct from "stuck") need no surface break.
type ResolutionStatus = "resolved" | "stuck" | string;

interface ResolvedExit {
  target_entity_id: string;          // §0.9.0 (A2): a resolvable query/address TOKEN, not a materialized
                                     // destination. Taking the exit re-runs that query on arrival (seeded,
                                     // §4.5) — a re-approximation unless snapshotted. The client echoes it back.
  affordance_required: Affordance;   // which interaction on which object triggers this
  via_object_id: string;             // which object in `objects[]` is the trigger
  weight: number;                    // soft-bias hint, client MAY use for visual affordance strength, MUST NOT use to alter server decision
}

// §0.9.0 (A4) — EXIT DERIVATION. Exits are not a separate graph. During room resolution the server emits one
// `ResolvedExit` per populated object whose affordance set includes a MOVEMENT affordance (author-designated in
// the ruleset; engine defaults `enter`/`traverse`, plus the `portal` archetype). For such an object:
// via_object_id = that object's id, affordance_required = its movement affordance, target_entity_id = a query
// token seeded from that object, weight = its soft-score. "Movement is an emergent consequence of environmental
// interaction" (§1) is exactly this: to move, the player interacts with a traversal-capable object.
```

### 3.3 Session / Move Request

```typescript
interface InteractRequest {
  session_id: string;
  action: {
    object_id: string;
    affordance: Affordance;
  };
}

interface InteractResponse {
  new_room: ResolvedRoomResponse;   // full re-resolution, same shape as GET /room/current
  transition_occurred: boolean;      // false if interaction was local (e.g. "read" a book, no movement)
  interaction_result: InteractionResult;  // §0.9.0 (A6): per-interaction output, esp. when nothing moved
  session_ended?: boolean;           // §0.9.0 (A7): true once an author rule has fired the `end` effect; the
                                     // engine surfaces the flag, the author owns the trigger. Omitted/false otherwise.
  movement_blocked?: boolean;        // §0.12.0: true iff a MOVEMENT affordance (A4) was invoked and resolution
                                     // yielded no destination — the INTERACTION resolved to nothing, which is
                                     // distinct from the ROOM having no exits. `transition_occurred: false`
                                     // alone cannot express it (a local interaction sets that too). Omitted/
                                     // false otherwise. `new_room.resolution_status` describes the room and
                                     // MUST NOT be overwritten to carry this signal — `new_room` is a full
                                     // re-resolution, identical to what `GET /room/current` would return for
                                     // the same state (§3.2, §5.1).
}

// §0.9.0 (A6). Local (non-movement) interactions run the SAME evaluateLayers + commit-phase pipeline (§4) for
// (object, affordance). The engine assigns NO intrinsic meaning to read/take/inspect/speak — those are engine
// DEFAULTS, not hardcoded behavior, and `Affordance` is an open string so authors may add/redefine verbs. If no
// rule matches, the interaction is a no-op returning the unchanged room. `interaction_result` is populated by the
// author `emit` effect (§3.4); `effects_summary` is auto-derived from the commit-phase writes for debug/UX.
interface InteractionResult {
  text?: string;                     // author-emitted text (e.g. the fuller passage a `read` returns)
  revealed?: string[];               // entity ids surfaced by the interaction, if any
  effects_summary?: string[];        // human-readable summary of commit-phase writes (debug/UX), auto-derived
}
```

### 3.4 Ruleset DSL — Data Shape (grammar in Section 4.2)

> **§0.9.0 (A11) — surface syntax & one-bundle.** A ruleset file is **structured
> data (JSON/YAML)** matching the `Ruleset` interface below; the DSL (§4.2) appears
> **only** inside `predicate`/`scope`/value strings. `parser.ts` parses those
> expression strings, not a file-level grammar. The ruleset is the single authored
> bundle — "the unit an author shares/forks/versions" (§8) — so it carries not just
> `layers` but the modifier registry (§3.6.1), resolver overrides (§3.6.3), the
> archetype/interpretation lookup (A13), primitive exposure (§3.7.4), and the
> movement-affordance designation (A4). Ruleset fixtures use a data extension
> (`.json`/`.yaml`); the historical `fixtures/rulesets/*.dsl` naming is retired.

```typescript
interface Ruleset {
  spec_version: string;             // must match packages/schema version, see 3.5
  authored_against?: string;        // §0.11.0 (C5): OPTIONAL substrate_version (§3.7.3) this ruleset was authored
                                    // against — ADVISORY only. Absent = unpinned. Present lets a load compare
                                    // against the live substrate and SURFACE drift (a warning), never reject
                                    // (INV-4). See docs/design/0005-c-series-resolution.md.
  layers: Layer[];
  // §0.9.0 (A11) — the rest of the authored bundle. All author content; adding/removing entries is NOT an
  // engine version bump (§3.5), only changing the engine mechanism that reads them is.
  modifier_registry?: Record<string, ModifierConfig>;   // §3.6.1 — author-defined modifier behavior
  resolvers?: Record<string, string>;                   // §3.6.3 — resolver overrides/additions (name → def)
  interpretation_lookup?: InterpretationLookup;         // §0.9.0 (A13) — tag/archetype → archetype, affordances,
                                                        // layout_hint, salience defaults (engine ships defaults)
  primitive_exposure?: PrimitiveExposure[];             // §3.7.4 — which overlay primitives players may invoke
  movement_affordances?: Affordance[];                  // §0.9.0 (A4) — affordances that trigger movement;
                                                        // engine default = ["enter","traverse"] (+ portal archetype)
}

// §0.9.0 (A13). Author content (with engine defaults), keyed by archetype and/or tag pattern (§4.2 MATCHES
// grammar). Supplies the interpretation applied to a resolved substrate result at render/rule time (§3.7.1).
interface InterpretationLookup {
  by_archetype?: Record<string, InterpretationEntry>;
  by_tag?: { pattern: string; interpretation: InterpretationEntry }[];  // first match wins, in array order
}

interface InterpretationEntry {
  archetype?: Archetype;
  affordances?: Affordance[];
  layout_hint?: Partial<LayoutHint>;
  salience?: number;                 // 0.0–1.0 default salience for matches
}

interface Layer {
  id: string;
  scope: "global" | ScopeCondition;  // global = always active; else activated by predicate
  mode: "override" | "yield" | { priority: number };
  rules: RuleBlock[];
}

interface RuleBlock {
  predicate: string;     // DSL expression, see 4.2 grammar, evaluated against static+dynamic props
  effect: Effect;
}

type Effect =
  // Traversal-control effects (unchanged from ≤0.8.0) — filter/weight the move decision, evaluated in §4.3.
  | { kind: "hard_allow" }
  | { kind: "hard_forbid" }
  | { kind: "soft_reweight"; factor: number }   // multiplicative, applied once per move-decision (discrete, not continuous)
  // §0.9.0 (A5/A6/A7) — WRITE effects. Collected across active layers and applied in a SEPARATE, deterministic
  // COMMIT PHASE *after* the §4.3 traversal decision, in declaration order, last-write-wins, NEVER throwing
  // (INV-4). They cannot influence the same move's candidate filtering, so §4.3 hard/soft logic is unchanged and
  // INV-2 holds trivially (writes are a pure function of the decided move + seed + ruleset).
  | { kind: "write"; target: string; value: string }   // set a scratch key (`dynamic.vars.<key>`, A8) to an
                                                        // evaluated §4.2 expression/literal
  | { kind: "primitive"; primitive: PrimitiveExposure["primitive"]; args?: Record<string, string> } // invoke an
                                                        // overlay primitive (§3.7.4); same primitive/effect as a
                                                        // player invocation, distinguished only by provenance
  | { kind: "emit"; text?: string; reveal?: string[] } // append to InteractResponse.interaction_result (§3.3, A6)
  | { kind: "end" };                                   // fire the author-triggered session-ended flag (§3.3, A7)

type ScopeCondition = string;  // DSL expression evaluated once per move to determine layer activation
```

### 3.5 Versioning Rules (implements INV-5)

- `spec_version` in every wire payload and ruleset file follows semver.
- Adding a new `Archetype` or `Affordance` string literal is a MINOR bump (additive, non-breaking — the open-string extension points in 3.1 exist specifically so this doesn't require a schema restructure).
- Adding or removing a modifier entry in an author's ruleset config requires no engine version bump — modifier entries are author content. Changing the modifier registry *mechanism* (how the engine parses or dispatches modifiers) is a MAJOR bump.
- Renaming/removing any field in `Entity`, `ResolvedRoomResponse`, or `Ruleset` is a MAJOR bump.
- Adding a REST endpoint (Section 5.1) is a MINOR bump; changing an existing endpoint's method, path, or response shape — or the base contract (headers, error envelope) — is a MAJOR bump, the same rule as a schema field change. This is what lets a third-party adapter (5.3) trust a MINOR version bump to be safe to ignore.
- `packages/schema/CHANGELOG.md` is mandatory reading before any schema edit in Phase 2+. A coding agent modifying `packages/schema/src/*` MUST append a changelog entry in the same commit.
- Conformance fixtures (Section 6.5) MUST be re-validated against any schema change before the change is considered complete.
- **§0.11.0 (C5) — cross-artifact coupling is versioned but surfaced, never enforced.** Beyond the schema/protocol `spec_version` and the per-build `substrate_version` (§3.7.3), the couplings *between* artifacts are versioned too: `tag-registry.yaml` carries a version header (§3.6.2) and a `Ruleset` may declare `authored_against` (§3.4). Drift between them (a predicate referencing a tag a rebuilt substrate no longer produces) is **surfaced as a load-time warning, never a rejection or auto-rewrite** (`INV-4`) — the same stance §3.7.3 takes for snapshot staleness. Adding these — an open-union `ResolutionStatus` value, an optional `Ruleset` field, a registry header — is additive (a MINOR-class change under this project's 0.x convention).

### 3.6 Structured Tag Grammar

Tags in `semantic_tags` follow a uniform grammar. Tags remain `string[]` on the wire — the grammar defines well-formedness validation, not a type change. Existing single-segment strings are valid under this grammar.

**EBNF**:

```
tag           = [ modifier "," ] segment_path [ "=" value ] ;
modifier      = identifier ;
segment_path  = segment { ":" segment } ;
segment       = seg_start { seg_char } ;
seg_start     = LOWER | DIGIT ;
seg_char      = LOWER | DIGIT | "-" | "_" ;
value         = value_char { value_char } ;
value_char    = ? any character except NUL ? ;
identifier    = seg_start { seg_char } ;
```

**Parse output**: `{ modifier: string | null, segments: string[], value: string | null, raw: string }`.

**Examples**: `environment:terrain:forest` (hierarchical path), `density=0.7` (scalar value), `viz,material:stone` (modifier-prefixed).

Per `INV-4`, the engine validates tag *syntax* only. It MUST NOT reject tags for unregistered modifiers, unknown segment paths, or absent registry entries. Well-formed tags are legal regardless of registry state.

#### 3.6.1 Modifier Registry

The engine provides a grammar slot for an optional `modifier,` prefix, a parser that extracts the modifier token, and a modifier registry data structure (`Record<string, ModifierConfig>`). **No modifiers are built into the engine** — zero is a valid configuration. Authors populate the registry in their ruleset config to define what modifiers mean and how they affect tag routing, filtering, and resolution.

Modifier entries can carry expression-based rules using the same DSL grammar from Section 4.2. These expressions configure how the engine treats tags carrying that modifier — the engine evaluates them, but authors write them.

#### 3.6.2 Tag Registry

> **Name disambiguation (§0.8.0).** This *Tag Registry* — a keys-only vocabulary
> tree — is distinct from the **Address Registry** in §3.7, which maps specific
> tag strings to substrate references. The two coexist and do different jobs: the
> Tag Registry constrains the *vocabulary* of tag strings; the Address Registry
> records *what specific strings point to*. The three-tier proposal (issue #11)
> originally called the §3.7 structure a "Tag Registry"; it was renamed here to
> avoid the collision.

A keys-only nested tree of valid segment paths — no values, no metadata, pure structural skeleton. Leaves are `{}`. YAML format: bare `key:` for leaves.

**File layout (§0.12.0, S3).** The C5 version header (below) is a key *with* a
value, which the pre-0.12.0 wording forbade outright. The file is therefore two
parts, not one: a top-level **`substrate_version:`** header, and the vocabulary
tree nested under a top-level **`tags:`** key. Nothing else may appear at the top
level. The "no values" rule is scoped to the **vocabulary tree** — the registry
validator MUST reject any node *under `tags:`* that carries a value or a list, or
whose key falls outside the segment charset (`/^[a-z0-9][a-z0-9_-]*$/`). A
consumer reading this file reads `tags:`, never the document root; §3.6.2's named
consumers (`packages/rule-engine`, `packages/client-threejs`) must not treat
`substrate_version` and `tags` as segment paths.

The validator is **`packages/corpus-builder`'s** to own and ship, alongside the
emitter — the registry is that package's output (below), so producing a
well-formed one and rejecting a malformed one are the same responsibility. It
validates *this artifact's* well-formedness, which is not in tension with `INV-4`:
`INV-4` forbids the runtime engine rejecting **authored content**, not the
pipeline rejecting its own malformed build output (the same line §6.3's fail-loud
gate draws).

The registry is a **vocabulary contract** between pipeline stages:
- **Produced** by `packages/corpus-builder` as `tag-registry.yaml` alongside `graph.json`
- **Consumed** by `packages/rule-engine` and `packages/client-threejs` as a vocabulary reference
- **Extended** by authors who can merge their own entries
- **Advisory** — unregistered tags are syntactically valid but orphaned; the pipeline warns, never rejects
- **Versioned (§0.11.0, C5)** — the file carries a version header, the `substrate_version` (§3.7.3) of the build
  that produced it, so this "vocabulary contract" is itself a versioned surface (`INV-5`). A ruleset predicate
  referencing a tag a rebuilt substrate no longer produces is an orphaned reference: a **load-time warning**
  through the §2.1 `Logger`, **never a rejection** (`INV-4`) — the same "surfaced, never auto-invalidated"
  stance §3.7.3 takes for snapshot staleness. See `docs/design/0005-c-series-resolution.md`.

#### 3.6.3 Registry-Bounded Values

Three rules resolve the structure-vs-data boundary:

1. Every segment path is registrable (vocabulary). The pipeline auto-registers paths for every tag it produces.
2. Explicit `=value` scalars are never registered. Values are runtime data.
3. A registered leaf (childless node) carries an implied value, resolved per use case by a pluggable resolver.

The **resolver dispatch** is engine machinery; the **resolver set** is configurable. It is owned by **`packages/rule-engine`** and built in Phase 3 (§6.4) — the pre-0.12.0 spec asserted the three defaults "exist at startup" without naming a phase or a package to build them in, so nothing did (§0.12.0). Three default resolvers ship with the engine:

| Resolver | Explicit `=value` | Leaf terminal | Non-leaf |
|---|---|---|---|
| `match` | the value string | `true` (presence) | `true` |
| `display` | the value string | terminal segment string | `null` |
| `numeric` | coerced to Number | `1.0` (presence) | `null` |

Authors can add custom resolvers or override defaults. A resolver is a function `(parsedTag, registry) → resolvedValue`. The engine guarantees the three defaults exist at startup but does not prevent replacement.

Full design rationale: `docs/tag-system-design.md`.

### 3.7 Overlay Layer — Address Registry and Primitives

The overlay (Tier 3 of the §0.8.0 model) is **not a place** — it is the interface
through which the stochastic substrate (Tier 2) becomes navigable and memorable.
Unlike the substrate, the overlay is **fully deterministic and reversible**: every
overlay write is recorded in the same input-log as moves and replays exactly
(`INV-2`). It has two parts: an inert **Address Registry** and a small closed set
of **primitive operations** that act on it.

Design rationale and the resolution of the open questions this raised:
`docs/design/0001-three-tier-data-model.md`.

#### 3.7.1 Address Registry

A pure name→reference map. It answers "what does this name point to" and nothing
else — no embedded behavior, no computation, no derived positions. It is
serializable, diffable, cacheable, and independently testable.

```typescript
// packages/schema/src/overlay.ts

interface AddressRegistryEntry {
  tag: string;                 // the address/name (a structured tag, §3.6 grammar)
  points_to: EntryReference;
  provenance: Provenance;
}

type Provenance = "build" | "author_runtime" | "player";

type EntryReference =
  | { kind: "coordinate"; vector_ref: string }   // a point in substrate; vector by ref, never raw (INV-3)
  | { kind: "snapshot"; snapshot: Snapshot }     // a frozen, resolved substrate query result (§3.7.3)
  | { kind: "composite"; member_tags: string[] };// a name for a SET of other tags — grouping, not computation

interface Snapshot {
  substrate_version: string;   // the substrate-build id this resolution was bound to (§3.7.3, §6.3)
  resolved_payload: Entity[];  // self-contained frozen result; readable regardless of later rebuilds
}
```

`composite` is the entire extent of "hierarchy" in the registry: grouping only.
The registry never merges, computes derived positions, or resolves composites — any
consumer (renderer, rule engine) that wants a composite's effective position does
that resolution itself, externally. `Entity.contains` (§3.1) is exactly a
`composite` entry's `member_tags`, resolved to concrete entities at interpretation
time.

Object types (room, item, …) are **not** registry entry kinds — they are
interpretations applied to a resolved reference at render/rule-evaluation time, via
the same `archetype` lookup keyed by tag that §3.1 already uses.

#### 3.7.2 Links

`Link` is a **separate relationship record**, not a form of `composite` (decision
D2, `docs/design/0001`). `composite` groups an unordered set; a `Link` is a
directed, typed edge between two addresses. Links live in a parallel, equally inert
table and are equally deterministic overlay writes.

```typescript
interface LinkRecord {
  from: string;        // an address (tag) in the registry
  to: string;          // an address (tag) in the registry
  kind: string;        // open string — interpretation-defined (see 3.5 versioning)
  provenance: Provenance;
}
```

#### 3.7.3 Snapshot staleness

A `snapshot` freezes one re-approximation of a stochastic substrate query as
canonical (decision D3). It binds to the `substrate_version` current at creation
time. On a corpus rebuild that changes `substrate_version`:

- the snapshot **remains valid and readable** — `resolved_payload` is
  self-contained; that self-containment is the point of pinning;
- consumers may derive `stale = (snapshot.substrate_version != live_substrate_version)`;
- the engine **surfaces** staleness but MUST NOT auto-invalidate or auto-refresh —
  silent re-resolution would violate `INV-2` (hidden state) and judging a pin
  "out of date" would violate `INV-4` (no taste-policing). Re-resolution is an
  explicit `Snapshot` primitive call.

#### 3.7.4 Primitive operations

A minimal, closed vocabulary — **not hardcoded gameplay, but reordered and
exposure-gated per game**:

| Primitive | Effect on the registry |
|---|---|
| `Pin` | write a `coordinate` entry naming a substrate point |
| `Bookmark` | write an entry naming the player's current resolved position |
| `Snapshot` | write a `snapshot` entry freezing a resolved query (§3.7.3) |
| `Link` | write a `LinkRecord` (§3.7.2) |
| `Query` | resolve a substrate query (stochastic, seeded per §4.5); read-only, records the query in the input-log |
| `Compose` | write a `composite` entry grouping member tags |

Every primitive:

- is **deterministic and reversible** (in contrast to Tier 2's stochastic
  resolution) — this is the overlay's defining property;
- is **exposure-gated per ruleset** using the §4.2 predicate grammar rather than a
  parallel permission system:

  ```typescript
  interface PrimitiveExposure {
    primitive: "pin" | "bookmark" | "snapshot" | "link" | "query" | "compose";
    exposure: "player" | "author_only" | "both";
    when?: string;   // optional §4.2 DSL predicate, e.g. "dynamic.turn_count > 5"
  }
  ```

- is usable by both author (design time, to hand-build initial registry structure)
  and player (runtime, if exposed) — same primitive, same effect, distinguished
  only by the `provenance` of the entry it writes;
- appends its write to the **same input-log as moves** — replaying a session means
  replaying both where the player went and what they named/connected along the way.

Per `INV-4`, exposure gating validates well-formedness only; it does not judge
whether a given exposure configuration is sensible.

> **§0.9.0 (A10) — how a primitive is invoked at runtime.** The only client input
> is `{object_id, affordance}` (§3.3). A **player** invokes a primitive by
> interacting with an object whose affordance an author rule maps to a
> `{ kind: "primitive" }` effect (§3.4); `exposure` gates whether the player may.
> **Rules** invoke the same primitives directly via that effect (A5) — same
> primitive, same effect, distinguished only by the `provenance` of the entry
> written. There is no separate primitive endpoint or permission system. Registry
> *contents* remain server-internal; a client-facing **names/labels** view of
> player-provenance entries is exposed via `GET /session/{id}/registry` (§5.1),
> within the INV-3 refinement (§0). The registry is owned per §3.8 (layered:
> shared build/author base + per-session player overlay).

### 3.8 Session State (§0.9.0, A8)

The in-memory run-state object the solver reads (`state` in §4.1) and every
`dynamic.*` predicate (§4.2) resolves against. A `packages/schema` type,
**server-internal** — never sent to the client (INV-3), except the derived
`ended` flag surfaced on `InteractResponse` (§3.3). This is the in-memory shape,
not persistence (durability is post-alpha, §6.8).

```typescript
// packages/schema/src/session.ts
interface SessionState {
  session_id: string;
  session_seed: number;              // the only entropy source (§4.5)
  position: CoordinateRef;           // §0.9.0 (A3): live substrate coordinate, by ref (INV-3), never a raw vector
  turn_count: number;                // dynamic.turn_count — §0.13.0: a pure runtime metric (turns taken),
                                     // NOT a substrate-seed component (§4.5). Advances as a game event, once per
                                     // resolved interaction; room resolution is independent of it.
  trace_centroid: number[] | null;   // dynamic.trace_centroid (vector, server-internal)
  momentum: number[] | null;         // dynamic.momentum
  path_coherence: number;            // §0.10.0 (B5): dynamic.path_coherence — 0.0–1.0, ENGINE-computed per turn from
                                     // trace_centroid/momentum/visited: how tight/consistent the recent trajectory
                                     // through embedding space has been. Distinct from a place's local_coherence (§3.1).
  visited_set: string[];             // dynamic.visited_set — overlay ADDRESS-TOKENS (A3), not ephemeral ids
  address_tokens: AddressToken[];    // §0.9.0 (A3): the append-only parent→children token tree the durable handle lives in;
                                     // `Entity.contains` (§3.1) resolves from it. SERVER-INTERNAL (INV-3), like the rest of this type.
  current_token: string | null;      // §0.9.0 (A3): the token at the player's current place — parent of the next mint, and the
                                     // ancestor backtracking truncates to. `null` before the first place is minted.
  vars: Record<string, string>;      // §0.9.0 (A8): dynamic.vars.* scratch — write target for `write` effects (A5),
                                     // readable in the DSL (§4.2). Values are strings; coerce per predicate use.
  registry: AddressRegistryEntry[];  // §0.9.0: the PLAYER-overlay layer (provenance "player"); reads merge this
                                     // over the shared build/author_runtime base bound to the world (§3.7.1)
  links: LinkRecord[];               // player-overlay links (§3.7.2)
  ended: boolean;                    // §0.9.0 (A7): set by the `end` effect; surfaced as InteractResponse.session_ended
  input_log: InputLogEntry[];        // §0.9.0 (A9): accumulated player inputs (§3.9)
}

type CoordinateRef = { vector_ref: string };  // a reference into the substrate index, never a raw vector (INV-3)

interface AddressToken {          // §0.9.0 (A3) — one node of the durable overlay token tree
  token: string;                  // opaque, engine-minted, replay-deterministic (INV-2/INV-3): not a vector_ref, not an Entity.id
  parent: string | null;          // parent token; null for the session root — the parent→children grouping is Entity.contains (§3.1)
  position: CoordinateRef;        // the substrate coordinate this token names (server-internal)
}
```

The **address-token tree is the durable memory** `position` is distinct from
(A3): `position` is a live substrate coordinate (Tier 2, re-approximated on
return), while a token is the append-only, opaque handle for a *place* (Tier 3).
Backtracking truncates `current_token` to an ancestor and re-resolves that
coordinate fresh; a subsequent move mints a **sibling** token, and the tree stays
monotonic so old branches remain addressable. `Entity.contains` (§3.1) is exactly
a token's children in this tree.

The **Address Registry is layered** (A8): build- and author_runtime-provenance
entries are shared per-world and immutable during play; player-provenance writes
live in `SessionState.registry`; a read is the merge (player over base).

### 3.9 Input Log (§0.9.0, A9)

The artifact `INV-2` is defined against: replaying `(session_seed, ruleset,
input_log)` reproduces a session byte-for-byte. It records **only player/author
inputs**; rule-driven scratch/overlay writes are deterministic consequences and
are **not** logged (they re-derive on replay).

```typescript
// packages/schema/src/session.ts
type InputLogEntry =
  | { kind: "interact"; action: { object_id: string; affordance: Affordance } }
  | { kind: "primitive"; primitive: PrimitiveExposure["primitive"]; args?: Record<string, string> };
```

The server accumulates the log per session and exposes it at
`GET /session/{id}/log` (§5.1). **Replay** = create a session with the same seed
and re-POST the logged `interact`/primitive actions in order; there is no
dedicated replay endpoint and no durable storage (sessions are in-memory, §5.1).

---

## 4. Rule Engine Specification

### 4.1 Evaluation Model

Pseudocode, normative (implementation in `packages/rule-engine/src/solver.ts` must match this control flow):

```
resolveMove(state, graph, layerStack):
    candidates = graph.neighbors(state.position)  // or k-NN if no discrete edges authored
    activeLayers = layerStack.filter(l => l.scope == "global" OR evaluate(l.scope, state))
    ordered = activeLayers.sortBy(resolutionOrder)  // see 4.3

    for layer in ordered:
        for rule in layer.rules:
            if evaluate(rule.predicate, state, graph, candidates):
                apply(rule.effect, candidates)
                if rule.effect.kind in ["hard_allow","hard_forbid"] and layer.mode == "override":
                    lockRemainingLowerLayersOutOfHardDecisions()

    if candidates.hardDecisions.isEmpty():
        candidates = graph.neighbors(state.position)  // fall through to null/relativistic (INV — see 1)

    return sample(candidates, weightedBy = softScores)
```

Per `INV-4`, this function MUST NOT throw, reject, or auto-correct when layers produce contradictory hard decisions. Resolution order (4.3) determines the outcome; a "bad" outcome is a valid outcome.

> **§0.9.0 amendments to the control flow (A4/A5).** Two additions, neither of
> which changes the hard/soft decision logic above:
> 1. **Exit-anchored candidates.** When a move is initiated by interacting with a
>    traversal-capable object (§3.2, A4), that object's seeded query **anchors**
>    `candidates` — `resolveMove` resolves the destination of the chosen exit
>    rather than sampling freely among all neighbors. `sample()` is still seeded
>    (§4.5), so determinism holds; the null-ruleset drift path (candidates =
>    `graph.neighbors`) is unchanged.
> 2. **Post-decision commit phase.** After the decision is made and `sample()`
>    returns, the engine runs a separate commit phase: collect every `write` /
>    `primitive` / `emit` / `end` effect (§3.4) fired by active layers and apply
>    them in declaration order, **last-write-wins, never throwing** (INV-4).
>    Writes cannot affect this move's candidate filtering. This is where authored
>    state (`dynamic.vars.*`, overlay entries) and `interaction_result` are
>    produced. Local (non-movement) interactions (§3.3, A6) run the identical
>    `evaluateLayers` + commit phase with no transition.

> **§0.11.0 (C2) — the degenerate (empty) resolution.** `sample()` is defined to
> **never throw on an empty candidate set**: over zero candidates it returns "no
> result," and the room resolves with `objects: []` and `exits: []`. This is a
> valid resolution, not a failure — a zero-candidate query, a region with no
> neighbors in radius, an all-objects-filtered room, and an all-exits-`hard_forbid`
> room all resolve to the same well-formed empty response. The response's
> `resolution_status` (§3.2) is **`"stuck"`** exactly when a well-formed resolution
> leaves no legal exit, and **`"resolved"`** otherwise (including a merely sparse
> room with short arrays). **That mechanical test is the whole definition (§0.12.0,
> S5)** — `"stuck"` describes the *shape* of a resolution, never its cause. The
> pre-0.12.0 wording also called `"stuck"` "a rules-produced dead-end, never the
> absence of authored structure," which contradicts it: a substrate region with no
> neighbours at all is exit-less without any rule saying so. Both are stuck, and a
> player cannot tell the difference from inside the room, which is the point.
>
> What the retired clause was protecting remains true and is stated directly: the
> engine never hard-locks a player *for want of authored rules*. The null-ruleset
> drift fallthrough (`candidates = graph.neighbors`, above) applies wherever no
> *hard* decision forbids movement, so a zero-rule world drifts rather than
> sticking. If the two causes ever need distinguishing on the wire,
> `ResolutionStatus` is an open union and a further value is a MINOR bump (§3.2) —
> deliberately not spent here. `INV-4` makes being stuck legal, which
> is why the stuck state is *defined and surfaced* here rather than errored at the
> protocol boundary (§5.1). See `docs/design/0005-c-series-resolution.md`.

Naming: `resolveMove`, `populate`, and every other TypeScript identifier in this section follow `docs/naming-conventions.md`. Wire-facing fields (`layout_hint`, effect kinds like `hard_allow`) keep the `snake_case` SPEC §3 already defines — the split is deliberate, not a typo.

### 4.2 DSL Grammar (v0)

Minimal expression grammar for `predicate` and `scope` strings. EBNF, informal:

```
expression   := comparison (("AND" | "OR") comparison)*
comparison   := operand OPERATOR operand
operand      := property | literal | function_call
property     := "static." PATH   |  "dynamic." PATH
PATH         := IDENT { "." IDENT }
function_call:= IDENT "(" (operand ("," operand)*)? ")"
OPERATOR     := ">" | "<" | ">=" | "<=" | "==" | "!=" | "IN" | "NOT IN"
             | "CONTAINS" | "MATCHES"
```

`PATH` is multi-segment (§0.12.0, S7): the reserved sets below are single-segment
except **`dynamic.vars.<key>`** (§0.9.0 A8), which the pre-0.12.0 single-`IDENT`
production could not express even though the same section's prose required it. A
path naming no reserved property resolves to *absent* rather than erroring
(`INV-4`); it is not an extension point for new namespaces.

**Reserved `static.*` properties** (read from the current candidate entity/edge): `static.embedding_distance` (§0.10.0 B2: cosine distance over L2-normalized vectors, range `[0,2]`, smaller = nearer — provider-independent), `static.archetype`, `static.tags` (array), `static.local_coherence` (§0.10.0 B5: the place's local-coherence, `EntityState.local_coherence`, `[0,1]`), and (§0.9.0 A1) `static.prose` (string) and `static.source` (string, the `source_span.source` id). Prose is "just data"; string tooling in the grammar (beyond `CONTAINS`/`MATCHES`) may grow in later versioned amendments. **Vestigial (§0.10.0 B2):** `static.edge_weight` and `static.cluster_id` remain reserved for backward compatibility but are leftovers of the pre-substrate node/edge model (removed by decision D1); no build stage produces them, and predicates should not rely on them.

**Reserved `dynamic.*` properties** (read from run state, §3.8): `dynamic.visited_set` (array of overlay address-tokens, §0.9.0 A3), `dynamic.trace_centroid` (vector), `dynamic.momentum` (vector), `dynamic.turn_count`, `dynamic.path_coherence` (§0.10.0 B5 — the session's trajectory-tightness scalar `[0,1]`; renamed from `dynamic.coherence`, and distinct from a place's `static.local_coherence`), and **`dynamic.vars.<key>`** (§0.9.0 A8 — the per-session scratch store; any author-chosen key, string-valued, written by `write` effects §3.4; the home for author-defined scalars that the old "author-defined coherence" wording implied). Prose (§3.1 `static.*`, below) is likewise readable as string data (A1); the reserved `static.*` set is extended with **`static.prose`** and **`static.source`**.

**Reserved functions**: `contains(array, value)`, `distance(vec, vec)`, `recent(dynamic.visited_set, n)`, `matches(array, pattern)`.

**`MATCHES` pattern grammar** (asymmetric — wildcards on pattern side only):

```
pattern       = [ mod_pattern "," ] seg_pattern [ "=" val_pattern ] ;
mod_pattern   = IDENT | "*" ;
seg_pattern   = seg_or_wild { ":" seg_or_wild } ;
seg_or_wild   = IDENT | "*" | "**" ;
val_pattern   = VALUE | "*" ;
```

`*` matches exactly one segment; `**` matches zero or more. Wildcards exist only in patterns. `CONTAINS` performs exact string comparison (backward-compatible); `MATCHES` parses both pattern and tag via the structured tag grammar (Section 3.6) and applies glob matching on parsed segments.

Example predicates:

```
static.tags CONTAINS "mood:tense" AND dynamic.turn_count > 5
static.tags MATCHES "theme:*" AND static.archetype == "container"
static.tags MATCHES "creature:hostile:**" OR static.tags MATCHES "environment:terrain:cave"
```

The DSL is intentionally small. It is NOT Turing-complete by design — no loops, no user-defined functions beyond the reserved set. Extending the grammar is a MAJOR version change to `packages/schema` (3.5) and requires a new grammar section here, not silent parser extension. `MATCHES` is the sole grammar extension since v0.1.0.

### 4.3 Layer Resolution Order

Given `layer.mode`:

1. Layers with explicit `{priority: N}` sort by N descending (higher priority evaluated first) — override order is author-controlled, not engine-assumed.
2. Among layers without explicit priority: `override` layers are inserted immediately above the layer they were scoped under (locally-scoped overrides beat their enclosing global layer); `yield` layers are inserted at the bottom of the stack, only applying if no decision has been made.
3. **First hard decision (`hard_allow` or `hard_forbid`) encountered while walking the ordered stack top-to-bottom wins and is not overridden by lower layers**, EXCEPT that a lower layer explicitly declared `override` re-opens the decision. This is the intentional "messy is allowed" escape hatch: two `override` layers disagreeing resolve by declaration order, with a warning logged, never an error.
4. All `soft_reweight` effects from every layer are collected and multiplied together regardless of hard-decision locking — soft effects always stack and are never cancelled by hard decisions elsewhere.

### 4.4 Room Population as Zero-Radius Query

Population of a room's `objects[]` (Section 3.2) uses the **identical** solver as movement, called with the room itself as both origin and destination, radius bounded by embedding proximity/cluster membership rather than graph edges:

```
populate(roomEntity, layerStack, graph):
    candidates = graph.neighborsWithinRadius(roomEntity, mode="embedding_proximity")
    // then IDENTICAL layer-evaluation loop as resolveMove (4.1)
    return sample(candidates, n = round(roomEntity.layout_hint.density * MAX_ROOM_OBJECTS), weighted=True)
```

This is not an approximation of shared logic — `resolveMove` and `populate` MUST call the same underlying `evaluateLayers()` function in `packages/rule-engine/src/solver.ts`. A test that asserts this (same function reference, not just same output) belongs in Phase 3 (Section 6.3).

> **§0.11.0 (C1) — `MAX_ROOM_OBJECTS = 12`.** The constant above is an alpha-scale
> **sampling target** (objects = `round(density * MAX_ROOM_OBJECTS)`), tunable in
> Phase 6, **not** a hard cap the engine rejects past: 12 keeps a room legible in a
> 3D scene and a query cheap to resolve, and per-room `density` scales it down. A
> ruleset wanting denser or sparser rooms tunes `density` (and, if it must, this
> default). `populate` obeys the §0.11.0 (C2) empty-resolution rule: `sample()` over
> zero candidates returns "no result" (`objects: []`), never throws. See
> `docs/design/0005-c-series-resolution.md`.

Under the §0.8.0 substrate model, `graph.neighborsWithinRadius(...)` is a **live
substrate query at the player's current position** rather than a lookup of
pre-clustered neighbors. The zero-radius-query mechanism survives intact: the
identical-`evaluateLayers()` requirement is unchanged, and query stochasticity is
seed-controlled per §4.5, so the determinism test still holds.

> **§0.9.0 (A4) — exits derived from the populated set.** After `objects[]` is
> populated, the server derives `exits[]` (§3.2) in the same resolution pass: for
> each populated object whose affordance set includes a movement affordance
> (`Ruleset.movement_affordances`, default `enter`/`traverse`, plus `portal`),
> emit a `ResolvedExit` bound to that object (via_object_id), its movement
> affordance (affordance_required), a query token seeded from it
> (target_entity_id), and its soft-score (weight). No separate exit graph or
> edge table exists.

> **§0.10.0 (B3) — the substrate `Query` and how a result becomes a room.** A
> substrate query is one unified shape (matching the §3.7.4 `Query` primitive):
>
> ```typescript
> interface Query {
>   origin: CoordinateRef;   // the player's live position (§3.8), by ref — never a raw vector (INV-3)
>   k: number;               // candidates to draw
>   radius?: number;         // optional cosine-distance cutoff (region queries)
>   direction?: number[];    // optional gradient bias, e.g. dynamic.momentum (gradient queries)
>   filter?: unknown;        // optional author-supplied tag/archetype prefilter
> }
> ```
>
> The §8 glossary's nearest-neighbor / region / gradient kinds are
> parameterizations (k alone; k + radius; k + direction), not separate types. `k`,
> the default `radius`, and the gradient source are **ruleset config with engine
> defaults** (same bundle as movement-affordances, A11/A13); a zero-config world
> runs as relativistic drift (§0). **Result → room:** the query returns k ranked
> spans; the nearest / highest-weight span becomes the room entity (its `prose`,
> tags, archetype), and the remaining k−1 are the candidate pool `populate`
> (above) samples `objects[]` from — `populate` is this same call with the room as
> origin. Exits then derive from the populated objects (A4). See
> `docs/design/0004-b-series-resolution.md`.

### 4.5 Determinism (implements INV-2)

- All sampling (`sample()` in 4.1/4.4) uses a seeded PRNG. The seed is derived deterministically from `(session_seed, normalized_query)` — never from wall-clock or external entropy. `turn_count` is **not** a seed component (§0.13.0); the query's `origin` carries the player's position (below), so the room is a function of where the player stands, not of how many turns have elapsed.
- Given identical `(graph.json, ruleset.dsl, session_seed, input-log)`, `resolveMove` and `populate` MUST produce byte-identical output across runs. This is a Phase 3 test requirement (Section 6.5), not a nice-to-have.

**Determinism across the three tiers (§0.8.0 precision amendment).** The §0.8.0
model splits determinism cleanly rather than weakening it:

- **Overlay (Tier 3, §3.7)** — fully deterministic and reversible. Every overlay
  write is a logged, replayable record. Unchanged, fully required.
- **Substrate (Tier 2)** — queries are *stochastic across seeds by design*
  (re-approximable "vibes," not noise to engineer out), but their randomness is
  drawn from the seeded PRNG rule above: `(session_seed, normalized_query)`.
  `turn_count` is **not** a component (§0.13.0); `normalized_query` carries the
  discretized position, so the seed keys on *where* the player stands. Consequences:
  - Replaying an identical `(graph.json, ruleset.dsl, session_seed, input-log)`
    reproduces every substrate result **byte-for-byte** — the `INV-2` replay
    guarantee holds unchanged.
  - A stationary player re-issues the same normalized query and gets the **same
    room byte-for-byte**, which is exactly what §3.3 (A6) requires of a local
    interaction — the room's stability is now structural, not something a
    turn-counter freeze has to preserve.
  - The "same question twice yields a similar-but-not-identical place" property is
    **position/session-relative**: it appears across *different* positions,
    *different* sessions (a new session changes `session_seed`), and a corpus
    rebuild (a new `substrate_version`, §3.7.3/§6.3) — never on returning to the
    same coordinate within a replay, where the place is stable by design (the
    §0.9.0 (A3) address-token backtracking model wants a revisited place to read
    the same).

This is a precision fix to `INV-2`, not a relaxation: the substrate sits one layer
below the solver's hard/soft decision logic, but its *seeded* results remain
replay-deterministic. Local coherence (a fixed property of the corpus) is
precomputed at build time (§6.3), so it contributes nothing nondeterministic to a
query.

**`normalized_query` — canonicalize before seeding (§0.10.0, B3).** The PRNG seed
component `normalized_query` is a **canonical serialization of the `Query` (§4.4),
hashed** — never the raw query. Canonicalization: round `origin` to the stored
index coordinate (a `vector_ref`, never a raw float vector — floats are a
determinism hazard), canonicalize/sort the `filter`, and quantize `radius` /
`direction` to fixed precision; hash the result. The seed therefore derives from a
**discretized, canonical** query, so two spellings of the same query seed
identically and float drift cannot fork a replay. This is what makes the `INV-2`
replay guarantee — stated in terms of `normalized_query` above — well-defined.

### 4.6 Debug Trace (optional, off by default)

```typescript
interface DebugTrace {
  candidates_initial: string[];
  per_layer: {
    layer_id: string;
    activated: boolean;
    rules_fired: { rule_index: number; effect: Effect; matched_entities: string[] }[];
  }[];
  final_hard_decision_source: string | null;  // layer_id that produced the winning hard decision
  final_soft_scores: Record<string, number>;
}
```

Enabled via server config flag, never a client-supplied parameter (a client should not be able to force debug-mode cost onto the server). Must add zero overhead to the hot path when disabled — implementation must gate trace construction behind the flag check, not construct-then-discard.

---

## 5. Adapter Contract (REST API + Reference Adapters)

The REST API (5.1) is the actual product surface — `INV-3` exists precisely so that every frontend, including this spec's own reference adapters, is just an HTTP client against it, with no privileged access to the engine internals. `client-threejs` (5.2) ships first because a 3D reference is the most convincing demo, but it is the *first* graphical adapter, not the only valid one: Unity, Godot, a 2D canvas, a VR shell, or anything else can be built against 5.1 with zero engine-side changes — exactly like `client-cli` (5.4), the terminal adapter, already is. Section 5.3 is what makes a third party's compatibility claim checkable without this project's involvement.

### 5.1 REST API

Normative for any adapter, not just the two reference ones (5.2, 5.4).

**Base contract**:
- JSON over HTTP; `Content-Type: application/json` on every request and response body.
- Every response carries an `X-Spec-Version` header echoing the running `spec_version` (SPEC header, Section 3.5) — not a body field, so it doesn't touch the schemas in Section 3. An adapter MAY refuse to render a response whose major version it doesn't understand; the engine does not enforce this, adapters do.
- Errors use one envelope regardless of endpoint: `{ error: { code: string, message: string } }`. No error body ever includes ruleset text, graph data, or a stack trace — `INV-3` applies to error paths, not just the happy path.
- Status codes: `200` success, `204` no content (session deletion), `400` malformed request body, `404` unknown session/route or a disabled debug/metrics endpoint, `500` internal error (message only, via the envelope above).
- Versioning: adding an endpoint is a MINOR bump; changing an existing endpoint's method, path, or response shape, or changing the base contract itself, is MAJOR (Section 3.5).

**Endpoints**:

```
GET    /session/new?seed={optional}           → { session_id, seed }   (uses the server-wide ruleset)
POST   /session/new                            → { seed?, ruleset_ref?, ruleset? } → { session_id, seed }
                                                  §0.9.0 (A12): DEV-MODE ONLY. Bind a ruleset per session —
                                                  ruleset_ref names a server-registered ruleset (by reference),
                                                  ruleset inlines a full bundle (by value). 404/403 if dev mode off.
GET    /room/current?session_id={id}          → ResolvedRoomResponse
POST   /interact                               → InteractRequest body → InteractResponse
GET    /session/{session_id}/log              → InputLogEntry[]  (§0.9.0 A9; for replay/diff)
GET    /session/{session_id}/registry         → AddressLabel[]   (§0.9.0 A10; player-provenance names/labels only,
                                                  never internals — INV-3 refinement §0)
DELETE /session/{session_id}                   → 204, frees in-memory session state; idempotent
GET    /debug/trace?session_id={id}            → DebugTrace  (only if server debug mode on, else 404)
GET    /health                                 → { status: "ok" }, liveness/readiness for deployment (6.7)
GET    /metrics                                → { counters, gauges } snapshot from the 2.1 Metrics interface, or 404 if metrics disabled
```

> **§0.9.0 (A12) — substrate & ruleset lifecycle.** The substrate bundle
> (`graph.json`) is a **server-wide startup config** (e.g. `--graph <path>`); a
> corpus rebuild means a server restart, consistent with in-memory,
> one-world-per-server sessions. Ruleset binding is gated by a **developer-mode
> server flag** (a sibling of the debug flag, §2.1/§4.6): with dev mode **off**
> (a shipped game) the server loads one ruleset at boot and every session uses it
> — `POST /session/new` is unavailable; with dev mode **on** a session may bind
> its own ruleset by reference or value via `POST /session/new`, which is what
> lets the Phase-4 exit criteria round-trip each fixture ruleset. `AddressLabel`
> is `{ tag: string; label: string }` — a player-provenance name and its
> display label, no references or payloads (INV-3).

> **§0.11.0 (C2/C3) — degenerate responses & the trust model.**
> - **Degenerate (empty) resolution is `200`, not an error (C2).** `GET
>   /room/current` and `POST /interact` return a normal `ResolvedRoomResponse` when
>   resolution yields nothing — `objects: []`, `exits: []`, `resolution_status:
>   "stuck"` (§3.2, §4.4). The `4xx`/`5xx` codes above remain for **malformed**
>   requests and **unknown** sessions/routes only; a well-formed request with no
>   resolvable answer is a valid game state, never a protocol failure.
> - **Trust model, on the record (C3).** The alpha is **single-user, local,
>   trusted-operator.** The server **binds to localhost by default**; there is no
>   authentication boundary and none is implied, and the author-supplied ruleset is
>   **trusted input** (the engine runs "bad" rulesets, `INV-4`; it does not sandbox
>   against malicious ones). Authentication, accounts, multiplayer, and any
>   remote/multi-tenant deployment are **post-alpha (§6.8)**. Phase-6 hardening
>   (§6.7) adds a **bounded session count with oldest-idle (TTL) eviction** — so the
>   in-memory session store (below) cannot grow without bound — and a **request
>   body-size cap**; both are operator-tunable hardening of the existing surface,
>   **not** an auth system. See `docs/design/0005-c-series-resolution.md`.

Session lifecycle: `GET /session/new` creates a session; `GET /room/current` and `POST /interact` operate on an existing one; `DELETE /session/{id}` explicitly tears one down (deleting an already-deleted or unknown session still returns `204`, not `404` — deletion is idempotent by design). Sessions are in-memory only (6.5) — nothing here is persistence, and a server restart drops all sessions, which is expected for alpha (Section 7).

No websocket requirement for v0 — turn-based interaction tolerates request/response latency. This is a deliberate scope cut, not an oversight; revisit only if the alpha's interaction pacing demands it (Section 7, open question).

### 5.2 ECS Mapping (Three.js Adapter — First Graphical Reference)

Any coding agent building `packages/client-threejs` should structure it as a minimal hand-rolled ECS. The reference adapter has no external ECS library dependency — setup cost isn't justified until scene complexity demands it; a fork is free to graduate to a real ECS library:

| Concept | Implementation |
|---|---|
| Entity | `id: string`, matches `Entity.id` from schema verbatim |
| Components | Plain object keyed by entity id: `{ archetype, semantic_tags, affordances, salience, layout_hint, state }` — direct copy of schema fields, no client-side reinterpretation |
| `LayoutSystem` | Pure function: `(Entity[], layout_hint) → Map<id, THREE.Vector3>`. This is the primary creative surface for adapter authors — same schema, different LayoutSystem = different spatial feel |
| `MeshResolutionSystem` | Pure function: `(archetype, semantic_tags) → THREE.Object3D`. Lookup table, extensible, is the "archetype → matter" mapping. Adapter authors can filter `semantic_tags` by modifier (e.g. tags carrying an author-defined rendering-hint modifier) to separate visual hints from semantic identity — see Section 3.6.1 |
| `InteractionSystem` | Raycast on click → resolve target entity id + affordance → `POST /interact` → await → hand result to `SyncSystem` |
| `SyncSystem` | `InteractResponse → mutate components → trigger LayoutSystem + MeshResolutionSystem re-run for changed entities only` |

**Adapter MUST NOT**: cache or reconstruct graph structure client-side, implement any predicate/rule logic, or make movement decisions locally under any circumstance (even "obviously safe" ones) — this is the hard boundary of INV-3, not a soft guideline.

### 5.3 Conformance

A conformance suite of fixed `ResolvedRoomResponse` JSON fixtures (Section 6.5) must render without error in a reference adapter. Any third-party adapter (Godot, Unity, future forks) implementing 5.1 and claiming schema compatibility should be checkable against the same fixture set without needing this spec's author involved — this is what makes a plugin ecosystem of independent frontends viable, rather than one this project must own. `client-threejs` and `client-cli` are the two adapters this spec builds and holds to that bar itself; nothing about 5.1 assumes either of them exists.

### 5.4 Terminal Reference Client (Testing Interface)

The simplest possible adapter: a REPL that speaks the REST API (5.1) over stdin/stdout, nothing else. It exists so the engine is fully usable and testable without any graphical frontend — where `client-threejs` is a reference adapter for players, `client-cli` is a reference adapter for authors, testers, and CI.

**Behavior**: `GET /session/new` on start → print the room (id, archetype, salience-ordered objects with affordances, exits) → read a line (`<object_id> <affordance>`) → `POST /interact` → print `new_room`, repeat. It also accepts a scripted input-log file (one action per line) for headless replay — the same input-log shape `INV-2` determinism already requires, so a recorded session can be replayed and diffed byte-for-byte with no one at the keyboard.

**Verbosity**: a single `--verbosity` flag (or `SDC_LOG_LEVEL` env var) reusing the Section 2.1 `Logger` levels: `error` prints transitions only; `warn` (default) adds affordances and exits; `info` adds full entity fields as pretty JSON; `debug` adds the raw `DebugTrace` (4.6, when the server has debug mode on) plus a per-session summary — turns, requests, latency — read from the Section 2.1 `Metrics` interface on exit. This is the wiring point for both supporting systems from Section 2.1: the CLI does not reimplement logging or metrics, it is a display surface for them.

**Constraints**: identical to `client-threejs` under `INV-3` — `packages/client-cli` imports wire-protocol types from `packages/schema` only, never `packages/rule-engine` or `packages/corpus-builder`. Because it has no rendering dependency, it can load and print `fixtures/rooms/*.json` directly (5.3) with nothing else running, making it the first conformance check exercised in the build order (6.5) — ahead of the graphical client (6.6).

---

## 6. Phased Build Plan

Each phase has explicit **Entry** (what must already be true), **Build** (what to create), and **Exit** (checkable done-criteria) conditions. A coding agent should not begin phase N+1 until phase N's Exit criteria are all met.

### 6.1 Phase 0 — Repository Scaffold

**Entry**: Empty repository.

**Build**:
```
/
├── SPEC.md                          (this document)
├── package.json                     (workspace root, npm/pnpm workspaces)
├── tsconfig.base.json
├── packages/
│   ├── schema/                      (Section 3, built first — everything imports this)
│   │   ├── src/entity.ts
│   │   ├── src/protocol.ts
│   │   ├── src/ruleset.ts
│   │   ├── CHANGELOG.md
│   │   └── package.json
│   ├── rule-engine/
│   │   └── src/ (empty, Phase 3)
│   ├── corpus-builder/
│   │   └── src/ (empty, Phase 2)
│   ├── server/
│   │   └── src/ (empty, Phase 4)
│   ├── client-cli/
│   │   └── src/ (empty, Phase 4)
│   ├── client-threejs/
│   │   └── src/ (empty, Phase 5)
│   └── rule-editor/
│       └── src/ (empty, Phase 7 — post-alpha, not required for production alpha)
├── fixtures/                        (Section 6.5 conformance data, populated incrementally)
└── docs/
    └── (generated/expanded technical docs, out of scope for this spec)
```

**Exit**: `npm install` (or pnpm) succeeds at root; all packages resolve workspace-internal dependencies; `packages/schema` compiles standalone with zero errors.

### 6.2 Phase 1 — Schema Implementation

**Entry**: Phase 0 complete.

**Build**: Implement Section 3.1–3.4 verbatim in `packages/schema/src/`, **plus the §0.9.0 additions**: `SourceSpan` (§3.1), `InteractionResult` (§3.3), the expanded `Ruleset`/`InterpretationLookup`/`Effect` (§3.4), and the new **session-state** (§3.8) and **input-log** (§3.9) types. No logic, no runtime code — types and minimal validation helpers only (e.g., a `isValidEntity()` type guard is in scope; a solver is not).

**Exit**: 
- All interfaces in Section 3 exist with matching field names/types.
- `packages/schema/CHANGELOG.md` has an initial `0.1.0` entry.
- A hand-written fixture (`fixtures/entity.example.json`) validates against the `Entity` type with zero TS errors when imported and type-checked.

### 6.3 Phase 2 — Corpus Builder (Build-Time Pipeline)

**Entry**: Phase 1 complete.

> **§0.8.0 re-scoping (three-tier model).** This phase no longer produces a fixed
> node/edge graph. It builds a **substrate index** (Tier 2): the `graph.json`
> artifact keeps its filename (vestigial, to avoid churning cross-references) but
> its contents are redefined to embedding vectors + an ANN index for live
> querying + a source-span provenance table + a precomputed **local-coherence
> field** (a fixed property of the corpus, computed once here rather than
> per-query, decision D4) + a `substrate_version` build-id header (used by
> snapshot staleness, §3.7.3). It does **not** contain pre-computed nodes or
> edges — "nodes" are ephemeral substrate-query results minted at runtime (§3.1,
> decision D1). The pipeline stage contract (hard validation, fail-loud on
> degenerate output) still applies but now validates *substrate-construction
> parameters* — is the embedding space well-formed, is there enough source
> material for meaningful queries — not a fixed clustering output. See
> `docs/design/0001-three-tier-data-model.md`.

> **§0.10.0 (B-series) — pipeline stage contracts.** Every stage below is a
> swappable interface with a deterministic default; ship the interface + one
> default now, defer richer implementations (`docs/design/0004-b-series-resolution.md`).
> - **Segmentation (B1)** — a `Segmenter` stage that *partitions* raw text (a
>   pure function of characters; no embeddings, no tags) over two axes: `unit`
>   ∈ char/word/sentence/token × `grouping` ∈ boundary (blank-line / newline /
>   delimiter) | fixed (N units, overlap k). Default: boundary on blank lines,
>   overlap 0 (paragraphs). `char`/`word`/`sentence` are zero-dep regex tilings;
>   `unit: token` lazily loads a pinned `Tokenizer` whose identity feeds
>   `substrate_version`. **§0.13.1 — the shipped alpha default `Tokenizer` is a
>   zero-dependency, deterministic approximate tokenizer (`approx-token-v1`, a
>   GPT-style regex pre-tokenizer), not `cl100k_base`.** A production BPE tokenizer
>   (`cl100k_base` et al., via a pure-JS BPE library) is the deferred richer
>   swap-in behind the same `Tokenizer` interface — the B-series "interface + one
>   default now, richer impl later" pattern, and the reason token-counting is
>   defined as *approximate sizing* in the first place. Swapping it in bumps the
>   pinned `id` and therefore `substrate_version`, so it is a visible new build id,
>   never a silent drift. Line endings are normalized (CRLF→LF) first;
>   token-counting is approximate sizing, decoupled from the embedding provider's
>   tokenizer. Structureless / half-sentence corpora are legal (`INV-4`).
> - **Embedding + normalization (B2)** — after the provider embeds each span,
>   **L2-normalize every vector at build time**. This fixes
>   `static.embedding_distance` as **cosine distance, range `[0,2]`, smaller =
>   nearer**, provider-independent (§4.2). Dimensionality is provider-declared
>   and stored in the substrate header.
> - **Index (B2)** — behind an interface; the alpha default is an **exact flat
>   k-NN** index (deterministic; equal distances broken by corpus order). A real
>   ANN (HNSW, …) is a deferred, must-be-deterministic optimization; the scale
>   threshold is C1 (§6.7). "Well-formed embedding space" for the fail-loud gate
>   = uniform dimension, all-finite values, non-zero norms, non-degenerate spread.
> - **Composition / `restructure` (B6)** — an optional stage *after* embedding and
>   tagging (so it can read those signals) that produces **discontinuous composite
>   spans** and feeds them back into the index. A composite is still a span; its
>   provenance is its member span ids (`SourceSpan.members`, §3.1), and at
>   resolution it is a room whose members are its `contains`/`objects[]`. Default
>   is identity/passthrough (`restructure: null`, contiguous spans only); grouping
>   strategies (`semantic-cluster`, `thematic-group`, `interleave`) are deferred.
> - **Local-coherence (B5)** — `local_coherence` is **embedding-neighborhood
>   tightness**: mean cosine similarity of a point to its k nearest neighbors,
>   normalized to `[0,1]`, precomputed and interpolated at a resolved point
>   (`EntityState.local_coherence`, `static.local_coherence`). Engine-produced,
>   not author-defined.
> - **Tagging (B4)** — a `Tagger` stage; the default is a **deterministic, offline,
>   model-free lexicon** (keyword/regex → tag path + a default `archetype`) shipped
>   with a starter lexicon that also **seeds `tag-registry.yaml`**. Models are
>   permitted at build time under the same pin+cache+`substrate_version` discipline
>   the embedding provider already uses, but the default ships none; an
>   LLM/classifier tagger is opt-in and reproducible-via-cache only (it relaxes
>   *build* determinism, never the runtime replay guarantee). Recorded future
>   alternatives: embedding-anchor and LLM/classifier taggers.
> - `substrate_version` absorbs the identity of every pinned model/tokenizer, so
>   any of them changing is a visible new build id (below), not a silent drift.

> **§0.11.0 (C4/C5) — build-quality evaluation and a versioned registry.**
> - **Evaluation is offline and never gates the engine (C4).** A `corpus-builder
>   eval --graph <graph.json>` command reports **build quality** — a sibling of
>   `corpus-builder inspect` (§6.3.1) reusing the same `Logger`/`Metrics` and
>   `--verbosity` conventions. It *reports*; it does not fail a build. An offline
>   harness does not touch `INV-4`, which forbids the **runtime engine** rejecting
>   authored content, not the **project** measuring its own build. Named signal
>   vocabulary: **local-coherence distribution** (spread of the B5 field),
>   **tag coverage / orphan rate** (fraction of spans the tagger reached; fraction
>   of tags orphaned against `tag-registry.yaml`), and **nearest-neighbor spread**
>   (k-NN cosine-distance distribution, which makes a shuffled-noise corpus visibly
>   distinguishable from a coherent one — the silent failure mode C4 names). Ship
>   the cheapest signals now (they fall out of the B2 index and B5 field already
>   computed); richer and model-based metrics are deferred, same interface-now /
>   impl-later pattern as B.
> - **"Fail loud on degenerate output" is now concrete (C4).** *Degenerate* is the
>   B2 gate — non-uniform dimension, non-finite values, zero norms, or degenerate
>   spread (a corpus embedding to one repeated vector). The **fail-loud gate rejects
>   a malformed build**; `eval` **reports** on a well-formed-but-possibly-
>   uninteresting one. Rejecting malformed builds and judging interesting-ness are
>   deliberately two mechanisms, not one.
> - **`tag-registry.yaml` is versioned (C5).** It carries a version header — the
>   `substrate_version` of the build that produced it (§3.6.2) — so the vocabulary
>   contract is a versioned surface (`INV-5`). See
>   `docs/design/0005-c-series-resolution.md`.

**Build**: `packages/corpus-builder/` — CLI tool: `corpus-builder build --input <dir> --output graph.json`.
- Corpus retrieval step (pluggable — see §6.3.1; resolves a manifest of source documents into raw text before embedding begins)
- Segmentation step (pluggable `Segmenter`, §0.10.0 B1; partitions raw text into source spans by `unit` × `grouping`, default paragraphs/no-overlap, before embedding)
- Embedding step (pluggable — spec does not mandate a specific model/provider, but MUST be swappable via config, not hardcoded to one vendor; vectors are L2-normalized at build time, §0.10.0 B2)
- Index construction step → ANN index over source-span embeddings (replaces fixed clustering/node formation; the substrate is queried live, §3.7 Tier 2; alpha default is an exact flat k-NN index behind an index interface, §0.10.0 B2)
- Local-coherence precomputation → the `local_coherence` field stored in the substrate bundle (decision D4; embedding-neighborhood tightness, §0.10.0 B5)
- `substrate_version` stamping → a content-hash/build-id in the `graph.json` header, consumed by snapshot staleness (§3.7.3)
- Tagging step (pluggable `Tagger`, §0.10.0 B4) → populates `semantic_tags` with structured tags (Section 3.6 grammar) and `archetype`; the default is a deterministic, offline, model-free lexicon that also seeds `tag-registry.yaml`. Models are permitted at build under pin+cache discipline but the default ships none (initial heuristic assignment is acceptable for alpha; model-based and author-refined tagging are post-alpha). Under §0.8.0, tags are interpretation-tier metadata attached to source spans, applied to resolved query results at runtime (§3.1).
- Composition step (optional, pluggable; the `restructure` slot §6.3.1, §0.10.0 B6; produces discontinuous composite spans, default passthrough). **Ordering (§0.12.0, S4):** this stage runs **after** embedding *and* tagging, so it can read both signals — the B6 reading. It therefore also runs after local-coherence precompute, and a composite it emits must be embedded, coherence-scored, and fed back into the index like any other span. The pre-0.12.0 Build list placed this bullet before coherence and tagging, contradicting B6; B6 wins and the list is reordered to match.
- Provenance: every source span carries `source_refs: string[]` — the id(s) of the raw corpus document(s) it was built from — so any resolved query result is traceable back to input. Documented in `GRAPH_FORMAT.md` alongside the rest of the internal format.
- Per-stage instrumentation: embedding, index-construction, coherence-precompute, and tagging each report through the §2.1 `Logger` (start/end, input/output counts, warnings) and `Metrics` (duration, counts) — the same interfaces `server` uses, not a parallel mechanism.
- Output: `graph.json` — internal-only format, never sent to any client (INV-3), consumed exclusively by `rule-engine`. Also outputs `tag-registry.yaml` — the vocabulary of tag segment paths discovered from the corpus (Section 3.6.2).

#### 6.3.1 Corpus Source Adapters

Corpus retrieval is a pluggable stage ahead of embedding, behind a `CorpusSource`
interface — the same swappability convention §6.3 already requires of the
embedding provider:

```typescript
// packages/corpus-builder/src/sources/types.ts
interface CorpusSource {
  resolve(manifest: CorpusManifestEntry[]): Promise<ResolvedDocument[]>;
}

interface ResolvedDocument {
  source_id: string;                  // e.g. "gutenberg:11"
  title: string;
  raw_text: string;                   // boilerplate-stripped
  metadata: Record<string, unknown>;  // subjects, authors, etc. — passed through for tagging
}
```

**First adapter — Gutendex** (`packages/corpus-builder/src/sources/gutendex.ts`):
resolves book metadata and plaintext URLs from [Gutendex](https://gutendex.com),
a free, unauthenticated, community-run JSON API over the Project Gutenberg
catalog. Plaintext is fetched directly from Project Gutenberg's own file hosts —
never proxied through Gutendex — and no text is committed to the repo; the
corpus definition checked into the repo is a small manifest of Gutenberg IDs,
resolved at build time. This keeps the repo small and holds `INV-1`/`INV-2`:
corpus retrieval is fully decoupled from the deterministic runtime, which only
ever consumes the resulting `graph.json`.

- Metadata resolution: `GET https://gutendex.com/books?ids=<comma-separated>`.
- Plaintext fetch: each book's `formats["text/plain; charset=utf-8"]` URL
  (fallback: nearest key matching `/^text\/plain/`).
- Boilerplate stripping: Project Gutenberg's standard
  `*** START OF ... ***` / `*** END OF ... ***` markers.
- Local build-time cache of fetched text (gitignored, e.g. `.cache/corpus/`) so
  repeated builds against the same manifest make no network calls.
- **Reliability caveat**: Gutendex is a community-run, best-effort service
  (recent measurements show roughly 50% error rate, ~4.5s avg response time).
  This is acceptable for a build-time, cacheable, retryable step and is **not**
  acceptable in the runtime request/response loop — `packages/server` and the
  client packages MUST NOT reference Gutendex or Gutenberg file hosts, directly
  or transitively. `corpus-builder` is the only caller.

**Manifest schema** (`corpus-manifest.json`) declares which documents a build
pulls in:

```json
{
  "source": "gutendex",
  "restructure": null,
  "entries": [
    { "id": 11, "note": "Alice's Adventures in Wonderland — Carroll" },
    { "id": 1228, "note": "On the Origin of Species — Darwin" }
  ]
}
```

`restructure` is the **composition-stage** selector (§0.10.0 B6): a post-embedding,
post-tagging stage that produces discontinuous composite spans (grouped by semantic
proximity, theme, or interleaving). `null` (the default) is identity/passthrough —
contiguous spans only. The concrete grouping strategies (`semantic-cluster`,
`thematic-group`, `interleave`) are pluggable and deferred (still out of scope for
the Gutendex adapter); the field and the composite-span data model
(`SourceSpan.members`, §3.1) exist now so adding a strategy needs no breaking
change. The manifest also carries a **`segmentation`** config block (§0.10.0 B1:
`unit` × `grouping` + `overlap`, default paragraphs/no-overlap) selecting how the
`Segmenter` partitions raw text before embedding.

`CorpusSource` anticipates non-Gutenberg sources (local filesystem, other
APIs) but this phase implements Gutendex only.

`fixtures/corpus-manifest.default.json` is the checked-in default test corpus:
a small, register-varied set (narrative, poetic, expository) so
clustering/tagging heuristics are exercised across more than one register.
Exact Gutenberg IDs are verified against `GET /books?ids=...` before being
locked into the fixture, since a wrong ID silently pulls the wrong book or
none at all.

**Development transparency and testing**: the build-time pipeline gets the same inspectability `client-cli` (§5.4) and `DebugTrace` (§4.6) give the runtime — scoped to `corpus-builder` itself, since a client seeing graph/corpus internals would violate `INV-3`.
- `corpus-builder inspect --graph <graph.json> --node <id>` prints a node's fields plus its `source_refs` chain back to raw documents. `corpus-builder inspect --graph <graph.json> --trace` prints the `BuildTrace` below, if the build that produced the graph was run with `--trace`. Both reuse the `--verbosity` levels from §5.4 for one consistent developer experience across the two tools.
- `corpus-builder build --trace` is flag-gated, off by default, zero overhead when disabled (the same rule §4.6 sets for `DebugTrace`). It writes `build-trace.json`, the build-time analogue of `DebugTrace`:

```typescript
interface BuildTrace {
  stages: {
    stage: "embedding" | "index_construction" | "coherence_precompute" | "tagging";
    input_count: number;
    output_count: number;
    duration_ms: number;
    warnings: string[];
  }[];
  span_provenance: Record<string, string[]>;  // source-span id -> source document ids
}
```

**Exit**:

> **§0.12.0 (S6) — what "small test corpus" means.** The single reference number is
> **C1's ~10–50 documents** (§0.11.0). The pre-0.12.0 "~20 documents" here was a
> third figure alongside C1's range and the checked-in fixture, so it is retired in
> favour of the C1 range, which this fixture must fall inside.
> `fixtures/corpus-manifest.default.json` (§6.3.1) is that corpus; the tiny
> in-repo `test-assets/corpus/` set exists to keep unit tests fast and is not held
> to this bar.

- Running the CLI against a small test corpus produces a valid `graph.json` **substrate index** — well-formed enough to answer queries (§0.8.0 re-scoping above), not a fixed node/edge set — and every source span in it has non-empty `source_refs` resolving to real documents in that fixture corpus. (`corpus-builder inspect --node <id>` below inspects a source-span/index entry, not a pre-clustered node.)
- The substrate bundle carries a `substrate_version` header and a local-coherence field; a second build of an unchanged manifest yields an identical `substrate_version` (determinism extends to the build-id, §4.5).
- `graph.json` schema, `source_refs`, and `BuildTrace` are documented in `packages/corpus-builder/GRAPH_FORMAT.md`. As internal formats that never cross the client boundary, they are versioned less strictly than the client-facing schema in Section 3.
- Re-running the build with identical input produces byte-identical output — `graph.json` and, when `--trace` is set, `build-trace.json` too (determinism extends to build-time transparency artifacts, not just the graph).
- `corpus-builder inspect --node <id>` and `corpus-builder inspect --trace` both run against the fixture without error.
- `GutendexSource` (§6.3.1) resolves metadata and boilerplate-stripped plaintext for a manifest of Gutenberg IDs; stripping is verified against at least 3 different books (header/footer format has minor historical variation).
- The local cache (§6.3.1) is verified: a second build run against an unchanged manifest makes zero network calls.
- `fixtures/corpus-manifest.default.json` is checked in with verified Gutenberg IDs; unit tests mock the Gutendex/Gutenberg responses — no live network calls in CI, consistent with Gutendex's best-effort/community-run reliability caveat.
- No file in `packages/server` or `packages/client-threejs` references Gutendex or a Gutenberg file host, directly or transitively (import-boundary check, same discipline as `INV-3`).

### 6.4 Phase 3 — Rule Engine

**Entry**: Phase 2 complete (needs `graph.json` to test against).

**Build**: `packages/rule-engine/src/`
- `parser.ts` — DSL grammar (4.2) → AST
- `solver.ts` — `evaluateLayers()`, `resolveMove()`, `populate()` per 4.1/4.4 pseudocode, normatively
- `layer-resolution.ts` — 4.3 ordering logic
- `debug-trace.ts` — 4.6, flag-gated
- `resolvers.ts` — §3.6.3 resolver dispatch plus the three defaults (`match`, `display`, `numeric`), which the engine guarantees exist at startup and an author may override or extend

**Exit**:
- `resolveMove` and `populate` both call the identical `evaluateLayers()` function (checked by a test that asserts function identity, not just output equivalence — per 4.4 requirement).
- Determinism test passes: same `(graph.json, ruleset.dsl, seed, input-log)` in, byte-identical output across 2 independent runs (INV-2, 4.5).
- A ruleset fixture with two `override`-mode layers producing contradictory hard decisions does NOT throw — it resolves via declaration order and logs a warning (INV-4 conformance test).
- Null-ruleset case (empty `layers: []`) produces pure nearest-neighbor drift with no errors (the "ambiguous relativistic traversal" default is exercised as a real, tested code path, not assumed).

### 6.5 Phase 4 — Server + Terminal Client + Conformance Fixtures

**Entry**: Phase 3 complete.

**Build**: `packages/server/src/` — implements the REST API (5.1) exactly. Session management (in-memory acceptable for alpha; persistence is a post-alpha concern, flagged in Section 7). Calls `rule-engine` for all resolution; server itself contains no rule logic. Wires in the Section 2.1 `Logger` and `Metrics` interfaces and the debug-flag gate for `GET /debug/trace`.

Also build `packages/client-cli/src/` per 5.4 — the terminal reference client. It is the cheapest way to exercise a live server manually, the display surface for the `Logger`/`Metrics` interfaces just wired into the server, and the first adapter validated against the fixtures below, ahead of Phase 5's graphical client.

Simultaneously populate `fixtures/`:
- `fixtures/rooms/*.json` — a set of ~10 hand-curated `ResolvedRoomResponse` payloads spanning archetype variety (at minimum: one `container` with 5+ objects, one near-empty room, one with all-soft-weighted population, one exercising `portal` archetype)
- `fixtures/rulesets/*` — ruleset bundles as structured data (`.json`/`.yaml`, §0.9.0 A11; the historical `.dsl` extension is retired), at least: null ruleset, single-global-layer ruleset, multi-layer-with-conflict ruleset (exercises 4.3's messy-resolution path deliberately)

**Exit**:
- All Section 5.1 endpoints respond with schema-valid payloads (validated against Phase 1 types).
- `fixtures/` populated and referenced by an automated test that round-trips each fixture ruleset through the server and asserts the response validates against `ResolvedRoomResponse`.
- This fixture set is what Section 5.3 conformance depends on — it must be genuinely engine-agnostic (no Three.js-specific assumptions baked into fixture content).
- `packages/client-cli` renders all `fixtures/rooms/*.json` without error (5.3 conformance, exercised here first) and can drive a live server session end-to-end through its REPL, including a `--verbosity=debug` run that prints `DebugTrace` output when server debug mode is on.
- No file in `packages/client-cli/src/` imports anything from `packages/rule-engine` or `packages/corpus-builder`, enforced by an ESLint import-boundary rule so `INV-3` holds from the first client built, not just the graphical one.

### 6.6 Phase 5 — Three.js Reference Client

**Entry**: Phase 4 complete (needs a running server to develop against, or at minimum the fixture set for offline development).

**Build**: `packages/client-threejs/src/` per Section 5.2. Minimum viable scene: load `GET /session/new` → `GET /room/current` → render room + objects via `LayoutSystem`/`MeshResolutionSystem` → capture one click interaction → `POST /interact` → re-render.

**Exit**:
- Running the client against the Phase 4 server, a player can: see a rendered room, click an object with an `enter`/`traverse` affordance, and observe a room transition (new objects render, matching a fresh `ResolvedRoomResponse`).
- Client renders all fixtures from `fixtures/rooms/*.json` without error when pointed at them directly (server bypassed) — this is the conformance check from 5.3, already exercised once by `client-cli` in Phase 4 (6.5) and repeated here for the graphical adapter.
- No file in `packages/client-threejs/src/` imports anything from `packages/rule-engine` or `packages/corpus-builder`, enforced by the same ESLint import-boundary rule introduced for `packages/client-cli` in Phase 4 (6.5) — so `INV-3` holds permanently across both reference adapters, independent of contributor awareness of this spec.

### 6.7 Phase 6 — Production Alpha Hardening

**Entry**: Phase 5 complete; end-to-end loop (corpus → graph → server → client → visible, interactive, movement-capable game) works.

**Build**: Not new features — hardening of the existing surface:
- Error handling at every protocol boundary (malformed ruleset, missing session, network failure client-side)
- Logging, metrics, and debug-flag wiring per §2.1 across all packages (structured `Logger` and `Metrics` interfaces, debug-gated trace/log verbosity)
- `GRAPH_FORMAT.md` and this spec's Section 3–5 reconciled with any drift discovered during Phases 2–5 (update `packages/schema/CHANGELOG.md` accordingly per INV-5)
- A first real (non-fixture) corpus run end-to-end, author-selected, small enough to sanity-check by hand
- Minimal deployment path documented (even if just "run server locally + open client" for alpha — production infra is explicitly out of scope, see Section 7)
- **§0.11.0 (C1/C3) — operational bounds.** Tune the C1 reference budget against the real corpus run
  (`MAX_ROOM_OBJECTS`, move-resolution p95 < ~200 ms, ~10–50 docs, single-digit concurrency — §4.4, §7);
  add the C3 trust-model bounds (localhost bind default, **bounded session count with idle-TTL eviction**,
  **request body-size cap**) as hardening, not an auth system (§5.1).
- **§0.11.0 (C4) — build-quality evaluation.** Run `corpus-builder eval` (§6.3) against the real corpus run
  and record the result — the repeatable, headless complement to "sanity-check by hand" above.

**Exit**: A person other than the original builder can clone the repo, run the build pipeline against a provided sample corpus, start the server, open the client, and play a session start-to-finish following only `README.md` (to be written in this phase) — no undocumented steps. This is the production alpha bar. **§0.11.0:** the C1 reference budget is met or its deviations recorded, the C3 session-eviction/body-size bounds are in place, and a `corpus-builder eval` (C4) result is recorded for the corpus run.

### 6.8 Phase 7+ — Explicitly Post-Alpha (Not This Spec's Scope)

Listed here so a coding agent doesn't accidentally scope-creep into these during Phases 0–6:

- Visual rule editor (`packages/rule-editor`) — flowchart UI compiling to DSL (Section 4.2 grammar is ready for this to target, but the UI itself is a separate build)
- Non-Three.js adapters (Godot, Unity) — enabled by this spec's conformance model (5.3) but not built by it
- Ruleset marketplace / sharing infrastructure
- Persistent session storage, auth, multiplayer
- WebSocket upgrade for the wire protocol
- Batch-run tooling for an "emergent rules from test-run analysis" workflow — a future authoring aid requiring Phase 4's server plus a harness that runs many null-ruleset sessions and clusters resulting traces; not required for alpha

---

## 7. Open Questions for Iterative Refinement

Flagged explicitly rather than silently decided, for resolution during or after alpha:

- **Latency/perceived responsiveness**: request/response movement (5.1) was accepted knowingly given turn-based pacing; revisit if alpha playtesting shows it feels laggy rather than deliberate. **§0.11.0 (C1):** the move-resolution budget this is measured against is now on the record — p95 < ~200 ms server-side (§4.4, §6.7).
- **Tagging quality**: Phase 2's heuristic auto-tagging is an alpha stand-in using the structured tag grammar (Section 3.6). The tag registry (3.6.2) and configurable modifier registry (3.6.1) provide the machinery for author-refined tagging; what does the refinement *tooling* look like? (Likely a Phase 7+ concern, possibly folded into the rule editor. See `docs/tag-system-design.md` for the full design rationale.)
- **`graph.json` scale limits**: no sharding/pagination strategy is specified for very large corpora. Fine for alpha-scale corpora; needs design work before "production" means more than "alpha." **§0.11.0 (C1):** "alpha-scale" is now a number — ~10–50 documents / low-thousands of spans — and that is the threshold past which the deferred ANN index (B2) and sharding become due (§4.4, §6.7).
- **Embedding provider choice**: Phase 2 mandates swappability but does not mandate a default. Pick one for the first real corpus run (Phase 6) and document the choice + rationale in `packages/corpus-builder/GRAPH_FORMAT.md`.
- **Substrate re-approximation tolerance** (§0.8.0, decision D5): the `substrate.reapproximation_tolerance` parameter — "how similar is similar enough" for two re-approximations of the same query to count as "the same kind of place" — is an empirical/tunable value, deliberately not fixed at the design-doc level. Tune it against a real corpus in Phase 6. See `docs/design/0001-three-tier-data-model.md`.

---

## 8. Glossary

| Term | Definition |
|---|---|
| Bedrock | Tier 1 of the §0.8.0 model: the corpus itself, ingested at build time, never client-visible (`INV-3`). Ground truth for the other tiers. |
| Substrate | Tier 2: a continuous embedding surface queried live (not a fixed node/edge graph). Queries are stochastic across seeds but replay-deterministic (§4.5). |
| Overlay | Tier 3: the deterministic, reversible interface (Address Registry + primitives, §3.7) through which the substrate becomes navigable and memorable. |
| Address Registry | The overlay's inert name→reference map (§3.7.1). Distinct from the Tag Registry (§3.6.2), which is a vocabulary tree. |
| Primitive (overlay) | One of the closed set `Pin`/`Bookmark`/`Snapshot`/`Link`/`Query`/`Compose` (§3.7.4): deterministic, reversible, exposure-gated per ruleset. |
| Snapshot | An overlay entry freezing one re-approximation of a stochastic substrate query as canonical, bound to a `substrate_version` (§3.7.3). |
| Substrate query | A live lookup against the substrate; one `Query{origin,k,radius?,direction?,filter?}` shape (§4.4, B3) whose nearest-neighbor / region / gradient kinds are parameterizations. Seeded per §4.5 (via `normalized_query`), re-approximable across seeds. |
| Entity | Unified schema for both rooms and objects (Section 3.1). No structural room/object distinction. Under §0.8.0, an interpretation-tier view of a resolved substrate query or registry entry, minted on demand. |
| Archetype | Entity field determining renderer interpretation and typical affordance set. |
| Layer | A scoped, prioritized set of rule-blocks (Section 3.4). Concurrent, not mutually exclusive. |
| Ruleset | The single authored bundle (§3.4, §0.9.0 A11): `spec_version` + `layers[]` plus the modifier registry (§3.6.1), resolver overrides (§3.6.3), the interpretation lookup (A13), primitive exposure (§3.7.4), movement affordances (A4), and the optional advisory `authored_against` (§0.11.0 C5). Structured data (JSON/YAML); the DSL appears only inside expression strings. The unit an author shares/forks/versions. |
| Relativistic drift | The null-ruleset default: pure nearest-neighbor movement in embedding space, no authored structure. |
| Zero-radius query | Room population (4.4), using the identical solver as movement with radius bounded to the room itself. |
| Resolved (as in "Resolved Room Response") | Fully computed server-side; client performs no further filtering/sampling logic. |
| Conformance fixtures | The fixed JSON dataset (6.5) any adapter must render correctly to claim schema compatibility. |
| Adapter | Any frontend implementing the REST API (5.1). `client-threejs` and `client-cli` are the two this spec builds and holds to conformance (5.3); neither is privileged over a third-party adapter built the same way. |
| Terminal reference client | The `client-cli` adapter (5.4): a REPL testing interface with no rendering dependency, built in Phase 4 ahead of the graphical client, display surface for the Logger/Metrics supporting systems (2.1). |
| Structured tag | A `semantic_tags` entry conforming to the grammar in Section 3.6: `[modifier,]segment[:segment...][=value]`. |
| Modifier registry | Author-configurable mapping of modifier names to behavior config. The engine provides the mechanism; authors define the entries (3.6.1). |
| Tag registry | Keys-only nested tree of valid tag segment paths, produced by the corpus-builder as a vocabulary contract (3.6.2). |
| Tag pattern | A glob-style string used with the `MATCHES` operator: `*` matches one segment, `**` matches zero or more (4.2). |
| Address-token (§0.9.0) | An opaque, engine-minted overlay id that is the *durable* handle for a place. Forms an append-only nested tree (parent→children = `Entity.contains`); the unit of `visited_set` and of backtracking by truncation (A2/A3). |
| Position (§0.9.0) | `SessionState.position`: the player's live substrate coordinate (by ref, INV-3), distinct from the address-token tree that records history (A3/A8). |
| Interpretation lookup (§0.9.0) | Author content (with engine defaults) in the ruleset mapping archetype/tags → archetype, affordances, `layout_hint`, and `salience` default, applied to a resolved query result (A13, §3.4). |
| Interaction result (§0.9.0) | `InteractResponse.interaction_result`: structured per-interaction output (`text`/`revealed`/`effects_summary`) produced by the author `emit` effect; how a local interaction reports what happened (A6). |
| Write effect / commit phase (§0.9.0) | `write`/`primitive`/`emit`/`end` effects (§3.4) applied in a deterministic post-decision commit phase, last-write-wins, never throwing — the only way rules change state (A5). |
| Developer mode (§0.9.0) | A server flag (sibling of the debug flag) that enables per-session ruleset binding via `POST /session/new`; off in a shipped game, where one boot-loaded ruleset serves all sessions (A12). |
| Input-log (§0.9.0) | The ordered list of player/author inputs (§3.9) that, with `(seed, ruleset)`, reproduces a session byte-for-byte (`INV-2`); server-accumulated, exported at `GET /session/{id}/log` (A9). |
| Source span (§0.10.0) | The atomic unit the pipeline produces and the player occupies — a slice of the corpus (`identity + char_ranges + vector + tags`). Contiguous by default (B1); may be a discontinuous **composite** (B6). Deliberately opinion-free: half-sentences and structureless spans are legal (`INV-4`). |
| Composite span (§0.10.0) | A discontinuous source span produced by the composition stage (B6), grouping non-adjacent members by proximity/theme. Provenance is `SourceSpan.members`; resolves to a room whose members are its `contains`/`objects[]`. |
| `local_coherence` (§0.10.0) | Place property (B5): embedding-neighborhood tightness (mean k-NN cosine similarity, normalized `[0,1]`), precomputed at build (D4) and interpolated at a resolved point. `EntityState.local_coherence` / DSL `static.local_coherence`. Engine-produced. |
| `path_coherence` (§0.10.0) | Session property (B5): how tight/consistent the player's recent trajectory through embedding space has been, computed per turn from run state, `[0,1]`. `SessionState.path_coherence` / DSL `dynamic.path_coherence`. Distinct from `local_coherence`. |
| Resolution status (§0.11.0) | `ResolvedRoomResponse.resolution_status` (C2): an open string union, `"resolved"` normally and `"stuck"` when a well-formed resolution leaves no legal exit. A stuck player is a valid `200` game state, never a protocol error (§3.2, §4.4). |
| Reference budget (§0.11.0) | The named, Phase-6-tunable alpha-scale numbers (C1): `MAX_ROOM_OBJECTS = 12`, ~10–50 corpus documents / low-thousands of spans, move-resolution p95 < ~200 ms, single-digit concurrent sessions. Defaults, not enforced ceilings; the thresholds §7's ANN/sharding work becomes due at. |
| Trust model (§0.11.0) | The recorded alpha posture (C3): single-user, local, trusted-operator; localhost-bound by default, no auth, author ruleset trusted (`INV-4`). Auth/accounts/multiplayer/remote are post-alpha (§6.8); Phase 6 adds bounded sessions + idle-TTL eviction and a body-size cap, not an auth system. |
| Build-quality evaluation (§0.11.0) | The offline `corpus-builder eval` report (C4): measures whether a built substrate is *interesting* (local-coherence distribution, tag coverage/orphan rate, nearest-neighbor spread) without gating the engine (`INV-4`). Distinct from the §6.3 fail-loud gate, which rejects a *malformed* build. |
