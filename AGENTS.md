# AGENTS.md — Canonical Guide for AI Coding Agents

This is the **authoritative guide** for any agent working in this repository. If
another doc disagrees with this one, this one wins — except that
[`SPEC.md`](SPEC.md) is the source of truth for *what to build*; this file is the
source of truth for *how to work*.

Read order for a cold start: **this file → the SPEC section your issue references
→ your issue's acceptance criteria.** Do not range ahead into later build steps.

---

## 1. Purpose & scope

The project is an **authoring engine for semantic-space games** (SPEC §1) — an
engine, not a single game. It ships two deliverables:

- A **deterministic, headless backend**: corpus → embedding → graph → rule solver
  → resolved JSON (SPEC §2).
- A **Three.js reference client** that renders the resolved JSON and nothing else
  (SPEC §5).

The default zero-rules behavior is **relativistic drift** (nearest-neighbor
movement in embedding space) — a valid mode, not a fallback.

## 2. Hard rules (non-negotiable — SPEC invariants)

These hold at **every phase boundary**. A change that violates one is wrong even
if it passes tests.

- **`INV-1` — Pure engine.** The traversal/rule engine never imports a rendering
  library. It is headless and testable with no client attached. (SPEC §2, §4)
- **`INV-2` — Determinism.** A session is fully reproducible from
  `(seed, ruleset-file, input-log)`. No wall-clock, no unseeded randomness in
  backend logic. Same inputs ⇒ **byte-identical** output. (SPEC §4.5)
- **`INV-3` — Client sees only resolved JSON.** The client never receives the
  graph, embeddings, or rule definitions — only `ResolvedRoomResponse` (SPEC §3.2).
  `packages/client-threejs` and `packages/client-cli` must not import
  `packages/rule-engine` or `packages/corpus-builder`. (SPEC §5.2, §5.4, §6.5, §6.6)
- **`INV-4` — No taste-policing.** The engine validates *well-formedness*, not
  *coherence*. Contradictory or "bad" rulesets are legal and must run, not be
  rejected or auto-corrected. The solver must not throw on conflicting hard
  decisions. (SPEC §4.1, §4.3)
- **`INV-5` — Everything versioned.** Every schema/protocol surface is versioned
  (SPEC §3.5). Breaking changes require a version bump **and** a
  `packages/schema/CHANGELOG.md` entry in the same commit — never silent mutation.

> The two easiest to break by accident: **`INV-2` (determinism)** — reach for a
> seeded PRNG derived from `(session_seed, turn_count)`, never `Math.random()` or
> `Date.now()`; and **`INV-3` (import boundary)** — enforced by an ESLint rule
> (added in Phase 4 for `client-cli`, SPEC §6.5; extended to `client-threejs` in
> Phase 5, SPEC §6.6), but respect it from day one.

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
are all met.** Each phase has Entry/Build/Exit conditions in the spec:

| Phase | What | SPEC |
|---|---|---|
| 0 | Repository scaffold (workspaces, tsconfig, empty packages) | §6.1 |
| 1 | `packages/schema` — types + CHANGELOG + example fixture | §6.2 |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 |
| 4 | `packages/server` + `packages/client-cli` + conformance fixtures | §6.5 |
| 5 | `packages/client-threejs` — reference renderer | §6.6 |
| 6 | Production-alpha hardening + `README` playable path | §6.7 |
| 7+ | Post-alpha (rule editor, other adapters, persistence) — **out of scope** | §6.8 |

The live status of each phase and its issues is in [`docs/roadmap.md`](docs/roadmap.md).

## 5. Working loop (do this for every issue)

1. **Take one issue.** Pick the lowest-numbered open issue labeled with the active
   phase (`phase:0`, then `phase:1`, …). Scope your work to that issue only.
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
6. **One issue per PR.** Fill in the PR template; link the issue with `Closes #N`.
   Linear history — rebase, don't merge (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

## 6. Toolchain

- **npm workspaces** — package manager and monorepo linking.
- **Vitest** — test runner. Determinism tests (`INV-2`) and the
  `evaluate_layers` function-identity test (SPEC §4.4) are required where the
  phase calls for them.
- **ESLint + Prettier** — lint and format. The `INV-3` import-boundary rule is a
  real ESLint rule (Phase 5, SPEC §6.6), not a convention.
- **`tsc --noEmit`** — typecheck across packages.

## 7. When in doubt

- The spec is authoritative. If the spec is ambiguous or appears wrong, **do not
  silently invent behavior** — flag it in the issue/PR and, if it's a spec defect,
  follow [`docs/spec-guidelines.md`](docs/spec-guidelines.md) to amend `SPEC.md`
  (versioned) rather than diverging in code.
- Stay in scope. SPEC §6.8 lists things that look tempting but are explicitly
  post-alpha — do not scope-creep into them.
