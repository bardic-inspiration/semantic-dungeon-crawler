# Naming Conventions

Single source of truth for casing and naming across code, schemas, docs, and
process artifacts in this repo. When a doc names a function, field, file, or
identifier, it follows this doc — and every doc naming the *same* thing must
use the *same* spelling (`docs/documentation-standards.md`: duplication
drifts).

## The one deliberate split

Two vocabularies coexist on purpose — this is not an inconsistency to fix, it
*is* the convention:

1. **TypeScript identifiers** (variables, functions, classes, types) —
   idiomatic TS/JS casing, below.
2. **Wire-format data** (JSON field names in `packages/schema` — SPEC §3 —
   and any payload/artifact built from it: the REST API, `graph.json`,
   `tag-registry.yaml`, `build-trace.json`, `DebugTrace`) — `snake_case`,
   matching the field names SPEC §3 already fixes.

Code that *manipulates* the data uses TS conventions; the data itself keeps
the field names the schema defines. A function is `resolveMove`; the field it
reads is `layout_hint`. Both are correct in the same line.

## TypeScript code

| Kind | Convention | Example |
|---|---|---|
| Variables & functions | `camelCase` | `resolveMove`, `evaluateLayers`, `isLeaf` |
| Types, interfaces, classes | `PascalCase`, no `I`-prefix | `Entity`, `ResolvedRoomResponse`, `LayoutSystem` |
| Type parameters | Single capital or `PascalCase` | `T`, `TEntity` |
| Module-level constants | `UPPER_SNAKE_CASE` | `MAX_ROOM_OBJECTS` |
| Booleans | `is`/`has`/`can` prefix | `isEmpty`, `hasCandidates` |
| Private members | TS `private`/module scoping, no `_` prefix | — |

Enum members and string-literal unions that model wire data (`Archetype`,
`Affordance`, `Effect.kind`, and similar) are `snake_case`, following the
wire-data rule below, not the TS-identifier rule — they're data values, not
identifiers.

## Files & directories

- Source files: `kebab-case.ts` (`layer-resolution.ts`, `debug-trace.ts`).
  Tests co-locate as `<name>.test.ts` (`docs/testing-standards.md`).
- Packages: `kebab-case` under `packages/` (`rule-engine`, `client-threejs`);
  each `package.json` `"name"` matches its directory.
- Root and package meta-files keep the standard OSS convention of
  `ALL-CAPS.md`: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`,
  `SPEC.md`, `AGENTS.md`, `CLAUDE.md`, `GRAPH_FORMAT.md`.
- Everything under `docs/`: `kebab-case.md` (`testing-standards.md`).

## Schema / wire-protocol data (SPEC §3)

- JSON field names: `snake_case` (`session_id`, `semantic_tags`,
  `layout_hint`).
- The TypeScript interface/type describing that data is still `PascalCase` —
  the field-name rule governs the fields, not the type name.
- String-literal values on the wire: `snake_case` (`hard_allow`,
  `embedding_proximity`).
- REST paths (SPEC §5.1): lowercase path segments; path/body params match the
  field name they carry (`session_id`, not `sessionId`).

## DSL (predicate grammar, SPEC §4.2)

- Property paths (`static.*`, `dynamic.*`): `snake_case`, mirroring the
  schema fields they read (`static.edge_weight`, `dynamic.turn_count`).
- Reserved functions (`contains`, `distance`, `recent`, `matches`):
  lowercase, no separators — this is DSL surface, not TypeScript, and is kept
  deliberately minimal (SPEC §4.2).
- Grammar/EBNF token names (`segment_path`, `seg_start`, `mod_pattern`):
  `snake_case`, standard EBNF convention. Used identically in SPEC §3.6/§4.2
  and `docs/tag-system-design.md`.

## Git & process

These already have dedicated docs — linked, not restated:

- Branches and commits: `docs/commit-standards.md`, `CONTRIBUTING.md`
  ("Branching").
- Issue/PR labels: lowercase, colon-scoped where hierarchical (`phase:0`,
  `task`, `bug`).

## Keeping this cohesive

`SPEC.md` §4.1/§4.4, `AGENTS.md`, `docs/testing-standards.md`, and
`docs/roadmap.md` all name the same rule-engine functions —
`resolveMove`, `populate`, `evaluateLayers`. Renaming one of them is a rename
everywhere they're mentioned, in the same PR (`docs/documentation-standards.md`
"Keep in sync"). Same rule for any other identifier named in more than one
doc.
