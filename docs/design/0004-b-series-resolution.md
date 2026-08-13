# Decision Record 0004 — B-series Resolution (the corpus-builder pipeline)

`status: accepted`
`spec-amendment: 0.10.0`
`issues: #28–#32 (B1–B5), #44 (B6)`
`supersedes: nothing; extends 0001 (three-tier data model) and 0003 (A-series)`

The spec-gap survey ([`open-scope.md`](open-scope.md)) filed five **Tier-B**
entries — the places where `SPEC.md` left the **Phase 2 build-time pipeline**
(§6.3) undefined: how a corpus becomes spans, how spans become an index, what a
live query is, how spans get tagged, and what "coherence" means. A sixth (B6)
surfaced during this resolution. Like the A-series, the six are not a scatter of
unrelated omissions — they are **one pipeline definition, answered from six
angles.** This record resolves all of them together and fixes the decisions the
`SPEC.md` §0.10.0 amendment implements.

Read [`0001`](0001-three-tier-data-model.md) and [`0003`](0003-a-series-resolution.md)
first: this record builds on the three-tier model (bedrock / substrate / overlay)
and the A-series runtime model, both of which stand unchanged.

---

## The unified model (why these are one decision, not six)

Two principles, established earlier, decide almost everything below:

- **Every pipeline stage is a swappable interface with an intuitive default.**
  §6.3 already mandates this for the corpus source (Gutendex) and the embedding
  provider; the B-series extends the same convention to *every* stage —
  segmentation, tokenization, indexing, tagging, and composition. The pattern is
  always the same: **ship the interface + one deterministic default now, defer
  richer implementations.** This keeps alpha small without wiring the pipeline
  shut.

- **A span is the pipeline's currency, and it is deliberately opinion-free.** A
  span is `identity + char_ranges (provenance) + vector + tags`. Nothing in that
  requires a span to be a well-formed passage, contiguous, or even from one
  document (`INV-4`). Every stage produces or consumes spans; discontinuity,
  structurelessness, and half-sentences are legal inputs, not error states.

Determinism (`INV-2`) splits cleanly, exactly as §4.5 already splits it for the
runtime: the **default** pipeline is byte-identical from scratch on any machine
(no models beyond the pinned, cached embedding provider); **opt-in** model stages
(a generative tagger) are reproducible-*via-cache*, and that relaxation is a
documented property of choosing them, never a change to the runtime replay
guarantee, which is defined over a *fixed* `graph.json`.

---

## B1 (#28) — Segmentation is a partition stage with two orthogonal axes

**Decision.** Segmentation is a swappable `Segmenter` stage (manifest config
block, same convention as `CorpusSource`). It **partitions** raw text — a pure
function of characters, no embeddings, no tags — along two independent axes:

- **`unit`** ∈ `char` | `word` | `sentence` | `token` — the countable atom, a
  deterministic tiling of the span's characters (each unit is a subset of the
  source, so `char_ranges` always resolve).
- **`grouping`** ∈ `boundary` (start a new span on a break signal: blank line /
  newline / author-supplied delimiter) | `fixed` (N units, overlap k).

Every construction falls out of the cross product: paragraphs = `boundary` on
blank lines; 512-token windows with 64 overlap = `fixed`, `unit: token`,
`N: 512`, `k: 64`; 3-char windows = `fixed`, `unit: char`, `N: 3`.

**Defaults:** `grouping: boundary` on blank lines, `overlap: 0` → paragraphs, no
overlap, no tokenizer loaded.

**Tokenizer.** `char`/`word`/`sentence` are zero-dependency regex tilings
(`sentence` is a fixed, documented, deliberately-crude splitter — `INV-4` makes
crude-but-deterministic legal). `unit: token` lazily loads a tokenizer behind a
swappable `Tokenizer` interface (default `cl100k_base` via a pure-JS BPE library),
so the dependency lands only on builds that ask for it.

**Determinism.** Normalize line endings (CRLF→LF) first; apply the mode's fixed
split; record each span's exact `char_ranges` (overlap → legitimately overlapping
ranges, already expressible in the CSV `SourceSpan.char_ranges`). The tokenizer's
pinned identity feeds `substrate_version`, so a tokenizer bump is a visible new
build id, not a silent drift. Token-counting is **approximate sizing**,
deliberately decoupled from the embedding provider's internal tokenizer.

**Rationale.** "The corpus is arbitrary dev-supplied tokens with no assumed
structure" derives a *configurable partition* rather than a fixed rule. Splitting
`unit` from `grouping` captures every construction discussed without a mode
explosion, and keeps the tokenizer opt-in and localized.

## B2 (#29) — A provider-independent distance contract

**Decision.** The threat the issue names — a swappable provider silently
breaking `static.embedding_distance < 0.3` — is fixed by **pinning the metric,
not the provider** (which stays deferred to Phase 6, §7):

- The pipeline **L2-normalizes every embedding vector at build time**, whatever
  the provider emits.
- **`static.embedding_distance` = cosine distance = 1 − cosine_similarity, range
  `[0, 2]`, smaller = nearer** — fixed for all providers. Normalization erases
  each provider's scale quirks; cosine keeps direction, the one thing roughly
  comparable across models.
- **Dimensionality is provider-declared**, read from the provider, stored in the
  substrate header; the index is built for it (no fixed dimension mandated).
- **"Well-formed embedding space"** (the §6.3 fail-loud gate) is made concrete:
  uniform dimension, all-finite values, non-zero norm (a zero vector cannot be
  normalized), non-degenerate spread (a corpus that embeds to one repeated vector
  fails loud). This validates the *build*, not the corpus's taste (`INV-4`).
- **The index is behind an interface; the alpha default is an exact flat k-NN
  index** — zero tuning, `INV-2`-trivial (exact search is deterministic; equal
  distances broken by corpus order). A real ANN (HNSW, etc.) is a deferred,
  must-be-deterministic optimization; "exact NN" is ANN at recall 1.0, so §6.3's
  wording survives. The scale threshold at which ANN is due is C1 (Phase 6).
- `static.edge_weight` and `static.cluster_id` (§4.2) are **marked vestigial** —
  leftovers of the pre-substrate node/edge model that D1 removed; no stage
  produces them.

**Honest limit (on the record).** This fixes the *metric*, not the *meaning*.
`0.3` is a well-defined, portable number under every provider, but *what
concept-distance* it corresponds to still varies by model. That is why picking
the default provider stays a Phase-6 tuning task and predicate thresholds are
tuned against the shipped provider.

## B3 (#30) — One `Query` primitive; `normalized_query` canonicalizes before it seeds

**Decision.** A substrate query is the act of turning "where the player is + how
they're moving" into a fresh candidate set. One unified shape, matching the single
`Query` overlay primitive (§3.7.4):

```
Query {
  origin: CoordinateRef    // the player's live position (§3.8), by ref (INV-3)
  k: number                // how many candidates to draw
  radius?: number          // optional cosine-distance cutoff — region queries
  direction?: vector       // optional gradient bias (dynamic.momentum) — gradient queries
  filter?: TagFilter       // optional author-supplied tag/archetype prefilter
}
```

The glossary's **nearest-neighbor / region / gradient** kinds are
parameterizations (k alone; k+radius; k+direction), not separate types. `k`, the
default `radius`, and the gradient source are **ruleset config with engine
defaults** (same home as movement-affordances, A11/A13); a zero-config world runs
as relativistic drift (the §0 default mode).

**`normalized_query` (the `INV-2` linchpin).** The PRNG seeds from
`(session_seed, turn_count, normalized_query)`, so two spellings of the same query
must seed identically. Normalization = **serialize the query to a canonical form,
then hash it**: round `origin` to the stored index coordinate (a `vector_ref`,
never a raw float vector — floats are a determinism hazard), canonicalize/sort the
filter, quantize `radius`/`direction` to fixed precision. The seed derives from a
**discretized canonical** query, so float drift cannot fork a replay.

**Result → room.** The query returns k ranked spans. The **nearest / highest-weight
span becomes the room entity** (its `prose`, tags, archetype); the remaining k−1
are the candidate pool `populate` (§4.4) samples `objects[]` from — §4.4 is this
same call with the room as origin. Exits then derive from the populated objects
(A4). One query yields the whole room in one pass.

**Rationale.** `resolveMove` and `populate` both bottom out here, and `INV-2` is
*stated* in terms of `normalized_query`. Canonicalize-then-hash over discretized
inputs is the minimal rule that makes the second invariant true.

## B4 (#31) — Deterministic lexicon tagger by default; models allowed, opt-in

**Decision.** Tagging assigns the connective tissue (tags drive predicates,
population, and interpretation), and it is a swappable `Tagger` stage.

- **The default tagger is deterministic, offline, and model-free**: a **lexicon**
  (keyword/regex → structured tag path + a default archetype), shipped with a
  starter lexicon. §6.3's byte-identical-build Exit holds fully and everywhere,
  and a build needs no network and no GPU.
- **The starter lexicon seeds the vocabulary.** The tagger *produces*
  `tag-registry.yaml`, auto-registering every path it emits (§3.6.3 rule 1),
  seeded from the lexicon — resolving the chicken-and-egg the issue names (no
  registry exists before tagging runs).
- **Archetype is produced here** (default: derived from tags via a tag→archetype
  map, fallback to a base archetype). B4 *assigns* the archetype string; A13 owns
  what it *means* at resolution — a clean producer/consumer split.

**Is a model in the pipeline? — answered explicitly.** There already is one: the
embedding provider (B2) runs a model at build time, once, **pinned + cached, its
output baked into `graph.json` and stamped into `substrate_version`.** Tagging
inherits exactly that discipline. Models are *permitted* at build time under it,
but **the default ships no generative model.** An LLM/classifier tagger is an
opt-in pluggable that trades full build-reproducibility (it becomes
reproducible-*via-cache*, not from-scratch on a fresh machine) for tag quality.
`INV-2`'s *runtime replay* guarantee is untouched either way — that is a property
of replaying over a fixed `graph.json`, regardless of how it was tagged.

**Recorded future alternatives** (pluggable, not alpha deliverables):
**embedding-anchor** (nearest labeled-anchor tagging — model-free but couples tag
output to the deferred provider choice) and **LLM/classifier** (generative,
relaxes build determinism as above).

**Rationale.** The strong guarantee stays welded to the default; a model tagger is
a documented, opt-in relaxation of *build* determinism only. The lexicon is
provider-independent and transparent, and it doubles as the vocabulary seed.

## B5 (#32) — Two engine quantities, collision removed by scope-naming

**Decision.** The three uses of "coherence" resolve to **two** engine-computed
quantities; the third use was a second name for the first.

- **`local_coherence` (place).** The D4 build-time field, a fixed measure of
  **embedding-neighborhood tightness** — mean cosine similarity to a point's k
  nearest neighbors, normalized to `[0, 1]` — precomputed once and interpolated at
  a resolved point. This *is* what `EntityState.coherence` was: the field and its
  per-entity sample are one quantity. Renamed `EntityState.coherence` →
  **`EntityState.local_coherence`**, and exposed in the DSL as
  **`static.local_coherence`** (previously missing — a place property belongs
  under `static.*`).
- **`path_coherence` (session).** Renamed `dynamic.coherence` →
  **`dynamic.path_coherence`**: a per-turn measure of how tight and consistent the
  player's *recent trajectory* through embedding space has been, derived
  deterministically from the `trace_centroid` / `momentum` / `visited` run-state
  beside it, `[0, 1]`. A wandering player has low **path** coherence even where
  each spot has high **local** coherence — a signal the one-quantity reading
  cannot express, and this engine is about movement through semantic space.

**Coherence is engine-defined, not author-defined.** §3.1's old "author-defined
decay/stability scalar" wording is the root of the confusion and is dropped.
Authors who want a *custom* scalar already have the right tool — `dynamic.vars.*`
(A8's scratch store) — which now cleanly owns that role. Both coherence quantities
are deterministic (`INV-2`): local from the fixed build field, path a pure
function of run state.

**Rationale.** [`naming-conventions.md`](../naming-conventions.md) makes one name
for different things the defect to fix — by unifying (the field + its sample) or
renaming (place vs. path). We do both. The `static.`/`dynamic.` prefixes already
encode exactly the place/session split, so the names fall out of the DSL's own
scoping.

## B6 (#44) — Span composition is a post-signal stage on the `restructure` slot

**Decision.** Discontinuous spans — non-adjacent aggregates, or slices grouped by
semantic proximity or theme — are legal and useful, but grouping by *meaning*
needs embeddings and tags, so it **cannot** live in the pre-embedding segmentation
stage (B1) without inverting the pipeline.

- Segmentation stays **partition-only**. Aggregation moves to a distinct
  **composition stage** that runs *after* embedding and tagging (so it can read
  those signals) and feeds composite spans **back into the index** — they are
  indexed and queried exactly like base spans.
- This is the **`restructure` slot** §6.3.1 reserves, now named and shaped.
- **A composite is still a span.** Its provenance is its **member span ids**
  (mirroring `Entity.contains`), with `char_ranges` as the union; a leaf span
  keeps raw ranges. `SourceSpan` (§3.1) gains multi-member/multi-source
  provenance. At resolution the composite span *is* the room and its members are
  its `contains` / `objects[]` — reusing the overlay's `composite` shape (§3.7),
  whose `Compose` primitive is the per-session runtime complement to build-time
  composition.
- **Scope: seam now, strategies later.** Define the composition-stage interface
  and the composite-span data model; ship the identity/passthrough default
  (`restructure: null` → contiguous spans only, today's behavior); defer the
  grouping strategies (`semantic-cluster`, `thematic-group`, `interleave`) as
  pluggable, seeded (`INV-2`) implementations — same interface-now / one-impl-later
  pattern as `CorpusSource` and the index.

**Rationale.** Reusing the span currency and the `contains`/`composite` structures
means discontinuity costs the pipeline one new *producer*, not a new *type*. A
composite's `local_coherence` (B5) is also meaningful by construction — a semantic
cluster is tight, a dispersed thematic group is loose.

---

## Cross-cutting consequences

### The pipeline, after B-series

```
CorpusSource → Segmenter (partition, B1) → Embedding + L2-normalize (B2)
                                                     │
                                              Index (exact flat, B2)
                                                     │
                                    [Composition / restructure]  ← B6 seam (default: passthrough)
                                                     │
                          local_coherence precompute (B5) ─ Tagger (lexicon default, B4)
                                                     │
                               graph.json (+ substrate_version) + tag-registry.yaml
```

### Every stage is now a named, swappable interface with a deterministic default
`Segmenter`, `Tokenizer`, embedding provider, index, `Tagger`, and the composition
stage all follow the `CorpusSource` convention: interface + one default now,
richer implementations deferred. `substrate_version` absorbs the identity of every
pinned model/tokenizer so any of them changing is a visible new build id (§6.3).

### Schema & DSL changes (drive the version bump)
- `EntityState.coherence` → `local_coherence`; drop "author-defined"; engine-produced.
- `SessionState.coherence` → `path_coherence`.
- DSL: add `static.local_coherence`; rename `dynamic.coherence` → `dynamic.path_coherence`;
  mark `static.edge_weight` / `static.cluster_id` vestigial.
- `SourceSpan`: member-id provenance for composites (B6).
- New build-time config surfaces (segmentation, tokenizer, index, tagger, query
  defaults, composition) — additive, in the ruleset/manifest, not the client-facing
  schema.

### Version impact
`spec-version` moves **0.9.0 → 0.10.0** — a MAJOR-equivalent revision under the
project's 0.x convention (renamed `EntityState`/`SessionState` fields and a changed
DSL grammar, the same class of change as the A-series' 0.8→0.9). No
`packages/schema/*` code exists yet (Phase 0 is unbuilt), so no
`packages/schema/CHANGELOG.md` entry is required by `INV-5` — Phase 1 implements to
the 0.10.0 shapes, and Phase 2 builds the pipeline defined here.

### What stays out of scope
Decisions D1–D5 (0001) and the A-series (0003) stand. Deferred by design and
untouched here: the default embedding provider (§7, Phase 6), `MAX_ROOM_OBJECTS`
and the scale/latency budget (C1), degenerate-empty-result semantics (C2),
cross-artifact compatibility (C5), the real ANN index, the composition grouping
strategies, and the model-based taggers. `reapproximation_tolerance` (D5) remains
a Phase-6 tuning value.
