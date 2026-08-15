# Milestone Practices

How GitHub **milestones** map to the build order. A milestone groups a phase's
issues and PRs and gives each phase one status page. Milestones complement the
`phase:N` labels ([`issue-standards.md`](issue-standards.md)) and the phase table
in [`roadmap.md`](roadmap.md), and follow the source-of-truth rule in
[`documentation-standards.md`](documentation-standards.md): point at `SPEC.md`,
don't duplicate it.

## One milestone per build phase

- The build order is `SPEC.md` §6, Phases 0–7 ([`roadmap.md`](roadmap.md)). Each
  phase has exactly one milestone, named **`Development Phase N`**.
- **The repo owner creates the phase milestones** — build agents do not. Agents
  file and assign issues into a milestone that already exists; they never create
  a milestone as a side effect of opening an issue. (The `Preliminary Design`
  milestone covers the pre-build design track and is closed.)
- Post-alpha work (`SPEC.md` §6.8, the `Development Phase 7` milestone) is out of
  this spec's scope: it carries no `phase:N` issue queue until something in it is
  deliberately scoped into the build order.

## Agents assign issues by phase

- Every build issue is labeled `phase:N` + `task`
  ([`issue-standards.md`](issue-standards.md)) **and** assigned to the matching
  `Development Phase N` milestone. The label routes the working queue; the
  milestone tracks completion.
- A PR inherits its issue's phase — assigning the issue to the milestone is
  enough, since the PR is tied to it through `Closes #N`.
- Unscoped or post-alpha work gets neither a `phase:N` label nor a phase
  milestone until it is scoped in.

## Milestone descriptions: in sync, not duplicated

- A milestone description states the phase's **deliverable in one line** and
  **points at `SPEC.md` §6.x** as the source of truth for its Entry / Build /
  Exit criteria. It must **not** restate those criteria — duplication drifts
  ([`documentation-standards.md`](documentation-standards.md)).
- Because the description is a pointer, a `SPEC.md` §6 amendment does not require
  editing the milestone: it stays correct precisely because it never copied the
  detail. Revise a description only when the phase's *deliverable or spec
  reference itself* changes — not when the criteria behind that reference change.
- The description may also name the issue convention (`phase:N` + `task`, assigned
  to the milestone) and the close condition, both of which live in full in
  [`roadmap.md`](roadmap.md) and [`issue-standards.md`](issue-standards.md).

## When a milestone closes

A phase milestone is the phase's done-marker: it closes at the end of the phase's
**QA/QC pass**, the single close condition defined in
[`roadmap.md`](roadmap.md) "The phase cycle" (every issue resolved **and** the
QA/QC pass confirms the `SPEC.md` §6.x Exit criteria). Don't close a milestone
while any Exit criterion is unmet, even if every issue happens to be closed; and
don't leave it open once the QA/QC pass has confirmed them.
