# Docs-Only Changes

A leaner issue/PR protocol for changes that touch **only** Markdown — no code,
schema, fixtures, or CI/build config. The full TDD/CI gate in
[`AGENTS.md`](../AGENTS.md) §5 and [`CONTRIBUTING.md`](../CONTRIBUTING.md)
exists to protect code correctness; it has nothing to check on a change that
contains no code.

## What qualifies

A change is **docs-only** if:

- Every changed file has a `.md` extension (`SPEC.md`, `AGENTS.md`,
  `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, anything under `docs/`,
  `.github/ISSUE_TEMPLATE/*.md`, `.github/pull_request_template.md`, package
  `README.md`s, etc.).
- Nothing under `packages/` or `fixtures/` changed.
- Nothing under `.github/workflows/`, `package.json`, `tsconfig*`, or any
  lockfile changed.

A PR that mixes a docs edit with any code change is a **code change** —
follow the normal protocol for the whole PR, not this one. When in doubt,
treat it as a code change.

## Filing an issue

- **Substantive** doc/spec changes (a spec amendment, a new or restructured
  standards doc) still get an issue, but use the lighter
  [Docs / spec change template](../.github/ISSUE_TEMPLATE/docs_change.md)
  instead of [Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md) —
  no testable acceptance criteria or fixtures section, since there's no code
  to test. No phase label required (see
  [`issue-standards.md`](issue-standards.md)).
- **Trivial, mechanical** fixes (typos, broken links, formatting, a stale
  roadmap status) don't need an issue at all — open the PR directly, no
  `Closes #N`.
- If a `SPEC.md` change is involved, it still follows
  [`spec-guidelines.md`](spec-guidelines.md) (versioning, invariant care)
  regardless of which issue path you took.
- **Design-track entries** ([`design/open-scope.md`](design/open-scope.md)) keep
  their own labels (`design`, `spec-revision`, `needs-discussion`) and their own
  triage process — this protocol only changes how the *PR/commit/CI* mechanics
  work once you're resolving one, not the label scheme.

## PR & commit

- Commit type is `docs` ([`commit-standards.md`](commit-standards.md)).
  Atomic commits still apply.
- **Skip:** TDD, `npm run lint && npm run typecheck && npm test` locally,
  and the code checklist items in the PR template.
- **Still required:** correct content, links that resolve, cross-references
  updated in the same PR when a shared term or section number changes, and
  no chat/conversation/process references in the doc content itself — those
  go in the PR description, not the doc
  ([`documentation-standards.md`](documentation-standards.md), "Product docs,
  not process") — plus `spec-guidelines.md` versioning if `SPEC.md` changed.
- Use the "Docs/spec-only" checklist in
  [`.github/pull_request_template.md`](../.github/pull_request_template.md)
  instead of the code checklist.

## CI

`ci.yml` detects a Markdown-only diff and skips the install/lint/typecheck/
test steps automatically — the job still runs and reports green, it just has
nothing to build. You don't need to do anything to trigger this; it's
based on the changed file list, not a PR label or flag.

If CI does *not* skip (because a non-Markdown file is in the diff after
all), that's a signal the change isn't actually docs-only — treat it as a
code change instead of trying to force the skip.
