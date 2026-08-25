# SPEC Changelog

Full history of the `SPEC.md` §0 amendments — the complete text of each
decision that produced a `spec-version` bump, newest first. `SPEC.md` §0
keeps only a one-line pointer to each entry so the read order for a
cold-starting agent stays skimmable ([`docs/documentation-standards.md`](docs/documentation-standards.md)
"Style"); this file is where the full amendment text lives.

## 0.13.1 — tokenizer default named (issue #107)

A conformance audit found §0.10.0 B1 (and `docs/design/0004`) naming
`cl100k_base` as the pinned default `Tokenizer` for `unit: token`, while the
pipeline ships a zero-dependency, deterministic approximate tokenizer
(`approx-token-v1`). Rather than pull a BPE dependency into the otherwise
model-free, byte-identical default build, this amendment **names the shipped
approximate tokenizer as the alpha default** and records `cl100k_base` (and
other production BPE tokenizers) as the deferred richer swap-in behind the
same `Tokenizer` interface — the B-series "interface + one default now,
richer impl later" pattern, and the reason token-counting is defined as
*approximate sizing* (B1). The tokenizer's pinned `id` still feeds
`substrate_version`, so swapping in a production tokenizer stays a visible
new build id, never a silent drift. No schema/protocol surface changes; a
documentation/decision correction (PATCH under §3.5's convention), hence
`0.13.1`.

Cross-referenced from §3.3 (A6), §3.8, §4.5. Making the code conform
(removing `turn_count` from the seed derivation and updating when the server
advances it) is a follow-on code issue, out of scope here — the spec is the
contract; code conforms to it.

## 0.13.0 — turn_count decoupled from resolution (issue #118)

Resolves the gap surfaced during #104: §3.8 declared `turn_count` with no
semantics and §4.5 made it a **seed component**, so whatever advanced it
silently re-sampled every room. #104 had to freeze `turn_count` while the
player stood still to keep §3.3 (A6) true ("a local interaction returns the
unchanged room"). This amendment removes that coupling instead of leaving it
inferred:

- **`turn_count` is a pure runtime metric**, not a seed component. It is a
  game-state counter readable as `dynamic.turn_count` (§3.8, §4.2) and
  nothing more. The substrate seed no longer includes it (§4.5).
- **A room is a deterministic function of `(session_seed, normalized_query)`**,
  and `normalized_query` already carries the player's position (`origin`,
  §4.4 / §0.10.0 B3). So A6 now holds **structurally**: a stationary player
  issues the same normalized query and the room re-resolves byte-identically
  no matter how many turns have passed — the freeze-while-still workaround is
  unnecessary.
- **Turn advancement is a game event.** By default `turn_count` advances once
  per resolved interaction (`POST /interact`), independent of whether the
  player moved or the move was blocked — it measures turns taken, the "how
  long have I been playing" meaning an author expects. Making its advancement
  *conditions* author-configurable is a natural extension left to a future
  versioned amendment; the machinery is not defined here.
- **The §0.8.0 "similar-but-not-identical place" property is now
  position/session-relative**, not turn-relative: it appears across
  *different* positions, *different* sessions (`session_seed`), and corpus
  rebuilds (`substrate_version`, §3.7.3/§6.3) — never on returning to the same
  coordinate within a replay, where the room is stable by design (what A6 and
  the §0.9.0 (A3) address-token backtracking model both want).

`INV-2` is untouched: given `(graph.json, ruleset, session_seed, input-log)`,
output stays byte-identical — only the seed's *components* change.
Additive/corrective at the 0.x level (MINOR under §3.5's convention), hence
`0.13.0`.

## 0.12.0 — conformance-audit amendment (internal consistency)

Resolves seven places where the spec contradicted *itself*, found by a
conformance audit of the Phase 0–4 build against spec 0.11.0. It adds no new
mechanism and changes no invariant; it makes the contract say one thing where
it previously said two, so the code findings filed alongside it can be
adjudicated. Summary:

- **§1 rewritten in substrate terms (S1).** §1 still described the
  pre-§0.8.0 "weighted graph… nodes are clusters… edges represent
  relatedness" that decision D1 removed — and §0's read order sends a
  cold-starting agent to §1 *first*, so this was the most-read stale
  paragraph in the spec. §2's reconciliation note is now stated in §1
  itself.
- **§3.6.2 registry file layout (S3).** §3.6.2 forbade any YAML value;
  §0.11.0 C5 then required a version header, which *is* a value. Fixed by
  defining the file as a `substrate_version:` header plus the vocabulary
  tree under `tags:`, scoping the "no values" rule to that tree, and naming
  `corpus-builder` as the validator's owner.
- **§6.3 composition ordering (S4).** The §6.3 Build list ran composition
  before coherence and tagging; B6 prose ran it after embedding and tagging.
  B6 wins and the Build list is reordered.
- **§4.1/C2 `"stuck"` (S5).** C2 defined `"stuck"` mechanically ("no legal
  exit") *and* causally ("a rules-produced dead-end, never the absence of
  authored structure"). A neighbour-less substrate region satisfies the
  first and violates the second. The mechanical test is now the whole
  definition; what the causal clause protected is stated directly instead.
- **§6.3 corpus size (S6).** Three different figures (§6.3 Exit's "~20
  documents", C1's "~10–50", the 8-entry fixture). C1's range is now the
  single reference.
- **§4.2 EBNF (S7).** `property := "static." IDENT` was single-segment, but
  the same section's prose requires `dynamic.vars.<key>`. The production now
  admits a multi-segment `PATH`.
- **§8 glossary "Ruleset" (S2).** Still `spec_version` + `layers[]`; now the
  full §3.4 A11 bundle.

Two additions rather than corrections, both additive (MINOR-class under this
project's 0.x convention, §3.5 — which is why this is `0.12.0` and not a
patch):

- **`InteractResponse.movement_blocked?` (§3.3).** The server had no way to
  say "a movement affordance resolved nowhere" — `transition_occurred: false`
  also means "this was a local interaction" — so it overloaded
  `new_room.resolution_status`, making `POST /interact` and
  `GET /room/current` disagree about the same room. The signal now has its
  own optional field and the room's status describes the room only.
- **§3.6.3 resolver ownership.** The spec guaranteed the three default
  resolvers "exist at startup" while no §6.x Build list claimed them, so none
  was ever built. They are now `packages/rule-engine`'s, listed in §6.4.

## 0.11.0 — C-series resolution (operational envelope & process)

Resolves the six Tier-C spec gaps (issues #33–#38) as one cross-cutting
envelope; see `docs/design/0005-c-series-resolution.md` for the decisions and
rationale. The unifying move is that **`INV-4`'s "surface, never reject"
discipline generalizes from the ruleset to the whole operational surface.**
Summary of what this amendment changes:

- **Scale/latency budget (C1).** Named alpha-scale reference defaults,
  tunable in Phase 6, never enforced ceilings: `MAX_ROOM_OBJECTS = 12`
  (§4.4), ~10–50 corpus documents / low-thousands of spans, move-resolution
  p95 < ~200 ms, single-digit concurrent sessions — the thresholds §7's
  deferred ANN/sharding work becomes due at (§4.4, §5.1, §6.7, §7).
- **Degenerate state (C2).** A resolution yielding nothing is a valid `200`
  `ResolvedRoomResponse`, never an error; `sample()` never throws on an empty
  candidate set; `ResolvedRoomResponse` gains **`resolution_status`** (open
  union, `"resolved" | "stuck"`) so a rules-produced dead-end is surfaced,
  not guessed from an empty array (§3.2, §4.1, §4.4, §5.1). *(The
  "rules-produced" qualifier is superseded by §0.12.0 S5: the `"stuck"` test
  is mechanical — no legal exit — never causal. §4.1 is normative.)*
- **Trust model (C3).** On the record: a **local, single-user,
  trusted-operator** alpha (localhost-bound default, no auth, author ruleset
  trusted, `INV-4`); auth/multiplayer/remote stay post-alpha (§6.8). Phase-6
  hardening adds bounded sessions with idle-TTL eviction and a request
  body-size cap — not an auth system (§5.1, §6.7, §6.8).
- **Semantic-quality evaluation (C4).** An offline **`corpus-builder eval`**
  report that never gates the engine (`INV-4` untouched); a named signal
  vocabulary (local-coherence distribution, tag coverage/orphan rate,
  nearest-neighbor spread so shuffled noise is distinguishable), cheapest
  signals shipped now, richer/model metrics deferred; §6.3's "fail loud on
  degenerate output" made concrete (§6.3, §6.7).
- **Cross-artifact compatibility (C5).** Mirrors the §3.7.3
  snapshot-staleness stance — surface, never auto-invalidate/reject:
  `tag-registry.yaml` gains a version header; `Ruleset` gains optional
  advisory **`authored_against?`**; an orphaned tag reference after a
  rebuild is a load-time warning, never a rejection; a session may not
  outlive a substrate rebuild (server-wide config, A12) (§3.4, §3.6.2,
  §3.7.3, §6.3).
- **Process (C6).** An explicit design-track queue: with no phase active the
  queue is the design track — lowest-numbered open `design` issue whose
  dependencies are resolved, one tier at a time (A → B → C). Issues #1/#2
  (closed unbuilt) are left closed; fresh Phase-0/1 issues are opened at
  gate-lift per `docs/roadmap.md` (`AGENTS.md` §4/§5, `docs/roadmap.md`,
  `docs/issue-standards.md`).

## 0.10.0 — B-series resolution (the corpus-builder pipeline)

Resolves the five Tier-B spec gaps (issues #28–#32) plus one that surfaced
during it (#44, B6) as one pipeline definition; see
`docs/design/0004-b-series-resolution.md` for the decisions and rationale.
Summary of what this amendment changes:

- **Every build stage is a swappable interface with a deterministic default**
  (the §6.3 `CorpusSource`/embedding convention, extended to segmentation,
  tokenization, indexing, tagging, and composition): ship the interface + one
  default now, defer richer implementations (B1/B2/B4/B6).
- **Segmentation** is a partition stage over two axes — `unit`
  (char/word/sentence/token) × `grouping` (boundary/fixed with overlap);
  default paragraphs, no overlap; `unit: token` loads a pinned `Tokenizer`
  whose identity feeds `substrate_version` (B1).
- **Embedding & index.** Vectors are L2-normalized at build time;
  `static.embedding_distance` is fixed as cosine distance `[0,2]`, smaller =
  nearer, provider-independent; the index is an interface with an exact
  flat-k-NN default; degenerate embedding spaces fail loud (B2).
- **Substrate query** is one `Query{origin,k,radius?,direction?,filter?}`
  primitive; `normalized_query` canonicalizes to the stored coordinate +
  quantized params before seeding, so float drift cannot fork a replay (B3).
- **Tagging** default is a deterministic, offline lexicon that also seeds
  `tag-registry.yaml` and assigns `archetype`; models are permitted at build
  under pin+cache discipline but the default ships none (B4).
- **Coherence** is two engine quantities: `local_coherence` (place;
  `EntityState.local_coherence`, `static.local_coherence`) and
  `path_coherence` (session; `dynamic.path_coherence`) — renamed from the
  colliding `coherence`; author-custom scalars use `dynamic.vars.*` (B5).
- **Span composition** (`restructure`, §6.3.1) is a post-embedding stage
  producing discontinuous composite spans; the seam is defined, strategies
  deferred (B6).

## 0.9.0 — A-series resolution (player-facing runtime & engine semantics)

Resolves the thirteen Tier-A spec gaps (issues #15–#27) as one interdependent
model; see `docs/design/0003-a-series-resolution.md` for the decisions and
rationale. Summary of what this amendment changes:

- **Identity & navigation.** `state.position` is a substrate coordinate;
  durable memory is an append-only tree of opaque overlay **address-tokens**
  (parent→children grouping = `Entity.contains`). `Entity.id` is ephemeral
  per-resolution; the durable handle is the address-token. Backtracking =
  truncate to an ancestor token and re-resolve fresh; `visited_set` holds
  address-tokens (A2/A3/A8).
- **Corpus text reaches the player.** `Entity` gains client-facing `prose` +
  `source_span` metadata (A1). INV-3 is refined (below) to name these, and
  overlay registry names/labels, as *output* rather than internals.
- **Interaction has consequence.** Traversal-capable objects *are* the exits
  (A4); the `Effect` taxonomy gains **write** and **emit** kinds applied in a
  deterministic post-decision commit phase (A5); local interactions are pure
  author-rules with a structured `interaction_result` (A6).
- **Authoring surface.** The ruleset is one JSON/YAML bundle (DSL only in
  expression strings) carrying layers + registries + interpretation lookup +
  primitive exposure + movement affordances (A11/A13); primitives are
  invoked via affordances through `POST /interact` plus a client-facing
  registry read (A10); ruleset binding is developer-mode-gated, substrate is
  server-wide (A12). New schema types: **session state** (A8) and
  **input-log** (A9).
- **Boundary.** The engine ships *mechanism*, not gameplay *meaning*: no
  built-in goals/score/inventory; an author-triggered `ended` flag; state via
  the overlay and a per-session scratch store (A7).

## 0.8.0 — three-tier data model

The world is framed as three tiers with different guarantees: **Bedrock**
(the corpus, build-time only), **Substrate** (a live-queried embedding
surface, not a fixed node/edge graph), and **Overlay** (an inert Address
Registry plus a small closed set of primitive operations). See §3.7 for the
overlay contract, §4.5 for how determinism splits across the tiers, and
`docs/design/0001-three-tier-data-model.md` for the decisions behind it
(resolves issue #11).
