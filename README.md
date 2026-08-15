# Semantic Dungeon Crawler Engine

An authoring engine for semantic-space games — not a single game. It embeds a
text corpus into a weighted graph, lets a player occupy a position in that
graph, and renders each node as a spatial room whose objects are the means of
movement. Movement is an emergent consequence of environmental interaction,
mediated by an authored rule layer. See [`SPEC.md`](SPEC.md) §1 for the full
concept.

The engine ships two things:

- A **deterministic, headless backend** (corpus → graph → rule solver →
  resolved JSON) exposed over a REST API any frontend can be built against.
- Two reference clients against that API: a **Three.js client**, the first of
  potentially several graphical frontends, which renders whatever the backend
  sends and nothing else; and a **terminal client** for running and testing
  the engine without a frontend.

## Status

Pre-alpha. No packages exist yet. The spec-design track has closed — the open
design questions are now resolved and `SPEC.md` is at 0.11.0 — but the build
order (`SPEC.md` §6, Phase 0→7) has not reopened yet. See
[`docs/design/open-scope.md`](docs/design/open-scope.md) for the now-closed
survey of what was undecided, and [`docs/roadmap.md`](docs/roadmap.md) for how
the phase queue reopens.

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
- **Lint/format:** ESLint + Prettier, including an import-boundary rule
  enforcing `INV-3`
- **Typecheck:** `tsc --noEmit`

## Development

Once the Phase 0 scaffold lands:

```bash
npm install         # install workspace dependencies
npm test            # run the Vitest suite
npm run lint        # eslint + prettier --check
npm run typecheck   # tsc --noEmit across packages
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch and commit conventions
and the TDD workflow, and [`docs/`](docs/) for issue, testing, commit,
documentation, naming, and spec standards.

## License

MIT — see [`LICENSE`](LICENSE).
