# Roadmap

**Status: the build queue is intentionally empty. The project is in a design and
definition phase that predates the build order.**

This file is a placeholder. It will be repopulated with a phase-by-phase issue
queue once the design track closes — see "Repopulating this file" below.

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

## Active work — the design track

All current work is spec refinement, tracked as issues labeled `design`,
`spec-revision`, and `needs-discussion`, deliberately carrying **no `phase:N`
label**. The index is [`docs/design/open-scope.md`](design/open-scope.md); each
entry names the phase it blocks.

Resolving an entry means amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md) — the amendment, not the discussion, is
what unblocks a phase.

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
