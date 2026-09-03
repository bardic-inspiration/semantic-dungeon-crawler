# First Real Corpus Run

The first end-to-end run of the full pipeline — corpus → `graph.json` → server →
client — against a **real, non-fixture** text, small enough to sanity-check by
hand. It exists to prove the engine works on genuine prose, not just the
`fixtures/` and `packages/corpus-builder/test-assets/` sets, and to record the
exact steps so the run is reproducible.

The `graph.json` this produces is a build artifact (gitignored, see
`.gitignore`); it is **not** committed. This document is the durable record — re-run
the steps to regenerate an identical bundle (the build is deterministic, INV-2).

## Corpus

- **Text:** *The Yellow Wallpaper*, Charlotte Perkins Gilman (1892).
- **Source:** Project Gutenberg ebook **#1952**, resolved at build time through
  the Gutendex adapter (SPEC §6.3.1). Public domain.
- **Why this text:** a single-author, single-work short story (~30 KB → 269
  paragraph spans) — large enough to be *real* prose with genuine internal
  structure, small enough to read end-to-end and check a resolved room against
  the source by eye. It is deliberately none of the existing fixture or
  test-asset corpora.

No corpus text is committed to the repo. The manifest carries only the Gutenberg
id; the plaintext is fetched once and cached under `.cache/corpus/` (gitignored),
after which rebuilds are network-free.

## Embedding provider

This run uses the **`minilm`** provider (local, offline `all-MiniLM-L6-v2` via
transformers.js), the corpus-builder default. The deliberate choice and its
rationale — closing the SPEC §7 "Embedding provider choice" open question — are
recorded in
[`packages/corpus-builder/GRAPH_FORMAT.md`](../packages/corpus-builder/GRAPH_FORMAT.md#embedding-provider-choice--first-real-corpus-run-closes-spec-7).

## Reproduce

### Prerequisites

```bash
npm install
```

Two environment notes:

- **transformers.js / `sharp`.** The `minilm` provider pulls in
  `@xenova/transformers`, which depends on the native `sharp` module (image ops
  it never exercises for text, but imports eagerly). In an environment that
  blocks npm install scripts, `sharp`'s prebuilt binary is not fetched and the
  first `embed()` fails to load. If that happens, fetch the binary once:

  ```bash
  cd node_modules/sharp && node install/libvips && node install/dll-copy && npx prebuild-install
  ```

  A normal `npm install` (install scripts allowed) does this automatically.
- **Running the CLIs.** Invoke each package CLI through its `bin/` wrapper
  (`node packages/<pkg>/bin/<name>.mjs …`). On Windows the `tsx src/cli.ts` dev
  shortcut and the matching `npm run` scripts do not execute the command — the
  direct-run guard in `src/cli.ts` does not fire there — so the `bin/` wrappers
  are the portable entry point.

### 1. Manifest

`corpus-manifest.json`:

```json
{
  "source": "gutendex",
  "restructure": null,
  "entries": [
    { "id": 1952, "note": "The Yellow Wallpaper by Charlotte Perkins Gilman" }
  ]
}
```

### 2. Build

```bash
node packages/corpus-builder/bin/corpus-builder.mjs build \
  --manifest corpus-manifest.json \
  --output out/graph.json \
  --verbosity info
```

Produces `out/graph.json` (plus `tag-registry.yaml`) with:

- **269 spans**, default blank-line (paragraph) segmentation.
- **384-dimensional**, L2-normalized MiniLM vectors (distance = cosine, range
  `[0,2]`).
- `substrate_version` **`sv_2069a1067626ed10984f6b9449ac6e9f`**,
  `embedding_provider` **`minilm-all-MiniLM-L6-v2-q-main`**.

A second build of the same manifest is byte-identical and makes zero network
calls (cache hit), confirming INV-2 determinism for this provider.

### 3. Build-quality report (optional)

```bash
node packages/corpus-builder/bin/corpus-builder.mjs eval --graph out/graph.json --verbosity info
```

For this run:

```
local-coherence distribution:  n=269 min=0.6299 mean=0.7143 median=0.7169 max=0.7899
tag coverage:                  97/269 (36.1%)
tag orphan rate:               0/124 (0.0%)
nearest-neighbor spread:       n=269 min=0.3829 mean=0.5481 median=0.5437 max=0.7256
```

The nearest-neighbor spread (mean ≈ 0.55, not collapsed toward 0) is the signal
that the embedding space carries real semantic variance — passages land near
*related* passages rather than at one undifferentiated point. `eval` reports; it
never gates the build (SPEC §0.11.0 C4, INV-4).

### 4. Serve and play

Start the server on the built bundle. A fresh session starts at the first span in
corpus order (the title, a `prop` — no exits, immediately `stuck`), so this walk
picks a content-rich `container` span as the start position:

```bash
node packages/server/bin/sdc-server.mjs \
  --graph out/graph.json \
  --host 127.0.0.1 --port 7779 \
  --start-ref gutenberg:1952:3971-4245
```

Drive a scripted, replayable session through the terminal client. Script
(`walk.script`, one `<object_id> <affordance>` per line):

```
gutenberg:1952:3677-3969 enter
gutenberg:1952:25510-25631 enter
gutenberg:1952:7073-7217 enter
```

```bash
node packages/client-cli/bin/sdc-cli.mjs \
  --server http://127.0.0.1:7779 --seed 1 \
  --script walk.script --verbosity info
```

Resolved walk (four distinct rooms, ending naturally where the neighbourhood
runs out of onward exits):

```
0. [container] gutenberg:1952:3971-4245   resolved, exits=3
     "It is a big, airy room, the whole floor nearly, with windows that look all ways…"
   --enter 3677-3969-->  moved
1. [container] gutenberg:1952:1955-2003   resolved, exits=2
     "So I will let it alone and talk about the house."
   --enter 25510-25631-->  moved
2. [container] gutenberg:1952:25633-25801 resolved, exits=1
     "And John is so queer now, that I don't want to irritate him. I wish he would take another room!…"
   --enter 7073-7217-->  moved
3. [readable]  gutenberg:1952:26341-26470 stuck, exits=0
     "There are only two more days to get this paper off, and I believe John is beginning to notice…"
```

The rooms stay thematically coherent — the narrator's room, John, the wallpaper —
because the MiniLM embeddings cluster related passages, which is what makes
movement feel like traversing one place rather than jumping at random.

## Things worth knowing about the run

- **Movement is drift, not a hard edge.** Invoking a movement affordance on an
  object (e.g. `enter gutenberg:1952:3677-3969`) does not teleport to that span;
  it drifts the player's coordinate and *re-resolves* the room from the
  neighbourhood (SPEC §7 "relativistic drift"). That is why the room you land in
  (`1955-2003`) is a near neighbour of, not identical to, the object you entered.
- **`stuck` is a valid game state, not an error** (SPEC §0.11.0 C2). Only the
  `container` archetype carries the `enter`/`traverse` movement affordances and a
  non-zero object density, so a room resolves onward only while its sampled
  neighbours include containers. A short story's neighbourhood graph is sparse, so
  walks are shallow; onward-reachability depth is a corpus/tuning property, out of
  scope here (SPEC §0.11.0 C1 reference-budget tuning is its own concern).
