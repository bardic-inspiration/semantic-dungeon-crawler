# Semantic Dungeon Crawler Engine

An **authoring engine for semantic-space games** — not a single game. It embeds a
text corpus into a weighted graph, lets a player "occupy" a position in that
graph, and renders each node as a spatial "room" whose objects are the means of
movement. Movement is an emergent consequence of environmental interaction,
mediated by an authored rule layer. See [`SPEC.md`](SPEC.md) §1 for the full
concept.

The engine ships two things: a **deterministic, headless backend** (corpus →
graph → rule solver → resolved JSON) exposed over a REST API any frontend can
be built against, and two reference adapters against that API — a **Three.js
client** (the first of potentially several graphical frontends) that renders
whatever the backend sends and nothing else, and a **terminal client** for
running and testing the engine with no frontend at all.

> **Status: pre-alpha, design phase.** This repository currently holds the
> specification and the agentic development process. The build order is paused
> while open design questions in the spec are resolved — see
> [`docs/design/open-scope.md`](docs/design/open-scope.md). No packages exist
> yet; [`docs/roadmap.md`](docs/roadmap.md) is a placeholder until the build
> queue reopens.

## How this repo is built (hands-off, iterative agentic process)

This project is developed by AI coding agents working in small, verifiable steps:

1. **[`SPEC.md`](SPEC.md) is the source of truth.** It defines the invariants
   (`INV-1`..`INV-5`), the data schemas, the rule engine, and a phased build plan
   (§6, Phase 0→7). Code conforms to the spec; the spec is not reverse-engineered
   from code.
2. **[`docs/roadmap.md`](docs/roadmap.md)** slices each spec phase into
   PR-sized GitHub issues labeled `phase:N`.
3. **Scheduled agents** pull the lowest-numbered open issue in the active phase,
   follow the working loop in [`AGENTS.md`](AGENTS.md), and open **one PR per
   issue**.
4. **CI + review gates** (green tests, lint, typecheck; one concern per PR) keep
   the loop honest. A phase closes when all its issues are resolved and the spec's
   Exit criteria hold.

If you are an agent (or a human) starting fresh: **read [`AGENTS.md`](AGENTS.md)
first** — it is the canonical guide.

## Toolchain

- **Language:** TypeScript (monorepo, npm workspaces — SPEC §6.1)
- **Tests:** [Vitest](https://vitest.dev/)
- **Lint/format:** ESLint + Prettier (including an import-boundary rule enforcing `INV-3`)
- **Typecheck:** `tsc --noEmit`

## Development (once the Phase 0 scaffold lands)

```bash
npm install            # install workspace dependencies
npm test               # run the Vitest suite
npm run lint           # eslint + prettier --check
npm run typecheck      # tsc --noEmit across packages
```

Until the Phase 0 scaffold is merged these scripts do not yet exist, and Phase 0
has not been opened for work — see [`docs/roadmap.md`](docs/roadmap.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch/commit conventions and the
TDD workflow, and [`docs/`](docs/) for issue, testing, commit, documentation,
naming, and spec standards. All work is test-first, atomic, and
Conventional-Commits formatted.

## License

MIT — see [`LICENSE`](LICENSE).
