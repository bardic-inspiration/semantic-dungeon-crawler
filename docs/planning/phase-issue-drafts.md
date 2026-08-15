# Phase 1–6 Issue Drafts

Pre-written build-task issues for Phases 1 through 6, sized one-per-PR and
mapped to their `SPEC.md` §6.x **Build** lists. This is a **planning artifact,
not the tracker**: nothing here is an open issue yet.

## How to use this document

- **Opening is still one phase at a time.** Per
  [`roadmap.md`](../roadmap.md) "The phase cycle" and [`AGENTS.md`](../../AGENTS.md)
  §4, a phase is opened only once the previous phase has finished its cycle — its
  `SPEC.md` §6.x **Exit** criteria confirmed by the phase's comprehensive QA/QC
  pass, which is what closes its milestone. These drafts are staged in advance so
  the slicing is reviewable up front; they do **not** authorize opening Phase 2+
  before Phase 1 closes.
- **When you open a phase**, copy each draft below into a new issue using the
  [Feature / build task](../../.github/ISSUE_TEMPLATE/feature_task.md) template,
  label it `phase:N` + `task`, and assign it to the `Development Phase N`
  milestone (owner-created — [`milestone-practices.md`](../milestone-practices.md)).
- **The draft IDs (`1.1`, `2.3`, …) are not issue numbers.** They exist only to
  express intra-phase ordering and the "Depends on" links here. Real GitHub issue
  numbers are assigned at open time; rewrite the dependency references then, the
  way `#50` references `#49`.
- **These are drafts, not scope law.** `SPEC.md` §6.x is the source of truth; if a
  draft and the spec disagree, the spec wins and the draft should be corrected
  (or split/merged) when the phase is opened. Acceptance criteria are written as
  the pre-TDD failing tests ([`issue-standards.md`](../issue-standards.md)).

Invariants `INV-1`..`INV-5` ([`AGENTS.md`](../../AGENTS.md) §2) hold across every
issue below regardless of phase and are not restated per-issue except where a
task's acceptance criteria test one directly.

---

## Phase 1 — Schema Implementation (`SPEC.md` §6.2)

Types and minimal validation helpers only — **no runtime logic** (no solver, no
pipeline). Every PR that touches `packages/schema/src/*` carries a
`packages/schema/CHANGELOG.md` entry in the same commit (`INV-5`); the initial
`0.1.0` entry lands with draft 1.1.

Milestone: `Development Phase 1`. Entry: Phase 0 complete.

### 1.1 — Entity schema, `SourceSpan`, and structured tag types

**Goal**

Implement the `Entity` schema (§3.1) including the §0.9.0 `SourceSpan` positional
metadata, plus the structured-tag types `Entity.semantic_tags` depends on (§3.6
grammar), in `packages/schema/src/entity.ts`. Seed the schema package's version
history and its first hand-written fixture.

**Spec reference**

`SPEC.md` §3.1 (Entity, `SourceSpan`), §3.6 / §3.6.1–§3.6.3 (structured tag
grammar, modifier & tag registries, registry-bounded values); §6.2 Phase 1.

**Acceptance criteria**

- [ ] `Entity` interface exists in `packages/schema/src/entity.ts` with every
      field name/type from §3.1 (including `prose`, `source_span`,
      `local_coherence`, `semantic_tags`, `archetype`).
- [ ] `SourceSpan` (§3.1) exists, including the `members` field for discontinuous
      composite spans (B6 data model, §0.10.0).
- [ ] Structured tag path type(s) per the §3.6 grammar exist and type
      `Entity.semantic_tags`.
- [ ] `isValidEntity()` type guard exists and returns `true`/`false` correctly for
      a well-formed vs. a malformed entity (well-formedness only — `INV-4`: no
      coherence judgement).
- [ ] `fixtures/entity.example.json` is checked in and type-checks against
      `Entity` with zero TS errors when imported.
- [ ] `packages/schema/CHANGELOG.md` has the initial `0.1.0` entry (`INV-5`).

**Fixtures / cases**

`fixtures/entity.example.json` (typical entity). Guard unit tests: minimal valid
entity, an entity missing a required field, an entity with a malformed tag path.

**Out of scope**

- Registry *contents* / `tag-registry.yaml` population — that is authored by the
  corpus-builder in Phase 2 (§6.3). Here we define only the types and any
  registry-bounded value shape.
- Any embedding/index/runtime logic.

### 1.2 — Resolved Room Response, Session/Move Request, `InteractionResult`

**Goal**

Implement the client-facing response and request shapes: `ResolvedRoomResponse`
(§3.2), the Session / Move Request types (§3.3), and the §0.9.0 `InteractionResult`
(§3.3), in `packages/schema/src/protocol.ts`.

**Spec reference**

`SPEC.md` §3.2 (Resolved Room Response), §3.3 (Session / Move Request,
`InteractionResult`); §6.2 Phase 1. `INV-3`: this is the only entity data a client
ever sees — resolved output, not engine internals.

**Acceptance criteria**

- [ ] `ResolvedRoomResponse` exists with every §3.2 field, carrying only resolved
      output (prose + `source_span` positional metadata and overlay
      names/labels of player-provenance entries) — no embeddings, index, rule
      definitions, or internal ids (`INV-3`, §0.9.0 refinement).
- [ ] Session / Move Request types (§3.3) exist with matching field names/types.
- [ ] `InteractionResult` (§3.3) exists with matching field names/types.
- [ ] A hand-written `ResolvedRoomResponse` value type-checks with zero errors.
- [ ] `packages/schema/CHANGELOG.md` entry in the same commit.

**Fixtures / cases**

A minimal in-test `ResolvedRoomResponse` literal and a `MoveRequest` literal that
type-check. (The curated `fixtures/rooms/*.json` set is Phase 4, §6.5 — not here.)

**Out of scope**

- Server wiring / endpoints (Phase 4, §6.5).
- The curated conformance room fixtures (Phase 4).

Depends on 1.1.

### 1.3 — Ruleset data shape: `Ruleset`, `InterpretationLookup`, `Effect`, versioning

**Goal**

Implement the ruleset **data shape** (not the grammar/parser) in
`packages/schema/src/ruleset.ts`: the §0.9.0-expanded `Ruleset`,
`InterpretationLookup`, and `Effect`, plus the §3.5 versioning-rule types.

**Spec reference**

`SPEC.md` §3.4 (Ruleset DSL data shape — grammar itself is §4.2, Phase 3), §3.5
(Versioning Rules, implements `INV-5`); §6.2 Phase 1.

**Acceptance criteria**

- [ ] `Ruleset`, `InterpretationLookup`, and `Effect` exist with every §3.4 field
      name/type, including the §0.9.0 expansions.
- [ ] The §3.5 versioning fields/types exist (schema/protocol surfaces are
      versioned — `INV-5`).
- [ ] An empty ruleset (`layers: []`) is representable and type-checks (the
      null-ruleset drift default is a legal value, exercised for real in Phase 3).
- [ ] A ruleset with two `override`-mode layers holding contradictory hard
      decisions type-checks (well-formed but incoherent is legal — `INV-4`; the
      solver's no-throw behavior is tested in Phase 3).
- [ ] `packages/schema/CHANGELOG.md` entry in the same commit.

**Fixtures / cases**

In-test ruleset literals: empty `layers: []`; single global layer; two conflicting
`override` layers.

**Out of scope**

- The DSL grammar, parser, and AST (§4.2) — Phase 3 (§6.4).
- Any solver / evaluation logic — Phase 3.

Depends on 1.1.

### 1.4 — Overlay layer types: address registry, links, snapshot staleness, primitives

**Goal**

Implement the Tier-3 overlay type surface in the schema: the address registry,
links, snapshot-staleness header, and primitive-operation shapes (§3.7).

**Spec reference**

`SPEC.md` §3.7 (Overlay Layer), §3.7.1 (Address Registry), §3.7.2 (Links), §3.7.3
(Snapshot staleness — consumes `substrate_version`), §3.7.4 (Primitive operations);
§6.2 Phase 1.

**Acceptance criteria**

- [ ] Address registry types (§3.7.1) exist, distinguishing player-provenance
      entries whose names/labels are client-visible (`INV-3`, §0.9.0) from hidden
      internal ids.
- [ ] Link types (§3.7.2) exist with matching field names/types.
- [ ] The snapshot-staleness header type (§3.7.3) carries the `substrate_version`
      field it is checked against.
- [ ] Primitive-operation shapes (§3.7.4) exist with matching field names/types.
- [ ] Overlay state types type-check against a hand-written literal with zero
      errors.
- [ ] `packages/schema/CHANGELOG.md` entry in the same commit.

**Fixtures / cases**

In-test literals: an empty overlay, an overlay with one player-authored named
entry, a stale-snapshot header (mismatched `substrate_version`).

**Out of scope**

- Primitive *execution* / overlay mutation logic — engine, Phase 3 (§6.4).
- `substrate_version` *production* — corpus-builder, Phase 2 (§6.3).

Depends on 1.1, 1.3.

### 1.5 — Session State and Input Log types

**Goal**

Implement the §0.9.0 session-state (§3.8) and input-log (§3.9) types — the
determinism-replay surface (`INV-2`).

**Spec reference**

`SPEC.md` §3.8 (Session State, A8), §3.9 (Input Log, A9); §4.5 (Determinism);
§6.2 Phase 1.

**Acceptance criteria**

- [ ] `SessionState` (§3.8) exists with every field name/type, including the seed
      / `turn_count` fields the seeded-PRNG determinism model reads (`INV-2`,
      §4.5).
- [ ] The input-log type(s) (§3.9) exist with matching field names/types; an
      input log is a replayable record of session inputs.
- [ ] Both type-check against hand-written literals with zero errors.
- [ ] `packages/schema/CHANGELOG.md` entry in the same commit.

**Fixtures / cases**

In-test literals: a fresh `SessionState` at turn 0; an input log with two logged
moves.

**Out of scope**

- Replay / determinism *execution* — engine, Phase 3 (§6.4); server session
  management — Phase 4 (§6.5).

Depends on 1.1.

**Phase 1 Exit (SPEC §6.2):** all §3 interfaces exist with matching names/types;
`CHANGELOG.md` has the `0.1.0` entry; `fixtures/entity.example.json` validates
against `Entity` with zero TS errors.

---

## Phase 2 — Corpus Builder (`SPEC.md` §6.3)

Build-time pipeline only. Produces the internal `graph.json` **substrate index**
(embeddings + ANN index + provenance + local-coherence field + `substrate_version`
header) and `tag-registry.yaml` — never sent to any client (`INV-3`), consumed only
by `rule-engine`. Each pipeline stage is a swappable interface with a
**deterministic default** (§0.10.0 B-series); ship interface + one default now.

Milestone: `Development Phase 2`. Entry: Phase 1 complete.

### 2.1 — CLI scaffold, pipeline harness, instrumentation, and `substrate_version` header

**Goal**

Stand up `corpus-builder build --input <dir> --output graph.json`: the staged
pipeline harness, the §2.1 `Logger`/`Metrics` per-stage instrumentation, and the
`graph.json` header carrying the `substrate_version` build-id.

**Spec reference**

`SPEC.md` §6.3 (CLI, per-stage instrumentation, `substrate_version` stamping),
§2.1 (`Logger`/`Metrics`), §3.7.3 (staleness consumes `substrate_version`).

**Acceptance criteria**

- [ ] `corpus-builder build --input <dir> --output <file>` runs the staged
      pipeline end-to-end over a trivial in-repo input and writes a `graph.json`.
- [ ] `graph.json` carries a header with `substrate_version` and the
      provider/tokenizer-declared dimensionality slot.
- [ ] `substrate_version` is a content-hash/build-id: a second build of unchanged
      input yields an identical `substrate_version` (`INV-2`, §4.5).
- [ ] Each stage reports start/end, input/output counts, and warnings through the
      same `Logger`/`Metrics` interfaces `server` uses — not a parallel mechanism.
- [ ] Re-running with identical input produces byte-identical `graph.json`.

**Fixtures / cases**

A tiny local text input (2–3 short docs) checked in under the package's test
assets; a byte-identical-rebuild test.

**Out of scope**

- Real embedding provider, index, tagging, coherence — later Phase 2 drafts.
- Gutendex network retrieval (2.2).

### 2.2 — `CorpusSource` interface + Gutendex adapter + manifest + cache

**Goal**

Implement corpus retrieval behind the `CorpusSource` interface with the Gutendex
adapter (§6.3.1): resolve a manifest of Gutenberg IDs to boilerplate-stripped
plaintext, cache locally, and check in the default test manifest.

**Spec reference**

`SPEC.md` §6.3.1 (Corpus Source Adapters, Gutendex, manifest schema, cache,
reliability caveat), `docs/design/0002-default-test-corpus.md`.

**Acceptance criteria**

- [ ] `CorpusSource` interface (`resolve(manifest) -> ResolvedDocument[]`) and
      `GutendexSource` implement §6.3.1: metadata via `GET /books?ids=`, plaintext
      from the book's `text/plain; charset=utf-8` URL (regex fallback).
- [ ] Project Gutenberg `*** START/END OF ... ***` boilerplate stripping is
      verified against **at least 3** different books (historical format variation).
- [ ] The manifest schema (`corpus-manifest.json`: `source`, `restructure`,
      `segmentation`, `entries`) parses, including `restructure: null` default.
- [ ] A build-time cache (gitignored, e.g. `.cache/corpus/`) makes a second build
      of an unchanged manifest perform **zero** network calls.
- [ ] `fixtures/corpus-manifest.default.json` is checked in with register-varied,
      **verified** Gutenberg IDs.
- [ ] Unit tests mock Gutendex/Gutenberg responses — **no live network calls in
      CI**.
- [ ] No file in `packages/server` or `packages/client-threejs` references
      Gutendex or a Gutenberg host, directly or transitively (import-boundary
      check).

**Fixtures / cases**

Mocked Gutendex/Gutenberg HTTP responses for ≥3 books; the checked-in default
manifest; a cache-hit (zero-network) test.

**Out of scope**

- Non-Gutenberg sources (filesystem, other APIs) — interface anticipates them,
  this phase implements Gutendex only.
- `restructure` grouping strategies (2.7 ships passthrough only).

Depends on 2.1.

### 2.3 — Segmentation stage (`Segmenter`, B1)

**Goal**

Implement the pluggable `Segmenter` that partitions raw text into source spans
over `unit` × `grouping`, defaulting to paragraph (blank-line) boundaries,
overlap 0.

**Spec reference**

`SPEC.md` §6.3 (segmentation step), §0.10.0 B1 (`docs/design/0004-b-series-resolution.md`).

**Acceptance criteria**

- [ ] `Segmenter` interface + default implementation partition text over `unit` ∈
      char/word/sentence/token × `grouping` ∈ boundary | fixed(N, overlap k).
- [ ] Default = boundary on blank lines, overlap 0 (paragraphs).
- [ ] `char`/`word`/`sentence` are zero-dependency regex tilings; `unit: token`
      lazily loads a pinned `Tokenizer` (default `cl100k_base`) whose identity
      feeds `substrate_version`.
- [ ] Line endings are normalized (CRLF→LF) before segmentation.
- [ ] Structureless / half-sentence corpora segment without error (`INV-4`).
- [ ] Partitioning is a pure function of characters (no embeddings/tags read).

**Fixtures / cases**

Paragraph text; a single blank-line-free blob; a fixed-N + overlap case; a
CRLF-laden input.

**Out of scope**

- Embedding/tagging (later drafts). Token-counting here is approximate sizing,
  decoupled from the embedding provider's tokenizer.

Depends on 2.1.

### 2.4 — Embedding provider + L2 normalization + flat k-NN index + fail-loud gate (B2)

**Goal**

Implement the swappable embedding stage (L2-normalized at build time) and the
alpha-default **exact flat k-NN** index behind an index interface, with the
fail-loud "well-formed embedding space" gate.

**Spec reference**

`SPEC.md` §6.3 (embedding + index steps), §4.2 (`static.embedding_distance` =
cosine, `[0,2]`), §0.10.0 B2, §0.11.0 C4 (degenerate = the B2 gate).

**Acceptance criteria**

- [ ] Embedding is behind a config-selected provider interface — **not** hardcoded
      to one vendor; a deterministic stub provider is usable in tests.
- [ ] Every vector is **L2-normalized at build time**; dimensionality is
      provider-declared and stored in the substrate header.
- [ ] The index is behind an interface; the default is exact flat k-NN, with equal
      distances broken deterministically by corpus order.
- [ ] Distance is cosine, range `[0,2]`, smaller = nearer (provider-independent).
- [ ] The fail-loud gate **rejects** a malformed build — non-uniform dimension,
      non-finite values, zero norms, or degenerate spread (all vectors identical) —
      with a clear error (`INV-4` untouched: rejecting *malformed builds* ≠
      rejecting authored content).

**Fixtures / cases**

Stub-embedded small corpus (well-formed); degenerate inputs: mixed dimension,
a NaN vector, a zero-norm vector, an all-identical-vector corpus.

**Out of scope**

- A real ANN (HNSW, …) — deferred, deterministic optimization gated by C1 (§6.7).
- `eval`'s interesting-ness reporting (2.9) — distinct from this reject-gate.

Depends on 2.1, 2.3.

### 2.5 — Local-coherence precomputation (B5)

**Goal**

Precompute the `local_coherence` field — embedding-neighborhood tightness — once
at build time and store it in the substrate bundle.

**Spec reference**

`SPEC.md` §6.3 (local-coherence precompute, decision D4), §0.10.0 B5,
§3.1 (`EntityState.local_coherence`, `static.local_coherence`).

**Acceptance criteria**

- [ ] `local_coherence` = mean cosine similarity of a point to its k nearest
      neighbors, normalized to `[0,1]`.
- [ ] It is computed once here (not per-query) and stored in the substrate bundle.
- [ ] It is engine-produced, not author-definable.
- [ ] A tightly-clustered fixture yields higher coherence than a dispersed one
      (ordering test).

**Fixtures / cases**

A tight cluster vs. a dispersed set (stub embeddings); a normalization
`[0,1]`-range assertion.

**Out of scope**

- Runtime interpolation at a resolved point — engine, Phase 3.

Depends on 2.4.

### 2.6 — Tagging stage (`Tagger` lexicon default) + versioned `tag-registry.yaml` (B4/C5)

**Goal**

Implement the pluggable `Tagger` with the default **deterministic, offline,
model-free lexicon** (keyword/regex → tag path + default `archetype`), and emit a
versioned `tag-registry.yaml`.

**Spec reference**

`SPEC.md` §6.3 (tagging step), §3.6/§3.6.2 (tag grammar, tag registry), §0.10.0 B4,
§0.11.0 C5 (registry version header), `docs/tag-system-design.md`.

**Acceptance criteria**

- [ ] `Tagger` interface + a deterministic offline lexicon default populate
      `semantic_tags` (§3.6 grammar) and `archetype`; a starter lexicon ships and
      seeds `tag-registry.yaml`.
- [ ] Same input ⇒ identical tags/registry (deterministic; no model at default).
- [ ] `tag-registry.yaml` carries a version header = the producing build's
      `substrate_version` (`INV-5`, C5).
- [ ] Model-based taggers are permitted only under pin+cache+`substrate_version`
      discipline and are **not** the default (opt-in, reproducible-via-cache).

**Fixtures / cases**

A corpus hitting several lexicon rules; an untagged/orphan span; a registry
version-header assertion.

**Out of scope**

- Embedding-anchor / LLM / author-refined taggers (deferred).

Depends on 2.4.

### 2.7 — Composition / `restructure` passthrough stage (B6)

**Goal**

Add the optional post-embedding, post-tagging composition stage with the default
identity/passthrough behavior (contiguous spans only), wired to the
`SourceSpan.members` composite data model.

**Spec reference**

`SPEC.md` §6.3 (composition step), §6.3.1 (`restructure` selector), §0.10.0 B6,
§3.1 (`SourceSpan.members`).

**Acceptance criteria**

- [ ] The composition stage runs *after* embedding and tagging (can read those
      signals) and feeds results back into the index.
- [ ] Default `restructure: null` is identity/passthrough — contiguous spans only,
      output equals input.
- [ ] A composite span is still a span; its provenance is its member span ids
      (`SourceSpan.members`).
- [ ] Selecting a grouping strategy is possible via the manifest `restructure`
      slot; concrete strategies are out of scope (below) but the field/data model
      exist without a breaking change.

**Fixtures / cases**

A `restructure: null` build (output == input); a manifest carrying a strategy name
(accepted/plumbed, even if the strategy itself is deferred).

**Out of scope**

- `semantic-cluster` / `thematic-group` / `interleave` strategies — deferred.

Depends on 2.4, 2.6.

### 2.8 — Provenance, `inspect`, `BuildTrace`, and `GRAPH_FORMAT.md`

**Goal**

Guarantee `source_refs` provenance on every span, add the developer
inspectability surface (`corpus-builder inspect`, `--trace` → `BuildTrace`), and
document the internal format.

**Spec reference**

`SPEC.md` §6.3 (provenance, dev transparency, `BuildTrace`), §6.3.1 (inspect,
`--verbosity`), §4.6 (flag-gated, zero overhead when off).

**Acceptance criteria**

- [ ] Every source span carries non-empty `source_refs` resolving to real
      documents in the input corpus.
- [ ] `corpus-builder inspect --graph <g> --node <id>` prints a span's fields plus
      its `source_refs` chain; `inspect --trace` prints the `BuildTrace` if the
      build was run with `--trace`. Both honor the `--verbosity` levels.
- [ ] `corpus-builder build --trace` is flag-gated, off by default, zero overhead
      when disabled; it writes `build-trace.json` (the `BuildTrace` shape).
- [ ] `build-trace.json` is byte-identical across two identical `--trace` runs.
- [ ] `packages/corpus-builder/GRAPH_FORMAT.md` documents the `graph.json` schema,
      `source_refs`, and `BuildTrace`.
- [ ] `inspect --node` and `inspect --trace` run against the fixture without error.

**Fixtures / cases**

The small fixture corpus (~20 docs) built once; an `inspect --node` run; a
`--trace` byte-identical rebuild.

**Out of scope**

- Runtime `DebugTrace` (§4.6) — engine, Phase 3.

Depends on 2.1, 2.2, 2.4, 2.6.

### 2.9 — `corpus-builder eval` build-quality reporting (C4)

**Goal**

Add the offline `corpus-builder eval --graph <graph.json>` command that **reports**
build quality (never gates a build), a sibling of `inspect` reusing the same
`Logger`/`Metrics`/`--verbosity` conventions.

**Spec reference**

`SPEC.md` §6.3 (§0.11.0 C4 evaluation block), §0.11.0 C4
(`docs/design/0005-c-series-resolution.md`).

**Acceptance criteria**

- [ ] `corpus-builder eval --graph <g>` reports local-coherence distribution, tag
      coverage / orphan rate, and nearest-neighbor spread — and **does not fail the
      build** (reporting, not gating; distinct from the 2.4 reject-gate).
- [ ] A shuffled-noise corpus is visibly distinguishable from a coherent one in the
      nearest-neighbor-spread report (the silent-failure mode C4 names).
- [ ] `eval` reuses the `Logger`/`Metrics` and `--verbosity` conventions of
      `inspect` — one consistent developer experience, not a parallel mechanism.

**Fixtures / cases**

A coherent fixture vs. a shuffled-noise fixture; assert the reports differ on
nearest-neighbor spread.

**Out of scope**

- Richer/model-based metrics (deferred, interface-now / impl-later).

Depends on 2.4, 2.5, 2.6.

**Phase 2 Exit (SPEC §6.3):** CLI produces a valid substrate `graph.json` with
non-empty `source_refs`; `substrate_version` + coherence present and rebuild-stable;
`GRAPH_FORMAT.md` documents the format; byte-identical rebuilds; `inspect`/`eval`
run on the fixture; Gutendex stripping verified on ≥3 books; cache verified
zero-network; default manifest checked in; server/client-threejs reference no
Gutendex/Gutenberg host.

---

## Phase 3 — Rule Engine (`SPEC.md` §6.4)

Parser, solver, layer resolution, debug trace. Headless — never imports a
rendering library (`INV-1`). Needs `graph.json` (Phase 2) to test against.

Milestone: `Development Phase 3`. Entry: Phase 2 complete.

### 3.1 — DSL parser (`parser.ts`)

**Goal**

Implement `packages/rule-engine/src/parser.ts`: the §4.2 DSL grammar → AST.

**Spec reference**

`SPEC.md` §4.2 (DSL Grammar v0), §3.4 (ruleset data shape the AST targets).

**Acceptance criteria**

- [ ] The §4.2 grammar parses to an AST matching the §3.4 ruleset data shape.
- [ ] A null ruleset (`layers: []`) parses to an empty-layers AST.
- [ ] A multi-layer ruleset with conditions/effects parses; a malformed ruleset
      raises a well-formedness error (validates *well-formedness*, not coherence —
      `INV-4`).
- [ ] Ruleset bundles are structured data (`.json`/`.yaml`, §0.9.0 A11; the `.dsl`
      extension is retired).

**Fixtures / cases**

Null ruleset; single-global-layer ruleset; multi-layer-with-conflict ruleset;
a syntactically malformed ruleset.

**Out of scope**

- Evaluation/solving (3.2, 3.3). Visual rule editor (§6.8).

### 3.2 — `evaluateLayers()` + layer resolution order (`layer-resolution.ts`)

**Goal**

Implement `evaluateLayers()` (§4.1) and the §4.3 layer-resolution ordering,
including the `INV-4` no-throw guarantee on contradictory hard decisions.

**Spec reference**

`SPEC.md` §4.1 (Evaluation Model), §4.3 (Layer Resolution Order), §4.4
(`evaluateLayers` is the single shared function).

**Acceptance criteria**

- [ ] `evaluateLayers()` implements the §4.1 model with the §4.3 ordering.
- [ ] Two `override`-mode layers with contradictory hard decisions resolve via
      declaration order and log a warning — **not** throw (`INV-4` conformance).
- [ ] Layer resolution is a pure function of its inputs (no wall-clock, no unseeded
      randomness — `INV-2`).

**Fixtures / cases**

The multi-layer-with-conflict ruleset from 3.1; a single-layer baseline.

**Out of scope**

- `resolveMove`/`populate` call sites (3.3); determinism harness (3.4).

Depends on 3.1.

### 3.3 — `resolveMove` + `populate` sharing `evaluateLayers` (`solver.ts`)

**Goal**

Implement `resolveMove()` and `populate()` (§4.1/§4.4) — room population as a
zero-radius query — both routing through the **identical** `evaluateLayers()`.

**Spec reference**

`SPEC.md` §4.1, §4.4 (Room Population as Zero-Radius Query; the function-identity
requirement), §3.2 (produces `ResolvedRoomResponse`).

**Acceptance criteria**

- [ ] `resolveMove` and `populate` both call the identical `evaluateLayers()`
      function — asserted by a **function-identity** test, not just output
      equivalence (§4.4).
- [ ] The null-ruleset case produces pure nearest-neighbor **relativistic drift**
      with no errors — a real, tested code path, not an assumed fallback.
- [ ] Resolution emits `ResolvedRoomResponse`-shaped output (resolved data only —
      `INV-3`).
- [ ] `MAX_ROOM_OBJECTS` bounding is respected in population (budget tuned later in
      §6.7 / C1, but the bound exists here).

**Fixtures / cases**

Null-ruleset drift session; a container room population; the function-identity
assertion.

**Out of scope**

- Server/session plumbing (Phase 4); C1 budget *tuning* (Phase 6, §6.7).

Depends on 3.2.

### 3.4 — Determinism: seeded PRNG + byte-identical replay test (`INV-2`)

**Goal**

Wire the seeded-PRNG determinism model (`(session_seed, turn_count, query)`) and
prove byte-identical replay from `(graph.json, ruleset, seed, input-log)`.

**Spec reference**

`SPEC.md` §4.5 (Determinism), `AGENTS.md` §2 `INV-2` (three-tier replay
guarantee), §3.8/§3.9 (session state + input log).

**Acceptance criteria**

- [ ] All stochastic backend behavior is seeded from `(session_seed, turn_count,
      query)` — no `Math.random()`, no `Date.now()`.
- [ ] Same `(graph.json, ruleset, seed, input-log)` in ⇒ **byte-identical** output
      across 2 independent runs.
- [ ] Replaying one input-log reproduces byte-identical output even though
      substrate queries are stochastic across *different* seeds by design.

**Fixtures / cases**

A recorded `(seed, ruleset, input-log)` triple replayed twice; a byte-diff
assertion.

**Out of scope**

- Server-side session persistence (Phase 4, in-memory; post-alpha for durable).

Depends on 3.3.

### 3.5 — `DebugTrace` (`debug-trace.ts`, §4.6)

**Goal**

Implement the flag-gated `DebugTrace`, off by default, zero overhead when
disabled.

**Spec reference**

`SPEC.md` §4.6 (Debug Trace).

**Acceptance criteria**

- [ ] `DebugTrace` is flag-gated and **off by default**.
- [ ] With the flag off there is zero overhead (no trace assembly on the hot path).
- [ ] With the flag on, a resolution emits a trace capturing the layer-evaluation
      decisions.
- [ ] The trace is deterministic for a fixed `(seed, ruleset, input-log)` (`INV-2`).

**Fixtures / cases**

A traced resolution (flag on) vs. an untraced one (flag off, no trace emitted).

**Out of scope**

- Server `GET /debug/trace` exposure (Phase 4, §6.5); client rendering of traces.

Depends on 3.3.

**Phase 3 Exit (SPEC §6.4):** `resolveMove`/`populate` share the identical
`evaluateLayers`; determinism test byte-identical across 2 runs; contradictory
`override` layers resolve without throwing (warn + declaration order); null-ruleset
drift runs error-free as a tested path.

---

## Phase 4 — Server + Terminal Client + Conformance Fixtures (`SPEC.md` §6.5)

Server implements the REST API exactly and calls `rule-engine` for all resolution
(no rule logic in the server). `client-cli` is the first conformance-validated
adapter. `INV-3`: neither client imports `rule-engine`/`corpus-builder`.

Milestone: `Development Phase 4`. Entry: Phase 3 complete.

### 4.1 — Server scaffold, session management, session/room endpoints

**Goal**

Stand up `packages/server` with in-memory session management and the
`GET /session/new` + `GET /room/current` endpoints per §5.1.

**Spec reference**

`SPEC.md` §5.1 (REST API), §6.5 (in-memory sessions acceptable for alpha).

**Acceptance criteria**

- [ ] `GET /session/new` creates a session (in-memory) and returns a session
      handle; `GET /room/current` returns a schema-valid `ResolvedRoomResponse`.
- [ ] The server calls `rule-engine` for resolution and contains **no** rule logic
      itself.
- [ ] Responses validate against the Phase 1 schema types.
- [ ] The server imports no rendering library (`INV-1`) and sends only resolved
      JSON (`INV-3`).

**Fixtures / cases**

A session-new → room-current happy path; a schema-validation assertion on the
response.

**Out of scope**

- `/interact` (4.2); debug endpoint (4.3); durable session storage (post-alpha, §7).

Depends on Phase 3 complete.

### 4.2 — `/interact` endpoint wired to move resolution

**Goal**

Implement the interaction/move endpoint (§5.1), routing to `rule-engine`
`resolveMove` and returning the resulting room + `InteractionResult`.

**Spec reference**

`SPEC.md` §5.1 (REST API — interact), §3.3 (`InteractionResult`), §4.1
(`resolveMove`).

**Acceptance criteria**

- [ ] `POST /interact` accepts a move request (§3.3), resolves via `rule-engine`,
      and returns a schema-valid `ResolvedRoomResponse` + `InteractionResult`.
- [ ] A room transition is observable: interacting with an `enter`/`traverse`
      affordance yields a different resolved room.
- [ ] Determinism holds through the endpoint: same session seed + input log ⇒
      identical responses (`INV-2`).

**Fixtures / cases**

An interact call producing a transition; a replay-equality assertion.

**Out of scope**

- Debug endpoint (4.3); client rendering (4.6).

Depends on 4.1.

### 4.3 — `Logger`/`Metrics` wiring + `GET /debug/trace` gate

**Goal**

Wire the §2.1 `Logger`/`Metrics` interfaces into the server and expose the
flag-gated `GET /debug/trace`.

**Spec reference**

`SPEC.md` §5.1 (`GET /debug/trace`), §2.1 (`Logger`/`Metrics`), §4.6 (debug flag).

**Acceptance criteria**

- [ ] `Logger`/`Metrics` are wired at request boundaries (same interfaces
      corpus-builder uses — not a parallel mechanism).
- [ ] `GET /debug/trace` returns a `DebugTrace` only when server debug mode is on;
      it is absent/denied when off (zero overhead off, §4.6).

**Fixtures / cases**

A debug-on request returning a trace; a debug-off request that does not.

**Out of scope**

- Client-side trace display (4.6).

Depends on 4.2.

### 4.4 — Conformance room fixtures + round-trip validation test

**Goal**

Curate `fixtures/rooms/*.json` (~10 engine-agnostic `ResolvedRoomResponse`
payloads) and an automated round-trip validation test.

**Spec reference**

`SPEC.md` §6.5 (fixtures/rooms, round-trip test), §5.3 (Conformance), §3.2.

**Acceptance criteria**

- [ ] ~10 hand-curated `fixtures/rooms/*.json` spanning archetype variety — at
      minimum: one `container` with 5+ objects, one near-empty room, one
      all-soft-weighted population, one exercising `portal`.
- [ ] An automated test round-trips each fixture ruleset through the server and
      asserts the response validates against `ResolvedRoomResponse`.
- [ ] Fixtures are engine-agnostic — no Three.js-specific assumptions baked in
      (§5.3).

**Fixtures / cases**

The `fixtures/rooms/*.json` set itself; the round-trip validation test.

**Out of scope**

- Renderer-specific content (Phase 5 must consume these unchanged).

Depends on 4.1.

### 4.5 — Conformance ruleset fixtures

**Goal**

Add `fixtures/rulesets/*` bundles as structured data exercising the resolution
paths, including the deliberately messy multi-layer conflict.

**Spec reference**

`SPEC.md` §6.5 (fixtures/rulesets), §4.3 (messy-resolution path), §0.9.0 A11
(`.json`/`.yaml`, `.dsl` retired).

**Acceptance criteria**

- [ ] At minimum: a null ruleset, a single-global-layer ruleset, and a
      multi-layer-with-conflict ruleset (exercises §4.3's messy-resolution path
      deliberately).
- [ ] Bundles are structured data (`.json`/`.yaml`), not `.dsl`.
- [ ] Each is referenced by the 4.4 round-trip test (drives a server session and
      validates the response).

**Fixtures / cases**

The three ruleset bundles above.

**Out of scope**

- New engine behavior — these exercise Phase 3's engine, not extend it.

Depends on 4.4.

### 4.6 — `client-cli` terminal REPL

**Goal**

Implement `packages/client-cli` (§5.4): render rooms, drive a live server session
end-to-end, and surface `Logger`/`Metrics`/`DebugTrace` at `--verbosity=debug`.

**Spec reference**

`SPEC.md` §5.4 (Terminal Reference Client), §5.3 (Conformance), §6.5.

**Acceptance criteria**

- [ ] `client-cli` renders **all** `fixtures/rooms/*.json` without error (§5.3
      conformance, exercised here first).
- [ ] It drives a live server session end-to-end through its REPL (session → room →
      interact → transition).
- [ ] A `--verbosity=debug` run prints `DebugTrace` output when server debug mode
      is on.
- [ ] It sends only resolved JSON to the display and never imports engine internals
      (`INV-3`; enforced by 4.7).

**Fixtures / cases**

A fixture-render pass over all rooms; a live end-to-end REPL session.

**Out of scope**

- Graphical rendering (Phase 5). The import-boundary ESLint rule (4.7).

Depends on 4.2, 4.4.

### 4.7 — `INV-3` import-boundary ESLint rule for `client-cli`

**Goal**

Add the real ESLint import-boundary rule forbidding `client-cli` from importing
`rule-engine`/`corpus-builder`, so `INV-3` is enforced from the first client.

**Spec reference**

`SPEC.md` §6.5, `AGENTS.md` §2 `INV-3` (the boundary is a real ESLint rule, not a
convention).

**Acceptance criteria**

- [ ] An ESLint rule fails the build if any file in `packages/client-cli/src/`
      imports from `packages/rule-engine` or `packages/corpus-builder` (directly or
      transitively).
- [ ] A test/fixture import violation is caught by `npm run lint`.
- [ ] The rule is structured so Phase 5 can extend it to `client-threejs` (5.5)
      without duplication.

**Fixtures / cases**

A deliberately-violating import (in a lint fixture) that the rule flags.

**Out of scope**

- `client-threejs` coverage (Phase 5, 5.5).

Depends on 4.6.

**Phase 4 Exit (SPEC §6.5):** all §5.1 endpoints return schema-valid payloads;
`fixtures/` populated and round-tripped by an automated test; fixtures
engine-agnostic; `client-cli` renders all room fixtures and drives a live session
(incl. `--verbosity=debug`); no `client-cli` file imports `rule-engine`/
`corpus-builder` (ESLint-enforced).

---

## Phase 5 — Three.js Reference Client (`SPEC.md` §6.6)

The first graphical adapter. Consumes resolved JSON only (`INV-3`); reuses the
Phase 4 fixtures for conformance.

Milestone: `Development Phase 5`. Entry: Phase 4 complete.

### 5.1 — Client scaffold + ECS mapping, render a `ResolvedRoomResponse`

**Goal**

Stand up `packages/client-threejs` with the §5.2 ECS mapping
(`LayoutSystem`/`MeshResolutionSystem`) and render a room + objects from a single
`ResolvedRoomResponse`.

**Spec reference**

`SPEC.md` §5.2 (ECS Mapping — Three.js adapter), §6.6.

**Acceptance criteria**

- [ ] `LayoutSystem` and `MeshResolutionSystem` map a `ResolvedRoomResponse` to a
      rendered scene (room + objects).
- [ ] Rendering consumes only resolved JSON — no import of `rule-engine`/
      `corpus-builder` (`INV-3`, enforced by 5.5).
- [ ] A single hand-fed `ResolvedRoomResponse` renders without error.

**Fixtures / cases**

One `fixtures/rooms/*.json` rendered offline (server bypassed).

**Out of scope**

- Live server bootstrap (5.2); interaction (5.3).

Depends on Phase 4 complete.

### 5.2 — Session bootstrap: `session/new` → `room/current` → render

**Goal**

Load a live session and render the current room against the Phase 4 server.

**Spec reference**

`SPEC.md` §6.6 (minimum viable scene), §5.1 (endpoints), §5.2.

**Acceptance criteria**

- [ ] The client calls `GET /session/new` then `GET /room/current` and renders the
      returned room via the 5.1 systems.
- [ ] Rendered content matches the `ResolvedRoomResponse` payload (room + objects).

**Fixtures / cases**

A live session bootstrap against the Phase 4 server rendering a room.

**Out of scope**

- Click interaction / transitions (5.3).

Depends on 5.1.

### 5.3 — Click interaction → `POST /interact` → re-render (room transition)

**Goal**

Capture one click interaction, POST it, and re-render the resulting room —
completing the minimum viable movement loop.

**Spec reference**

`SPEC.md` §6.6 (capture click → `POST /interact` → re-render), §5.1, §5.2.

**Acceptance criteria**

- [ ] A player can click an object carrying an `enter`/`traverse` affordance.
- [ ] The click issues `POST /interact` and the client re-renders, showing a room
      transition (new objects render, matching a fresh `ResolvedRoomResponse`).
- [ ] The end-to-end loop (render → click → transition) works against the Phase 4
      server.

**Fixtures / cases**

An end-to-end click-to-transition run against the live server.

**Out of scope**

- Rich UI, non-`enter`/`traverse` affordances beyond the minimum viable loop.

Depends on 5.2.

### 5.4 — Direct-fixture conformance render

**Goal**

Render all `fixtures/rooms/*.json` directly (server bypassed) — the §5.3
conformance check for the graphical adapter.

**Spec reference**

`SPEC.md` §6.6 (renders all room fixtures pointed directly), §5.3 (Conformance).

**Acceptance criteria**

- [ ] The client renders every `fixtures/rooms/*.json` without error when pointed
      at them directly (server bypassed).
- [ ] This repeats, for the graphical adapter, the conformance `client-cli`
      exercised in Phase 4 — same fixtures, no Three.js-specific fixture changes.

**Fixtures / cases**

A batch render over all `fixtures/rooms/*.json`.

**Out of scope**

- New fixtures — reuse the Phase 4 set unchanged.

Depends on 5.1.

### 5.5 — Extend the `INV-3` import-boundary rule to `client-threejs`

**Goal**

Extend the Phase 4 ESLint import-boundary rule (4.7) to `client-threejs` so
`INV-3` holds permanently across both reference adapters.

**Spec reference**

`SPEC.md` §6.6, `AGENTS.md` §2 `INV-3`.

**Acceptance criteria**

- [ ] The ESLint rule fails the build if any file in
      `packages/client-threejs/src/` imports from `packages/rule-engine` or
      `packages/corpus-builder`.
- [ ] The rule reuses the 4.7 mechanism (extended coverage, not a second parallel
      rule).
- [ ] A violating import (lint fixture) is flagged by `npm run lint`.

**Fixtures / cases**

A deliberately-violating import that the rule flags.

**Out of scope**

- Any new engine/client behavior.

Depends on 5.1, 4.7.

**Phase 5 Exit (SPEC §6.6):** against the Phase 4 server a player sees a rendered
room, clicks an `enter`/`traverse` object, and observes a transition; the client
renders all `fixtures/rooms/*.json` directly; no `client-threejs` file imports
`rule-engine`/`corpus-builder` (ESLint-enforced).

---

## Phase 6 — Production Alpha Hardening (`SPEC.md` §6.7)

**Not new features** — hardening of the existing surface, plus the §0.11.0 C1/C3/C4
operational bounds. The exit bar is a clean-room playable path from `README.md`.

Milestone: `Development Phase 6`. Entry: Phase 5 complete; the end-to-end loop
(corpus → graph → server → client → interactive movement) works.

### 6.1 — Error handling at every protocol boundary

**Goal**

Add graceful error handling at each protocol boundary: malformed ruleset, missing
session, and client-side network failure.

**Spec reference**

`SPEC.md` §6.7 (error handling), §4.1/§4.3 (`INV-4`: malformed vs. incoherent),
§5.1 (protocol).

**Acceptance criteria**

- [ ] A malformed ruleset is rejected with a clear well-formedness error — an
      *incoherent* (but well-formed) ruleset still runs (`INV-4`).
- [ ] A request against a missing/expired session returns a defined error, not a
      crash.
- [ ] The client surfaces a network failure gracefully (no unhandled rejection).

**Fixtures / cases**

Malformed-ruleset request; missing-session request; simulated client network
failure.

**Out of scope**

- New endpoints/features; auth (§6.8 / not an auth system, §5.1).

Depends on Phase 5 complete.

### 6.2 — Uniform `Logger`/`Metrics`/debug-flag wiring across all packages

**Goal**

Reconcile logging, metrics, and debug-flag wiring to the §2.1 interfaces uniformly
across every package.

**Spec reference**

`SPEC.md` §6.7 (logging/metrics/debug across all packages), §2.1, §4.6.

**Acceptance criteria**

- [ ] Every package emits through the structured §2.1 `Logger`/`Metrics`
      interfaces — one mechanism, not per-package variants.
- [ ] Debug-gated trace/log verbosity is consistent across packages (off by
      default, zero overhead when off — §4.6).

**Fixtures / cases**

A cross-package smoke test asserting the shared interfaces are used at each
boundary.

**Out of scope**

- New telemetry backends / production observability infra (§6.8).

Depends on 6.1.

### 6.3 — C3 trust-model bounds (localhost bind, session eviction, body-size cap)

**Goal**

Add the §0.11.0 C3 hardening bounds — not an auth system.

**Spec reference**

`SPEC.md` §6.7 (§0.11.0 C3), §5.1 (trust model), `docs/design/0005-c-series-resolution.md`.

**Acceptance criteria**

- [ ] The server binds to **localhost by default**.
- [ ] Session count is **bounded** with **idle-TTL eviction** (an evicted session's
      later request returns the defined missing-session error from 6.1).
- [ ] A **request body-size cap** rejects oversized bodies with a defined error.

**Fixtures / cases**

An eviction test (session past its idle TTL); an oversized-body rejection; a
default-bind assertion.

**Out of scope**

- Authentication, TLS, multiplayer (§6.8).

Depends on 6.1.

### 6.4 — C1 operational budget tuning

**Goal**

Tune the §0.11.0 C1 reference budget against a real corpus run.

**Spec reference**

`SPEC.md` §6.7 (§0.11.0 C1), §4.4 (`MAX_ROOM_OBJECTS`), §7.

**Acceptance criteria**

- [ ] `MAX_ROOM_OBJECTS` is set to the C1 reference value (or its deviation
      recorded with rationale).
- [ ] Move-resolution p95 is measured and **< ~200 ms** on the reference corpus
      (~10–50 docs, single-digit concurrency) — or the deviation is recorded.
- [ ] The measurement is repeatable/headless (reuses `Metrics`, 6.2).

**Fixtures / cases**

A p95 move-resolution measurement over the reference corpus run (6.5).

**Out of scope**

- A real ANN index / large-scale performance work (§6.8; C1 threshold only).

Depends on 6.2, 6.5.

### 6.5 — First real corpus run + `corpus-builder eval` (C4) recorded

**Goal**

Do a first real (non-fixture), author-selected corpus run end-to-end and record a
`corpus-builder eval` result — the repeatable complement to hand-sanity-checking.

**Spec reference**

`SPEC.md` §6.7 (first real corpus run; §0.11.0 C4 eval recorded), §6.3 (`eval`).

**Acceptance criteria**

- [ ] A small, author-selected real corpus builds end-to-end (corpus → graph →
      server → client) and is sanity-checkable by hand.
- [ ] `corpus-builder eval` is run against it and its result is **recorded** in the
      repo (the headless complement to the manual check).

**Fixtures / cases**

The recorded `eval` output for the real corpus run.

**Out of scope**

- Shipping a large production corpus; corpus curation tooling (§6.8).

Depends on Phase 5 complete.

### 6.6 — Spec / `GRAPH_FORMAT.md` reconciliation + schema CHANGELOG

**Goal**

Reconcile `GRAPH_FORMAT.md` and `SPEC.md` §3–5 with any drift discovered during
Phases 2–5, updating `packages/schema/CHANGELOG.md` per `INV-5`.

**Spec reference**

`SPEC.md` §6.7 (reconciliation), §3.5 (versioning), `AGENTS.md` §2 `INV-5`.

**Acceptance criteria**

- [ ] `GRAPH_FORMAT.md` matches the `graph.json` actually produced by Phase 2's
      builder as of this point.
- [ ] Any `SPEC.md` §3–5 drift found during Phases 2–5 is reconciled (spec amended
      per `spec-guidelines.md`, or code corrected — not left divergent).
- [ ] Any schema surface change carries a `packages/schema/CHANGELOG.md` entry in
      the same commit (`INV-5`).

**Fixtures / cases**

N/A beyond the existing suites remaining green after reconciliation (docs + any
schema-version bump).

**Out of scope**

- New schema features (this is reconciliation, not extension).

Depends on 6.1.

### 6.7 — `README.md` playable path + minimal deployment doc (the alpha bar)

**Goal**

Write the `README.md` clean-room playable path and the minimal deployment doc that
constitute the production-alpha exit bar.

**Spec reference**

`SPEC.md` §6.7 Exit (a person other than the builder can clone → build → serve →
play following only `README.md`), §7 (production infra out of scope).

**Acceptance criteria**

- [ ] `README.md` documents, with no undocumented steps: clone → run the build
      pipeline against a provided sample corpus → start the server → open the
      client → play a session start-to-finish.
- [ ] A minimal deployment path is documented (even "run server locally + open
      client" for alpha).
- [ ] The path is validated by someone/something other than the original author
      following only the README (the production-alpha bar).

**Fixtures / cases**

A clean-room run-through of the README steps (fresh clone) reaching a playable
session.

**Out of scope**

- Production infrastructure, hosting, CI/CD deploy (§7 / §6.8).

Depends on 6.1, 6.3, 6.4, 6.5, 6.6.

**Phase 6 Exit (SPEC §6.7):** a non-original-builder can clone → build against a
sample corpus → start the server → open the client → play a full session following
only `README.md`; the C1 budget is met or deviations recorded; C3 eviction/body-size
bounds are in place; a `corpus-builder eval` (C4) result is recorded.

---

## Coverage check against `SPEC.md` §6

| Phase | SPEC | Drafts | Milestone |
|---|---|---|---|
| 1 | §6.2 | 1.1–1.5 | Development Phase 1 |
| 2 | §6.3 | 2.1–2.9 | Development Phase 2 |
| 3 | §6.4 | 3.1–3.5 | Development Phase 3 |
| 4 | §6.5 | 4.1–4.7 | Development Phase 4 |
| 5 | §6.6 | 5.1–5.5 | Development Phase 5 |
| 6 | §6.7 | 6.1–6.7 | Development Phase 6 |

Phase 7+ (§6.8) is explicitly post-alpha and gets no drafts here — it carries no
`phase:N` queue until something in it is deliberately scoped into the build order
([`milestone-practices.md`](../milestone-practices.md)).
