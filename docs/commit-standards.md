# Commit Standards

Clean, readable history through atomic, conventionally-formatted commits.

## Atomic commits

- Each commit is **one logical change** that builds successfully and passes tests.
- Do not mix unrelated concerns in a commit, and do not split one change across
  commits that leave the tree broken in between.
- Commit **tests and the implementation they cover together** (TDD produces them
  as one logical change).

## Conventional Commits

Format:

```
type(scope): imperative subject

optional body explaining WHY, wrapped near 72 chars

optional footer (Closes #12, BREAKING CHANGE: ...)
```

- **Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `build`.
- **Scope:** the package or area, e.g. `feat(schema): ...`,
  `fix(rule-engine): ...`.
- **Subject:** imperative, lower-case, no trailing period, ≤ ~72 chars
  ("add entity type guard", not "Added entity type guard.").
- **Body:** explain *why* the change was made, not *what* changed (the diff shows
  what). Wrap near 72 characters.

## Linear history

- Keep history linear — **no merge commits**.
- Rebase your branch onto `main` rather than merging `main` into it.
- Land PRs with **"Rebase and merge."**
- Clean up work-in-progress commits (amend / interactive rebase) before review so
  each landed commit is atomic and meaningful.

## Schema changes (`INV-5`, SPEC §3.5)

Any commit that edits `packages/schema/src/*` **must** include the corresponding
`packages/schema/CHANGELOG.md` entry in the **same commit**. Adding an
`Archetype`/`Affordance` string literal is a MINOR bump; renaming or removing a
field is a MAJOR bump. Never mutate a schema surface silently.
