# Semantic Dungeon Crawler Engine — Build Specification

`spec-version: 0.1.0`
`status: draft`
`audience: coding-agent + human-maintainer`

## 0. Purpose and Reading Order

This document is the authoritative build specification for an **authoring engine for semantic-space games** — not a single game. It is written to drive a phased, iterative Claude Code development process. Each phase in Section 6 is independently checkable: it lists file paths to create, exact schemas to implement, and pass/fail done-criteria.

**Read order for a coding agent starting fresh:** Section 1 (concepts) → Section 2 (architecture) → Section 3 (schema, verbatim) → Section 6 (phase you are on). Sections 4–5 are reference material to consult when a phase requires them, not sequential reading.

**Non-negotiable invariants** (referenced throughout as `INV-n`, must hold at every phase boundary):

- `INV-1`: The traversal/rule engine (Section 4) never imports a rendering library. It is pure, headless, testable with no client attached.
- `INV-2`: A game session is fully reproducible from `(seed, ruleset-file, input-log)`. No hidden state, no wall-clock dependence, no non-seeded randomness in backend logic.
- `INV-3`: The client (Three.js reference adapter, Section 5) never receives the graph, embeddings, or rule definitions. It receives only resolved JSON matching the Entity Schema (Section 3).
- `INV-4`: The engine does not validate ruleset *coherence* or *taste*. It validates ruleset *well-formedness* (parses, references exist, types match). Contradictory or "bad" rules are legal and must run, not be rejected.
- `INV-5`: Every schema and protocol surface is versioned (Section 3.5). Breaking changes require a version bump and a changelog entry, not silent mutation.

---

## 1. Concept Summary

For a coding agent with no prior context:

The engine takes a text corpus, embeds it, and builds a weighted graph where nodes are clusters of semantically related content and edges represent relatedness. A player "occupies" a position in this graph. Each node, when visited, is rendered as a spatial environment (a "room") populated with interactive objects derived from that node's data. Interacting with objects in the room is how the player moves through the graph — there is no separate "pick an exit" menu; movement is an *emergent consequence* of environmental interaction, mediated by an authored rule layer.

The engine ships two things:

1. **A backend** that owns the corpus, graph, embeddings, and rule evaluation, and exposes a small HTTP/WS contract.
2. **A reference Three.js client** that renders whatever the backend sends, and nothing else.

The default behavior with zero authored rules is **relativistic drift**: the player moves to nearest-neighbor nodes in embedding space with no imposed structure. This is considered a valid, "pure" mode, not a fallback to be ashamed of. All authored structure (Section 4) is opt-in refinement layered on top of this default.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BUILD-TIME (offline, run once or incrementally, cached)         │
│                                                                   │
│  Corpus ──▶ Embedding ──▶ Clustering ──▶ Graph ──▶ Tagging       │
│                                            │                      │
│                                            ▼                      │
│                                    graph.json (cached artifact)  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME BACKEND (deterministic, pure, headless — INV-1)         │
│                                                                   │
│   graph.json + ruleset.dsl + session(seed, input-log)            │
│                    │                                              │
│                    ▼                                              │
│         Rule Solver (Section 4) ── layered constraint eval        │
│                    │                                              │
│                    ▼                                              │
│         Resolved Entity Tree (Section 3 schema)                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                          HTTP/WS contract (Section 5.1)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (swappable, engine-specific — Three.js is the reference) │
│                                                                   │
│   Resolved JSON ──▶ ECS sync ──▶ Mesh resolution ──▶ Scene       │
│                                                          │        │
│                                          Player interaction       │
│                                                          │        │
│                                          POST /interact ─┘        │
└─────────────────────────────────────────────────────────────────┘
```

**Directory-to-layer mapping** (see Section 6.1 for full repo layout):

| Layer | Package | Owns |
|---|---|---|
| Build-time pipeline | `packages/corpus-builder` | Embedding, clustering, graph construction, tagging |
| Rule DSL + solver | `packages/rule-engine` | Parser, layered constraint evaluator, DSL grammar |
| Runtime backend | `packages/server` | HTTP/WS contract, session state, calls rule-engine |
| Shared contract | `packages/schema` | TypeScript types for Entity Schema, imported by server AND client |
| Three.js reference client | `packages/client-threejs` | ECS, mesh resolution, interaction capture |
| Authoring tool | `packages/rule-editor` | Visual flowchart UI, compiles to DSL text |

---

## 3. Core Data Schemas

These are the literal contracts. Implementations must match field names and types exactly. All schemas live in `packages/schema/src/` as the single source of truth, imported (not duplicated) by every other package.

### 3.1 Entity Schema

The unified representation for both "rooms" and "objects" — there is no structural distinction between them (see design rationale in conversation history; a room is an entity whose `archetype` implies containment).

```typescript
// packages/schema/src/entity.ts

interface Entity {
  id: string;                          // stable node id, matches graph.json node id
  archetype: Archetype;                // determines renderer interpretation
  semantic_tags: string[];             // free-form tags from build-time tagging
  embedding_ref: string;               // pointer to vector in graph.json, NEVER the raw vector
  affordances: Affordance[];           // legal interaction verbs
  salience: number;                    // 0.0–1.0, informs render prominence / population weight
  contains: string[];                  // child entity ids (empty for leaf/prop entities)
  layout_hint: LayoutHint;
  state: EntityState;
}

type Archetype =
  | "container"      // room-like; implies "enter"/"traverse" affordances typically present
  | "readable"
  | "actor"
  | "portal"
  | "prop"
  | string;           // open extension point — see 3.5 versioning rules for adding archetypes

type Affordance =
  | "enter" | "traverse" | "read" | "take" | "inspect" | "speak" | string;

interface LayoutHint {
  scale: "small" | "medium" | "large";
  density: number;        // 0.0–1.0, target population density if this entity is a container
  shape_bias: string;     // open string — adapter-interpreted, e.g. "vertical", "radial"
}

interface EntityState {
  coherence: number;       // 0.0–1.0, decay/stability scalar, author-defined meaning
  visited: boolean;
}
```

### 3.2 Resolved Room Response

What `GET /room/current` returns. This is the *only* shape the client ever sees (INV-3). Population is fully resolved server-side per the zero-radius-query rule (Section 4.4) — the client never receives candidates or rules.

```typescript
// packages/schema/src/protocol.ts

interface ResolvedRoomResponse {
  room: Entity;                 // archetype: "container", the current node
  objects: Entity[];            // fully resolved, filtered, sampled — final list, no further logic required
  exits: ResolvedExit[];        // pre-computed legal transitions, NOT raw graph edges
  debug?: DebugTrace;           // present only if debug mode enabled server-side, see 4.6
}

interface ResolvedExit {
  target_entity_id: string;
  affordance_required: Affordance;   // which interaction on which object triggers this
  via_object_id: string;             // which object in `objects[]` is the trigger
  weight: number;                    // soft-bias hint, client MAY use for visual affordance strength, MUST NOT use to alter server decision
}
```

### 3.3 Session / Move Request

```typescript
interface InteractRequest {
  session_id: string;
  action: {
    object_id: string;
    affordance: Affordance;
  };
}

interface InteractResponse {
  new_room: ResolvedRoomResponse;   // full re-resolution, same shape as GET /room/current
  transition_occurred: boolean;      // false if interaction was local (e.g. "read" a book, no movement)
}
```

### 3.4 Ruleset DSL — Data Shape (grammar in Section 4.2)

```typescript
interface Ruleset {
  spec_version: string;             // must match packages/schema version, see 3.5
  layers: Layer[];
}

interface Layer {
  id: string;
  scope: "global" | ScopeCondition;  // global = always active; else activated by predicate
  mode: "override" | "yield" | { priority: number };
  rules: RuleBlock[];
}

interface RuleBlock {
  predicate: string;     // DSL expression, see 4.2 grammar, evaluated against static+dynamic props
  effect: Effect;
}

type Effect =
  | { kind: "hard_allow" }
  | { kind: "hard_forbid" }
  | { kind: "soft_reweight"; factor: number };   // multiplicative, applied once per move-decision (confirmed discrete, not continuous)

type ScopeCondition = string;  // DSL expression evaluated once per move to determine layer activation
```

### 3.5 Versioning Rules (implements INV-5)

- `spec_version` in every wire payload and ruleset file follows semver.
- Adding a new `Archetype` or `Affordance` string literal is a MINOR bump (additive, non-breaking — the open-string extension points in 3.1 exist specifically so this doesn't require a schema restructure).
- Renaming/removing any field in `Entity`, `ResolvedRoomResponse`, or `Ruleset` is a MAJOR bump.
- `packages/schema/CHANGELOG.md` is mandatory reading before any schema edit in Phase 2+. A coding agent modifying `packages/schema/src/*` MUST append a changelog entry in the same commit.
- Conformance fixtures (Section 6.5) MUST be re-validated against any schema change before the change is considered complete.

---

## 4. Rule Engine Specification

### 4.1 Evaluation Model

Pseudocode, normative (implementation in `packages/rule-engine/src/solver.ts` must match this control flow):

```
resolve_move(state, graph, layer_stack):
    candidates = graph.neighbors(state.position)  // or k-NN if no discrete edges authored
    active_layers = layer_stack.filter(l => l.scope == "global" OR evaluate(l.scope, state))
    ordered = active_layers.sort_by(resolution_order)  // see 4.3

    for layer in ordered:
        for rule in layer.rules:
            if evaluate(rule.predicate, state, graph, candidates):
                apply(rule.effect, candidates)
                if rule.effect.kind in ["hard_allow","hard_forbid"] and layer.mode == "override":
                    lock_remaining_lower_layers_out_of_hard_decisions()

    if candidates.hard_decisions.is_empty():
        candidates = graph.neighbors(state.position)  // fall through to null/relativistic (INV — see 1)

    return sample(candidates, weighted_by = soft_scores)
```

Per `INV-4`, this function MUST NOT throw, reject, or auto-correct when layers produce contradictory hard decisions. Resolution order (4.3) determines the outcome; a "bad" outcome is a valid outcome.

### 4.2 DSL Grammar (v0)

Minimal expression grammar for `predicate` and `scope` strings. EBNF, informal:

```
expression   := comparison (("AND" | "OR") comparison)*
comparison   := operand OPERATOR operand
operand      := property | literal | function_call
property     := "static." IDENT  |  "dynamic." IDENT
function_call:= IDENT "(" (operand ("," operand)*)? ")"
OPERATOR     := ">" | "<" | ">=" | "<=" | "==" | "!=" | "IN" | "NOT IN"
```

**Reserved `static.*` properties** (read from the current candidate entity/edge): `static.embedding_distance`, `static.archetype`, `static.tags` (array), `static.edge_weight`, `static.cluster_id`.

**Reserved `dynamic.*` properties** (read from run state): `dynamic.visited_set` (array of ids), `dynamic.trace_centroid` (vector), `dynamic.momentum` (vector), `dynamic.turn_count`, `dynamic.coherence`.

**Reserved functions**: `contains(array, value)`, `distance(vec, vec)`, `recent(dynamic.visited_set, n)`.

Example predicate: `static.tags CONTAINS "financial-abstract" AND dynamic.turn_count > 5`

The DSL is intentionally small in v0. It is NOT Turing-complete by design — no loops, no user-defined functions beyond the reserved set. Extending the grammar is a MAJOR version change to `packages/schema` (3.5) and requires a new grammar section here, not silent parser extension.

### 4.3 Layer Resolution Order

Given `layer.mode`:

1. Layers with explicit `{priority: N}` sort by N descending (higher priority evaluated first, per author confirmation that override should be author-controlled, not engine-assumed).
2. Among layers without explicit priority: `override` layers are inserted immediately above the layer they were scoped under (locally-scoped overrides beat their enclosing global layer); `yield` layers are inserted at the bottom of the stack, only applying if no decision has been made.
3. **First hard decision (`hard_allow` or `hard_forbid`) encountered while walking the ordered stack top-to-bottom wins and is not overridden by lower layers**, EXCEPT that a lower layer explicitly declared `override` re-opens the decision (this is the intentional "messy is allowed" escape hatch — two `override` layers disagreeing produce declaration-order-wins with a warning logged, never an error).
4. All `soft_reweight` effects from every layer are collected and multiplied together regardless of hard-decision locking — soft effects always stack (per author confirmation, soft nudges are never cancelled by hard decisions elsewhere).

### 4.4 Room Population as Zero-Radius Query

Population of a room's `objects[]` (Section 3.2) uses the **identical** solver as movement, called with the room itself as both origin and destination, radius bounded by embedding proximity/cluster membership rather than graph edges:

```
populate(room_entity, layer_stack, graph):
    candidates = graph.neighbors_within_radius(room_entity, mode="embedding_proximity")
    // then IDENTICAL layer-evaluation loop as resolve_move (4.1)
    return sample(candidates, n = round(room_entity.layout_hint.density * MAX_ROOM_OBJECTS), weighted=True)
```

This is not an approximation of shared logic — `resolve_move` and `populate` MUST call the same underlying `evaluate_layers()` function in `packages/rule-engine/src/solver.ts`. A test that asserts this (same function reference, not just same output) belongs in Phase 3 (Section 6.3).

### 4.5 Determinism (implements INV-2)

- All sampling (`sample()` in 4.1/4.4) uses a seeded PRNG. The seed is derived deterministically from `(session_seed, turn_count)` — never from wall-clock or external entropy.
- Given identical `(graph.json, ruleset.dsl, session_seed, input-log)`, `resolve_move` and `populate` MUST produce byte-identical output across runs. This is a Phase 3 test requirement (Section 6.5), not a nice-to-have.

### 4.6 Debug Trace (optional, off by default)

```typescript
interface DebugTrace {
  candidates_initial: string[];
  per_layer: {
    layer_id: string;
    activated: boolean;
    rules_fired: { rule_index: number; effect: Effect; matched_entities: string[] }[];
  }[];
  final_hard_decision_source: string | null;  // layer_id that produced the winning hard decision
  final_soft_scores: Record<string, number>;
}
```

Enabled via server config flag, never a client-supplied parameter (a client should not be able to force debug-mode cost onto the server). Must add zero overhead to the hot path when disabled — implementation must gate trace construction behind the flag check, not construct-then-discard.

---

## 5. Client Contract (Three.js Reference Adapter)

### 5.1 Wire Protocol

```
GET  /room/current?session_id={id}          → ResolvedRoomResponse
POST /interact                                → InteractRequest body → InteractResponse
GET  /session/new?seed={optional}             → { session_id, seed }
GET  /debug/trace?session_id={id}             → DebugTrace  (only if server debug mode on, else 404)
```

No websocket requirement for v0 — turn-based interaction tolerates request/response latency per the architecture discussion; this is an explicit scope cut, not an oversight. Revisit only if the alpha's interaction pacing demands it (Section 7, open question).

### 5.2 ECS Mapping (Three.js adapter internal structure)

Any coding agent building `packages/client-threejs` should structure it as a minimal hand-rolled ECS (no external ECS library dependency in the reference adapter — see rationale: setup cost isn't justified until scene complexity demands it; a fork is free to graduate to a real ECS library):

| Concept | Implementation |
|---|---|
| Entity | `id: string`, matches `Entity.id` from schema verbatim |
| Components | Plain object keyed by entity id: `{ archetype, semantic_tags, affordances, salience, layout_hint, state }` — direct copy of schema fields, no client-side reinterpretation |
| `LayoutSystem` | Pure function: `(Entity[], layout_hint) → Map<id, THREE.Vector3>`. This is the primary creative surface for adapter authors — same schema, different LayoutSystem = different spatial feel |
| `MeshResolutionSystem` | Pure function: `(archetype, semantic_tags) → THREE.Object3D`. Lookup table, extensible, is the "archetype → matter" mapping |
| `InteractionSystem` | Raycast on click → resolve target entity id + affordance → `POST /interact` → await → hand result to `SyncSystem` |
| `SyncSystem` | `InteractResponse → mutate components → trigger LayoutSystem + MeshResolutionSystem re-run for changed entities only` |

**Adapter MUST NOT**: cache or reconstruct graph structure client-side, implement any predicate/rule logic, or make movement decisions locally under any circumstance (even "obviously safe" ones) — this is the hard boundary of INV-3, not a soft guideline.

### 5.3 Conformance

A conformance suite of fixed `ResolvedRoomResponse` JSON fixtures (Section 6.5) must render without error in the reference adapter. Any third-party adapter (Godot, Unity, future forks) claiming schema compatibility should be checkable against the same fixture set without needing this spec's author involved — this is what makes the "plugin ecosystem, not owned integrations" model (per design discussion) actually work in practice rather than remaining aspirational.

---

## 6. Phased Build Plan

Each phase has explicit **Entry** (what must already be true), **Build** (what to create), and **Exit** (checkable done-criteria) conditions. A coding agent should not begin phase N+1 until phase N's Exit criteria are all met.

### 6.1 Phase 0 — Repository Scaffold

**Entry**: Empty repository.

**Build**:
```
/
├── SPEC.md                          (this document)
├── package.json                     (workspace root, npm/pnpm workspaces)
├── tsconfig.base.json
├── packages/
│   ├── schema/                      (Section 3, built first — everything imports this)
│   │   ├── src/entity.ts
│   │   ├── src/protocol.ts
│   │   ├── src/ruleset.ts
│   │   ├── CHANGELOG.md
│   │   └── package.json
│   ├── rule-engine/
│   │   └── src/ (empty, Phase 3)
│   ├── corpus-builder/
│   │   └── src/ (empty, Phase 2)
│   ├── server/
│   │   └── src/ (empty, Phase 4)
│   ├── client-threejs/
│   │   └── src/ (empty, Phase 5)
│   └── rule-editor/
│       └── src/ (empty, Phase 7 — post-alpha, not required for production alpha)
├── fixtures/                        (Section 6.5 conformance data, populated incrementally)
└── docs/
    └── (generated/expanded technical docs, out of scope for this spec)
```

**Exit**: `npm install` (or pnpm) succeeds at root; all packages resolve workspace-internal dependencies; `packages/schema` compiles standalone with zero errors.

### 6.2 Phase 1 — Schema Implementation

**Entry**: Phase 0 complete.

**Build**: Implement Section 3.1–3.4 verbatim in `packages/schema/src/`. No logic, no runtime code — types and minimal validation helpers only (e.g., a `isValidEntity()` type guard is in scope; a solver is not).

**Exit**: 
- All interfaces in Section 3 exist with matching field names/types.
- `packages/schema/CHANGELOG.md` has an initial `0.1.0` entry.
- A hand-written fixture (`fixtures/entity.example.json`) validates against the `Entity` type with zero TS errors when imported and type-checked.

### 6.3 Phase 2 — Corpus Builder (Build-Time Pipeline)

**Entry**: Phase 1 complete.

**Build**: `packages/corpus-builder/` — CLI tool: `corpus-builder build --input <dir> --output graph.json`.
- Embedding step (pluggable — spec does not mandate a specific model/provider, but MUST be swappable via config, not hardcoded to one vendor)
- Clustering step → node formation
- Edge weight computation (cosine similarity threshold, configurable)
- Tagging step → populates `semantic_tags`, `archetype` (initial heuristic assignment is acceptable for alpha; author-refined tagging is post-alpha)
- Output: `graph.json` — internal-only format, never sent to any client (INV-3), consumed exclusively by `rule-engine`.

**Exit**:
- Running the CLI against a small test corpus (fixture, ~20 documents) produces a valid `graph.json`.
- `graph.json` schema is documented in `packages/corpus-builder/GRAPH_FORMAT.md` (internal format, distinct from and not bound by the same versioning strictness as the client-facing schema in Section 3, since it never crosses the client boundary).
- Re-running the build with identical input produces byte-identical output (determinism extends to build-time, not just runtime).

### 6.4 Phase 3 — Rule Engine

**Entry**: Phase 2 complete (needs `graph.json` to test against).

**Build**: `packages/rule-engine/src/`
- `parser.ts` — DSL grammar (4.2) → AST
- `solver.ts` — `evaluate_layers()`, `resolve_move()`, `populate()` per 4.1/4.4 pseudocode, normatively
- `layer-resolution.ts` — 4.3 ordering logic
- `debug-trace.ts` — 4.6, flag-gated

**Exit**:
- `resolve_move` and `populate` both call the identical `evaluate_layers()` function (checked by a test that asserts function identity, not just output equivalence — per 4.4 requirement).
- Determinism test passes: same `(graph.json, ruleset.dsl, seed, input-log)` in, byte-identical output across 2 independent runs (INV-2, 4.5).
- A ruleset fixture with two `override`-mode layers producing contradictory hard decisions does NOT throw — it resolves via declaration order and logs a warning (INV-4 conformance test).
- Null-ruleset case (empty `layers: []`) produces pure nearest-neighbor drift with no errors (the "ambiguous relativistic traversal" default is exercised as a real, tested code path, not assumed).

### 6.5 Phase 4 — Server + Conformance Fixtures

**Entry**: Phase 3 complete.

**Build**: `packages/server/src/` — implements the wire protocol (5.1) exactly. Session management (in-memory acceptable for alpha; persistence is a post-alpha concern, flagged in Section 7). Calls `rule-engine` for all resolution; server itself contains no rule logic.

Simultaneously populate `fixtures/`:
- `fixtures/rooms/*.json` — a set of ~10 hand-curated `ResolvedRoomResponse` payloads spanning archetype variety (at minimum: one `container` with 5+ objects, one near-empty room, one with all-soft-weighted population, one exercising `portal` archetype)
- `fixtures/rulesets/*.dsl` — at least: null ruleset, single-global-layer ruleset, multi-layer-with-conflict ruleset (exercises 4.3's messy-resolution path deliberately)

**Exit**:
- All Section 5.1 endpoints respond with schema-valid payloads (validated against Phase 1 types).
- `fixtures/` populated and referenced by an automated test that round-trips each fixture ruleset through the server and asserts the response validates against `ResolvedRoomResponse`.
- This fixture set is what Section 5.3 conformance depends on — it must be genuinely engine-agnostic (no Three.js-specific assumptions baked into fixture content).

### 6.6 Phase 5 — Three.js Reference Client

**Entry**: Phase 4 complete (needs a running server to develop against, or at minimum the fixture set for offline development).

**Build**: `packages/client-threejs/src/` per Section 5.2. Minimum viable scene: load `GET /session/new` → `GET /room/current` → render room + objects via `LayoutSystem`/`MeshResolutionSystem` → capture one click interaction → `POST /interact` → re-render.

**Exit**:
- Running the client against the Phase 4 server, a player can: see a rendered room, click an object with an `enter`/`traverse` affordance, and observe a room transition (new objects render, matching a fresh `ResolvedRoomResponse`).
- Client renders all fixtures from `fixtures/rooms/*.json` without error when pointed at them directly (server bypassed) — this is the conformance check from 5.3, exercised for the reference adapter itself first.
- No file in `packages/client-threejs/src/` imports anything from `packages/rule-engine` or `packages/corpus-builder` (mechanically checkable via import-boundary lint rule — add this as an actual ESLint rule, not just a convention, since INV-3 depends on it holding permanently, including after this alpha, under future contributors who haven't read this spec).

### 6.7 Phase 6 — Production Alpha Hardening

**Entry**: Phase 5 complete; end-to-end loop (corpus → graph → server → client → visible, interactive, movement-capable game) works.

**Build**: Not new features — hardening of the existing surface:
- Error handling at every protocol boundary (malformed ruleset, missing session, network failure client-side)
- `GRAPH_FORMAT.md` and this spec's Section 3–5 reconciled with any drift discovered during Phases 2–5 (update `packages/schema/CHANGELOG.md` accordingly per INV-5)
- A first real (non-fixture) corpus run end-to-end, author-selected, small enough to sanity-check by hand
- Minimal deployment path documented (even if just "run server locally + open client" for alpha — production infra is explicitly out of scope, see Section 7)

**Exit**: A person other than the original builder can clone the repo, run the build pipeline against a provided sample corpus, start the server, open the client, and play a session start-to-finish following only `README.md` (to be written in this phase) — no undocumented steps. This is the production alpha bar.

### 6.8 Phase 7+ — Explicitly Post-Alpha (Not This Spec's Scope)

Listed here so a coding agent doesn't accidentally scope-creep into these during Phases 0–6:

- Visual rule editor (`packages/rule-editor`) — flowchart UI compiling to DSL (Section 4.2 grammar is ready for this to target, but the UI itself is a separate build)
- Non-Three.js adapters (Godot, Unity) — enabled by this spec's conformance model (5.3) but not built by it
- Ruleset marketplace / sharing infrastructure
- Persistent session storage, auth, multiplayer
- WebSocket upgrade for the wire protocol
- Batch-run tooling for "emergent rules from test-run analysis" workflow (mentioned in design discussion as a future authoring aid — requires Phase 4's server plus a harness that runs many null-ruleset sessions and clusters resulting traces; not required for alpha)

---

## 7. Open Questions for Iterative Refinement

Flagged explicitly rather than silently decided, for resolution during or after alpha:

- **Latency/perceived responsiveness**: request/response movement (5.1) was accepted knowingly given turn-based pacing; revisit if alpha playtesting shows it feels laggy rather than deliberate.
- **Tagging quality**: Phase 2's heuristic auto-tagging is an alpha stand-in. What does author-refinement tooling for `semantic_tags`/`archetype` assignment look like? (Likely a Phase 7+ concern, possibly folded into the rule editor.)
- **`graph.json` scale limits**: no sharding/pagination strategy is specified for very large corpora. Fine for alpha-scale corpora; needs design work before "production" means more than "alpha."
- **Embedding provider choice**: Phase 2 mandates swappability but does not mandate a default. Pick one for the first real corpus run (Phase 6) and document the choice + rationale in `packages/corpus-builder/GRAPH_FORMAT.md`.

---

## 8. Glossary

| Term | Definition |
|---|---|
| Entity | Unified schema for both rooms and objects (Section 3.1). No structural room/object distinction. |
| Archetype | Entity field determining renderer interpretation and typical affordance set. |
| Layer | A scoped, prioritized set of rule-blocks (Section 3.4). Concurrent, not mutually exclusive. |
| Ruleset | A full authored file: `spec_version` + `layers[]`. The unit an author shares/forks/versions. |
| Relativistic drift | The null-ruleset default: pure nearest-neighbor movement in embedding space, no authored structure. |
| Zero-radius query | Room population (4.4), using the identical solver as movement with radius bounded to the room itself. |
| Resolved (as in "Resolved Room Response") | Fully computed server-side; client performs no further filtering/sampling logic. |
| Conformance fixtures | The fixed JSON dataset (6.5) any adapter must render correctly to claim schema compatibility. |
