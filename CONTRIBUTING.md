# Contributing

This project is built by AI coding agents and humans following the same
test-first, atomic, one-issue-per-PR process. **Read [`AGENTS.md`](AGENTS.md)
first** — it is the canonical working guide. This file covers the mechanics.

## Getting started

```bash
git clone https://github.com/bardic-inspiration/semantic-dungeon-crawler
cd semantic-dungeon-crawler
npm install     # once the Phase 0 scaffold is merged
npm test
```

Until the Phase 0 scaffold lands the workspace and scripts don't exist yet. The
spec-design track has closed (all entries resolved, `SPEC.md` at 0.11.0); the
build order has not reopened yet and is repopulated at gate-lift — see
[`docs/roadmap.md`](docs/roadmap.md) and
[`docs/design/open-scope.md`](docs/design/open-scope.md).

## Branching

- Branch from `main` using `type/short-description`, e.g. `feat/schema-entity`,
  `fix/solver-hard-decision-lock`, `chore/scaffold-workspace`.
- One issue per branch, one issue per PR.

## Commits

- **Atomic:** each commit is one logical change that builds and passes tests.
- **Conventional Commits:** `type(scope): imperative subject` — see
  [`docs/commit-standards.md`](docs/commit-standards.md).
- Tests and the implementation they cover are committed **together**.
- Editing `packages/schema/src/*` requires a `packages/schema/CHANGELOG.md` entry
  in the same commit (`INV-5`, SPEC §3.5).

## Linear history

We keep history linear. **Rebase** your branch onto `main` rather than merging
`main` into it, and PRs land via **"Rebase and merge."** Clean up
work-in-progress commits (amend / interactive rebase) before requesting review.

## Development workflow (TDD — required)

1. Claim the lowest-numbered open issue in the active phase (`phase:N`). See
   [`docs/issue-standards.md`](docs/issue-standards.md) for how to pick up,
   file, and scope issues.
2. Read the SPEC section the issue references.
3. Write a failing Vitest test that encodes an acceptance criterion (**red**).
4. Write the minimal code to pass it (**green**), then **refactor**.
5. Run `npm run lint && npm run typecheck && npm test` — all green.
6. Commit atomically; open one PR.

See [`docs/testing-standards.md`](docs/testing-standards.md) for the full testing
contract (fixtures, determinism, import-boundary checks).

## Pull requests

- Fill in the [PR template](.github/pull_request_template.md): summary, linked
  issue (`Closes #N`), affected SPEC section, testing notes, and the checklist.
- CI (lint + typecheck + test matrix) must be green before merge.
- Keep the PR to a single build-order concern. Do not scope-creep into later
  phases or the post-alpha items in SPEC §6.8.

## Docs-only changes

A change touching only Markdown (no `packages/`, `fixtures/`, or CI/config
files) skips TDD and the lint/typecheck/test gate — CI detects this and
skips those steps itself. See
[`docs/docs-only-changes.md`](docs/docs-only-changes.md) for the full
protocol, the lighter issue template, and the PR checklist to use instead.

## Standards docs

- [`docs/roadmap.md`](docs/roadmap.md) — phases → issues, the build process.
- [`docs/issue-standards.md`](docs/issue-standards.md) — filing, scoping, and
  closing issues; handling open questions and sub-issues.
- [`docs/testing-standards.md`](docs/testing-standards.md) — TDD contract.
- [`docs/commit-standards.md`](docs/commit-standards.md) — commit format.
- [`docs/documentation-standards.md`](docs/documentation-standards.md) — keeping docs in sync.
- [`docs/naming-conventions.md`](docs/naming-conventions.md) — casing rules for code, files, schema fields, and the DSL.
- [`docs/spec-guidelines.md`](docs/spec-guidelines.md) — how to amend `SPEC.md`.
- [`docs/docs-only-changes.md`](docs/docs-only-changes.md) — leaner protocol
  for Markdown-only changes.
