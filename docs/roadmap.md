# Roadmap

**Status: the design track has closed — all A/B/C spec-gap entries are resolved
— and `SPEC.md` is at 0.13.1 after the `Conformance Audit 1` pass (below) folded
in a further 0.11.0→0.13.1 run of amendments. Phases 0, 1, 2, and 3 have
completed the full phase cycle — their issues are merged (Phase 1's
`packages/schema` in #59; Phase 2's `packages/corpus-builder`; Phase 3's
`packages/rule-engine` in #71–#76) and their QA/QC passes confirmed the
§6.1/§6.2/§6.3/§6.4 Exit criteria hold, so the `Development Phase 3` milestone
is closed. Phase 4 (`packages/server` + `packages/client-cli` + conformance
fixtures, §6.5) is now active: its issues (#85–#92) were opened under the
`Development Phase 4` milestone, sliced from the §6.5 Build list (server
endpoints, `Logger`/`Metrics` + debug gate, conformance fixtures, `client-cli`,
and the `INV-3` import-boundary lint rule); #85–#88 are merged, #89–#92 remain
open, and the milestone closes after the phase's QA/QC pass, per
[The phase cycle](#the-phase-cycle). Interleaved with that queue, `Conformance
Audit 1` (#98–#118) has run to completion and its milestone is closed; #125 is
open follow-on code work from that pass — see
[Conformance audit track](#conformance-audit-track) for its queue status.**

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

So the build order is unblocked and underway: Phases 0, 1, 2, and 3 opened, built,
and passed their QA/QC pass, and Phase 4 (`packages/server` + `packages/client-cli`
+ conformance fixtures) is now active with its issues opened (below). The later
phases are tracked below and not yet opened — see [The phase cycle](#the-phase-cycle).

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
| 1 | `packages/schema` — Section 3 types + CHANGELOG + example fixture | §6.2 | [Development Phase 1](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/3) | **Complete** — issues [#54](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/54)–[#58](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/58) merged in [#59](https://github.com/bardic-inspiration/semantic-dungeon-crawler/pull/59); §6.2 Exit checklist recorded in that PR; milestone closes per [The phase cycle](#the-phase-cycle) |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 | [Development Phase 2](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/4) | **Complete** — issues [#60](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/60)–[#69](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/69) merged; QA/QC pass confirmed §6.3 Exit criteria hold; milestone closed |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 | [Development Phase 3](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/5) | **Complete** — issues [#71](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/71)–[#76](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/76) merged; QA/QC pass confirmed §6.4 Exit criteria hold; milestone closed |
| 4 | `packages/server` + `packages/client-cli` + conformance fixtures | §6.5 | [Development Phase 4](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/6) | **Active** — issues [#85](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/85)–[#92](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/92) opened under the milestone; milestone closes after the phase's QA/QC pass |
| 5 | `packages/client-threejs` — reference renderer | §6.6 | [Development Phase 5](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/7) | Not started |
| 6 | Production-alpha hardening + README playable path | §6.7 | [Development Phase 6](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/8) | Not started |
| 7+ | Post-alpha (rule editor, other adapters, persistence) — out of scope | §6.8 | [Development Phase 7](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/9) | Out of scope |

A phase becomes **active** when its issues are opened; it (and its milestone)
**closes** at the end of its QA/QC pass. Both transitions follow
[The phase cycle](#the-phase-cycle) below — the single place the open/close
conditions are defined. Phases 0–3 are complete; Phase 4 is currently active.

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
the track carries no open entries. Phases 0, 1, 2, and 3 have since completed their
full cycle and Phase 4 is active (see [The phase cycle](#the-phase-cycle)).

Resolving an entry meant amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md) — the amendment, not the discussion, is
what unblocked a phase.

## Conformance audit track

Alongside the phase queue, periodic **conformance audits** check the
assembled build (code, fixtures, and docs) against the current `SPEC.md` —
including the seams between phases that no single phase's QA/QC pass
(step 4 below) owns. Findings are filed as `[audit]`-titled issues, labeled
`bug`/`task` (or `task` plus the affected package, e.g. `corpus-builder`),
deliberately carrying **no `phase:N` label** — the same reasoning the design
track (above) uses for its own labels.

**Queue rule.** `[audit]` issues are worked interleaved with the phase
queue, not queued behind it: when picking up work, compare the
lowest-numbered open `phase:N` issue against the lowest-numbered open
`[audit]` issue and take whichever number is lower. This extends the
"lowest-numbered open issue" rule [`AGENTS.md`](../AGENTS.md) §5 /
[`issue-standards.md`](issue-standards.md) already use for the phase and
design-track queues to this parallel backlog, so it stays reachable from a
cold start instead of going undiscovered.

**Status.** The `Conformance Audit 1` milestone is closed: its `[audit]`
findings (#100–#117, spanning the overlay seams §3.7/§3.8, the corpus-builder
seams §6.3, and smaller solver/protocol nits) and the `[docs]` spec amendments
they drove (#98, #99, #118) are all resolved, carrying `SPEC.md` from `0.11.0`
to `0.13.1`. No `[audit]`-titled issue is open as of this writing, so the
audit queue is currently empty — the phase queue below is the only active
backlog. The one exception is **#125**, follow-on *code* for the §0.13.0
amendment (#118 was docs-only) that its own body says "belongs in the
Conformance Audit 1 milestone" but was never assigned there or given the
`[audit]` title prefix the queue rule above keys on — filed after the
milestone's issue set was fixed, it closed with #125 outside it. Until it
picks up the `[audit]` prefix (or a second audit pass opens to absorb it),
treat it as the queue's de facto lowest-numbered `[audit]` item by the same
interleaving rule, since it is exactly the kind of cross-phase conformance gap
this track exists to catch.

## Design gates

A phase must not be declared active while an open design entry blocks it. That is
why the phase table above lists status rather than declaring a phase active: a
queue that marks a phase active is an instruction to an agent to start, and
starting is exactly what the design gates guard. No design entry blocks a phase
now, so the gate is clear — Phases 0–3 have opened on that clear gate, and Phase 4
(and each later phase) opens the same way once its predecessor finishes the cycle,
not on a further design decision.

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
