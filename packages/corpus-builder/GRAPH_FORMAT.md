# `graph.json` — Substrate Index Format

`format-version: 0.1.0`
`audience: coding-agent + human-maintainer`

This documents the **internal** artifacts produced by `corpus-builder`:
`graph.json`, `tag-registry.yaml`, and `build-trace.json`. Per **INV-3** these are
**never sent to any client** — `graph.json` is consumed exclusively by
`packages/rule-engine`, which mints ephemeral client-facing `Entity` views from it
at query time (SPEC §3.1, §3.7). As internal formats that never cross the client
boundary, they are versioned **less strictly** than the client-facing Section 3
schema (SPEC §6.3 Exit); breaking changes still bump `format-version` here.

Under the §0.8.0 three-tier model this is **not** a fixed node/edge graph. It is a
**substrate index** (Tier 2): embedding vectors + a source-span provenance table +
a precomputed **local-coherence field** + a `substrate_version` build-id header
(SPEC §6.3 re-scoping). The filename `graph.json` is kept for cross-reference
continuity only.

**The index structure itself is not serialized here — by decision.** The bundle
carries the **vectors**; the index is **built on load**. For the alpha-default
exact flat k-NN index (§0.10.0 B2) a consumer rebuilds it from those vectors in
O(n), so shipping it would be redundant bytes. The build still constructs the
index once (it is what computes the B5 `local_coherence` field and what the B6
composition stage queries — it is not discarded), but only the vectors reach the
artifact. So a consumer knows *which* index to rebuild, the header carries an
`index` identity, and that identity is folded into `substrate_version` (a
different index would change the coherence field). There is no `index` key on a
span or in the bundle — do not read one.

## Pipeline that produces it

`corpus-builder build --input DIR --output graph.json [--manifest FILE] [--trace] [--verbosity quiet|normal|verbose]`

Stages run in order, each a swappable interface with a deterministic default
(§0.10.0 B-series):

1. **Corpus retrieval** — `--input DIR` reads local `*.txt` files; `--manifest`
   uses the `CorpusSource`/Gutendex adapter (§6.3.1).
2. **Segmentation** (`Segmenter`, B1) — partitions raw text into source spans over
   `unit` × `grouping`. Default: blank-line boundaries, overlap 0 (paragraphs).
   Line endings are normalized (CRLF→LF) first.
3. **Embedding** (B2) — a config-selected provider (`SDC_EMBEDDING_PROVIDER`). The
   pre-alpha default is `minilm`, a local, offline `all-MiniLM-L6-v2` model
   (transformers.js) whose pinned weights are fetched once then cached; `hashing`
   is a model-free **test-mode** provider (deterministic, instant, no download, no
   real semantic signal) for build-pipeline tests that do not concern the embedding
   space. Either way vectors are **L2-normalized at build time**, which fixes
   distance as **cosine, range `[0,2]`, smaller = nearer**.
4. **Index construction** (`IndexFactory`, B2) — exact flat k-NN, ties broken by
   corpus order. Built once and used (B5 coherence + the B6 composition stage),
   not serialized; the header's `index` identity names which impl to rebuild.
5. **Tagging** (`Tagger`, B4) — default is a deterministic offline lexicon
   assigning `semantic_tags` (§3.6 grammar) + a default `archetype`; also seeds
   `tag-registry.yaml`.
6. **Local-coherence precompute** (B5) — mean cosine similarity of a point to its
   k nearest neighbors, normalized to `[0,1]`.
7. **Composition** (`restructure`, B6) — optional, after embedding, tagging, and
   the coherence precompute. Behind a `CompositionStrategy` interface handed a
   context (the build's embedding provider + index + a coherence scorer) so a
   composite it emits is embedded and coherence-scored like any other span.
   Default `null` = identity passthrough (contiguous spans only).
8. **`substrate_version` stamping** — a content hash of the inputs + every pinned
   stage identity.

Every stage reports through the same `Logger`/`Metrics` interfaces `server` uses
(SPEC §2.1) — not a parallel mechanism.

## Embedding provider choice — first real corpus run (closes SPEC §7)

SPEC §7 left the embedding provider deliberately unmandated: Phase 2 fixes
*swappability*, not a *default*, and asks the first real corpus run (Phase 6) to
pick one and record the rationale here (ratified as SPEC amendment §0.13.2).
**The choice is `minilm`** — the local, offline `all-MiniLM-L6-v2` model above —
and it is the corpus-builder default (`DEFAULT_EMBEDDING_PROVIDER_ID`). The
reasoning:

- **It carries the semantic signal gameplay actually depends on.** Room
  resolution, similarity, and relativistic drift (SPEC §7, §4.4) are queries over
  the embedding space. `minilm`'s vectors place related passages near each other;
  the `hashing` provider is a model-free **test-mode** trick with no semantic
  meaning — correct for build-pipeline tests that don't concern the space, wrong
  for a run whose whole point is semantic room resolution. On the first real run
  (below) `minilm` yielded a nearest-neighbour spread with real variance (mean
  ≈ 0.55, not collapsed) and a thematically coherent multi-room walk.
- **It is free and fully local.** No API key, no account, no per-request cost, and
  no network call during `embed()` once the pinned weights are cached — so a build
  is reproducible offline after the first fetch. Embeddings drive gameplay feel
  (room similarity), not generated-text quality, so a paid API-backed provider
  buys little at alpha scale.
- **It is deterministic (INV-2) and self-describing (provenance).** Pinned weights
  are a pure function input ⇒ output — identical text yields an identical vector,
  and a full rebuild of one corpus is byte-identical. The pinned identity (model +
  quantization + revision) rides in the provider `id`, which feeds
  `substrate_version`, so a re-pin is a *visible* new build, never silent drift
  (§3.7.3).

A remote/API-key provider (OpenAI, Cohere, …) remains the deferred swap-in the
interface exists for, not an alpha requirement — `minilm` removes the need to take
that dependency now. The end-to-end first real corpus run that exercised this
choice — corpus source, exact reproduce steps, build/eval output, and a played
session — is written up in
[`docs/first-corpus-run.md`](../../docs/first-corpus-run.md).

## `graph.json` schema

```jsonc
{
  "format_version": "0.1.0",
  "substrate_version": "sv_<32 hex>",     // mirror of header.substrate_version
  "header": {
    "substrate_version": "sv_<32 hex>",   // content-hash build id (§3.7.3)
    "dimensions": 384,                    // provider-declared vector dimensionality
    "distance": "cosine",
    "distance_range": [0, 2],             // cosine distance over L2-normalized vectors
    "embedding_provider": "minilm-all-MiniLM-L6-v2-q-main",  // pinned identity (default; `hashing-embed-v1-d256` in test mode)
    "tokenizer": null,                    // tokenizer identity iff `unit: token`, else null
    "tagger": "lexicon-v1",               // pinned identity
    "index": "flat-v1",                   // §0.10.0 B2 index-stage identity; index is BUILT ON LOAD from the vectors, not serialized
    "segmentation": { "unit": "char", "grouping": "boundary", "boundary": "blank-line", "overlap": 0 },
    "restructure": null,                  // composition selector (null = passthrough)
    "span_count": 18
  },
  "spans": [
    {
      "id": "file:forest.txt:0-72",       // deterministic, replay-stable: `${source_id}:${start}-${end}`
      "source_refs": ["file:forest.txt"], // §6.3 provenance: raw document id(s) — ALWAYS non-empty
      "source_span": {
        "source": "file:forest.txt",
        "char_ranges": "0-72",            // `start-end`, end EXCLUSIVE; CSV for composites/overlap
        "members": []                     // present only for a composite span (§3.1 B6).
                                          // NOT emitted today: the default `restructure`
                                          // is passthrough, so no composite is produced
                                          // and this key is absent from every real span.
      },
      "prose": "The forest was full of tall green trees…",  // verbatim excerpt (client-facing at runtime, §3.1)
      "embedding": [ -0.0913, 0.0, /* … dimensions floats … */ ],  // L2-normalized — INTERNAL ONLY (INV-3)
      "semantic_tags": ["environment:nature"],  // structured §3.6 tags; may be empty (orphan span)
      "archetype": "container",           // default archetype from the tagger
      "local_coherence": 0.7431           // embedding-neighborhood tightness, [0,1] (§0.10.0 B5)
    }
  ]
}
```

### `source_refs` (provenance)

Every span carries a non-empty `source_refs` array of the raw corpus document id(s)
it was built from, so any resolved query result is traceable back to input
(SPEC §2.1, §6.3). `corpus-builder inspect --node <id>` prints a span's fields plus
this chain.

### Notes for the `rule-engine` consumer (Phase 3)

- **`char_ranges` are offsets into the CRLF-normalized text.** Segmentation
  normalizes line endings (CRLF/CR → LF) before partitioning, so a span's
  `start`/`end` — and the `prose` excerpt — are relative to the normalized form
  of its source document, not the raw on-disk bytes. `end` is exclusive.
- **The span `id` is the embedding reference.** A resolved client `Entity`
  carries `embedding_ref` (SPEC §3.1), "a pointer to the vector in `graph.json`,
  never the raw vector". Here the vector lives inline on its span, keyed by `id`,
  so when `rule-engine` mints an `Entity` from a span it sets
  `embedding_ref = span.id`. The vector itself never leaves the build artifact
  (INV-3).

## `tag-registry.yaml`

The vocabulary contract (SPEC §3.6.2): a keys-only nested tree of the segment paths
discovered from the corpus, leaves written as bare `key:`. Under §0.11.0 C5 it
carries a **version header** — the `substrate_version` of the producing build — so
the vocabulary contract is itself a versioned surface (INV-5).

```yaml
# tag-registry.yaml — vocabulary contract (SPEC §3.6.2, versioned per §0.11.0 C5)
substrate_version: sv_<32 hex>
tags:
  environment:
    built:
    nature:
```

Only **segment paths** are registered — a tag's `modifier,` prefix and any
`=value` scalar are runtime data and never registered (§3.6.3). Unregistered tags
are syntactically valid but orphaned: the pipeline warns, never rejects (INV-4).

## `build-trace.json` (`--trace` only)

The build-time analogue of the runtime `DebugTrace` (SPEC §4.6): **flag-gated**,
off by default, **zero overhead when disabled** (gate before construct). Shape:

```jsonc
{
  "stages": [
    { "stage": "embedding",            "input_count": 18, "output_count": 18, "duration_ms": 0, "warnings": [] },
    { "stage": "index_construction",   "input_count": 18, "output_count": 18, "duration_ms": 0, "warnings": [] },
    { "stage": "tagging",              "input_count": 18, "output_count": 18, "duration_ms": 0, "warnings": [] },
    { "stage": "coherence_precompute", "input_count": 18, "output_count": 18, "duration_ms": 0, "warnings": [] }
  ],
  "span_provenance": { "file:forest.txt:0-72": ["file:forest.txt"] }
}
```

### Determinism of `build-trace.json` (INV-2)

SPEC §6.3 Exit requires `build-trace.json` to be **byte-identical** across two
identical `--trace` runs. A wall-clock `duration_ms` would break that, so the
persisted artifact writes **`duration_ms: 0`**; real per-stage durations are
emitted live through the §2.1 `Metrics` channel (which is not persisted). Choosing
a deterministic artifact over an embedded timestamp is the correct INV-2 tradeoff.

## Determinism guarantees (INV-2)

- `substrate_version` is a pure function of a canonical representation of the
  inputs + every pinned stage identity — a rebuild of unchanged input yields the
  same id; any pinned model/tokenizer/tagger change makes it visibly change.

  **The hash covers exactly these, and nothing else:**

  | Input | Why it is in the hash |
  |---|---|
  | `documents` (`source_id` + `raw_text`, sorted by `source_id`) | the corpus itself; sorted so retrieval order cannot fork the id |
  | `segmentation` (`unit` × `grouping` + `overlap`) | decides what a span *is* |
  | `restructure` | the B6 composition selector |
  | `embeddingProviderId` | the pinned embedding model |
  | `tokenizerId` | the pinned tokenizer (`unit: token` only, but always hashed) |
  | `taggerId` | the pinned tagger |
  | `indexId` | the B2 index impl — the B5 `local_coherence` field is computed *through* it, so a different index changes the bundle's contents |
  | `compositionId` | the B6 composition strategy — a non-passthrough strategy emits composite spans |
  | `coherenceK` | the k of the B5 local-coherence precompute — changes every `local_coherence` value in the bundle |
  | `formatVersion` | the artifact schema itself |

  The bar for inclusion is **"does changing it change the bundle's contents"**,
  not "is it a model". `coherenceK` is the case that proves it: it pins no model,
  but two builds differing only in `coherenceK` produce different
  `local_coherence` on every span. It was missing from this hash until the
  Conformance Audit 1 pass, which meant those two builds shared a build id — and
  §3.7.3 derives snapshot staleness from that id, so a stale snapshot reported
  itself fresh.

  **Adding a build input means adding it here.** When the index and composition
  stages became injectable (§0.10.0 B2/B6), their identities (`indexId`,
  `compositionId`) were added to this hash in the same change — closing the hole
  before it could open, exactly as the `coherenceK` case teaches.
- `graph.json`, `tag-registry.yaml`, and (when `--trace`) `build-trace.json` are
  **byte-identical** across independent builds of identical input — no wall-clock,
  no map-iteration order, no unseeded value anywhere in the pipeline.

## `inspect` and `eval`

- `corpus-builder inspect --graph G --node ID` — a span's fields + `source_refs`.
- `corpus-builder inspect --graph G --trace` — the `BuildTrace` (needs a `--trace` build).
- `corpus-builder eval --graph G` — offline **build-quality report** (local-coherence
  distribution, tag coverage / orphan rate, nearest-neighbor spread). It **reports**;
  it never gates a build (SPEC §0.11.0 C4, INV-4).

## Boundary reminder (INV-1 / INV-3)

Gutendex/Gutenberg hosts are a **build-time-only** dependency. `packages/server`
and the client packages MUST NOT reference them, directly or transitively.
`graph.json` internals (embeddings, the index, rule/corpus internals) never reach
a client — only resolved `Entity` output does (SPEC §3.1, §3.2).
