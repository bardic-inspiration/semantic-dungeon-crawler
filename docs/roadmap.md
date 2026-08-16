# Roadmap

**Status: the design track has closed — all A/B/C spec-gap entries are resolved
and `SPEC.md` is at 0.11.0. Phase 0 has completed the full phase cycle — its
issues are merged and its QA/QC pass confirmed the §6.1 Exit criteria hold, so
the `Development Phase 0` milestone is ready to close. No `phase:1` issues are
open yet, so Phase 1 is not yet active (see
[The phase cycle](#the-phase-cycle)).**

This file tracks the phase-by-phase build order: the
[development-phase table](#development-phases) mirrors `SPEC.md` §6 and links each
phase to its milestone. The design track that gated the build has closed
([`docs/design/open-scope.md`](design/open-scope.md) is `status: closed`); what
remains is to open each remaining phase's issues, one phase at a time, per
[The phase cycle](#the-phase-cycle).

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

So the build order is unblocked and underway: Phase 0 opened, built, and passed
its QA/QC pass (below). The remaining phases are tracked below, but none of them
has its issues opened yet, so no phase is currently active — see
[The phase cycle](#the-phase-cycle).

## Development phases

The build order is `SPEC.md` §6, Phases 0–7. Each in-scope phase has one
milestone (`Development Phase N`) that the repo owner creates and agents file the
phase's issues into; the milestone points at the spec rather than restating it.
See [`milestone-practices.md`](milestone-practices.md) for the convention.

`SPEC.md` §6.x is the source of truth for each phase's Entry / Build / Exit
criteria — this table is a status index, not a second copy of them.

| Phase | Deliverable | SPEC | Milestone | Status |
|---|---|---|---|---|
| 0 | Repository scaffold — workspaces, `tsconfig.base.json`, empty packages | §6.1 | [Development Phase 0](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/2) | **Complete** — closes [#49](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/49), [#50](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/50); QA/QC pass confirmed §6.1 Exit criteria hold; milestone ready to close |
| 1 | `packages/schema` — Section 3 types + CHANGELOG + example fixture | §6.2 | [Development Phase 1](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/3) | Not started |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 | [Development Phase 2](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/4) | Not started |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 | [Development Phase 3](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/5) | Not started |
| 4 | `packages/server` + `packages/client-cli` + conformance fixtures | §6.5 | [Development Phase 4](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/6) | Not started |
| 5 | `packages/client-threejs` — reference renderer | §6.6 | [Development Phase 5](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/7) | Not started |
| 6 | Production-alpha hardening + README playable path | §6.7 | [Development Phase 6](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/8) | Not started |
| 7+ | Post-alpha (rule editor, other adapters, persistence) — out of scope | §6.8 | [Development Phase 7](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/9) | Out of scope |

A phase becomes **active** when its issues are opened; it (and its milestone)
**closes** at the end of its QA/QC pass. Both transitions follow
[The phase cycle](#the-phase-cycle) below — the single place the open/close
conditions are defined. No phase is active yet.

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
the track carries no open entries. Phase 0 has since completed its full cycle;
the next action is to open Phase 1 (see [The phase cycle](#the-phase-cycle)).

Resolving an entry meant amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md) — the amendment, not the discussion, is
what unblocked a phase.

## Design gates

A phase must not be declared active while an open design entry blocks it. That is
why the phase table above lists status rather than declaring a phase active: a
queue that marks a phase active is an instruction to an agent to start, and
starting is exactly what the design gates guard. No design entry blocks a phase
now, so the gate is clear — opening Phase 1's issues is the remaining step, not a
further design decision.

## The phase cycle

Every build phase runs the same loop: **open its issues → build them → a
comprehensive QA/QC pass → close the milestone → open the next phase.** A phase is
opened only once the previous phase has finished this loop. This section is the
**canonical procedure and the single place the open/close conditions are
defined** — [`milestone-practices.md`](milestone-practices.md) and
[`AGENTS.md`](../AGENTS.md) §4 point here rather than restating them. The
per-issue working loop that step 3 wraps lives in [`AGENTS.md`](../AGENTS.md) §5.

1. **Confirm entry.** The previous phase's Exit criteria hold — verified by *its*
   QA/QC pass (step 4; none to check for Phase 0) — and no open design-track issue
   blocks this phase ([Design gates](#design-gates) above).
2. **Open the issues.** Ensure the phase's `Development Phase N` milestone exists
   (the repo owner creates it — [`milestone-practices.md`](milestone-practices.md)),
   then open the phase's issues from the corresponding `SPEC.md` §6.x **Build**
   list — each sized for one PR, labeled `phase:N` + `task` using the
   [Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md) template, and
   assigned to the milestone.
3. **Build.** Agents work the phase's issues one at a time through the
   [`AGENTS.md`](../AGENTS.md) §5 working loop — lowest-numbered open `phase:N`
   issue first, one PR each, CI green per PR. Update this phase's **Status** in the
   table above as issues progress, in the PR that closes each phase's last issue.
4. **QA/QC pass — the phase gate.** Once every issue is merged, run a comprehensive
   quality pass **before** closing the milestone. Per-PR CI proves each slice in
   isolation; this pass proves the **assembled phase**:
   - Walk the `SPEC.md` §6.x **Exit** checklist item by item against the integrated
     packages — including the criteria no single issue owned and the seams between
     issues.
   - Re-run the full `lint` + `typecheck` + `test` suite across the whole workspace,
     plus the phase's invariant tests where applicable — `INV-2` determinism,
     `INV-3` import-boundary, `INV-4` conformance
     ([`testing-standards.md`](testing-standards.md)).
   - Confirm docs, `GRAPH_FORMAT.md`, and `packages/schema/CHANGELOG.md` are
     reconciled with what actually shipped (`INV-5`,
     [`documentation-standards.md`](documentation-standards.md)).
   - **Record the result** — the Exit checklist, checked off — in the PR that closes
     the phase's last issue, so the close is traceable. A failed or partial pass is
     not a close: file the gaps as issues in the same phase and finish them first.
5. **Close and open the next.** A phase (and its milestone) closes only when
   **every issue is resolved and the QA/QC pass has confirmed all `SPEC.md` §6.x
   Exit criteria hold**. Closing the milestone is the phase's done-marker; only
   then does the next phase become active — return to step 1.

The contract a delegated agent must satisfy is defined by `AGENTS.md` + the issue
it claims + `SPEC.md`, not by this file.
