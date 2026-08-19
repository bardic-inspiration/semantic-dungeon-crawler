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
**substrate index** (Tier 2): embedding vectors + an ANN index for live querying +
a source-span provenance table + a precomputed **local-coherence field** + a
`substrate_version` build-id header (SPEC §6.3 re-scoping). The filename
`graph.json` is kept for cross-reference continuity only.

## Pipeline that produces it

`corpus-builder build --input DIR --output graph.json [--manifest FILE] [--trace] [--verbosity quiet|normal|verbose]`

Stages run in order, each a swappable interface with a deterministic default
(§0.10.0 B-series):

1. **Corpus retrieval** — `--input DIR` reads local `*.txt` files; `--manifest`
   uses the `CorpusSource`/Gutendex adapter (§6.3.1).
2. **Segmentation** (`Segmenter`, B1) — partitions raw text into source spans over
   `unit` × `grouping`. Default: blank-line boundaries, overlap 0 (paragraphs).
   Line endings are normalized (CRLF→LF) first.
3. **Embedding** (B2) — a config-selected provider (default: a deterministic,
   offline feature-hashing provider). Vectors are **L2-normalized at build time**,
   which fixes distance as **cosine, range `[0,2]`, smaller = nearer**.
4. **Index construction** (B2) — exact flat k-NN, ties broken by corpus order.
5. **Tagging** (`Tagger`, B4) — default is a deterministic offline lexicon
   assigning `semantic_tags` (§3.6 grammar) + a default `archetype`; also seeds
   `tag-registry.yaml`.
6. **Composition** (`restructure`, B6) — optional, after embedding + tagging.
   Default `null` = identity passthrough (contiguous spans only).
7. **Local-coherence precompute** (B5) — mean cosine similarity of a point to its
   k nearest neighbors, normalized to `[0,1]`.
8. **`substrate_version` stamping** — a content hash of the inputs + every pinned
   stage identity.

Every stage reports through the same `Logger`/`Metrics` interfaces `server` uses
(SPEC §2.1) — not a parallel mechanism.

## `graph.json` schema

```jsonc
{
  "format_version": "0.1.0",
  "substrate_version": "sv_<32 hex>",     // mirror of header.substrate_version
  "header": {
    "substrate_version": "sv_<32 hex>",   // content-hash build id (§3.7.3)
    "dimensions": 256,                    // provider-declared vector dimensionality
    "distance": "cosine",
    "distance_range": [0, 2],             // cosine distance over L2-normalized vectors
    "embedding_provider": "hashing-embed-v1-d256",  // pinned identity
    "tokenizer": null,                    // tokenizer identity iff `unit: token`, else null
    "tagger": "lexicon-v1",               // pinned identity
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
        "members": []                     // present only for a composite span (§3.1 B6)
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
