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

Pre-alpha, and building. The spec-design track has closed — the open design
questions are resolved and `SPEC.md` is at 0.11.0 — and the build order
(`SPEC.md` §6, Phase 0→7) is underway: Phase 0 (repo scaffold), Phase 1
(`packages/schema`), Phase 2 (`packages/corpus-builder`, the build-time pipeline),
and Phase 3 (`packages/rule-engine`, the parser + solver) are complete, each
through its QA/QC pass. Phase 4 (`packages/server` + `packages/client-cli` +
conformance fixtures) is now active, its issues opened. See
[`docs/roadmap.md`](docs/roadmap.md) for
live phase status and [`docs/design/open-scope.md`](docs/design/open-scope.md)
for the now-closed survey of what was undecided.

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
  **not yet enforced** — no test or lint rule asserts that a client package
  avoids importing `rule-engine`/`corpus-builder`; the dedicated ESLint rule
  arrives with the client packages (Phases 4–5, SPEC §6.5/§6.6). The guard that
  does exist today is a different one: `corpus-builder`'s `boundary.test.ts`
  keeps Gutendex/Gutenberg hosts out of the runtime packages (SPEC §6.3.1)
- **Typecheck:** `tsc --noEmit`

## Development

```bash
npm install         # install workspace dependencies
npm test            # run the Vitest suite
npm run lint        # eslint + prettier --check
npm run typecheck   # tsc --noEmit across packages
```

Build-time pipeline (Phase 2, `packages/corpus-builder`) — turns a text corpus
into the internal `graph.json` substrate index (never sent to a client, `INV-3`):

```bash
# from packages/corpus-builder/
node bin/corpus-builder.mjs build --input <dir> --output graph.json [--trace]
node bin/corpus-builder.mjs inspect --graph graph.json --node <id>
node bin/corpus-builder.mjs eval --graph graph.json
```

See [`packages/corpus-builder/GRAPH_FORMAT.md`](packages/corpus-builder/GRAPH_FORMAT.md)
for the artifact format.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch and commit conventions
and the TDD workflow, and [`docs/`](docs/) for issue, testing, commit,
documentation, naming, and spec standards.

## License

MIT — see [`LICENSE`](LICENSE).
