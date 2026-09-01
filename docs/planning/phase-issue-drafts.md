# Phase 1–6 Issue Drafts

Pre-written build-task issues for Phases 1 through 6, sized one-per-PR and
mapped to their `SPEC.md` §6.x **Build** lists. This is a **planning artifact,
not the tracker**: nothing here is an open issue yet.

## How to use this document

- **Opening is still one phase at a time.** Per
  [`roadmap.md`](../roadmap.md) "The phase cycle" and [`AGENTS.md`](../../AGENTS.md)
  §4, a phase is opened only once the previous phase has finished its cycle — its
  `SPEC.md` §6.x **Exit** criteria confirmed by the phase's comprehensive QA/QC
  pass, which is what closes its milestone. These drafts are staged in advance so
  the slicing is reviewable up front; they do **not** authorize opening Phase 2+
  before Phase 1 closes.
- **When you open a phase**, copy each draft below into a new issue using the
  [Feature / build task](../../.github/ISSUE_TEMPLATE/feature_task.md) template,
  label it `phase:N` + `task`, and assign it to the `Development Phase N`
  milestone (owner-created — [`milestone-practices.md`](../milestone-practices.md)).
- **The draft IDs (`1.1`, `2.3`, …) are not issue numbers.** They exist only to
  express intra-phase ordering and the "Depends on" links here. Real GitHub issue
  numbers are assigned at open time; rewrite the dependency references then, the
  way `#50` references `#49`.
- **These are drafts, not scope law.** `SPEC.md` §6.x is the source of truth; if a
  draft and the spec disagree, the spec wins and the draft should be corrected
  (or split/merged) when the phase is opened. Acceptance criteria are written as
  the pre-TDD failing tests ([`issue-standards.md`](../issue-standards.md)).

Invariants `INV-1`..`INV-5` ([`AGENTS.md`](../../AGENTS.md) §2) hold across every
issue below regardless of phase and are not restated per-issue except where a
task's acceptance criteria test one directly.

---

## Phase 1 — Schema Implementation (`SPEC.md` §6.2)

**Opened and complete.** This section originally staged drafts 1.1–1.5 for
review before Phase 1 opened. That purpose is fully served now: the drafts
were sliced into real issues
[#54](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/54)–[#58](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/58),
merged in
[#59](https://github.com/bardic-inspiration/semantic-dungeon-crawler/pull/59),
and the phase's QA/QC pass confirmed §6.2 Exit criteria hold
([`roadmap.md`](../roadmap.md)). See the linked issues and PR for what
actually shipped rather than the superseded draft text.

## Phase 2 — Corpus Builder (`SPEC.md` §6.3)

**Opened and complete.** This section originally staged drafts 2.1–2.9 for
review before Phase 2 opened. That purpose is fully served now: the drafts
were sliced into real issues
[#60](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/60)–[#69](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/69),
merged, and the phase's QA/QC pass confirmed §6.3 Exit criteria hold
([`roadmap.md`](../roadmap.md)). See the linked issues for what actually
shipped rather than the superseded draft text.

## Phase 3 — Rule Engine (`SPEC.md` §6.4)

**Opened and complete.** This section originally staged drafts 3.1–3.5 for
review before Phase 3 opened. That purpose is fully served now: the drafts
were sliced into real issues
[#71](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/71)–[#76](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/76),
merged, and the phase's QA/QC pass confirmed §6.4 Exit criteria hold
([`roadmap.md`](../roadmap.md)). See the linked issues for what actually
shipped rather than the superseded draft text.

## Phase 4 — Server + Terminal Client + Conformance Fixtures (`SPEC.md` §6.5)

**Opened and complete.** This section originally staged drafts 4.1–4.7 for
review before Phase 4 opened. That purpose is fully served now: the drafts
were sliced into real issues
[#85](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/85)–[#92](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/92),
merged, and the phase's QA/QC pass confirmed §6.5 Exit criteria hold
([`roadmap.md`](../roadmap.md)). See the linked issues for what actually
shipped rather than the superseded draft text.

## Phase 5 — Three.js Reference Client (`SPEC.md` §6.6)

**Opened and complete.** This section originally staged drafts 5.1–5.5 for
review before Phase 5 opened. That purpose is fully served now: the drafts
were sliced into real issues
[#148](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/148)–[#152](https://github.com/bardic-inspiration/semantic-dungeon-crawler/issues/152),
merged, and the phase's QA/QC pass confirmed §6.6 Exit criteria hold
([`roadmap.md`](../roadmap.md)). See the linked issues for what actually
shipped rather than the superseded draft text.

---

## Phase 6 — Production Alpha Hardening (`SPEC.md` §6.7)

**Not new features** — hardening of the existing surface, plus the §0.11.0 C1/C3/C4
operational bounds. The exit bar is a clean-room playable path from `README.md`.

Milestone: `Development Phase 6`. Entry: Phase 5 complete; the end-to-end loop
(corpus → graph → server → client → interactive movement) works.

### 6.1 — Error handling at every protocol boundary

**Goal**

Add graceful error handling at each protocol boundary: malformed ruleset, missing
session, and client-side network failure.

**Spec reference**

`SPEC.md` §6.7 (error handling), §4.1/§4.3 (`INV-4`: malformed vs. incoherent),
§5.1 (protocol).

**Acceptance criteria**

- [ ] A malformed ruleset is rejected with a clear well-formedness error — an
      *incoherent* (but well-formed) ruleset still runs (`INV-4`).
- [ ] A request against a missing/expired session returns a defined error, not a
      crash.
- [ ] The client surfaces a network failure gracefully (no unhandled rejection).

**Fixtures / cases**

Malformed-ruleset request; missing-session request; simulated client network
failure.

**Out of scope**

- New endpoints/features; auth (§6.8 / not an auth system, §5.1).

Depends on Phase 5 complete.

### 6.2 — Uniform `Logger`/`Metrics`/debug-flag wiring across all packages

**Goal**

Reconcile logging, metrics, and debug-flag wiring to the §2.1 interfaces uniformly
across every package.

**Spec reference**

`SPEC.md` §6.7 (logging/metrics/debug across all packages), §2.1, §4.6.

**Acceptance criteria**

- [ ] Every package emits through the structured §2.1 `Logger`/`Metrics`
      interfaces — one mechanism, not per-package variants.
- [ ] Debug-gated trace/log verbosity is consistent across packages (off by
      default, zero overhead when off — §4.6).

**Fixtures / cases**

A cross-package smoke test asserting the shared interfaces are used at each
boundary.

**Out of scope**

- New telemetry backends / production observability infra (§6.8).

Depends on 6.1.

### 6.3 — C3 trust-model bounds (localhost bind, session eviction, body-size cap)

**Goal**

Add the §0.11.0 C3 hardening bounds — not an auth system.

**Spec reference**

`SPEC.md` §6.7 (§0.11.0 C3), §5.1 (trust model), `docs/design/0005-c-series-resolution.md`.

**Acceptance criteria**

- [ ] The server binds to **localhost by default**.
- [ ] Session count is **bounded** with **idle-TTL eviction** (an evicted session's
      later request returns the defined missing-session error from 6.1).
- [ ] A **request body-size cap** rejects oversized bodies with a defined error.

**Fixtures / cases**

An eviction test (session past its idle TTL); an oversized-body rejection; a
default-bind assertion.

**Out of scope**

- Authentication, TLS, multiplayer (§6.8).

Depends on 6.1.

### 6.4 — C1 operational budget tuning

**Goal**

Tune the §0.11.0 C1 reference budget against a real corpus run.

**Spec reference**

`SPEC.md` §6.7 (§0.11.0 C1), §4.4 (`MAX_ROOM_OBJECTS`), §7.

**Acceptance criteria**

- [ ] `MAX_ROOM_OBJECTS` is set to the C1 reference value (or its deviation
      recorded with rationale).
- [ ] Move-resolution p95 is measured and **< ~200 ms** on the reference corpus
      (~10–50 docs, single-digit concurrency) — or the deviation is recorded.
- [ ] The measurement is repeatable/headless (reuses `Metrics`, 6.2).

**Fixtures / cases**

A p95 move-resolution measurement over the reference corpus run (6.5).

**Out of scope**

- A real ANN index / large-scale performance work (§6.8; C1 threshold only).

Depends on 6.2, 6.5.

### 6.5 — First real corpus run + `corpus-builder eval` (C4) recorded

**Goal**

Do a first real (non-fixture), author-selected corpus run end-to-end and record a
`corpus-builder eval` result — the repeatable complement to hand-sanity-checking.

**Spec reference**

`SPEC.md` §6.7 (first real corpus run; §0.11.0 C4 eval recorded), §6.3 (`eval`).

**Acceptance criteria**

- [ ] A small, author-selected real corpus builds end-to-end (corpus → graph →
      server → client) and is sanity-checkable by hand.
- [ ] `corpus-builder eval` is run against it and its result is **recorded** in the
      repo (the headless complement to the manual check).

**Fixtures / cases**

The recorded `eval` output for the real corpus run.

**Out of scope**

- Shipping a large production corpus; corpus curation tooling (§6.8).

Depends on Phase 5 complete.

### 6.6 — Spec / `GRAPH_FORMAT.md` reconciliation + schema CHANGELOG

**Goal**

Reconcile `GRAPH_FORMAT.md` and `SPEC.md` §3–5 with any drift discovered during
Phases 2–5, updating `packages/schema/CHANGELOG.md` per `INV-5`.

**Spec reference**

`SPEC.md` §6.7 (reconciliation), §3.5 (versioning), `AGENTS.md` §2 `INV-5`.

**Acceptance criteria**

- [ ] `GRAPH_FORMAT.md` matches the `graph.json` actually produced by Phase 2's
      builder as of this point.
- [ ] Any `SPEC.md` §3–5 drift found during Phases 2–5 is reconciled (spec amended
      per `spec-guidelines.md`, or code corrected — not left divergent).
- [ ] Any schema surface change carries a `packages/schema/CHANGELOG.md` entry in
      the same commit (`INV-5`).

**Fixtures / cases**

N/A beyond the existing suites remaining green after reconciliation (docs + any
schema-version bump).

**Out of scope**

- New schema features (this is reconciliation, not extension).

Depends on 6.1.

### 6.7 — `README.md` playable path + minimal deployment doc (the alpha bar)

**Goal**

Write the `README.md` clean-room playable path and the minimal deployment doc that
constitute the production-alpha exit bar.

**Spec reference**

`SPEC.md` §6.7 Exit (a person other than the builder can clone → build → serve →
play following only `README.md`), §7 (production infra out of scope).

**Acceptance criteria**

- [ ] `README.md` documents, with no undocumented steps: clone → run the build
      pipeline against a provided sample corpus → start the server → open the
      client → play a session start-to-finish.
- [ ] A minimal deployment path is documented (even "run server locally + open
      client" for alpha).
- [ ] The path is validated by someone/something other than the original author
      following only the README (the production-alpha bar).

**Fixtures / cases**

A clean-room run-through of the README steps (fresh clone) reaching a playable
session.

**Out of scope**

- Production infrastructure, hosting, CI/CD deploy (§7 / §6.8).

Depends on 6.1, 6.3, 6.4, 6.5, 6.6.

**Phase 6 Exit (SPEC §6.7):** a non-original-builder can clone → build against a
sample corpus → start the server → open the client → play a full session following
only `README.md`; the C1 budget is met or deviations recorded; C3 eviction/body-size
bounds are in place; a `corpus-builder eval` (C4) result is recorded.

---

## Coverage check against `SPEC.md` §6

| Phase | SPEC | Drafts | Milestone |
|---|---|---|---|
| 1 | §6.2 | 1.1–1.5 | Development Phase 1 |
| 2 | §6.3 | 2.1–2.9 | Development Phase 2 |
| 3 | §6.4 | 3.1–3.5 | Development Phase 3 |
| 4 | §6.5 | 4.1–4.7 | Development Phase 4 |
| 5 | §6.6 | 5.1–5.5 | Development Phase 5 |
| 6 | §6.7 | 6.1–6.7 | Development Phase 6 |

Phase 7+ (§6.8) is explicitly post-alpha and gets no drafts here — it carries no
`phase:N` queue until something in it is deliberately scoped into the build order
([`milestone-practices.md`](../milestone-practices.md)).
