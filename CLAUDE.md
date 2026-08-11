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

## Open questions & sub-issues

Cold-start sessions surface things beyond the one issue you were scoped to —
edge cases, ambiguities, follow-on work. Resolve them without losing scope or
traceability:

- **Don't solve it inline.** Finish the issue you were given. An open question
  is not license to widen the current PR — that breaks "one build-order
  concern per PR."
- **Spec ambiguity or defect** (the acceptance criteria conflict with `SPEC.md`,
  or the spec looks wrong) → do not silently invent behavior. Follow
  [`docs/spec-guidelines.md`](docs/spec-guidelines.md) / AGENTS.md §7: raise it
  and, if it's a genuine defect, amend `SPEC.md` deliberately before writing
  code that guesses.
- **Everything else** (edge case out of scope, deferred feature, tech debt,
  later-phase idea) → file it as a **new GitHub issue**, not a `TODO` comment
  or a note buried in a PR description that will rot.
  - Use the repo's issue templates so it carries a spec reference and testable
    acceptance criteria like any other task.
  - Label it with the phase it belongs to (`phase:N`), or leave unlabeled /
    flag as out-of-scope if it falls under SPEC §6.8 (post-alpha).
  - Reference the originating issue/PR in its body (e.g. "Surfaced while
    working #N") so the chain is traceable later.
- **Link back once.** In the PR that surfaced the question, add a single line
  noting the new issue number (e.g. "opened #N for X, out of scope here").
  Don't re-explain it in every subsequent PR that touches nearby code — the
  issue link is the record.
- **Don't block on it.** An unresolved sub-issue should not stall the current
  issue's merge unless it's the spec-ambiguity case above, where guessing
  would risk violating an invariant (`INV-1`..`INV-5`).

## Useful commands

```
npm install              # install workspace dependencies
npm test                 # run the Vitest suite
npm run lint             # eslint + prettier --check
npm run typecheck        # tsc --noEmit
```

(These scripts exist once the Phase 0 scaffold is merged — see
[`docs/roadmap.md`](docs/roadmap.md).)
