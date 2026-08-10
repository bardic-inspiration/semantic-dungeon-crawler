# Tag System Design

`status: accepted`
`spec-amendment: 0.2.0`
`source: dnd-hirelings tag system analysis`

This document records the design of the structured tag system for the semantic
dungeon crawler engine. It is a companion to the SPEC.md amendments in Sections
3.6 and 4.2. The spec is the contract; this document is the rationale.

---

## 1. Problem

SPEC.md §3.1 defines `semantic_tags: string[]` as free-form strings populated by
build-time auto-tagging. Three consumers read these tags — the rule engine (DSL
predicates), the client (mesh resolution), and debug tooling — but the spec
provides no grammar, no vocabulary contract, and no way to query tags beyond
exact string matching (`CONTAINS`).

Tags are token addresses that can be read in volume to create rich slices of
precedent for procedural generation. A flat, unstructured string array limits
this: authors cannot write rules that match categories of tags, the pipeline
cannot distinguish rendering hints from semantic identity, and there is no
shared vocabulary between the corpus-builder (producer) and its consumers.

## 2. Source: dnd-hirelings tag system

The `dnd-hirelings` project (same org) has a mature tag system that encodes
every entity property as a structured tag string. Its core concepts:

### 2.1 Structured grammar

`[modifier,]segment[:segment...][=value]`

Parsed by `parseTag()` → `{ modifier, segments, value }`. Segments are
hierarchical, colon-separated, lowercase alphanumeric with hyphens/underscores.
Values are opaque scalars after `=`. The grammar is uniform — every tag in the
system, from `skill:arcana=3` to `req,class:fighter`, follows the same parse
path.

Reference: `src/logic/tags.js` — `parseTag()`, `buildTag()`,
`MODIFIER_REGISTRY`.

### 2.2 Keys-only registry

A nested tree of valid segment paths with no values or metadata — a pure
structural skeleton. The validator rejects anything that isn't a keys-only map.
YAML serialization uses bare `key:` for leaves.

Closed categories (e.g. `class: { fighter, druid, ... }`) store their preset
values as leaf children. Open categories (e.g. `level`, `hp`) accept arbitrary
`=value` scalars.

Reference: `src/logic/tagRegistry.js` — `addTagToRegistry()`,
`seedTagRegistry()`, `pathExists()`, `serializeRegistry()`.

### 2.3 Modifier registry

Pluggable prefixes (`req`, `block`, `bonus`, `dyn`) with descriptions and
routing info. Each modifier maps to a `{ prefix, description, taskField? }`
config. Modifiers are always a single token before the `,` separator.

In dnd-hirelings, modifiers route tags to different entity fields (e.g. `req`
and `block` route to `requirements`, everything else to `attributes`). This is
game-specific behavior, not a universal pattern.

Reference: `src/logic/tags.js` — `MODIFIER_REGISTRY`.

### 2.4 Registry-bounded values

Three rules that resolve the structure-vs-data ambiguity:

1. Every segment in a tag string is registered by definition.
2. Explicit `=value` scalars are never registered.
3. A registered leaf carries an implied value, resolved per use case.

This design was chosen over three alternatives (registry value lists,
enum-flag metadata, typed per-node schema) because it requires no data
migration, no registry format change, and the keys-only model survives intact.

Reference: `docs/tag-values.md` — full design record with comparison.

### 2.5 Pluggable value resolvers

A `VALUE_RESOLVER_REGISTRY` maps use-case keys to resolution functions:

- `match` — explicit value if present, else `true` for a registered leaf
- `display` — explicit value if present, else the terminal segment string
- `numeric` — explicit value coerced to Number, else invalid

Each resolver defines its own semantics independently. Adding a use case means
adding a resolver, never a registry or data-schema change.

Reference: `src/logic/tagValues.js` — `VALUE_RESOLVER_REGISTRY`,
`resolveTagValue()`.

### 2.6 Pattern matching

Three match modes in `MATCH_MODE_REGISTRY`:

- `exact` — same segment count, pairwise match
- `numbered` — compare only the first N segments (prefix matching)
- `open` — glob-style: `*` matches one segment, `**` matches zero or more

Wildcards are asymmetric — patterns can have `*`/`**`, tag segments are always
literal. Value comparison operators (`==`, `>=`, `<=`, `>`, `<`) apply after
path matching.

Reference: `src/logic/tagMatching.js` — `MATCH_MODE_REGISTRY`,
`VALUE_COMPARE_REGISTRY`.

## 3. What transfers, what doesn't

This is an authoring engine — a configurable developer toolkit for rules-based
games, not a single game. The tag system must be a configurable primitive: the
engine provides grammar, parsing, registry machinery, and pattern matching; game
authors configure modifiers, registry content, and value interpretation rules to
fit their domain.

### Transfers directly

| Concept | Why |
|---|---|
| Structured grammar | Hierarchical segments are more expressive than flat strings for auto-tagging, rule predicates, and mesh resolution |
| Keys-only registry | Serves as a vocabulary contract between corpus-builder (producer) and rule-engine/client (consumers) |
| Registry-bounded values | Cleanly separates categorical tags from scalar tags; auto-tagger can produce both |
| Pluggable resolvers | Three consumers (rule engine, renderer, debug) need different interpretations of the same tags |
| Pattern matching | Glob-style matching makes hierarchical tags queryable by category in DSL predicates |
| Auto-registration | Tags register their segment paths on creation, keeping the registry in sync |

### Transfers with adaptation

| Concept | Adaptation |
|---|---|
| Modifier registry | dnd-hirelings hardcodes four game-specific modifiers. This engine provides the grammar slot and registry mechanism; authors populate it. No built-in modifiers. |
| Suggest-don't-block | dnd-hirelings auto-registers unknown tags. This engine treats the registry as advisory (warn, never reject) per INV-4. |

### Does not transfer

| Concept | Why |
|---|---|
| Dynamic/computed tags | The dungeon crawler has `EntityState` and `dynamic.*` DSL properties for runtime-computed values. Computed tags would overlap. |
| Single authoring surface (Tag Registry Modal) | No authoring UI until the rule editor (Phase 7+). |
| Locked mode | INV-4 forbids taste-policing. The engine validates well-formedness, never coherence. |
| Structural truncation / UX patterns | Client-specific; the reference Three.js adapter can adopt these independently. |

## 4. Design decisions

### 4.1 Tag grammar

The grammar is the fixed contract — the one thing that is not configurable,
because every consumer must agree on how to parse a tag string.

```ebnf
tag           = [ modifier "," ] segment_path [ "=" value ] ;
modifier      = identifier ;
segment_path  = segment { ":" segment } ;
segment       = seg_start { seg_char } ;
seg_start     = lower | digit ;
seg_char      = lower | digit | "-" | "_" ;
value         = value_char { value_char } ;
value_char    = ? any character except NUL ? ;
identifier    = seg_start { seg_char } ;
lower         = "a" | "b" | ... | "z" ;
digit         = "0" | "1" | ... | "9" ;
```

Tags remain `string[]` on the wire. The grammar defines a well-formedness
validation function, not a type change. Existing free-form strings that happen
to match the grammar parse normally; those that don't are syntactically invalid
but MUST NOT be rejected at runtime (INV-4). The validation function is a
build-time and authoring-time tool.

**Parse output**: `{ modifier: string | null, segments: string[], value: string | null, raw: string }`

**Examples**:
```
environment:terrain:forest    → { modifier: null, segments: ["environment","terrain","forest"], value: null }
mood:tense                    → { modifier: null, segments: ["mood","tense"], value: null }
density=0.7                   → { modifier: null, segments: ["density"], value: "0.7" }
viz,material:stone:rough      → { modifier: "viz", segments: ["material","stone","rough"], value: null }
meta,confidence=0.85          → { modifier: "meta", segments: ["confidence"], value: "0.85" }
gen,archetype-hint:dungeon    → { modifier: "gen", segments: ["archetype-hint","dungeon"], value: null }
```

### 4.2 Modifier registry (configurable extension point)

The engine provides:

- The grammar slot for an optional `modifier,` prefix
- `parseTag()` extracting the modifier token
- A modifier registry data structure: `Record<string, ModifierConfig>`
- No built-in modifiers — zero is a valid configuration

Authors populate the modifier registry in their ruleset configuration. Each
entry maps a modifier name to an author-defined config object. The engine reads
the config to determine how modifiers affect tag routing, filtering, and
resolution. The config format is intentionally open-ended — the engine defines
the dispatch mechanism, authors define what each modifier means.

```yaml
# Example modifier config — illustrative, not prescriptive
# Lives in the ruleset or a companion config file
modifiers:
  viz:
    description: "Rendering hints for mesh resolution"
    filter_expression: "static.archetype != 'portal'"
  gen:
    description: "Generation directives for procedural content"
  meta:
    description: "Pipeline metadata"
  ctx:
    description: "Contextual relationship annotations"
    filter_expression: "static.edge_weight > 0.5"
```

Modifier entries can carry expression-based rules using the same DSL grammar
that authors already know from rule predicates (Section 4.2). These expressions
configure how the engine treats tags with that modifier — filtering, routing, or
resolution behavior. This avoids hardcoding per-modifier logic in the engine
while giving authors full control.

**Versioning**: The modifier registry mechanism (parsing, dispatch) is engine
schema. Changing it is a MAJOR bump. Authors adding/removing modifier entries in
their config is author content and requires no engine version bump.

### 4.3 Tag registry (vocabulary contract)

A keys-only nested tree of valid segment paths. No values, no metadata — pure
structural skeleton. The format is identical to dnd-hirelings: leaves are `{}`,
YAML serialization uses bare `key:` for leaves.

```yaml
# Example registry — content depends on the corpus, not the engine
theme:
  gothic:
  pastoral:
  industrial:
  surreal:
mood:
  tense:
  calm:
  chaotic:
  melancholic:
creature:
  hostile:
    undead:
    beast:
  neutral:
  friendly:
environment:
  terrain:
    forest:
    cave:
    urban:
  weather:
lighting:
era:
density:
```

The registry is:

- **Produced** by the corpus-builder as `tag-registry.yaml` alongside
  `graph.json`. The pipeline discovers categories from corpus analysis and
  outputs the vocabulary it found.
- **Consumed** by rule-engine and client as a vocabulary reference. Rule authors
  consult it when writing predicates; the client can use it for mesh resolution
  lookups.
- **Extended** by authors who can merge their own entries into the
  pipeline-generated registry.
- **Advisory** — unregistered tags are syntactically valid. The pipeline warns
  on orphaned tags but never rejects them (INV-4 compliance).

**Registry operations** (pure functions, return new objects):

- `addPath(registry, segments)` — insert a segment path, creating intermediates
- `deletePath(registry, segments)` — remove a node and its subtree
- `pathExists(registry, segments)` — check full path existence
- `isLeaf(registry, segments)` — true for childless registered nodes
- `serializeRegistry(registry)` → YAML string
- `parseRegistry(yamlString)` → registry object (normalizes leaves to `{}`)
- `validateRegistry(yamlString)` → errors (must be keys-only, valid segment
  charset)

### 4.4 Registry-bounded values (configurable resolution)

Three rules adapted from dnd-hirelings. These are engine-level invariants:

1. **Every segment path is registrable.** The pipeline auto-registers paths for
   every tag it produces. Authors can pre-register paths before the pipeline
   runs. Registration is vocabulary — it records what paths exist, not what
   values they hold.
2. **Explicit `=value` scalars are never registered.** Values are runtime data.
   The registry holds structure only.
3. **A registered leaf carries an implied value, resolved per use case.** The
   implied value depends on who is asking — the resolution function is pluggable.

**Value resolver dispatch** is engine machinery. The **resolver set** is
configurable. Three default resolvers ship as sensible starting points:

| Resolver | Explicit `=value` | Leaf terminal | Non-leaf | Overridable? |
|---|---|---|---|---|
| `match` | the value string | `true` (presence) | `true` | Yes |
| `display` | the value string | terminal segment string | `null` | Yes |
| `numeric` | coerced to Number | `1.0` (presence) | `null` | Yes |

Authors can add custom resolvers or override the defaults in their ruleset
config. The engine guarantees the three defaults exist at startup but does not
prevent replacement. A custom resolver is a function
`(parsedTag, registry) → resolvedValue`.

**Why these three defaults:**

- `match` is used by the rule engine for predicate evaluation. Presence of a
  leaf tag evaluates to `true`; explicit values are compared as strings.
- `display` is used by debug trace and logging. Leaf tags display their terminal
  segment (e.g. `class:fighter` → `"fighter"`); non-leaf tags are structural
  references and display nothing.
- `numeric` is used by the rule engine for numeric comparisons and reweight
  factors. Leaf presence resolves to `1.0` so that presence/absence can
  participate in arithmetic expressions.

### 4.5 Pattern matching (MATCHES operator)

The MATCHES operator adds glob-style pattern matching to the DSL grammar,
alongside the existing CONTAINS operator for exact string matching.

**Pattern grammar** (asymmetric — wildcards on pattern side only):

```ebnf
pattern       = [ mod_pattern "," ] seg_pattern [ "=" val_pattern ] ;
mod_pattern   = identifier | "*" ;
seg_pattern   = seg_or_wild { ":" seg_or_wild } ;
seg_or_wild   = identifier | "*" | "**" ;
val_pattern   = value | "*" ;
```

- `*` matches exactly one segment
- `**` matches zero or more segments
- Wildcards exist only in patterns, never in tag segments (asymmetric)
- `\*` is a literal asterisk, `\:` a literal colon in patterns

**DSL usage examples**:

```
static.tags CONTAINS "mood:tense"              -- exact match (backward-compatible)
static.tags MATCHES "theme:*"                   -- any tag in the theme category
static.tags MATCHES "creature:hostile:**"        -- any hostile creature subtype
static.tags MATCHES "*,material:stone"           -- any modifier on material:stone
static.tags MATCHES "**:undead"                  -- undead at any depth
matches(static.tags, "gen,**")                   -- function form: any gen-modified tag
```

**CONTAINS vs MATCHES**:

- `CONTAINS` performs exact string comparison against each element of the array.
  It is the existing operator, unchanged.
- `MATCHES` parses both the pattern and each tag via the tag grammar, then
  applies glob matching on the parsed segments. It is the new operator.

Both return a boolean when used with `static.tags` (an array): true if any
element matches.

### 4.6 Build pipeline integration

The tagging step in the build pipeline (SPEC §2, final step) gains a structured
output without architectural change:

1. **Structured tags on each entity**: grammar-conformant strings in
   `semantic_tags`. The auto-tagger uses appropriate modifiers from the author's
   modifier config and hierarchical segments from corpus analysis.
2. **Tag registry file**: `tag-registry.yaml` capturing the vocabulary
   discovered from the corpus. Produced alongside `graph.json` as a build
   artifact.

The auto-tagger's responsibilities:
- Parse corpus content into hierarchical categories
- Produce grammar-conformant tag strings
- Apply modifiers from the author's config where the auto-tagger has enough
  signal (e.g. pipeline metadata tags get the configured metadata modifier)
- Build the registry as a side effect of tagging
- Output `tag-registry.yaml` alongside `graph.json`

Authors who want to pre-define categories can provide a seed registry that the
pipeline merges with its discovered categories.

## 5. Example configurations

These illustrate how different game domains would configure the tag system.
They are not engine defaults — they are author content.

### 5.1 Fantasy dungeon crawler

```yaml
# Modifier config
modifiers:
  viz:
    description: "Visual rendering hints"
  lore:
    description: "Lore-relevant tags for narrative queries"

# Registry (seed — pipeline extends with discovered categories)
environment:
  terrain:
    cave:
    forest:
    ruins:
  atmosphere:
    dark:
    misty:
creature:
  hostile:
  neutral:
  friendly:
item:
  weapon:
  armor:
  consumable:
theme:
  gothic:
  arcane:
```

Example tags: `environment:terrain:cave`, `viz,lighting:dim=0.3`,
`creature:hostile:undead`, `lore,origin:ancient-empire`.

### 5.2 Sci-fi exploration

```yaml
modifiers:
  scan:
    description: "Sensor-detectable properties"
  hazard:
    description: "Environmental hazards"

environment:
  biome:
    desert:
    ocean:
    volcanic:
  gravity:
  radiation:
structure:
  station:
  wreck:
  colony:
tech-level:
  primitive:
  advanced:
  alien:
```

Example tags: `environment:biome:volcanic`, `scan,radiation=4.2`,
`hazard,atmosphere:toxic`, `structure:wreck`.

### 5.3 Literary/abstract corpus

```yaml
modifiers:
  tone:
    description: "Narrative tone markers"
  ref:
    description: "Intertextual references"

theme:
  mortality:
  power:
  identity:
  isolation:
style:
  dense:
  sparse:
  lyrical:
period:
  modernist:
  victorian:
  contemporary:
```

Example tags: `theme:mortality:decay`, `tone,mood:melancholic`,
`ref,author:kafka`, `style:dense`, `period:modernist`.

## 6. Conformance implications

### 6.1 Phase 1 (Schema)

`fixtures/entity.example.json` must use structured tags conforming to the
grammar. Example:

```json
{
  "id": "node-01",
  "archetype": "container",
  "semantic_tags": ["environment:terrain:cave", "mood:tense", "lighting=dim"],
  "embedding_ref": "vec-01",
  "affordances": ["enter", "traverse"],
  "salience": 0.8,
  "contains": ["obj-01", "obj-02"],
  "layout_hint": { "scale": "large", "density": 0.6, "shape_bias": "radial" },
  "state": { "coherence": 0.9, "visited": false }
}
```

### 6.2 Phase 2 (Corpus Builder)

The corpus-builder must output:
- Entities with grammar-conformant `semantic_tags`
- A `tag-registry.yaml` file alongside `graph.json`

### 6.3 Phase 3 (Rule Engine)

The DSL parser must support both `CONTAINS` and `MATCHES` operators. At least
one ruleset fixture must exercise `MATCHES` with glob patterns.

### 6.4 Phase 4 (Conformance Fixtures)

New fixtures needed:
- `fixtures/tags.valid.json` — well-formed tag strings covering the grammar
- `fixtures/tags.invalid.json` — malformed strings for validation coverage
- At least one ruleset in `fixtures/rulesets/` must use `MATCHES`

## 7. Rejected alternatives

### 7.1 Typed tag objects instead of strings

Replace `string[]` with `ParsedTag[]` on the wire. Rejected: breaks
backward compatibility, inflates payload size, and forces every consumer to
handle a structured object. The grammar achieves the same expressiveness with
`parseTag()` at the consumer boundary — parse on read, serialize on write.

### 7.2 Hardcoded modifier set in the engine

Ship the engine with built-in modifiers (e.g. `viz,`, `gen,`, `meta,`,
`ctx,`). Rejected: this is a toolkit, not a single game. The engine provides
the grammar slot and registry mechanism; authors define what modifiers mean.
Hardcoded modifiers would impose a single game's taxonomy on every project
built with the engine.

### 7.3 Registry value lists

Store preset values in the registry itself (e.g.
`class: [druid, fighter, ...]`). Rejected for the same reasons as in
dnd-hirelings: breaks the keys-only model, the validator, and the YAML
round-trip. Registry-bounded values (§4.4) achieve the same expressiveness
without any of it.

### 7.4 Typed per-node schema

Registry nodes declare a value type (`enum`, `string`, `number`, `none`).
Deferred: the most machinery to build for expressiveness no current feature
needs. Compatible as a future sidecar annotation — a schema layer could
later annotate the same keys-only tree from a separate file.
