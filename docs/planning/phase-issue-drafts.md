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

---

## Phase 4 — Server + Terminal Client + Conformance Fixtures (`SPEC.md` §6.5)

Server implements the REST API exactly and calls `rule-engine` for all resolution
(no rule logic in the server). `client-cli` is the first conformance-validated
adapter. `INV-3`: neither client imports `rule-engine`/`corpus-builder`.

Milestone: `Development Phase 4`. Entry: Phase 3 complete.

### 4.1 — Server scaffold, session management, session/room endpoints

**Goal**

Stand up `packages/server` with in-memory session management and the
`GET /session/new` + `GET /room/current` endpoints per §5.1.

**Spec reference**

`SPEC.md` §5.1 (REST API), §6.5 (in-memory sessions acceptable for alpha).

**Acceptance criteria**

- [ ] `GET /session/new` creates a session (in-memory) and returns a session
      handle; `GET /room/current` returns a schema-valid `ResolvedRoomResponse`.
- [ ] The server calls `rule-engine` for resolution and contains **no** rule logic
      itself.
- [ ] Responses validate against the Phase 1 schema types.
- [ ] The server imports no rendering library (`INV-1`) and sends only resolved
      JSON (`INV-3`).

**Fixtures / cases**

A session-new → room-current happy path; a schema-validation assertion on the
response.

**Out of scope**

- `/interact` (4.2); debug endpoint (4.3); durable session storage (post-alpha, §7).

Depends on Phase 3 complete.

### 4.2 — `/interact` endpoint wired to move resolution

**Goal**

Implement the interaction/move endpoint (§5.1), routing to `rule-engine`
`resolveMove` and returning the resulting room + `InteractionResult`.

**Spec reference**

`SPEC.md` §5.1 (REST API — interact), §3.3 (`InteractionResult`), §4.1
(`resolveMove`).

**Acceptance criteria**

- [ ] `POST /interact` accepts a move request (§3.3), resolves via `rule-engine`,
      and returns a schema-valid `ResolvedRoomResponse` + `InteractionResult`.
- [ ] A room transition is observable: interacting with an `enter`/`traverse`
      affordance yields a different resolved room.
- [ ] Determinism holds through the endpoint: same session seed + input log ⇒
      identical responses (`INV-2`).

**Fixtures / cases**

An interact call producing a transition; a replay-equality assertion.

**Out of scope**

- Debug endpoint (4.3); client rendering (4.6).

Depends on 4.1.

### 4.3 — `Logger`/`Metrics` wiring + `GET /debug/trace` gate

**Goal**

Wire the §2.1 `Logger`/`Metrics` interfaces into the server and expose the
flag-gated `GET /debug/trace`.

**Spec reference**

`SPEC.md` §5.1 (`GET /debug/trace`), §2.1 (`Logger`/`Metrics`), §4.6 (debug flag).

**Acceptance criteria**

- [ ] `Logger`/`Metrics` are wired at request boundaries (same interfaces
      corpus-builder uses — not a parallel mechanism).
- [ ] `GET /debug/trace` returns a `DebugTrace` only when server debug mode is on;
      it is absent/denied when off (zero overhead off, §4.6).

**Fixtures / cases**

A debug-on request returning a trace; a debug-off request that does not.

**Out of scope**

- Client-side trace display (4.6).

Depends on 4.2.

### 4.4 — Conformance room fixtures + round-trip validation test

**Goal**

Curate `fixtures/rooms/*.json` (~10 engine-agnostic `ResolvedRoomResponse`
payloads) and an automated round-trip validation test.

**Spec reference**

`SPEC.md` §6.5 (fixtures/rooms, round-trip test), §5.3 (Conformance), §3.2.

**Acceptance criteria**

- [ ] ~10 hand-curated `fixtures/rooms/*.json` spanning archetype variety — at
      minimum: one `container` with 5+ objects, one near-empty room, one
      all-soft-weighted population, one exercising `portal`.
- [ ] An automated test round-trips each fixture ruleset through the server and
      asserts the response validates against `ResolvedRoomResponse`.
- [ ] Fixtures are engine-agnostic — no Three.js-specific assumptions baked in
      (§5.3).

**Fixtures / cases**

The `fixtures/rooms/*.json` set itself; the round-trip validation test.

**Out of scope**

- Renderer-specific content (Phase 5 must consume these unchanged).

Depends on 4.1.

### 4.5 — Conformance ruleset fixtures

**Goal**

Add `fixtures/rulesets/*` bundles as structured data exercising the resolution
paths, including the deliberately messy multi-layer conflict.

**Spec reference**

`SPEC.md` §6.5 (fixtures/rulesets), §4.3 (messy-resolution path), §0.9.0 A11
(`.json`/`.yaml`, `.dsl` retired).

**Acceptance criteria**

- [ ] At minimum: a null ruleset, a single-global-layer ruleset, and a
      multi-layer-with-conflict ruleset (exercises §4.3's messy-resolution path
      deliberately).
- [ ] Bundles are structured data (`.json`/`.yaml`), not `.dsl`.
- [ ] Each is referenced by the 4.4 round-trip test (drives a server session and
      validates the response).

**Fixtures / cases**

The three ruleset bundles above.

**Out of scope**

- New engine behavior — these exercise Phase 3's engine, not extend it.

Depends on 4.4.

### 4.6 — `client-cli` terminal REPL

**Goal**

Implement `packages/client-cli` (§5.4): render rooms, drive a live server session
end-to-end, and surface `Logger`/`Metrics`/`DebugTrace` at `--verbosity=debug`.

**Spec reference**

`SPEC.md` §5.4 (Terminal Reference Client), §5.3 (Conformance), §6.5.

**Acceptance criteria**

- [ ] `client-cli` renders **all** `fixtures/rooms/*.json` without error (§5.3
      conformance, exercised here first).
- [ ] It drives a live server session end-to-end through its REPL (session → room →
      interact → transition).
- [ ] A `--verbosity=debug` run prints `DebugTrace` output when server debug mode
      is on.
- [ ] It sends only resolved JSON to the display and never imports engine internals
      (`INV-3`; enforced by 4.7).

**Fixtures / cases**

A fixture-render pass over all rooms; a live end-to-end REPL session.

**Out of scope**

- Graphical rendering (Phase 5). The import-boundary ESLint rule (4.7).

Depends on 4.2, 4.4.

### 4.7 — `INV-3` import-boundary ESLint rule for `client-cli`

**Goal**

Add the real ESLint import-boundary rule forbidding `client-cli` from importing
`rule-engine`/`corpus-builder`, so `INV-3` is enforced from the first client.

**Spec reference**

`SPEC.md` §6.5, `AGENTS.md` §2 `INV-3` (the boundary is a real ESLint rule, not a
convention).

**Acceptance criteria**

- [ ] An ESLint rule fails the build if any file in `packages/client-cli/src/`
      imports from `packages/rule-engine` or `packages/corpus-builder` (directly or
      transitively).
- [ ] A test/fixture import violation is caught by `npm run lint`.
- [ ] The rule is structured so Phase 5 can extend it to `client-threejs` (5.5)
      without duplication.

**Fixtures / cases**

A deliberately-violating import (in a lint fixture) that the rule flags.

**Out of scope**

- `client-threejs` coverage (Phase 5, 5.5).

Depends on 4.6.

**Phase 4 Exit (SPEC §6.5):** all §5.1 endpoints return schema-valid payloads;
`fixtures/` populated and round-tripped by an automated test; fixtures
engine-agnostic; `client-cli` renders all room fixtures and drives a live session
(incl. `--verbosity=debug`); no `client-cli` file imports `rule-engine`/
`corpus-builder` (ESLint-enforced).

---

## Phase 5 — Three.js Reference Client (`SPEC.md` §6.6)

The first graphical adapter. Consumes resolved JSON only (`INV-3`); reuses the
Phase 4 fixtures for conformance.

Milestone: `Development Phase 5`. Entry: Phase 4 complete.

### 5.1 — Client scaffold + ECS mapping, render a `ResolvedRoomResponse`

**Goal**

Stand up `packages/client-threejs` with the §5.2 ECS mapping
(`LayoutSystem`/`MeshResolutionSystem`) and render a room + objects from a single
`ResolvedRoomResponse`.

**Spec reference**

`SPEC.md` §5.2 (ECS Mapping — Three.js adapter), §6.6.

**Acceptance criteria**

- [ ] `LayoutSystem` and `MeshResolutionSystem` map a `ResolvedRoomResponse` to a
      rendered scene (room + objects).
- [ ] Rendering consumes only resolved JSON — no import of `rule-engine`/
      `corpus-builder` (`INV-3`, enforced by 5.5).
- [ ] A single hand-fed `ResolvedRoomResponse` renders without error.

**Fixtures / cases**

One `fixtures/rooms/*.json` rendered offline (server bypassed).

**Out of scope**

- Live server bootstrap (5.2); interaction (5.3).

Depends on Phase 4 complete.

### 5.2 — Session bootstrap: `session/new` → `room/current` → render

**Goal**

Load a live session and render the current room against the Phase 4 server.

**Spec reference**

`SPEC.md` §6.6 (minimum viable scene), §5.1 (endpoints), §5.2.

**Acceptance criteria**

- [ ] The client calls `GET /session/new` then `GET /room/current` and renders the
      returned room via the 5.1 systems.
- [ ] Rendered content matches the `ResolvedRoomResponse` payload (room + objects).

**Fixtures / cases**

A live session bootstrap against the Phase 4 server rendering a room.

**Out of scope**

- Click interaction / transitions (5.3).

Depends on 5.1.

### 5.3 — Click interaction → `POST /interact` → re-render (room transition)

**Goal**

Capture one click interaction, POST it, and re-render the resulting room —
completing the minimum viable movement loop.

**Spec reference**

`SPEC.md` §6.6 (capture click → `POST /interact` → re-render), §5.1, §5.2.

**Acceptance criteria**

- [ ] A player can click an object carrying an `enter`/`traverse` affordance.
- [ ] The click issues `POST /interact` and the client re-renders, showing a room
      transition (new objects render, matching a fresh `ResolvedRoomResponse`).
- [ ] The end-to-end loop (render → click → transition) works against the Phase 4
      server.

**Fixtures / cases**

An end-to-end click-to-transition run against the live server.

**Out of scope**

- Rich UI, non-`enter`/`traverse` affordances beyond the minimum viable loop.

Depends on 5.2.

### 5.4 — Direct-fixture conformance render

**Goal**

Render all `fixtures/rooms/*.json` directly (server bypassed) — the §5.3
conformance check for the graphical adapter.

**Spec reference**

`SPEC.md` §6.6 (renders all room fixtures pointed directly), §5.3 (Conformance).

**Acceptance criteria**

- [ ] The client renders every `fixtures/rooms/*.json` without error when pointed
      at them directly (server bypassed).
- [ ] This repeats, for the graphical adapter, the conformance `client-cli`
      exercised in Phase 4 — same fixtures, no Three.js-specific fixture changes.

**Fixtures / cases**

A batch render over all `fixtures/rooms/*.json`.

**Out of scope**

- New fixtures — reuse the Phase 4 set unchanged.

Depends on 5.1.

### 5.5 — Extend the `INV-3` import-boundary rule to `client-threejs`

**Goal**

Extend the Phase 4 ESLint import-boundary rule (4.7) to `client-threejs` so
`INV-3` holds permanently across both reference adapters.

**Spec reference**

`SPEC.md` §6.6, `AGENTS.md` §2 `INV-3`.

**Acceptance criteria**

- [ ] The ESLint rule fails the build if any file in
      `packages/client-threejs/src/` imports from `packages/rule-engine` or
      `packages/corpus-builder`.
- [ ] The rule reuses the 4.7 mechanism (extended coverage, not a second parallel
      rule).
- [ ] A violating import (lint fixture) is flagged by `npm run lint`.

**Fixtures / cases**

A deliberately-violating import that the rule flags.

**Out of scope**

- Any new engine/client behavior.

Depends on 5.1, 4.7.

**Phase 5 Exit (SPEC §6.6):** against the Phase 4 server a player sees a rendered
room, clicks an `enter`/`traverse` object, and observes a transition; the client
renders all `fixtures/rooms/*.json` directly; no `client-threejs` file imports
`rule-engine`/`corpus-builder` (ESLint-enforced).

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
