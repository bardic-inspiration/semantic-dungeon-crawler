<!--
One PR = one issue = one build-order concern. See AGENTS.md and CONTRIBUTING.md.

Docs/spec-only PR (Markdown files only, no code)? Use the leaner checklist
below and skip the code one — see docs/docs-only-changes.md. Mixing a doc
edit with any code change makes it a code change; use the code checklist.
-->

## Summary

<!-- One or two sentences: what this PR does. -->

## Linked issue

Closes #

<!-- Trivial docs/spec fixes (typos, broken links) may omit this — see docs/docs-only-changes.md. -->

## Spec section

<!-- Which part of SPEC.md this implements or affects, e.g. "§6.2 Phase 1", "§3.1". -->

## Testing

<!-- What tests were added/changed, and which fixtures (minimal / typical / maxed). N/A for docs-only PRs. -->

## Checklist — code changes

- [ ] Tests written first (TDD) and passing — `npm test` green
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] Atomic commits in Conventional Commits format
- [ ] Documentation updated if behavior changed
- [ ] Schema changes include a `packages/schema/CHANGELOG.md` entry (INV-5), if applicable
- [ ] Scope compliant with the SPEC invariants (INV-1..INV-5) and this phase only

## Checklist — docs/spec-only changes

<!-- Use instead of the code checklist above. See docs/docs-only-changes.md. -->

- [ ] Every changed file is Markdown — no `packages/`, `fixtures/`, or `.github/workflows/` changes
- [ ] Atomic commits in Conventional Commits format (`docs: ...`)
- [ ] Cross-references updated where a shared term or section number changed (docs/documentation-standards.md)
- [ ] If `SPEC.md` changed: versioned per docs/spec-guidelines.md

## TL;DR

<!--
Required. Plain English, no software-expert jargon, bullet points — explain
this like you're telling a friend who doesn't code. Cover:
- Why: what problem or reason this PR exists for.
- Impact: what changes for someone using or building the project.
-->

-
