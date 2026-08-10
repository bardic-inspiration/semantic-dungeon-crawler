# Semantic Dungeon Crawler Engine — Build Specification

`spec-version: 0.6.1`
`status: draft`
`audience: coding-agent + human-maintainer`

## 0. Purpose and Reading Order

This document is the authoritative build specification for an **authoring engine for semantic-space games** — not a single game. It is written to drive a phased, iterative Claude Code development process. Each phase in Section 6 is independently checkable: it lists file paths to create, exact schemas to implement, and pass/fail done-criteria.

**Read order for a coding agent starting fresh:** Section 1 (concepts) → Section 2 (architecture) → Section 3 (schema, verbatim) → Section 6 (phase you are on). Sections 4–5 are reference material to consult when a phase requires them, not sequential reading.

**Non-negotiable invariants** (referenced throughout as `INV-n`, must hold at every phase boundary):

- `INV-1`: The traversal/rule engine (Section 4) never imports a rendering library. It is pure, headless, testable with no client attached.
- `INV-2`: A game session is fully reproducible from `(seed, ruleset-file, input-log)`. No hidden state, no wall-clock dependence, no non-seeded randomness in backend logic.
- `INV-3`: The client (Three.js and terminal reference adapters, Section 5) never receives the graph, embeddings, or rule definitions. It receives only resolved JSON matching the Entity Schema (Section 3).
- `INV-4`: The engine does not validate ruleset *coherence* or *taste*. It validates ruleset *well-formedness* (parses, references exist, types match). Contradictory or "bad" rules are legal and must run, not be rejected.
- `INV-5`: Every schema and protocol surface is versioned (Section 3.5). Breaking changes require a version bump and a changelog entry, not silent mutation.

---

## 1. Concept Summary

For a coding agent with no prior context:

The engine takes a text corpus, embeds it, and builds a weighted graph where nodes are clusters of semantically related content and edges represent relatedness. A player "occupies" a position in this graph. Each node, when visited, is rendered as a spatial environment (a "room") populated with interactive objects derived from that node's data. Interacting with objects in the room is how the player moves through the graph — there is no separate "pick an exit" menu; movement is an *emergent consequence* of environmental interaction, mediated by an authored rule layer.

The engine ships two things:

1. **A backend** that owns the corpus, graph, embeddings, and rule evaluation, and exposes a REST API (Section 5.1) any frontend can be built against.
2. **A reference Three.js client** — the first of potentially several graphical frontends — that renders whatever the backend sends, and nothing else.

The default behavior with zero authored rules is **relativistic drift**: the player moves to nearest-neighbor nodes in embedding space with no imposed structure. This is a valid, deliberate mode, not a fallback. All authored structure (Section 4) is opt-in refinement layered on top of this default.

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
                              REST API (Section 5.1)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (swappable — Three.js ships first, others build on 5.1)  │
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
| Runtime backend | `packages/server` | REST API (5.1), session state, calls rule-engine |
| Shared contract | `packages/schema` | TypeScript types for Entity Schema, imported by server AND client |
| Three.js reference client | `packages/client-threejs` | First graphical reference adapter — ECS, mesh resolution, interaction capture |
| Terminal reference client | `packages/client-cli` | REPL adapter against the same REST API — text rendering, scripted input-log replay, testing/debug interface |
| Authoring tool | `packages/rule-editor` | Visual flowchart UI, compiles to DSL text |

### 2.1 Supporting Systems (Developer Toolkit)

Cross-cutting infrastructure every package needs — not a phase of its own. Wired in as each package is built; hardened in Phase 6 (§6.7).

- **Logging** — structured, leveled (`debug`/`info`/`warn`/`error`) events via a small `Logger` interface (`log(level, event, fields)`), one instance per package. Pluggable sink; console-only is an acceptable default pre-alpha, same swappability convention as the embedding provider (§6.3). Logging is a side channel: it MUST NOT influence control flow (`INV-2`) and MUST NOT be a path by which graph/rule/embedding internals reach the client (`INV-3`) — it is a server-operator-only surface, never wire-protocol output. The §4.3 "messy resolution" warning (conflicting `override` layers) is emitted through this system at `warn`.
- **Metrics** — counters/gauges/histograms behind a small `Metrics` interface (`increment`/`observe`), in-memory default. Build-time: corpus size, build duration, embedding-call count (`corpus-builder`). Runtime: request latency, active session count, rule-evaluation duration per move (`server`). Diagnostic only — `resolveMove`/`populate` (§4.1/§4.4) MUST NOT read metrics state; letting output depend on prior instrumentation would violate `INV-2`.
- **Debug** — one server-side flag gates both `DebugTrace` construction/exposure (§4.6, `GET /debug/trace`) and elevated log verbosity. The zero-overhead-when-disabled requirement in §4.6 extends to debug-level logging: gate before construct, never construct-then-discard.
- **Config & errors** — swappable components (embedding provider, log sink, metrics backend) are selected through one environment-driven config convention rather than being hardcoded per package. Protocol-boundary errors (malformed ruleset, missing session, network failure) get a typed error taxonomy instead of ad hoc throws; built out in Phase 6 hardening (§6.7).
- **Corpus↔graph traceability** — the build-time pipeline (`corpus-builder`, §6.3) is a supporting-systems consumer too, not just the runtime `server`. Every graph node carries `source_refs` back to the raw corpus documents it was built from, and each pipeline stage reports through the same `Logger`/`Metrics` interfaces above (input/output counts, duration, warnings) — build-time transparency and runtime transparency are the same mechanism, not two. This surfaces through `corpus-builder inspect` (§6.3), not `client-cli`: a client speaking the wire protocol has no business seeing graph/corpus internals (`INV-3`), so build-time inspection stays a `corpus-builder`-owned tool, structurally separate from the runtime testing interface in §5.4 even though the two share verbosity conventions.

None of this introduces a new invariant — it operates entirely inside `INV-1`..`INV-5` as already stated.

---

## 3. Core Data Schemas

These are the literal contracts. Implementations must match field names and types exactly. All schemas live in `packages/schema/src/` as the single source of truth, imported (not duplicated) by every other package. Field names below are `snake_case` by design — see `docs/naming-conventions.md` for the full split between wire-data casing and TypeScript-identifier casing used everywhere else in this spec.

### 3.1 Entity Schema

The unified representation for both "rooms" and "objects" — there is no structural distinction between them. A room is simply an entity whose `archetype` implies containment.

```typescript
// packages/schema/src/entity.ts

interface Entity {
  id: string;                          // stable node id, matches graph.json node id
  archetype: Archetype;                // determines renderer interpretation
  semantic_tags: string[];             // structured tags — grammar in Section 3.6
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
  | { kind: "soft_reweight"; factor: number };   // multiplicative, applied once per move-decision (discrete, not continuous)

type ScopeCondition = string;  // DSL expression evaluated once per move to determine layer activation
```

### 3.5 Versioning Rules (implements INV-5)

- `spec_version` in every wire payload and ruleset file follows semver.
- Adding a new `Archetype` or `Affordance` string literal is a MINOR bump (additive, non-breaking — the open-string extension points in 3.1 exist specifically so this doesn't require a schema restructure).
- Adding or removing a modifier entry in an author's ruleset config requires no engine version bump — modifier entries are author content. Changing the modifier registry *mechanism* (how the engine parses or dispatches modifiers) is a MAJOR bump.
- Renaming/removing any field in `Entity`, `ResolvedRoomResponse`, or `Ruleset` is a MAJOR bump.
- Adding a REST endpoint (Section 5.1) is a MINOR bump; changing an existing endpoint's method, path, or response shape — or the base contract (headers, error envelope) — is a MAJOR bump, the same rule as a schema field change. This is what lets a third-party adapter (5.3) trust a MINOR version bump to be safe to ignore.
- `packages/schema/CHANGELOG.md` is mandatory reading before any schema edit in Phase 2+. A coding agent modifying `packages/schema/src/*` MUST append a changelog entry in the same commit.
- Conformance fixtures (Section 6.5) MUST be re-validated against any schema change before the change is considered complete.

### 3.6 Structured Tag Grammar

Tags in `semantic_tags` follow a uniform grammar. Tags remain `string[]` on the wire — the grammar defines well-formedness validation, not a type change. Existing single-segment strings are valid under this grammar.

**EBNF**:

```
tag           = [ modifier "," ] segment_path [ "=" value ] ;
modifier      = identifier ;
segment_path  = segment { ":" segment } ;
segment       = seg_start { seg_char } ;
seg_start     = LOWER | DIGIT ;
seg_char      = LOWER | DIGIT | "-" | "_" ;
value         = value_char { value_char } ;
value_char    = ? any character except NUL ? ;
identifier    = seg_start { seg_char } ;
```

**Parse output**: `{ modifier: string | null, segments: string[], value: string | null, raw: string }`.

**Examples**: `environment:terrain:forest` (hierarchical path), `density=0.7` (scalar value), `viz,material:stone` (modifier-prefixed).

Per `INV-4`, the engine validates tag *syntax* only. It MUST NOT reject tags for unregistered modifiers, unknown segment paths, or absent registry entries. Well-formed tags are legal regardless of registry state.

#### 3.6.1 Modifier Registry

The engine provides a grammar slot for an optional `modifier,` prefix, a parser that extracts the modifier token, and a modifier registry data structure (`Record<string, ModifierConfig>`). **No modifiers are built into the engine** — zero is a valid configuration. Authors populate the registry in their ruleset config to define what modifiers mean and how they affect tag routing, filtering, and resolution.

Modifier entries can carry expression-based rules using the same DSL grammar from Section 4.2. These expressions configure how the engine treats tags carrying that modifier — the engine evaluates them, but authors write them.

#### 3.6.2 Tag Registry

A keys-only nested tree of valid segment paths — no values, no metadata, pure structural skeleton. Leaves are `{}`. YAML format: bare `key:` for leaves. The registry validator MUST reject any YAML that contains values, lists, or keys outside the segment charset (`/^[a-z0-9][a-z0-9_-]*$/`).

The registry is a **vocabulary contract** between pipeline stages:
- **Produced** by `packages/corpus-builder` as `tag-registry.yaml` alongside `graph.json`
- **Consumed** by `packages/rule-engine` and `packages/client-threejs` as a vocabulary reference
- **Extended** by authors who can merge their own entries
- **Advisory** — unregistered tags are syntactically valid but orphaned; the pipeline warns, never rejects

#### 3.6.3 Registry-Bounded Values

Three rules resolve the structure-vs-data boundary:

1. Every segment path is registrable (vocabulary). The pipeline auto-registers paths for every tag it produces.
2. Explicit `=value` scalars are never registered. Values are runtime data.
3. A registered leaf (childless node) carries an implied value, resolved per use case by a pluggable resolver.

The **resolver dispatch** is engine machinery; the **resolver set** is configurable. Three default resolvers ship with the engine:

| Resolver | Explicit `=value` | Leaf terminal | Non-leaf |
|---|---|---|---|
| `match` | the value string | `true` (presence) | `true` |
| `display` | the value string | terminal segment string | `null` |
| `numeric` | coerced to Number | `1.0` (presence) | `null` |

Authors can add custom resolvers or override defaults. A resolver is a function `(parsedTag, registry) → resolvedValue`. The engine guarantees the three defaults exist at startup but does not prevent replacement.

Full design rationale: `docs/tag-system-design.md`.

---

## 4. Rule Engine Specification

### 4.1 Evaluation Model

Pseudocode, normative (implementation in `packages/rule-engine/src/solver.ts` must match this control flow):

```
resolveMove(state, graph, layerStack):
    candidates = graph.neighbors(state.position)  // or k-NN if no discrete edges authored
    activeLayers = layerStack.filter(l => l.scope == "global" OR evaluate(l.scope, state))
    ordered = activeLayers.sortBy(resolutionOrder)  // see 4.3

    for layer in ordered:
        for rule in layer.rules:
            if evaluate(rule.predicate, state, graph, candidates):
                apply(rule.effect, candidates)
                if rule.effect.kind in ["hard_allow","hard_forbid"] and layer.mode == "override":
                    lockRemainingLowerLayersOutOfHardDecisions()

    if candidates.hardDecisions.isEmpty():
        candidates = graph.neighbors(state.position)  // fall through to null/relativistic (INV — see 1)

    return sample(candidates, weightedBy = softScores)
```

Per `INV-4`, this function MUST NOT throw, reject, or auto-correct when layers produce contradictory hard decisions. Resolution order (4.3) determines the outcome; a "bad" outcome is a valid outcome.

Naming: `resolveMove`, `populate`, and every other TypeScript identifier in this section follow `docs/naming-conventions.md`. Wire-facing fields (`layout_hint`, effect kinds like `hard_allow`) keep the `snake_case` SPEC §3 already defines — the split is deliberate, not a typo.

### 4.2 DSL Grammar (v0)

Minimal expression grammar for `predicate` and `scope` strings. EBNF, informal:

```
expression   := comparison (("AND" | "OR") comparison)*
comparison   := operand OPERATOR operand
operand      := property | literal | function_call
property     := "static." IDENT  |  "dynamic." IDENT
function_call:= IDENT "(" (operand ("," operand)*)? ")"
OPERATOR     := ">" | "<" | ">=" | "<=" | "==" | "!=" | "IN" | "NOT IN"
             | "CONTAINS" | "MATCHES"
```

**Reserved `static.*` properties** (read from the current candidate entity/edge): `static.embedding_distance`, `static.archetype`, `static.tags` (array), `static.edge_weight`, `static.cluster_id`.

**Reserved `dynamic.*` properties** (read from run state): `dynamic.visited_set` (array of ids), `dynamic.trace_centroid` (vector), `dynamic.momentum` (vector), `dynamic.turn_count`, `dynamic.coherence`.

**Reserved functions**: `contains(array, value)`, `distance(vec, vec)`, `recent(dynamic.visited_set, n)`, `matches(array, pattern)`.

**`MATCHES` pattern grammar** (asymmetric — wildcards on pattern side only):

```
pattern       = [ mod_pattern "," ] seg_pattern [ "=" val_pattern ] ;
mod_pattern   = IDENT | "*" ;
seg_pattern   = seg_or_wild { ":" seg_or_wild } ;
seg_or_wild   = IDENT | "*" | "**" ;
val_pattern   = VALUE | "*" ;
```

`*` matches exactly one segment; `**` matches zero or more. Wildcards exist only in patterns. `CONTAINS` performs exact string comparison (backward-compatible); `MATCHES` parses both pattern and tag via the structured tag grammar (Section 3.6) and applies glob matching on parsed segments.

Example predicates:

```
static.tags CONTAINS "mood:tense" AND dynamic.turn_count > 5
static.tags MATCHES "theme:*" AND static.archetype == "container"
static.tags MATCHES "creature:hostile:**" OR static.tags MATCHES "environment:terrain:cave"
```

The DSL is intentionally small. It is NOT Turing-complete by design — no loops, no user-defined functions beyond the reserved set. Extending the grammar is a MAJOR version change to `packages/schema` (3.5) and requires a new grammar section here, not silent parser extension. `MATCHES` is the sole grammar extension since v0.1.0.

### 4.3 Layer Resolution Order

Given `layer.mode`:

1. Layers with explicit `{priority: N}` sort by N descending (higher priority evaluated first) — override order is author-controlled, not engine-assumed.
2. Among layers without explicit priority: `override` layers are inserted immediately above the layer they were scoped under (locally-scoped overrides beat their enclosing global layer); `yield` layers are inserted at the bottom of the stack, only applying if no decision has been made.
3. **First hard decision (`hard_allow` or `hard_forbid`) encountered while walking the ordered stack top-to-bottom wins and is not overridden by lower layers**, EXCEPT that a lower layer explicitly declared `override` re-opens the decision. This is the intentional "messy is allowed" escape hatch: two `override` layers disagreeing resolve by declaration order, with a warning logged, never an error.
4. All `soft_reweight` effects from every layer are collected and multiplied together regardless of hard-decision locking — soft effects always stack and are never cancelled by hard decisions elsewhere.

### 4.4 Room Population as Zero-Radius Query

Population of a room's `objects[]` (Section 3.2) uses the **identical** solver as movement, called with the room itself as both origin and destination, radius bounded by embedding proximity/cluster membership rather than graph edges:

```
populate(roomEntity, layerStack, graph):
    candidates = graph.neighborsWithinRadius(roomEntity, mode="embedding_proximity")
    // then IDENTICAL layer-evaluation loop as resolveMove (4.1)
    return sample(candidates, n = round(roomEntity.layout_hint.density * MAX_ROOM_OBJECTS), weighted=True)
```

This is not an approximation of shared logic — `resolveMove` and `populate` MUST call the same underlying `evaluateLayers()` function in `packages/rule-engine/src/solver.ts`. A test that asserts this (same function reference, not just same output) belongs in Phase 3 (Section 6.3).

### 4.5 Determinism (implements INV-2)

- All sampling (`sample()` in 4.1/4.4) uses a seeded PRNG. The seed is derived deterministically from `(session_seed, turn_count)` — never from wall-clock or external entropy.
- Given identical `(graph.json, ruleset.dsl, session_seed, input-log)`, `resolveMove` and `populate` MUST produce byte-identical output across runs. This is a Phase 3 test requirement (Section 6.5), not a nice-to-have.

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

## 5. Adapter Contract (REST API + Reference Adapters)

The REST API (5.1) is the actual product surface — `INV-3` exists precisely so that every frontend, including this spec's own reference adapters, is just an HTTP client against it, with no privileged access to the engine internals. `client-threejs` (5.2) ships first because a 3D reference is the most convincing demo, but it is the *first* graphical adapter, not the only valid one: Unity, Godot, a 2D canvas, a VR shell, or anything else can be built against 5.1 with zero engine-side changes — exactly like `client-cli` (5.4), the terminal adapter, already is. Section 5.3 is what makes a third party's compatibility claim checkable without this project's involvement.

### 5.1 REST API

Normative for any adapter, not just the two reference ones (5.2, 5.4).

**Base contract**:
- JSON over HTTP; `Content-Type: application/json` on every request and response body.
- Every response carries an `X-Spec-Version` header echoing the running `spec_version` (SPEC header, Section 3.5) — not a body field, so it doesn't touch the schemas in Section 3. An adapter MAY refuse to render a response whose major version it doesn't understand; the engine does not enforce this, adapters do.
- Errors use one envelope regardless of endpoint: `{ error: { code: string, message: string } }`. No error body ever includes ruleset text, graph data, or a stack trace — `INV-3` applies to error paths, not just the happy path.
- Status codes: `200` success, `204` no content (session deletion), `400` malformed request body, `404` unknown session/route or a disabled debug/metrics endpoint, `500` internal error (message only, via the envelope above).
- Versioning: adding an endpoint is a MINOR bump; changing an existing endpoint's method, path, or response shape, or changing the base contract itself, is MAJOR (Section 3.5).

**Endpoints**:

```
GET    /session/new?seed={optional}           → { session_id, seed }
GET    /room/current?session_id={id}          → ResolvedRoomResponse
POST   /interact                               → InteractRequest body → InteractResponse
DELETE /session/{session_id}                   → 204, frees in-memory session state; idempotent
GET    /debug/trace?session_id={id}            → DebugTrace  (only if server debug mode on, else 404)
GET    /health                                 → { status: "ok" }, liveness/readiness for deployment (6.7)
GET    /metrics                                → { counters, gauges } snapshot from the 2.1 Metrics interface, or 404 if metrics disabled
```

Session lifecycle: `GET /session/new` creates a session; `GET /room/current` and `POST /interact` operate on an existing one; `DELETE /session/{id}` explicitly tears one down (deleting an already-deleted or unknown session still returns `204`, not `404` — deletion is idempotent by design). Sessions are in-memory only (6.5) — nothing here is persistence, and a server restart drops all sessions, which is expected for alpha (Section 7).

No websocket requirement for v0 — turn-based interaction tolerates request/response latency. This is a deliberate scope cut, not an oversight; revisit only if the alpha's interaction pacing demands it (Section 7, open question).

### 5.2 ECS Mapping (Three.js Adapter — First Graphical Reference)

Any coding agent building `packages/client-threejs` should structure it as a minimal hand-rolled ECS. The reference adapter has no external ECS library dependency — setup cost isn't justified until scene complexity demands it; a fork is free to graduate to a real ECS library:

| Concept | Implementation |
|---|---|
| Entity | `id: string`, matches `Entity.id` from schema verbatim |
| Components | Plain object keyed by entity id: `{ archetype, semantic_tags, affordances, salience, layout_hint, state }` — direct copy of schema fields, no client-side reinterpretation |
| `LayoutSystem` | Pure function: `(Entity[], layout_hint) → Map<id, THREE.Vector3>`. This is the primary creative surface for adapter authors — same schema, different LayoutSystem = different spatial feel |
| `MeshResolutionSystem` | Pure function: `(archetype, semantic_tags) → THREE.Object3D`. Lookup table, extensible, is the "archetype → matter" mapping. Adapter authors can filter `semantic_tags` by modifier (e.g. tags carrying an author-defined rendering-hint modifier) to separate visual hints from semantic identity — see Section 3.6.1 |
| `InteractionSystem` | Raycast on click → resolve target entity id + affordance → `POST /interact` → await → hand result to `SyncSystem` |
| `SyncSystem` | `InteractResponse → mutate components → trigger LayoutSystem + MeshResolutionSystem re-run for changed entities only` |

**Adapter MUST NOT**: cache or reconstruct graph structure client-side, implement any predicate/rule logic, or make movement decisions locally under any circumstance (even "obviously safe" ones) — this is the hard boundary of INV-3, not a soft guideline.

### 5.3 Conformance

A conformance suite of fixed `ResolvedRoomResponse` JSON fixtures (Section 6.5) must render without error in a reference adapter. Any third-party adapter (Godot, Unity, future forks) implementing 5.1 and claiming schema compatibility should be checkable against the same fixture set without needing this spec's author involved — this is what makes a plugin ecosystem of independent frontends viable, rather than one this project must own. `client-threejs` and `client-cli` are the two adapters this spec builds and holds to that bar itself; nothing about 5.1 assumes either of them exists.

### 5.4 Terminal Reference Client (Testing Interface)

The simplest possible adapter: a REPL that speaks the REST API (5.1) over stdin/stdout, nothing else. It exists so the engine is fully usable and testable without any graphical frontend — where `client-threejs` is a reference adapter for players, `client-cli` is a reference adapter for authors, testers, and CI.

**Behavior**: `GET /session/new` on start → print the room (id, archetype, salience-ordered objects with affordances, exits) → read a line (`<object_id> <affordance>`) → `POST /interact` → print `new_room`, repeat. It also accepts a scripted input-log file (one action per line) for headless replay — the same input-log shape `INV-2` determinism already requires, so a recorded session can be replayed and diffed byte-for-byte with no one at the keyboard.

**Verbosity**: a single `--verbosity` flag (or `SDC_LOG_LEVEL` env var) reusing the Section 2.1 `Logger` levels: `error` prints transitions only; `warn` (default) adds affordances and exits; `info` adds full entity fields as pretty JSON; `debug` adds the raw `DebugTrace` (4.6, when the server has debug mode on) plus a per-session summary — turns, requests, latency — read from the Section 2.1 `Metrics` interface on exit. This is the wiring point for both supporting systems from Section 2.1: the CLI does not reimplement logging or metrics, it is a display surface for them.

**Constraints**: identical to `client-threejs` under `INV-3` — `packages/client-cli` imports wire-protocol types from `packages/schema` only, never `packages/rule-engine` or `packages/corpus-builder`. Because it has no rendering dependency, it can load and print `fixtures/rooms/*.json` directly (5.3) with nothing else running, making it the first conformance check exercised in the build order (6.5) — ahead of the graphical client (6.6).

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
│   ├── client-cli/
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
- Tagging step → populates `semantic_tags` with structured tags (Section 3.6 grammar), `archetype` (initial heuristic assignment is acceptable for alpha; author-refined tagging is post-alpha)
- Provenance: every graph node carries `source_refs: string[]` — the id(s) of the raw corpus document(s) it was built from — so any node is traceable back to input. Documented in `GRAPH_FORMAT.md` alongside the rest of the internal format.
- Per-stage instrumentation: embedding, clustering, edge-weighting, and tagging each report through the §2.1 `Logger` (start/end, input/output counts, warnings) and `Metrics` (duration, counts) — the same interfaces `server` uses, not a parallel mechanism.
- Output: `graph.json` — internal-only format, never sent to any client (INV-3), consumed exclusively by `rule-engine`. Also outputs `tag-registry.yaml` — the vocabulary of tag segment paths discovered from the corpus (Section 3.6.2).

**Development transparency and testing**: the build-time pipeline gets the same inspectability `client-cli` (§5.4) and `DebugTrace` (§4.6) give the runtime — scoped to `corpus-builder` itself, since a client seeing graph/corpus internals would violate `INV-3`.
- `corpus-builder inspect --graph <graph.json> --node <id>` prints a node's fields plus its `source_refs` chain back to raw documents. `corpus-builder inspect --graph <graph.json> --trace` prints the `BuildTrace` below, if the build that produced the graph was run with `--trace`. Both reuse the `--verbosity` levels from §5.4 for one consistent developer experience across the two tools.
- `corpus-builder build --trace` is flag-gated, off by default, zero overhead when disabled (the same rule §4.6 sets for `DebugTrace`). It writes `build-trace.json`, the build-time analogue of `DebugTrace`:

```typescript
interface BuildTrace {
  stages: {
    stage: "embedding" | "clustering" | "edge_weighting" | "tagging";
    input_count: number;
    output_count: number;
    duration_ms: number;
    warnings: string[];
  }[];
  node_provenance: Record<string, string[]>;  // node id -> source document ids
}
```

**Exit**:
- Running the CLI against a small test corpus (fixture, ~20 documents) produces a valid `graph.json`, and every node in it has non-empty `source_refs` resolving to real documents in that fixture corpus.
- `graph.json` schema, `source_refs`, and `BuildTrace` are documented in `packages/corpus-builder/GRAPH_FORMAT.md`. As internal formats that never cross the client boundary, they are versioned less strictly than the client-facing schema in Section 3.
- Re-running the build with identical input produces byte-identical output — `graph.json` and, when `--trace` is set, `build-trace.json` too (determinism extends to build-time transparency artifacts, not just the graph).
- `corpus-builder inspect --node <id>` and `corpus-builder inspect --trace` both run against the fixture without error.

### 6.4 Phase 3 — Rule Engine

**Entry**: Phase 2 complete (needs `graph.json` to test against).

**Build**: `packages/rule-engine/src/`
- `parser.ts` — DSL grammar (4.2) → AST
- `solver.ts` — `evaluateLayers()`, `resolveMove()`, `populate()` per 4.1/4.4 pseudocode, normatively
- `layer-resolution.ts` — 4.3 ordering logic
- `debug-trace.ts` — 4.6, flag-gated

**Exit**:
- `resolveMove` and `populate` both call the identical `evaluateLayers()` function (checked by a test that asserts function identity, not just output equivalence — per 4.4 requirement).
- Determinism test passes: same `(graph.json, ruleset.dsl, seed, input-log)` in, byte-identical output across 2 independent runs (INV-2, 4.5).
- A ruleset fixture with two `override`-mode layers producing contradictory hard decisions does NOT throw — it resolves via declaration order and logs a warning (INV-4 conformance test).
- Null-ruleset case (empty `layers: []`) produces pure nearest-neighbor drift with no errors (the "ambiguous relativistic traversal" default is exercised as a real, tested code path, not assumed).

### 6.5 Phase 4 — Server + Terminal Client + Conformance Fixtures

**Entry**: Phase 3 complete.

**Build**: `packages/server/src/` — implements the REST API (5.1) exactly. Session management (in-memory acceptable for alpha; persistence is a post-alpha concern, flagged in Section 7). Calls `rule-engine` for all resolution; server itself contains no rule logic. Wires in the Section 2.1 `Logger` and `Metrics` interfaces and the debug-flag gate for `GET /debug/trace`.

Also build `packages/client-cli/src/` per 5.4 — the terminal reference client. It is the cheapest way to exercise a live server manually, the display surface for the `Logger`/`Metrics` interfaces just wired into the server, and the first adapter validated against the fixtures below, ahead of Phase 5's graphical client.

Simultaneously populate `fixtures/`:
- `fixtures/rooms/*.json` — a set of ~10 hand-curated `ResolvedRoomResponse` payloads spanning archetype variety (at minimum: one `container` with 5+ objects, one near-empty room, one with all-soft-weighted population, one exercising `portal` archetype)
- `fixtures/rulesets/*.dsl` — at least: null ruleset, single-global-layer ruleset, multi-layer-with-conflict ruleset (exercises 4.3's messy-resolution path deliberately)

**Exit**:
- All Section 5.1 endpoints respond with schema-valid payloads (validated against Phase 1 types).
- `fixtures/` populated and referenced by an automated test that round-trips each fixture ruleset through the server and asserts the response validates against `ResolvedRoomResponse`.
- This fixture set is what Section 5.3 conformance depends on — it must be genuinely engine-agnostic (no Three.js-specific assumptions baked into fixture content).
- `packages/client-cli` renders all `fixtures/rooms/*.json` without error (5.3 conformance, exercised here first) and can drive a live server session end-to-end through its REPL, including a `--verbosity=debug` run that prints `DebugTrace` output when server debug mode is on.
- No file in `packages/client-cli/src/` imports anything from `packages/rule-engine` or `packages/corpus-builder`, enforced by an ESLint import-boundary rule so `INV-3` holds from the first client built, not just the graphical one.

### 6.6 Phase 5 — Three.js Reference Client

**Entry**: Phase 4 complete (needs a running server to develop against, or at minimum the fixture set for offline development).

**Build**: `packages/client-threejs/src/` per Section 5.2. Minimum viable scene: load `GET /session/new` → `GET /room/current` → render room + objects via `LayoutSystem`/`MeshResolutionSystem` → capture one click interaction → `POST /interact` → re-render.

**Exit**:
- Running the client against the Phase 4 server, a player can: see a rendered room, click an object with an `enter`/`traverse` affordance, and observe a room transition (new objects render, matching a fresh `ResolvedRoomResponse`).
- Client renders all fixtures from `fixtures/rooms/*.json` without error when pointed at them directly (server bypassed) — this is the conformance check from 5.3, already exercised once by `client-cli` in Phase 4 (6.5) and repeated here for the graphical adapter.
- No file in `packages/client-threejs/src/` imports anything from `packages/rule-engine` or `packages/corpus-builder`, enforced by the same ESLint import-boundary rule introduced for `packages/client-cli` in Phase 4 (6.5) — so `INV-3` holds permanently across both reference adapters, independent of contributor awareness of this spec.

### 6.7 Phase 6 — Production Alpha Hardening

**Entry**: Phase 5 complete; end-to-end loop (corpus → graph → server → client → visible, interactive, movement-capable game) works.

**Build**: Not new features — hardening of the existing surface:
- Error handling at every protocol boundary (malformed ruleset, missing session, network failure client-side)
- Logging, metrics, and debug-flag wiring per §2.1 across all packages (structured `Logger` and `Metrics` interfaces, debug-gated trace/log verbosity)
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
- Batch-run tooling for an "emergent rules from test-run analysis" workflow — a future authoring aid requiring Phase 4's server plus a harness that runs many null-ruleset sessions and clusters resulting traces; not required for alpha

---

## 7. Open Questions for Iterative Refinement

Flagged explicitly rather than silently decided, for resolution during or after alpha:

- **Latency/perceived responsiveness**: request/response movement (5.1) was accepted knowingly given turn-based pacing; revisit if alpha playtesting shows it feels laggy rather than deliberate.
- **Tagging quality**: Phase 2's heuristic auto-tagging is an alpha stand-in using the structured tag grammar (Section 3.6). The tag registry (3.6.2) and configurable modifier registry (3.6.1) provide the machinery for author-refined tagging; what does the refinement *tooling* look like? (Likely a Phase 7+ concern, possibly folded into the rule editor. See `docs/tag-system-design.md` for the full design rationale.)
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
| Adapter | Any frontend implementing the REST API (5.1). `client-threejs` and `client-cli` are the two this spec builds and holds to conformance (5.3); neither is privileged over a third-party adapter built the same way. |
| Terminal reference client | The `client-cli` adapter (5.4): a REPL testing interface with no rendering dependency, built in Phase 4 ahead of the graphical client, display surface for the Logger/Metrics supporting systems (2.1). |
| Structured tag | A `semantic_tags` entry conforming to the grammar in Section 3.6: `[modifier,]segment[:segment...][=value]`. |
| Modifier registry | Author-configurable mapping of modifier names to behavior config. The engine provides the mechanism; authors define the entries (3.6.1). |
| Tag registry | Keys-only nested tree of valid tag segment paths, produced by the corpus-builder as a vocabulary contract (3.6.2). |
| Tag pattern | A glob-style string used with the `MATCHES` operator: `*` matches one segment, `**` matches zero or more (4.2). |
