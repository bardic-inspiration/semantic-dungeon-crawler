# Doc Audit

The docs set — [`SPEC.md`](../SPEC.md), [`AGENTS.md`](../AGENTS.md),
[`CLAUDE.md`](../CLAUDE.md), and everything under `docs/` — is a **living,
periodically reconciled** artifact, not a write-once record. Documentation drift
is a defect ([`documentation-standards.md`](documentation-standards.md)); this
doc is the staleness/consistency audit that keeps the set truthful, so a
cold-start agent knows the docs are maintained and can be trusted to be current.

## What the audit checks

- **Stale status.** [`roadmap.md`](roadmap.md) phase status, the active-phase /
  design-gate state, and milestone links match the actual issue and milestone
  state on GitHub.
- **Links resolve.** Every relative link points at a file (and, for anchors, a
  heading) that still exists.
- **Cross-reference drift.** When a shared term, identifier, or section number
  changes in one doc, every doc that names it changed in the same PR
  ([`documentation-standards.md`](documentation-standards.md) "Keep in sync";
  identical spelling of code identifiers per
  [`naming-conventions.md`](naming-conventions.md)).
- **Terminology pairing.** Synonyms stay consistent wherever they appear —
  notably **"post-alpha"** and **"out of scope"** for Phase 7+ (SPEC §6.8),
  which are treated as synonyms and should read consistently across the
  `AGENTS.md` §3 repo-layout table and [`roadmap.md`](roadmap.md)'s
  development-phases table.
- **Invariant / notes split.** `AGENTS.md` §2 holds only the stable invariant
  statements; churn-prone mechanics stay in
  [`invariant-notes.md`](invariant-notes.md), not in the constitution section.
- **Process narration.** No chat/conversation/session references leak into doc
  content — that belongs in PR descriptions
  ([`documentation-standards.md`](documentation-standards.md) "Product docs, not
  process").
- **Structure & routing.** Each doc opens with its purpose line, and a parent
  doc's references to its subdocuments use the routing-table format rather than
  loose prose or a copy of another doc's table
  ([`documentation-standards.md`](documentation-standards.md) "Document structure
  & routing").

## When it runs

Treat the docs as reconciled periodically, not continuously. Any agent may open a
docs-only PR ([`docs-only-changes.md`](docs-only-changes.md)) to fix drift it
spots while working — trivial fixes need no issue; a broader reconciliation pass
is filed as its own docs issue. Don't fold doc fixes into an unrelated code PR
(see [`scope-discipline.md`](scope-discipline.md)); file or PR them separately.
