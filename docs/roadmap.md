# Roadmap

This is the process engine for hands-off, iterative development. It turns
[`SPEC.md`](../SPEC.md) §6 into a queue of small, verifiable work items that
agents execute one at a time.

## How the build runs

1. **Phases come from the spec.** [`SPEC.md`](../SPEC.md) §6 defines Phases 0–7,
   each with Entry / Build / Exit criteria.
2. **Each phase's work is tracked as GitHub issues** labeled `phase:N` and `task`,
   each sized for a single PR (use the
   [Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md) template).
3. **Scheduled agents pull the lowest-numbered open issue in the active phase**,
   follow the working loop in [`AGENTS.md`](../AGENTS.md), and open **one PR per
   issue**.
4. **A phase closes** when all its issues are resolved **and** the spec's Exit
   criteria for that phase hold. Only then does the next phase become active — do
   not start phase N+1 early (`AGENTS.md` §4).

## Phase status

| Phase | Deliverable | SPEC | Status |
|---|---|---|---|
| 0 | Repository scaffold — npm workspaces, `tsconfig.base.json`, empty `packages/*` | §6.1 | **active** |
| 1 | `packages/schema` — entity/protocol/ruleset types, CHANGELOG 0.1.0, example fixture | §6.2 | queued |
| 2 | `packages/corpus-builder` — build-time pipeline → `graph.json` | §6.3 | not started |
| 3 | `packages/rule-engine` — parser, solver, layer resolution, debug trace | §6.4 | not started |
| 4 | `packages/server` + conformance fixtures | §6.5 | not started |
| 5 | `packages/client-threejs` — Three.js reference renderer | §6.6 | not started |
| 6 | Production-alpha hardening + playable `README` path | §6.7 | not started |
| 7+ | Post-alpha (rule editor, other adapters, persistence, WS) — **out of scope** | §6.8 | out of scope |

Keep this table in sync as phases advance (update it in the PR that closes a
phase's last issue).

## Exit criteria (summary — the spec is authoritative)

- **Phase 0:** `npm install` succeeds at root; all packages resolve
  workspace-internal deps; `packages/schema` compiles standalone with zero errors.
- **Phase 1:** All SPEC §3 interfaces exist verbatim; `CHANGELOG.md` has a `0.1.0`
  entry; `fixtures/entity.example.json` type-checks against `Entity`.
- **Phases 2–6:** see SPEC §6.3–6.7 Exit blocks — including the determinism tests
  (`INV-2`), the `evaluate_layers` function-identity test (§4.4), and the
  import-boundary ESLint rule (`INV-3`, §6.6).

## Scheduled agent wiring

The "hands-off" driver is a **scheduled task/trigger** that periodically launches
an agent with a prompt equivalent to:

> Read `AGENTS.md`. Find the lowest-numbered open issue labeled with the active
> phase (`phase:0`, then `phase:1`, …). Follow the working loop: read the SPEC
> section it references, write failing tests first, implement minimally, run
> `npm run lint && npm run typecheck && npm test`, commit atomically, and open one
> PR that closes that issue. Do not start work belonging to a later phase.

Wire this up with whichever scheduler you use for agent runs (e.g. a Claude Code
scheduled task / cron trigger, or a GitHub Actions `schedule:` job that invokes
an agent). The repository itself is scheduler-agnostic; the contract the agent
must satisfy is fully defined by `AGENTS.md` + the issue it claims + `SPEC.md`.

To keep the queue full, ensure the active phase always has at least one open
`task` issue; when a phase's issues are exhausted and its Exit criteria hold,
open the next phase's issues from the corresponding SPEC §6.x Build list.
