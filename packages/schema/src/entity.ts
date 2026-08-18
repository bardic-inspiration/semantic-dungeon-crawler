// packages/schema/src/entity.ts
//
// SPEC §3.1 (Entity, SourceSpan) and §3.6 (structured tag grammar). The literal
// client-facing contract (INV-3): field names/types are `snake_case` wire data
// (docs/naming-conventions.md). Types + well-formedness helpers only — no runtime
// engine logic (SPEC §6.2 Phase 1). Well-formedness, never coherence (INV-4).

// §3.1 — open extension points. Adding a literal is a MINOR bump (§3.5); the
// trailing `string` is what keeps that additive.
export type Archetype =
  | "container" // room-like; implies "enter"/"traverse" affordances typically present
  | "readable"
  | "actor"
  | "portal"
  | "prop"
  | string;

export type Affordance =
  "enter" | "traverse" | "read" | "take" | "inspect" | "speak" | string;

// §3.1 (A1) — client-facing positional provenance for `Entity.prose`.
export interface SourceSpan {
  source: string; // human/machine-legible source id (e.g. "gutenberg:11")
  char_ranges: string; // CSV of character range(s), e.g. "1024-1330,1450-1502"
  members?: string[]; // §0.10.0 (B6): member span ids of a composite; absent for a contiguous leaf span
}

export interface LayoutHint {
  scale: "small" | "medium" | "large";
  density: number; // 0.0–1.0, target population density if this entity is a container
  shape_bias: string; // open string — adapter-interpreted, e.g. "vertical", "radial"
}

export interface EntityState {
  local_coherence: number; // 0.0–1.0; §0.10.0 (B5) embedding-neighborhood tightness — engine-produced
  visited: boolean; // §0.9.0 (A3): true iff this entity's address-token is in dynamic.visited_set
}

export interface Entity {
  id: string; // §0.9.0 (A2): EPHEMERAL per-resolution id, replay-stable via the seed (§4.5)
  archetype: Archetype; // determines renderer interpretation (§3.4, A13)
  semantic_tags: string[]; // structured tags — grammar in §3.6; stays string[] on the wire
  embedding_ref: string; // pointer to vector in graph.json, NEVER the raw vector (INV-3)
  affordances: Affordance[]; // legal interaction verbs; default set from the interpretation lookup (A13)
  salience: number; // 0.0–1.0, render prominence / population weight (§3.4, A13)
  prose: string; // §0.9.0 (A1): verbatim source-span excerpt — CLIENT-FACING; "" if none
  source_span: SourceSpan; // §0.9.0 (A1): positional provenance for `prose` — CLIENT-FACING
  contains: string[]; // §0.9.0 (A3): child address-tokens (composite member_tags), resolved at interpretation time
  layout_hint: LayoutHint; // produced by the interpretation lookup at resolution (§3.4, A13)
  state: EntityState;
}

// §3.6.1 — author-defined modifier behavior, keyed by modifier token in a
// Ruleset's `modifier_registry` (§3.4). No modifiers are built into the engine;
// entries may carry §4.2 DSL expression strings the engine evaluates but authors
// write. The shape is intentionally open at 0.1.0 — the dispatch mechanism that
// reads it is Phase 3 (§6.4).
export interface ModifierConfig {
  [key: string]: unknown;
}

// §3.6 — structured-tag PARSE OUTPUT. `semantic_tags` stays `string[]` on the
// wire (§3.6); this is the well-formedness view of one tag, not the field type.
export interface ParsedTag {
  modifier: string | null;
  segments: string[];
  value: string | null;
  raw: string;
}

// §3.6 EBNF: segment = seg_start { seg_char }, seg_start = LOWER | DIGIT,
// seg_char = LOWER | DIGIT | "-" | "_". Same charset used for `modifier`.
const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Parse a `semantic_tags` string per the §3.6 grammar:
 *   tag = [ modifier "," ] segment_path [ "=" value ]
 * Returns the structured parse, or `null` if the string is not well-formed.
 * Validates SYNTAX only (INV-4): unknown modifiers / unregistered paths are legal.
 */
export function parseTag(raw: string): ParsedTag | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw.includes("\0")) return null; // value_char = any character except NUL

  // `value` is everything after the first "=" (value_char admits ":" "," "=").
  const equalsIndex = raw.indexOf("=");
  let head: string;
  let value: string | null;
  if (equalsIndex === -1) {
    head = raw;
    value = null;
  } else {
    head = raw.slice(0, equalsIndex);
    value = raw.slice(equalsIndex + 1);
    if (value.length === 0) return null; // value = value_char { value_char } — at least one char
  }

  // An optional `modifier,` prefix precedes the segment path. A segment can never
  // contain ",", so the first comma in `head` (if any) delimits the modifier.
  const commaIndex = head.indexOf(",");
  let modifier: string | null;
  let pathPart: string;
  if (commaIndex === -1) {
    modifier = null;
    pathPart = head;
  } else {
    modifier = head.slice(0, commaIndex);
    pathPart = head.slice(commaIndex + 1);
    if (!SEGMENT_PATTERN.test(modifier)) return null;
  }

  const segments = pathPart.split(":");
  for (const segment of segments) {
    if (!SEGMENT_PATTERN.test(segment)) return null;
  }

  return { modifier, segments, value, raw };
}

/** True iff `raw` is a well-formed §3.6 tag string. */
export function isWellFormedTag(raw: string): boolean {
  return parseTag(raw) !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isValidSourceSpan(value: unknown): value is SourceSpan {
  if (typeof value !== "object" || value === null) return false;
  const span = value as Record<string, unknown>;
  if (typeof span.source !== "string") return false;
  if (typeof span.char_ranges !== "string") return false;
  if (span.members !== undefined && !isStringArray(span.members)) return false;
  return true;
}

function isValidLayoutHint(value: unknown): value is LayoutHint {
  if (typeof value !== "object" || value === null) return false;
  const hint = value as Record<string, unknown>;
  if (
    hint.scale !== "small" &&
    hint.scale !== "medium" &&
    hint.scale !== "large"
  ) {
    return false;
  }
  if (typeof hint.density !== "number") return false;
  if (typeof hint.shape_bias !== "string") return false;
  return true;
}

function isValidEntityState(value: unknown): value is EntityState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.local_coherence !== "number") return false;
  if (typeof state.visited !== "boolean") return false;
  return true;
}

/**
 * Structural well-formedness guard for `Entity` (SPEC §3.1). Checks that every
 * required field is present with the right type and that each `semantic_tags`
 * entry parses under the §3.6 grammar. Per INV-4 it makes NO coherence/taste
 * judgement — numeric ranges and semantic sensibility are not validated here.
 */
export function isValidEntity(value: unknown): value is Entity {
  if (typeof value !== "object" || value === null) return false;
  const entity = value as Record<string, unknown>;

  if (typeof entity.id !== "string") return false;
  if (typeof entity.archetype !== "string") return false;
  if (typeof entity.embedding_ref !== "string") return false;
  if (typeof entity.prose !== "string") return false;
  if (typeof entity.salience !== "number") return false;

  const tags = entity.semantic_tags;
  if (!isStringArray(tags)) return false;
  if (!tags.every(isWellFormedTag)) return false;

  if (!isStringArray(entity.affordances)) return false;
  if (!isStringArray(entity.contains)) return false;

  if (!isValidSourceSpan(entity.source_span)) return false;
  if (!isValidLayoutHint(entity.layout_hint)) return false;
  if (!isValidEntityState(entity.state)) return false;

  return true;
}
