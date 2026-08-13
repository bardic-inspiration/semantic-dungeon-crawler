# Documentation Standards

Keep docs truthful and in sync with behavior. Documentation drift is a defect.

## Source of truth

- [`SPEC.md`](../SPEC.md) is **authoritative** for what the engine does. Code
  conforms to the spec; docs describe and point back to it rather than
  duplicating it (duplication drifts). When a doc needs a detail, link to the
  SPEC section instead of restating it.
- [`AGENTS.md`](../AGENTS.md) is authoritative for *how to work*.

## Product docs, not process

- `SPEC.md`, `AGENTS.md`, `CLAUDE.md`, and everything under `docs/` describe
  the **product** — technical and design intent — not how a change came to
  be. They must not reference chat/conversation sessions, "as discussed",
  a Claude session link, or similar process narration.
- That record belongs in the **PR description** instead: process, decisions,
  and the "why" of a specific change go in the PR summary and commit body
  ([`commit-standards.md`](commit-standards.md),
  [`.github/pull_request_template.md`](../.github/pull_request_template.md)),
  never in the doc content itself.
- If a decision needs to outlive the PR, capture the decision and its
  rationale in the doc (a `docs/design/*` entry, a `SPEC.md` amendment per
  [`spec-guidelines.md`](spec-guidelines.md)) — write it as settled product
  intent, not as a summary of the conversation that produced it.
- Applies equally to docs-only changes
  ([`docs-only-changes.md`](docs-only-changes.md)): the leaner protocol
  loosens testing/CI, not this rule.

## Keep in sync

- If a change alters observable behavior, update the affected docs **in the same
  PR** (README, package READMEs, and any doc that describes the changed surface).
- The PR checklist item "Documentation updated if behavior changed" is not
  optional when behavior changed.

## Schema / protocol changes

- Any change to a schema or wire-protocol surface follows SPEC §3.5 versioning and
  requires a `packages/schema/CHANGELOG.md` entry in the same commit (`INV-5`).
- Internal formats that never cross the client boundary (e.g. `graph.json`,
  documented in `packages/corpus-builder/GRAPH_FORMAT.md`) are versioned less
  strictly but must still be documented where the spec calls for it (SPEC §6.3).

## Style

- Prefer short, skimmable docs with links over long prose.
- Use fenced code blocks for commands and payloads.
- Reference invariants by name (`INV-3`) and spec sections (`SPEC §5.2`) so
  readers can trace claims back to the source of truth.
- Naming — of code identifiers, files, packages, or wire fields — follows
  [`docs/naming-conventions.md`](naming-conventions.md). When the same
  function or field is named in more than one doc (e.g. `resolveMove` in
  `SPEC.md`, `AGENTS.md`, and `docs/testing-standards.md`), every mention must
  use the identical spelling; update all of them in the same PR.
