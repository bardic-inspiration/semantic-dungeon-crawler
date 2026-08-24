# CLAUDE.md

Claude Code specific notes. **Read [`AGENTS.md`](AGENTS.md) first** — it is the
canonical guide (purpose, hard rules, layout, build order, working loop). This
file only adds Claude-Code specifics.

## Before you start

- The build is delegated to agents via scheduled tasks; you may cold-start on a
  single build-order step. Scope your work to that step's issue and its spec
  section — don't range ahead into later steps. Implement only what the
  issue's acceptance criteria require; resist folding in adjacent fixes,
  refactors, or improvements you notice along the way, even small ones —
  file those as separate issues instead
  ([`docs/issue-standards.md`](docs/issue-standards.md)). Because each
  cold start has no memory of prior sessions, this restraint is the only
  thing standing between the build and scope drift across agents — don't
  rely on a later session to notice and revert an out-of-scope change.
- Read the relevant section of [`SPEC.md`](SPEC.md) before touching code. The
  invariants `INV-1`..`INV-5` (AGENTS.md §2) are non-negotiable.

## Asking questions

- When you need to ask the user a question, ask **one question at a time**,
  through regular chat, with a few suggested options they can pick from or
  riff on.
- **Never** use the app's multiple-choice/question-picker widgets — always
  ask in plain chat text instead.

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
- Changing only Markdown (`SPEC.md`, `docs/**`, `AGENTS.md`, ...) and no code?
  None of the above applies — use
  [`docs/docs-only-changes.md`](docs/docs-only-changes.md) instead.

## CI watch protocol

- **Code change → always watch.** Once you open a PR that touches anything
  beyond Markdown, call `subscribe_pr_activity` on it before ending the turn.
  Cold-start sessions have no memory of prior runs, so this subscription is
  what keeps CI failures, merge conflicts, and review comments from going
  unhandled between agent sessions — drive the PR to green per the
  babysitting rules rather than leaving it to be noticed later.
- **Docs-only → never watch.** A PR that qualifies as docs-only under
  [`docs/docs-only-changes.md`](docs/docs-only-changes.md) skips CI's
  install/lint/typecheck/test steps entirely, so there's no build state to
  babysit — don't call `subscribe_pr_activity` on it.
- If a docs-only PR later picks up a code change, it stops being docs-only
  ([`docs/docs-only-changes.md`](docs/docs-only-changes.md), "mixes a docs
  edit with any code change") — subscribe as soon as that happens.

## Useful commands

```
npm install              # install workspace dependencies
npm test                 # run the Vitest suite
npm run lint             # eslint + prettier --check
npm run typecheck        # tsc --noEmit
```

(These scripts exist once the Phase 0 scaffold is merged — see
[`docs/roadmap.md`](docs/roadmap.md).)
