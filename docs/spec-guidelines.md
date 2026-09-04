# Spec Guidelines

[`SPEC.md`](../SPEC.md) is the contract. Code conforms to the spec — the spec is
not reverse-engineered from code. This doc explains how to change the spec when it
genuinely needs to change.

## The spec is the contract

- Build to the spec. If the spec is ambiguous or looks wrong, **do not silently
  invent behavior in code.** Raise it in the issue/PR.
- If it is a real spec defect or a needed change, amend `SPEC.md` deliberately and
  in a versioned way (below) — then make code conform.

## Versioning changes (SPEC §3.5, `INV-5`)

- Every schema/protocol surface and ruleset file carries a semver
  `spec_version`.
- **MINOR bump** (additive, non-breaking): adding a new `Archetype` or
  `Affordance` string literal — the open-string extension points in SPEC §3.1
  exist precisely so this needs no restructure.
- **MAJOR bump** (breaking): renaming or removing any field in `Entity`,
  `ResolvedRoomResponse`, or `Ruleset`, or changing the DSL grammar (SPEC §4.2).
- Any change to `packages/schema/src/*` requires a `packages/schema/CHANGELOG.md`
  entry in the **same commit**, and conformance fixtures (SPEC §6.5) must be
  re-validated before the change is considered complete.

## Editing SPEC.md

- Bump `spec-version` in the SPEC header when the change is versioned.
- Keep the invariants `INV-1`..`INV-5` intact; changing an invariant is a major,
  deliberate decision — it ripples through every phase. The canonical statements
  live in `SPEC.md` §0; amend them there, then update the one-line glosses in
  `AGENTS.md` §2 and any mechanics in [`invariant-notes.md`](invariant-notes.md)
  to match.
- Preserve the section numbering that issues and docs reference; if you must
  renumber, update the cross-references (`docs/*`, `AGENTS.md`, issue templates).
- Do not expand scope into SPEC §6.8 (post-alpha) items via the spec without an
  explicit decision to move them in-scope.
