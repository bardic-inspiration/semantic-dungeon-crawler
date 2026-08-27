# Roadmap

This file tracks the phase-by-phase build order (`SPEC.md` §6): the
[development-phase table](#development-phases) is the status index, and
[The phase cycle](#the-phase-cycle) is the canonical open/close procedure —
other docs point here rather than restating either.

**Current status:** Phases 0–5 are complete (full phase cycle: opened, built,
QA/QC pass confirmed each phase's `SPEC.md` §6.x Exit criteria, milestone
closed). Phase 6 (production-alpha hardening, §6.7) is **open** — issues
[#159](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/159)–[#167](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/167)
are filed against the `Development Phase 6` milestone and ready to build. See
the table below for per-phase issue links, and
[Conformance audit track](#conformance-audit-track) for the parallel
`[audit]` queue (#125 open there). The design track that used to gate phase
openings is closed — see [Design track & gates](#design-track--gates-closed).

## Development phases

The build order is `SPEC.md` §6, Phases 0–7. Each in-scope phase has one
milestone (`Development Phase N`) that the repo owner creates and agents file the
phase's issues into; the milestone points at the spec rather than restating it.
See [`milestone-practices.md`](milestone-practices.md) for the convention.

`SPEC.md` §6.x is the source of truth for each phase's Entry / Build / Exit
criteria — this table is a status index, not a second copy of them.

| Phase | Deliverable | SPEC | Milestone | Status |
|---|---|---|---|---|
| 0 | Repository scaffold — workspaces, `tsconfig.base.json`, empty packages | §6.1 | [Development Phase 0](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/2) | **Complete** — closes [#49](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/49), [#50](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/50) |
| 1 | `packages/schema` — Section 3 types + CHANGELOG + example fixture | §6.2 | [Development Phase 1](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/3) | **Complete** — issues [#54](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/54)–[#58](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/58) merged in [#59](https://github.com/bardic-inspiration/semantic-dungeon-crawler/pull/59) |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 | [Development Phase 2](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/4) | **Complete** — issues [#60](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/60)–[#69](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/69) merged |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 | [Development Phase 3](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/5) | **Complete** — issues [#71](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/71)–[#76](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/76) merged |
| 4 | `packages/server` + `packages/client-cli` + conformance fixtures | §6.5 | [Development Phase 4](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/6) | **Complete** — issues [#85](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/85)–[#92](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/92) merged |
| 5 | `packages/client-threejs` — reference renderer | §6.6 | [Development Phase 5](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/7) | **Complete** — issues [#148](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/148)–[#152](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/152) merged |
| 6 | Production-alpha hardening + README playable path | §6.7 | [Development Phase 6](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/8) | **Open** — issues [#159](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/159)–[#167](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/167) filed, assigned to the milestone; build in progress |
| 7+ | Post-alpha (rule editor, other adapters, persistence) — out of scope | §6.8 | [Development Phase 7](https://github.com/bardic-inspiration/semantic-dungeon-crawler/milestone/9) | Out of scope |

A phase becomes **active** when its issues are opened; it (and its milestone)
**closes** at the end of its QA/QC pass — see
[The phase cycle](#the-phase-cycle). A completed phase's QA/QC-pass record
(the Exit checklist walked and confirmed) lives in the PR that closed the
phase's last issue, per that section's step 4 — not duplicated here.

## Conformance audit track

Alongside the phase queue, periodic **conformance audits** check the
assembled build (code, fixtures, docs) against the current `SPEC.md`,
including seams between phases that no single phase's QA/QC pass owns.
Findings are filed as `[audit]`-titled issues (`bug`/`task` labels, no
`phase:N` label).

**Queue rule.** `[audit]` issues run interleaved with the phase queue, not
behind it: compare the lowest-numbered open `phase:N` issue against the
lowest-numbered open `[audit]` issue and take whichever is lower — the same
"lowest-numbered open issue" rule ([`issue-standards.md`](issue-standards.md))
extended to this backlog.

**Status.** `Conformance Audit 1` is closed — its findings (#100–#117) and the
spec amendments they drove (#98, #99, #118) are resolved, carrying `SPEC.md`
to `0.13.1`. No `[audit]`-titled issue is open. **Exception:** #125 is
follow-on code work from that pass that never picked up the `[audit]` prefix
or milestone assignment its own body calls for — until it does (or a new audit
absorbs it), treat it as the queue's de facto lowest-numbered `[audit]` item.

## Design track & gates (closed)

Spec refinement ran as `design`/`spec-revision`/`needs-discussion` issues,
deliberately carrying no `phase:N` label — index:
[`docs/design/open-scope.md`](design/open-scope.md). While open, this was the
active queue whenever no phase was: lowest-numbered open `design` issue with
resolved dependencies, one tier at a time (A → B → C) — the same routing
[`AGENTS.md`](../AGENTS.md) §5 and [`issue-standards.md`](issue-standards.md)
still describe for reference. All tiers are resolved and `open-scope.md` is
`status: closed`, so the track carries no open entries and no open design
issue blocks any phase — the gate that used to hold a phase from opening
until its design entries cleared is moot for every phase opened so far.
Resolving an entry meant amending `SPEC.md` per
[`spec-guidelines.md`](spec-guidelines.md).

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
   blocks this phase ([Design track & gates](#design-track--gates-closed) above).
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

