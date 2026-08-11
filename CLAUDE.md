# CLAUDE.md

Claude Code specific notes. **Read [`AGENTS.md`](AGENTS.md) first** — it is the
canonical guide (purpose, hard rules, layout, build order, working loop). This
file only adds Claude-Code specifics.

## Before you start

- The build is delegated to agents via scheduled tasks; you may cold-start on a
  single build-order step. Scope your work to that step's issue and its spec
  section — don't range ahead into later steps.
- Read the relevant section of [`SPEC.md`](SPEC.md) before touching code. The
  invariants `INV-1`..`INV-5` (AGENTS.md §2) are non-negotiable.

## Workflow

- **TDD, always.** Failing Vitest test first
  ([`docs/testing-standards.md`](docs/testing-standards.md)); red → green →
  refactor.
- Run `npm run lint && npm run typecheck && npm test` before every commit; CI runs
  the same and must be green before merge.
- Atomic commits, Conventional Commits format
  ([`docs/commit-standards.md`](docs/commit-standards.md)).
- One build-order concern per PR; fill in the PR template.
- If you edit `packages/schema/src/*`, add a `packages/schema/CHANGELOG.md` entry
  in the same commit (`INV-5`).
- Picking up an issue, filing one, and handling open questions or sub-issues
  that surface mid-work are all covered in
  [`docs/issue-standards.md`](docs/issue-standards.md) — read it before your
  first cold start.

## Useful commands

```
npm install              # install workspace dependencies
npm test                 # run the Vitest suite
npm run lint             # eslint + prettier --check
npm run typecheck        # tsc --noEmit
```

(These scripts exist once the Phase 0 scaffold is merged — see
[`docs/roadmap.md`](docs/roadmap.md).)
