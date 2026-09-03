# C4 Build-Quality Evaluation — First Real Corpus Run

The `§0.11.0` **C4 build-quality report** for the first real corpus run
([`first-corpus-run.md`](first-corpus-run.md)), produced by `corpus-builder eval`
and recorded here per `SPEC §6.7` Build/Exit ("a `corpus-builder eval` (C4) result
is recorded for the corpus run").

`eval` is an **offline report, never a gate** (`SPEC §0.11.0` C4, `INV-4`): it
measures whether a well-formed substrate is *interesting*, separately from the
build's fail-loud gate that rejects *degenerate* output. See
[`design/0005-c-series-resolution.md`](design/0005-c-series-resolution.md) C4.

## Substrate evaluated

The #164 bundle: *The Yellow Wallpaper* (Project Gutenberg #1952), `minilm`
provider, **269 spans**, `substrate_version sv_2069a1067626ed10984f6b9449ac6e9f`
([`first-corpus-run.md`](first-corpus-run.md)). `graph.json` is a build artifact
(gitignored); regenerate it with the deterministic steps in that doc, then:

```bash
node packages/corpus-builder/bin/corpus-builder.mjs eval --graph out/graph.json --verbosity info
```

## Report

```
Build-quality report — 269 span(s)
  local-coherence distribution:  n=269 min=0.6299 mean=0.7142 median=0.7169 max=0.7899
  tag coverage:                  97/269 (36.1%)
  tag orphan rate:               0/124 (0.0%)
  nearest-neighbor spread:       n=269 min=0.3829 mean=0.5482 median=0.5442 max=0.7256

This report never gates the build (INV-4; C4).
```

## Reading — an interesting substrate, no degeneracy

**Verdict: the substrate is "interesting" per C4's intent** — it is clearly
distinguishable from the shuffled-noise failure mode C4 exists to catch, with one
benign observation (tag coverage) tied to a known `SPEC §7` open question.

- **Nearest-neighbor spread — the decisive signal.** C4 names the k-NN
  cosine-distance distribution as what makes "a shuffled-noise corpus visibly
  distinguishable from a coherent one." Cosine distance is `[0, 2]` (`§0.10.0` B2;
  0 = identical, 1 = orthogonal). The mean **0.548** (≈ cosine similarity 0.45)
  sits well away from **both** degenerate extremes: not collapsed toward 0 (the
  "embeds to one repeated vector" degeneracy the build gate rejects) and not near
  1.0 (orthogonal noise). The spread across the range **[0.38, 0.73]** is itself
  the tell — passages land near *related* passages while remaining distinct, i.e.
  the embedding space carries real semantic variance. This is the positive result.
- **Local-coherence distribution — healthy.** All 269 values fall in a moderate,
  tight band (**0.63–0.79**, mean 0.71) on the `[0, 1]` scale — consistent with a
  single coherent short story, not the low, wide distribution noise would produce.
- **Tag coverage — a mild observation, not a concern.** The heuristic auto-tagger
  reached **36.1%** of spans (97/269). That is expected: Phase 2's heuristic
  tagging is an explicit alpha stand-in, and *tagging quality / refinement tooling*
  is an open `SPEC §7` question (likely Phase 7+). It is not a degeneracy and does
  not gate anything; recorded here as the one number a future tagging-quality pass
  would want to move.
- **Tag orphan rate — structurally 0, as designed.** 0/124 (0.0%). Per
  `eval.ts`'s scope note, the default pipeline seeds `tag-registry.yaml` from the
  corpus's own tags, so a matched (bundle, registry) pair can never orphan its own
  tags. This is a *drift* signal (it fires only against a hand-edited or stale
  registry), so 0% here simply confirms the bundle and its registry match — not a
  build-quality measure.

## No mutation, no runtime effect (confirmed)

`eval` is a pure, read-only report over `graph.json`. Confirmed for this run: the
`graph.json` (and its sibling `tag-registry.yaml`) were **byte-identical**
(SHA-256 unchanged) before and after the `eval` invocation. `eval` is an offline
sibling of `inspect` with no write path, is never invoked by `packages/server` or
the engine, and cannot affect resolution (`INV-4`; the C4 offline-seam decision).
