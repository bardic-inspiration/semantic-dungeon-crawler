# AGENTS.md — Canonical Guide for AI Coding Agents

This is the **authoritative guide** for any agent working in this repository. If
another doc disagrees with this one, this one wins — except that
[`SPEC.md`](SPEC.md) is the source of truth for *what to build*; this file is the
source of truth for *how to work*.

This build is delegated to memoryless, scheduled cold-start sessions, each
claiming one build-order issue. Read order for a cold start: **this file → the
SPEC section your issue references → your issue's acceptance criteria.** Do not
range ahead into later build steps.

---

## 1. Purpose & scope

The project is an **authoring engine for semantic-space games** (SPEC §1) — an
engine, not a single game. It ships two deliverables:

- A **deterministic, headless backend**: corpus → embedding → substrate index →
  rule solver → resolved JSON, exposed over a REST API any frontend can be built
  against (SPEC §2, §5.1). The build artifact keeps the filename `graph.json`,
  but it is a substrate index, not a node/edge graph (SPEC §0.8.0, D1).
- A **Three.js reference client** — the first of potentially several graphical
  adapters — that renders the resolved JSON and nothing else, plus a **terminal
  reference client** (`client-cli`) for testing without a frontend at all
  (SPEC §5.2, §5.4).

The default zero-rules behavior is **relativistic drift** (nearest-neighbor
movement in embedding space) — a valid mode, not a fallback.

## 2. Hard rules (non-negotiable — SPEC invariants)

These hold at **every phase boundary**. A change that violates one is wrong even
if it passes tests.

- **`INV-1` — Pure engine.** The traversal/rule engine never imports a rendering
  library. It is headless and testable with no client attached. (SPEC §2, §4)
- **`INV-2` — Determinism.** A session is fully reproducible from
  `(seed, ruleset-file, input-log)`. No wall-clock, no unseeded randomness in
  backend logic. Same inputs ⇒ **byte-identical** output. (SPEC §4.5) Under the
  §0.8.0 three-tier model this is a *replay* guarantee: substrate queries
  (Tier 2) are stochastic across seeds by design, but seeded from
  `(session_seed, normalized_query)` (position carried by the query;
  `turn_count` is not a seed component — SPEC §0.13.0), so replaying one input-log still
  reproduces byte-identical output; overlay state (Tier 3) is deterministic
  outright. (SPEC §3.7, §4.5)
- **`INV-3` — Client sees only resolved JSON.** The client never receives the
  graph, embeddings, or rule definitions — only `ResolvedRoomResponse` (SPEC §3.2).
  `packages/client-threejs` and `packages/client-cli` must not import
  `packages/rule-engine` or `packages/corpus-builder`. (SPEC §5.2, §5.4, §6.5, §6.6)
  **§0.9.0 refinement (issues #15/#24):** "resolved output" explicitly includes an
  entity's `prose` + `source_span` positional metadata (SPEC §3.1) and overlay
  registry **names/labels** of player-provenance entries (SPEC §3.7, §5.1). Still
  hidden: embeddings, the ANN index, rule definitions, internal ids, raw snapshot
  payloads. The line is *resolved output vs. engine internals*, not *text vs.
  no-text*. See `docs/design/0003-a-series-resolution.md`.
- **`INV-4` — No taste-policing.** The engine validates *well-formedness*, not
  *coherence*. Contradictory or "bad" rulesets are legal and must run, not be
  rejected or auto-corrected. The solver must not throw on conflicting hard
  decisions. (SPEC §4.1, §4.3)
- **`INV-5` — Everything versioned.** Every schema/protocol surface is versioned
  (SPEC §3.5). Breaking changes require a version bump **and** a
  `packages/schema/CHANGELOG.md` entry in the same commit — never silent mutation.

> The invariants above are stable, timeless statements. The two easiest to break
> by accident — **`INV-2` (determinism)** and **`INV-3` (the import boundary)** —
> carry concrete, churn-prone mechanics (the seed-derivation formula, which
> ESLint rule enforces the boundary and which phase added it). Those live in
> [`docs/invariant-notes.md`](docs/invariant-notes.md), kept out of this section
> so a phase update revises the mechanics without diffing the constitution — read
> it before touching determinism or a client's imports.

## 3. Repo layout (target — SPEC §2, §6.1)

```
/
├── SPEC.md                     # source of truth
├── package.json                # npm workspaces root
├── tsconfig.base.json
├── packages/
│   ├── schema/                 # Section 3 types — built first, imported by all
│   ├── corpus-builder/         # build-time pipeline (Phase 2)
│   ├── rule-engine/            # parser + solver (Phase 3)
│   ├── server/                 # HTTP/WS contract (Phase 4)
│   ├── client-cli/             # terminal reference client, testing interface (Phase 4)
│   ├── client-threejs/         # reference renderer (Phase 5)
│   └── rule-editor/            # visual authoring (Phase 7+, post-alpha)
├── fixtures/                   # conformance data (SPEC §6.5)
└── docs/                       # roadmap + standards
```

Not all of this exists yet — it is created phase by phase. Build only what your
issue's phase calls for.

## 4. Build order (SPEC §6)

Work proceeds Phase 0 → 7. **Do not start phase N+1 until phase N's Exit criteria
are all met** — verified by that phase's comprehensive **QA/QC pass**, the gate
that closes its milestone ([`docs/roadmap.md`](docs/roadmap.md) "The phase
cycle"). Each phase's Entry/Build/Exit conditions are in `SPEC.md` §6.1–§6.8.

The phase → deliverable → SPEC-section plan **and** live build status — which
phase is active, the status of each phase's issues, the design-track gate, and
the conformance-audit track — both live in
[`docs/roadmap.md`](docs/roadmap.md)'s
[development-phases table](docs/roadmap.md#development-phases). That is the single
place the grid lives; consult it rather than a copy here.

Each phase is also tracked by a `Development Phase N` milestone — the repo owner
creates it, agents assign the phase's issues to it, and its description points at
the SPEC section rather than restating it
([`docs/milestone-practices.md`](docs/milestone-practices.md)).

**When no phase is active**, the queue is the design track rather than a `phase:N`
queue, and §5 step 1 has the mechanics for picking the next design issue.
[`docs/roadmap.md`](docs/roadmap.md) "Design track & gates" records the live state
of that gate.

## 5. Working loop (do this for every issue)

See [`docs/issue-standards.md`](docs/issue-standards.md) for the full contract
on picking up, filing, scoping, and closing issues — including how to handle
open questions or follow-on work that surfaces mid-issue. Summary:

1. **Take one issue.** When a phase is active, pick the lowest-numbered open issue
   labeled with that phase (`phase:0`, then `phase:1`, …). **When no phase is
   active** (§4's design-track gate), **the queue is the
   design track**: pick
   the lowest-numbered open `design` issue whose dependencies are resolved
   (the tier ordering and "Depends on" links in
   [`docs/design/open-scope.md`](docs/design/open-scope.md)), resolving **one tier
   at a time (A → B → C)**. Scope your work to that issue only — implement its
   acceptance criteria, nothing else, even if you notice other build-order work
   that seems related.
2. **Read the spec.** Read the SPEC section the issue references before touching
   code. The acceptance criteria are your pre-written failing tests.
3. **TDD, always.** Write a failing Vitest test first (red), then the minimal code
   to pass (green), then refactor. Per behavior, not per module. See
   [`docs/testing-standards.md`](docs/testing-standards.md).
4. **Gate before commit.** `npm run lint && npm run typecheck && npm test` must be
   green. CI runs the same and must pass before merge.
5. **Commit atomically.** Conventional Commits format; one logical change per
   commit; tests + implementation together. See
   [`docs/commit-standards.md`](docs/commit-standards.md). If you touch
   `packages/schema/src/*`, append a `packages/schema/CHANGELOG.md` entry in the
   **same** commit (`INV-5`).
6. **One issue per PR.** When a session's work is ready, open the PR — the build
   advances on memoryless, scheduled cold starts, so finishing work must reliably
   produce a PR; nobody is watching to ask for one. (Exception: you're explicitly
   told not to.) Fill in the PR template; link the issue with `Closes #N`. Linear
   history — rebase, don't merge (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

Changing only Markdown (`SPEC.md`, docs, `AGENTS.md`, etc.) — no code? Steps
3–4 don't apply; use the leaner path in
[`docs/docs-only-changes.md`](docs/docs-only-changes.md) instead.

### Protocol docs — read when

The working loop above and §6 route to a set of standards docs. Read each when
its trigger fires — you don't need all of them for every issue:

| Read | When |
|---|---|
| [`docs/issue-standards.md`](docs/issue-standards.md) | Picking up, filing, scoping, or closing an issue; something out of scope surfaces mid-work. |
| [`docs/testing-standards.md`](docs/testing-standards.md) | Writing the failing test (step 3) — test structure, determinism / `evaluateLayers` cases. |
| [`docs/commit-standards.md`](docs/commit-standards.md) | Writing a commit message (step 5) — Conventional Commits format. |
| [`docs/naming-conventions.md`](docs/naming-conventions.md) | Naming any identifier, file, package, or wire field. |
| [`docs/config-conventions.md`](docs/config-conventions.md) | Adding or selecting a swappable component (embedding provider, `Logger`, `Metrics`). |
| [`docs/milestone-practices.md`](docs/milestone-practices.md) | Assigning an issue to a `Development Phase N` milestone. |
| [`docs/roadmap.md`](docs/roadmap.md) | Checking phase status, or the phase-cycle open/close procedure (step 1, §4). |
| [`docs/docs-only-changes.md`](docs/docs-only-changes.md) | Your change touches only Markdown — no code (skips steps 3–4). |
| [`docs/invariant-notes.md`](docs/invariant-notes.md) | Upholding `INV-2` / `INV-3` — seed derivation, import-boundary ESLint mechanics (§2). |
| [`docs/scope-discipline.md`](docs/scope-discipline.md) | Tempted to fold in adjacent work — why each PR stays tight to its issue (§7). |
| [`docs/doc-audit.md`](docs/doc-audit.md) | The docs are living artifacts — reconciling the set for staleness/consistency. |
| [`docs/documentation-standards.md`](docs/documentation-standards.md) | Writing or editing any doc — source-of-truth, keep-in-sync, structure/routing, and style rules. |
| [`docs/spec-guidelines.md`](docs/spec-guidelines.md) | Amending `SPEC.md` — versioning and invariant care. |

## 6. Toolchain

- **npm workspaces** — package manager and monorepo linking.
- **Vitest** — test runner. Determinism tests (`INV-2`) and the
  `evaluateLayers` function-identity test (SPEC §4.4) are required where the
  phase calls for them.
- **ESLint + Prettier** — lint and format. The `INV-3` import-boundary rule is a
  real ESLint rule (added Phase 4 for `client-cli`, SPEC §6.5; extended to
  `client-threejs` in Phase 5, SPEC §6.6), not a convention.
- **`tsc --noEmit`** — typecheck across packages.
- **Naming** — [`docs/naming-conventions.md`](docs/naming-conventions.md) is
  authoritative for identifier, file, package, and wire-field casing. SPEC.md
  pseudocode function names (`resolveMove`, `evaluateLayers`) are literal
  required identifiers, not illustrative — implement them verbatim.
- **Config** — swappable components (embedding provider, `Logger` sink, `Metrics`
  backend) are selected through one environment-driven convention (SPEC §2.1),
  not hardcoded per package. Env var names, defaults, and where a new swappable
  component hooks in are in
  [`docs/config-conventions.md`](docs/config-conventions.md).

Common commands (available once the Phase 0 scaffold is merged):

```
npm install        # install workspace dependencies
npm test           # run the Vitest suite
npm run lint       # eslint + prettier --check
npm run typecheck  # tsc --noEmit
```

## 7. When in doubt

- The spec is authoritative. If the spec is ambiguous or appears wrong, **do not
  silently invent behavior** — flag it in the issue/PR and, if it's a spec defect,
  follow [`docs/spec-guidelines.md`](docs/spec-guidelines.md) to amend `SPEC.md`
  (versioned) rather than diverging in code.
- Stay in scope. Implement only what your issue's acceptance criteria call
  for — nothing more; SPEC §6.8 lists the tempting-but-post-alpha items. The
  full discipline — no adjacent refactors or drive-by fixes even when small,
  narrowing a drifting PR back down, and why it matters across memoryless
  sessions — is in [`docs/scope-discipline.md`](docs/scope-discipline.md).
- Anything else that comes up mid-issue — an edge case, a follow-on idea, a
  question that isn't a spec defect — gets filed as its own issue per
  [`docs/issue-standards.md`](docs/issue-standards.md), not solved inline.
- The docs set is living, not write-once — periodically reconciled for staleness
  and consistency ([`docs/doc-audit.md`](docs/doc-audit.md)). If you spot drift
  while working, fix it in a docs-only PR or file it; don't leave it or fold it
  into an unrelated change.
