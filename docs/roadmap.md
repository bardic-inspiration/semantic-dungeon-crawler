# Roadmap

**Status: the design track has closed — all A/B/C spec-gap entries are resolved
and `SPEC.md` is at 0.11.0. The build queue is not yet repopulated: no phase is
active until the phase queue is opened at gate-lift (see "Repopulating this
file" below).**

This file is a placeholder for the phase-by-phase issue queue. The design track
that gated it has now closed ([`docs/design/open-scope.md`](design/open-scope.md)
is `status: closed`); the queue stays empty until it is repopulated per
"Repopulating this file" below.

## Where the project actually is

[`SPEC.md`](../SPEC.md) §6 defines Phases 0–7 with Entry / Build / Exit criteria,
and that structure stands. What does not yet stand is the assumption underneath
it: that the spec is settled enough to slice into build tasks.

It is not. [`docs/design/open-scope.md`](design/open-scope.md) surveys the areas
where the spec is undefined, inferred, or self-contradicting — including several
that block Phase 0 and Phase 1. Building against them would mean inventing
spec-defined behavior, which [`issue-standards.md`](issue-standards.md) exists to
prevent.

So the build order is paused rather than in progress. No phase is active, and no
phase status is tracked here until one is.

## The design track (now closed)

Spec refinement was tracked as issues labeled `design`, `spec-revision`, and
`needs-discussion`, deliberately carrying **no `phase:N` label**. The index is
[`docs/design/open-scope.md`](design/open-scope.md); each entry names the phase
it blocked.

**The design track was the active queue whenever no phase was active.** The rule:
take the **lowest-numbered open `design` issue whose dependencies are resolved** —
the tier ordering and "Depends on" links in
[`open-scope.md`](design/open-scope.md) — resolving **one tier at a time
(A → B → C)**. This mirrors the `phase:N` routing rule in
[`AGENTS.md`](../AGENTS.md) §5 so design work is owned and ordered rather than
unqueued. Tiers A (spec 0.9.0), B (spec 0.10.0), and C (spec 0.11.0) are all
resolved and [`open-scope.md`](design/open-scope.md) is now `status: closed`, so
the track carries no open entries. The next action is to repopulate the phase
queue below.

Resolving an entry meant amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md) — the amendment, not the discussion, is
what unblocked a phase.

## Design gates

A phase must not be declared active while an open design entry blocks it. That is
the whole reason this file is empty rather than optimistic: a queue that lists
Phase 0 as active is an instruction to an agent to start, and starting is exactly
what the design gates are for.

## Repopulating this file

When the design track has closed far enough that the spec is buildable again:

1. Confirm no open design-track issue blocks the phase being opened.
2. Open that phase's issues from the corresponding `SPEC.md` §6.x **Build** list,
   each sized for one PR, labeled `phase:N` + `task`, using the
   [Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md) template.
3. Restore a phase status table here — deliverable, SPEC reference, and status per
   phase — and keep it in sync in the PR that closes each phase's last issue.
4. A phase closes when all its issues are resolved **and** the spec's Exit
   criteria hold. Only then does the next phase become active
   ([`AGENTS.md`](../AGENTS.md) §4).

The working loop itself is unchanged and lives in [`AGENTS.md`](../AGENTS.md) §5;
the contract a delegated agent must satisfy is defined by `AGENTS.md` + the issue
it claims + `SPEC.md`, not by this file.
