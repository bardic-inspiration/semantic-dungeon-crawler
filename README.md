# Semantic Dungeon Crawler Engine

An authoring engine for semantic-space games — not a single game. It segments a
text corpus into source spans, embeds them into a **substrate** — a continuous
embedding surface queried live, not a fixed graph — and lets a player occupy a
coordinate in it. Each query resolves on demand into a room whose objects are the
means of movement. Movement is an emergent consequence of environmental
interaction, mediated by an authored rule layer. See [`SPEC.md`](SPEC.md) §1 for
the full concept.

The engine ships two things:

- A **deterministic, headless backend** (corpus → graph → rule solver →
  resolved JSON) exposed over a REST API any frontend can be built against.
- Two reference clients against that API: a **Three.js client**, the first of
  potentially several graphical frontends, which renders whatever the backend
  sends and nothing else; and a **terminal client** for running and testing
  the engine without a frontend.

## Status

Pre-alpha, and building. See [`docs/roadmap.md`](docs/roadmap.md) for the
current phase status and active issue queue — it is the single source of
truth for where the build stands — and
[`docs/design/open-scope.md`](docs/design/open-scope.md) for the closed
survey of what was undecided before the build order opened.

## How this repo is built

The project is developed by AI coding agents working in small, verifiable
steps:

1. [`SPEC.md`](SPEC.md) is the source of truth — invariants `INV-1`..`INV-5`,
   data schemas, rule engine, and a phased build plan (§6). Code conforms to
   the spec; the spec is not reverse-engineered from code.
2. [`docs/roadmap.md`](docs/roadmap.md) slices each spec phase into
   PR-sized GitHub issues labeled `phase:N`.
3. Scheduled agents pull the lowest-numbered open issue in the active phase,
   follow the working loop in [`AGENTS.md`](AGENTS.md), and open one PR per
   issue.
4. CI and review gates — green tests, lint, typecheck, one concern per PR —
   keep each PR honest; a comprehensive **QA/QC pass** against the spec's Exit
   criteria then gates the whole phase before its milestone closes and the next
   phase opens ([`docs/roadmap.md`](docs/roadmap.md) "The phase cycle").

Agents and humans starting fresh should read [`AGENTS.md`](AGENTS.md) first —
it is the canonical guide.

## Toolchain

- **Language:** TypeScript (monorepo, npm workspaces — SPEC §6.1)
- **Tests:** [Vitest](https://vitest.dev/)
- **Lint/format:** ESLint + Prettier. The `INV-3` client import boundary is
  **enforced** — a dedicated ESLint rule (`eslint/client-import-boundary.js`)
  is wired into both `packages/client-cli` and `packages/client-threejs`; a
  forbidden `rule-engine`/`corpus-builder` import fails `npm run lint` (SPEC
  §6.5/§6.6). Separately, `corpus-builder`'s `boundary.test.ts` keeps
  Gutendex/Gutenberg hosts out of the runtime packages (SPEC §6.3.1)
- **Typecheck:** `tsc --noEmit`

## Play a session (the playable path)

A clone-to-playing walkthrough: build a world from a sample corpus, start the
server, and play a session in the terminal. Every step is an exact command; no
prior knowledge of the codebase is assumed. This is the SPEC §6.7 alpha bar — a
person other than the builder plays start-to-finish from this README alone.

The sample corpus used here is the bundled six-document set under
[`packages/corpus-builder/test-assets/corpus/`](packages/corpus-builder/test-assets/corpus/),
so the walkthrough is self-contained — nothing to download, no corpus to
supply. For the same loop against real, non-fixture prose (a Project Gutenberg
short story), see the worked example in
[`docs/first-corpus-run.md`](docs/first-corpus-run.md).

Run every CLI through its `bin/` wrapper (`node packages/<pkg>/bin/<name>.mjs`).
Those wrappers are the portable entry point across platforms; the `tsx`
dev-script shortcuts do not run on every OS (see
[`docs/first-corpus-run.md`](docs/first-corpus-run.md#prerequisites)).

### 1. Install

```bash
npm install
```

### 2. Build the world (`graph.json`)

The build-time pipeline (`packages/corpus-builder`) turns a corpus directory
into the internal `graph.json` substrate index — the engine's world, never sent
to a client (`INV-3`):

```bash
node packages/corpus-builder/bin/corpus-builder.mjs build \
  --input packages/corpus-builder/test-assets/corpus \
  --output out/graph.json --verbosity info
```

`graph.json` and `tag-registry.yaml` are build artifacts (gitignored); `out/`
keeps them out of the tree.

**Embedding provider (`SDC_EMBEDDING_PROVIDER`).** The default is `minilm` — the
local `all-MiniLM-L6-v2` model, which gives real semantic clustering. Its first
run downloads the model (~90 MB) and needs the native `sharp` dependency's
prebuilt binary; if your environment blocks npm install scripts, see the
[transformers.js / `sharp` note](docs/first-corpus-run.md#prerequisites). For a
**fully offline** run with no model download, prefix the build with the
model-free test-mode provider (instant, deterministic, but no real semantic
signal — fine for trying the loop):

```bash
SDC_EMBEDDING_PROVIDER=hashing node packages/corpus-builder/bin/corpus-builder.mjs build \
  --input packages/corpus-builder/test-assets/corpus \
  --output out/graph.json --verbosity info
```

Optional: inspect a span or record a build-quality report (§0.11.0 C4 — it
reports, never gates the build):

```bash
node packages/corpus-builder/bin/corpus-builder.mjs inspect --graph out/graph.json --node <span-id>
node packages/corpus-builder/bin/corpus-builder.mjs eval --graph out/graph.json --verbosity info
```

`SDC_EMBEDDING_PROVIDER` is one of the `SDC_`-prefixed knobs from
[`docs/config-conventions.md`](docs/config-conventions.md); `SDC_LOG_SINK` and
`SDC_LOG_LEVEL` (or `--verbosity`) tune output the same way. See
[`packages/corpus-builder/GRAPH_FORMAT.md`](packages/corpus-builder/GRAPH_FORMAT.md)
for the artifact format.

### 3. Start the server

In one terminal, serve the world you built. The server binds to localhost only
by default (§0.11.0 C3 — see [Deployment](#deployment--trust-model-alpha)):

```bash
node packages/server/bin/sdc-server.mjs \
  --graph out/graph.json --host 127.0.0.1 --port 7777
```

It prints the address to connect a client to:

```
listening on http://127.0.0.1:7777
```

`--port 0` (the default) picks an ephemeral port instead — read the printed line
for the actual number. Session lifetime and request size are bounded by the
`SDC_SESSION_MAX` / `SDC_SESSION_TTL_MS` / `SDC_MAX_BODY_BYTES` env vars
([Deployment](#deployment--trust-model-alpha)); the defaults need no tuning to
play.

### 4. Play in the terminal client

In a second terminal, start the terminal reference client (`client-cli`, SPEC
§5.4) against the server's address:

```bash
node packages/client-cli/bin/sdc-cli.mjs --server http://127.0.0.1:7777 --seed 1
```

It creates a session and prints the current room — its objects (with the
affordances each accepts) and exits:

```
room file:forest.txt:0-72 [container]
  status: resolved
  objects:
    file:forest.txt:152-225 [container] salience=0.6 affordances=[enter, traverse]
    file:gothic.txt:143-219 [container] salience=0.6 affordances=[enter, traverse]
    file:town.txt:0-73 [container] salience=0.6 affordances=[enter, traverse]
    file:poem.txt:137-203 [prop] salience=0.4 affordances=[inspect]
  exits:
    enter -> file:gothic.txt:143-219 via file:gothic.txt:143-219 (weight=1)
    ...
```

To move, type a line of the form `<object_id> <affordance>` — copy an object id
listed under `objects:` and one of its affordances. For example, to enter the
first container above:

```
file:forest.txt:152-225 enter
```

The client posts the interaction, prints `moved`, and re-renders the room it
drifted into — repeat to keep playing. Movement is **relativistic drift**: the
affordance nudges your coordinate and the room re-resolves from the new
neighbourhood (SPEC §7), so you traverse one continuous space rather than jump
between fixed nodes. A room with `status: stuck` and no exits is a valid
end-of-walk, not an error (§0.11.0 C2). Press **Ctrl-D** (EOF) to end the
session.

**Scripted replay.** The same actions can be replayed headlessly and diffed
byte-for-byte (`INV-2`). Put one `<object_id> <affordance>` per line in a script
file and pass `--script`:

```bash
node packages/client-cli/bin/sdc-cli.mjs \
  --server http://127.0.0.1:7777 --seed 1 --script walk.script
```

`--verbosity error|warn|info|debug` (default `warn`) controls detail;
`--render <room.json>` renders a `ResolvedRoomResponse` fixture with no server
running (the §5.3 conformance path).

### The graphical client

[`packages/client-threejs`](packages/client-threejs) is the Three.js reference
adapter (SPEC §5.2): the ECS projection and pure systems that turn a resolved
room into a scene, plus the live-server session bootstrap and click→`POST
/interact` pipeline. It is a **library** consumed by a host application and
verified end-to-end against a live server by its test suite; this alpha does not
ship a bundled browser app to launch, so the terminal client above is the
runnable playable path. `client-cli` and `client-threejs` are two adapters
against the same §5.1 API (`INV-3`); nothing in the API assumes either exists.

## Deployment & trust model (alpha)

The alpha deployment path is deliberately minimal: **run the server locally and
open a client against it** — exactly the [playable path](#play-a-session-the-playable-path)
above. That is the whole supported posture.

The trust model is on the record (SPEC §0.11.0 C3): the alpha is
**single-user, local, trusted-operator**.

- **Localhost-bind by default.** The server binds `127.0.0.1` unless `--host`
  says otherwise; it is not meant to face a network.
- **No authentication.** There is no auth boundary and none is implied. The
  author-supplied ruleset is trusted input — the engine runs "bad" rulesets
  (`INV-4`), it does not sandbox against malicious ones.
- **Operational bounds, not auth.** Phase 6 hardening adds operator-tunable
  limits so the in-memory surface stays bounded — `SDC_SESSION_MAX` (max live
  sessions before oldest-idle eviction), `SDC_SESSION_TTL_MS` (idle TTL before a
  session is evicted), and `SDC_MAX_BODY_BYTES` (request body-size cap, rejected
  `413` before parsing). Defaults and ranges are in
  [`docs/config-conventions.md`](docs/config-conventions.md). These are
  hardening of the existing surface, **not** an authentication system.
- **Sessions are in-memory.** A server restart drops all sessions; there is no
  persistence. That is expected for alpha.

**Production infrastructure is explicitly out of scope.** Authentication,
accounts, multiplayer, persistence, and any remote or multi-tenant deployment
are post-alpha (SPEC §6.8, §7) — not configured here and not implied by anything
above.

## Development

```bash
npm install         # install workspace dependencies
npm test            # run the Vitest suite
npm run lint        # eslint + prettier --check
npm run typecheck   # tsc --noEmit across packages
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for getting started — branching,
commits, linear history. [`AGENTS.md`](AGENTS.md) is the canonical guide for how
to work, and its §5 routing table indexes the standards docs under
[`docs/`](docs/).

## License

MIT — see [`LICENSE`](LICENSE).
