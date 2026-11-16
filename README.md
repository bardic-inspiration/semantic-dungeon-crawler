# semantic-dungeon-crawler

An engine for games played on **embedding surfaces**: bodies of text cut into
passages and laid out by meaning, which a player moves through by choosing
words. The engine is a corpus and embeddings pipeline that produces a surface;
the rules of a game are data, played by
[core](https://github.com/bardic-inspiration/core).

The Throughline prototype at the repo root is still standalone: open
[`index.html`](index.html) to play it. It moves onto the engine, as the first
project and the test fixture, in the change after this one.

## How it fits together

```
 a project's config                      the engine                      core
 ──────────────────                      ──────────                      ────
 corpus.sources   ─▶ corpus.mjs  ─▶ passages ─┐
 embeddings       ─▶ embed.mjs   ─▶ vectors  ─┴▶ surface.json
                                                    │
                                              host.mjs: the surface
                                              as a core map  ◀──── asks about space
 ruleset.yaml (an extension)  ─┐                                   compiles the rules,
 engine/rulesets/<base>       ─┴──────────────────────────────▶    runs the match
 scenario.yaml                ────────────────────────────────▶
                                                    │
 interface (title, copy, theme) ─▶ engine/interface/<template> ─▶ index.html
```

| Part | Where | What it is |
|---|---|---|
| Corpus | [`engine/corpus.mjs`](engine/corpus.mjs) | Reads sources (Project Gutenberg ids or local files) and cuts them into passages. |
| Embeddings | [`engine/embed.mjs`](engine/embed.mjs) | Providers that turn passages into vectors: `minilm` (real meaning) and `hashing` (no model, for tests). |
| Surface | [`engine/surface.mjs`](engine/surface.mjs) | The passages, their vectors, and a flat picture of them for drawing. Plain JSON. |
| Host | [`engine/host.mjs`](engine/host.mjs) | Answers core's questions about space from the surface. |
| Runtime | [`engine/game.mjs`](engine/game.mjs) | Compiles a ruleset with core and plays it on a surface. Runs in Node and the browser. |
| Base rulesets | [`engine/rulesets/`](engine/rulesets) | Rules templates in core's format. A project extends one. |
| Interface templates | [`engine/interface/`](engine/interface) | Pages that draw any game on a given base ruleset. A project configures one. |
| Projects | [`projects/`](projects) | One directory per game: its configuration of all of the above. |

The engine has no game-specific code.

## The surface as a core map

Core declares what is spatially possible and asks its host for the geometry.
This engine's host answers from meaning. Each passage is one cell,
`cell(i, 0)`, on a map as wide as the surface and one cell high.

| Core asks | The surface answers |
|---|---|
| `distance(a, b)` | How unalike two passages are: 0 for the same passage, 1000 for unrelated, 2000 for opposite. `1000 - distance` is similarity. |
| `cellsWithin(c, r)` | Every open passage within that distance of `c`. |
| `neighbors(c)` | The nearest open passages to `c`: as many as the ruleset's `adjacency`. |
| `inBounds(c)` | The passage exists and the ruleset's `blocksMove` does not hold for it. |
| `cellAt(c)` | The passage's layer values, such as which source it came from. |
| `lineOfSight(a, b)` | Always true. |

So a ruleset reads a surface with the functions core already has, and core
itself is unchanged. The host keeps core's contract: pure, total, and lists in
row order.

## The `hand` base ruleset

[`engine/rulesets/hand/ruleset.yaml`](engine/rulesets/hand/ruleset.yaml) is a
template for games where the player holds a hand of passages and plays one a
turn. The passages played are the trail; each move changes a meter by what the
passage was worth against the trail. A dealt passage becomes blocked, so it is
never dealt twice.

A project extends it with a core extension document:

| Table | Set by | Meaning |
|---|---|---|
| `bands` | the project (required) | One card is dealt from each band of the room: the open passages ranked by closeness to the last one played. The number of bands is the size of the hand. |
| `weights` | the project (required) | How much each of the last passages played counts toward the thread, latest first. |
| `goal` | default 100 | The meter value a scenario plays to. |
| `pivot`, `gain` | defaults 420, 60 | The similarity (out of 1000) at which a passage is worth nothing, and points per 1000 above or below it. |
| `streakStep`, `streakCap` | defaults 25, 4 | Each good move in a row adds this many percent to a gain, up to the cap. |
| `maxGain`, `maxLoss` | defaults 20, -20 | The most a single move can add or take. |

The two list-valued tables are left for the project because core's layering
only ever appends to a list. A project may also add globals, signals,
reactions, procedures and intents; the base emits a `played` signal on every
move for reactions to hang on. The scenario declares the end.

## The `hand` interface template

[`engine/interface/`](engine/interface) draws any game on the `hand` ruleset:
the meter, the hand, the trail, and a map of the surface with the path drawn
through it. A project's `interface` config sets:

| Key | Sets |
|---|---|
| `title`, `fonts` | The page title and an optional font stylesheet URL. |
| `theme` | Colour and font tokens (`ink`, `bone`, `accent`, `display`, `ui`, …). |
| `groups` | A label and colour for each source `group`, for the cards and the map legend. |
| `copy` | Every string the player reads. The defaults are at the top of [`hand.js`](engine/interface/hand.js). |

## Make a game

A project is a directory under `projects/`:

```
projects/<name>/
  project.mjs     corpus, embeddings, rules and interface config
  ruleset.yaml    a core extension of an engine base ruleset
  scenario.yaml   a core scenario: the seat and the end
  surface.json    built
  index.html      built
```

A source is `{ gutenberg: <id> }` or `{ file: <path> }`, with a `title` and an
optional `group`. The toy project the tests build
([`test/helpers.mjs`](test/helpers.mjs)) is a complete small example.

## Development

Requires Node 22 or later.

```bash
npm install
```

`npm install` also bundles the pinned core into `engine/vendor/`.

Build a project (downloads its books, and the embedding model once, about 90 MB):

```bash
npm run build -- projects/<name>
```

Rebuild only the page, reusing the surface, after changing rules or interface:

```bash
npm run build -- projects/<name> --page
```

Play simulated games to tune a project's tables:

```bash
npm run sim -- projects/<name>
```

```bash
npm test
```

The tests need no network or model: the engine's run on a small generated
corpus with the `hashing` embedder.

### Core

Core is installed from git, pinned to a commit in `package.json`. It is in
early development, so move the pin deliberately and run the tests after. Core
checks documents with a schema checker that needs `eval`, which strict hosts
forbid; the build checks every document in Node and ships the browser a copy of
core without the checker.

## History

This repo began as a larger engine for semantic-space games (its own rule DSL,
a REST server and two clients). That was replaced by the Throughline prototype
and then by this smaller engine around core. The earlier code is in git
history.

## License

MIT — see [`LICENSE`](LICENSE).
