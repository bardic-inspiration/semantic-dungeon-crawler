# Roadmap

**Status: the design track has closed — all A/B/C spec-gap entries are resolved
and `SPEC.md` is at 0.11.0. The build phases and their milestones are tracked in
[Development phases](#development-phases) below, but no `phase:N` issues are open
yet, so no phase is active. Phase 0 opens first (see "Opening a phase").**

This file tracks the phase-by-phase build order: the
[development-phase table](#development-phases) mirrors `SPEC.md` §6 and links each
phase to its milestone. The design track that gated the build has closed
([`docs/design/open-scope.md`](design/open-scope.md) is `status: closed`); what
remains is to open each phase's issues, one phase at a time, per "Opening a
phase".

## Where the project actually is

[`SPEC.md`](../SPEC.md) §6 defines Phases 0–7 with Entry / Build / Exit criteria,
and that structure stands. The assumption underneath it — that the spec is
settled enough to slice into build tasks — now holds too. The spec-gap survey
([`docs/design/open-scope.md`](design/open-scope.md)) that catalogued where the
spec was undefined, inferred, or self-contradicting (including entries that
blocked Phase 0 and Phase 1) is closed: every entry was resolved through the
A/B/C amendments, and `SPEC.md` is at 0.11.0. Building no longer means inventing
spec-defined behavior, the situation [`issue-standards.md`](issue-standards.md)
exists to prevent.

So the build order is unblocked but not yet reopened. The phases are tracked
below, but none has its issues opened, so no phase is active yet — see "Opening a
phase".

## Development phases

The build order is `SPEC.md` §6, Phases 0–7. Each in-scope phase has one
milestone (`Development Phase N`) that the repo owner creates and agents file the
phase's issues into; the milestone points at the spec rather than restating it.
See [`milestone-practices.md`](milestone-practices.md) for the convention.

`SPEC.md` §6.x is the source of truth for each phase's Entry / Build / Exit
criteria — this table is a status index, not a second copy of them.

| Phase | Deliverable | SPEC | Milestone | Status |
|---|---|---|---|---|
| 0 | Repository scaffold — workspaces, `tsconfig.base.json`, empty packages | §6.1 | [Development Phase 0](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/2) | Not started — issues [#49](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/49), [#50](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/50) open |
| 1 | `packages/schema` — Section 3 types + CHANGELOG + example fixture | §6.2 | [Development Phase 1](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/3) | Not started |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 | [Development Phase 2](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/4) | Not started |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 | [Development Phase 3](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/5) | Not started |
| 4 | `packages/server` + `packages/client-cli` + conformance fixtures | §6.5 | [Development Phase 4](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/6) | Not started |
| 5 | `packages/client-threejs` — reference renderer | §6.6 | [Development Phase 5](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/7) | Not started |
| 6 | Production-alpha hardening + README playable path | §6.7 | [Development Phase 6](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/8) | Not started |
| 7+ | Post-alpha (rule editor, other adapters, persistence) — out of scope | §6.8 | [Development Phase 7](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/9) | Out of scope |

A phase becomes **active** only when its issues are opened and the previous
phase's Exit criteria hold; it (and its milestone) **closes** when all its issues
are resolved and the SPEC §6.x Exit criteria hold. No phase is active yet.

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
the track carries no open entries. The next action is to open Phase 0 (see
"Opening a phase").

Resolving an entry meant amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md) — the amendment, not the discussion, is
what unblocked a phase.

## Design gates

A phase must not be declared active while an open design entry blocks it. That is
why the phase table above lists status rather than declaring a phase active: a
queue that marks Phase 0 active is an instruction to an agent to start, and
starting is exactly what the design gates guard. No design entry blocks a phase
now, so the gate is clear — opening Phase 0's issues is the remaining step, not a
further design decision.

## Opening a phase

The design track has closed, so the spec is buildable and the phase table above
exists. To open the next phase (Phase 0 first):

1. Confirm the previous phase's Exit criteria hold (none to check for Phase 0)
   and that no open design-track issue blocks it.
2. Ensure the phase's `Development Phase N` milestone exists — the repo owner
   creates it ([`milestone-practices.md`](milestone-practices.md)).
3. Open that phase's issues from the corresponding `SPEC.md` §6.x **Build** list,
   each sized for one PR, labeled `phase:N` + `task` using the
   [Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md) template, and
   assign each to the phase milestone.
4. Update this phase's **Status** in the table above as its issues progress — in
   the PR that closes each phase's last issue.
5. A phase closes when all its issues are resolved **and** the spec's Exit
   criteria hold. Only then does the next phase become active
   ([`AGENTS.md`](../AGENTS.md) §4).

The working loop itself is unchanged and lives in [`AGENTS.md`](../AGENTS.md) §5;
the contract a delegated agent must satisfy is defined by `AGENTS.md` + the issue
it claims + `SPEC.md`, not by this file.
