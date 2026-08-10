# Documentation Standards

Keep docs truthful and in sync with behavior. Documentation drift is a defect.

## Source of truth

- [`SPEC.md`](../SPEC.md) is **authoritative** for what the engine does. Code
  conforms to the spec; docs describe and point back to it rather than
  duplicating it (duplication drifts). When a doc needs a detail, link to the
  SPEC section instead of restating it.
- [`AGENTS.md`](../AGENTS.md) is authoritative for *how to work*.

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
