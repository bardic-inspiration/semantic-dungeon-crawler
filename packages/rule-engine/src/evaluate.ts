// packages/rule-engine/src/evaluate.ts
//
// SPEC §4.2 — evaluate a parsed predicate/scope AST (the {@link Expression} the
// parser (#72) produces) against `(candidate, state)`. This is the
// `evaluate(...)` the solver's layer loop calls (§4.1); binding the reserved
// `static.*` / `dynamic.*` properties, the reserved functions, and `CONTAINS` /
// `MATCHES` semantics live here. The layer loop, effect application, and
// ordering (§4.1, §4.3) are the solver's issues — this only decides whether a
// single predicate holds for a single candidate.
//
// INV-1: pure, headless — imports `schema` types and the parser only, never a
// renderer. INV-4: evaluation never throws on a contradictory-but-well-formed
// predicate, and a missing / vestigial property yields a defined result
// (`undefined`, i.e. absent), never an error.

import type { Entity, SessionState } from "schema";
import { parseTag } from "schema";
import {
  parseMatchPattern,
  parseOperand,
  ParseError,
  type Comparison,
  type Expression,
  type FunctionCallOperand,
  type MatchPattern,
  type ModPattern,
  type Operand,
  type PropertyOperand,
  type SegPattern,
  type ValPattern,
} from "./parser";

// ── Binding surface ───────────────────────────────────────────────────────────

/**
 * The current candidate the `static.*` namespace binds against (§4.2). Under the
 * §0.8.0 substrate model a candidate is a ranked query result: the entity plus
 * the cosine `embedding_distance` (`[0,2]`, §0.10.0 B2) the substrate query
 * computed for it against the query origin. The solver supplies this per
 * candidate; the vestigial `static.edge_weight` / `static.cluster_id` (removed by
 * D1) have no field here and read as absent.
 */
export interface EntityCandidate {
  entity: Entity;
  embedding_distance: number;
}

/**
 * The context one predicate evaluates in. `candidate` is present for a rule
 * `predicate` (which binds `static.*`); it is absent for a layer `scope`, which
 * activates against run state alone (§4.1) — an unbound `static.*` then reads as
 * absent rather than an error.
 */
export interface EvalBindings {
  candidate?: EntityCandidate;
  state: SessionState;
}

// ── Value model ───────────────────────────────────────────────────────────────

// An evaluated operand. `undefined` is the defined "absent" value a missing or
// vestigial property (and an ill-typed function result) collapses to (INV-4);
// arrays cover both `static.tags` / `visited_set` (string[]) and the
// vector-valued `dynamic.trace_centroid` / `dynamic.momentum` (number[]).
type EvalValue =
  string | number | boolean | readonly string[] | readonly number[] | undefined;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Evaluate a parsed §4.2 {@link Expression} to a boolean against `bindings`.
 * `AND`/`OR` have no precedence and no grouping in the grammar (§4.2), so the
 * flat term sequence folds left-associatively. Never throws (INV-4).
 */
export function evaluate(
  expression: Expression,
  bindings: EvalBindings,
): boolean {
  const { terms, operators } = expression;
  let result = evalComparison(terms[0]!, bindings);
  for (let i = 0; i < operators.length; i++) {
    const next = evalComparison(terms[i + 1]!, bindings);
    result = operators[i] === "AND" ? result && next : result || next;
  }
  return result;
}

/**
 * Evaluate a §3.4 `write` effect's `value` to the string stored in
 * `dynamic.vars.*` (§3.8 types the scratch store as `Record<string, string>`,
 * so the result is coerced here and coerced back per predicate use, §4.2).
 *
 * §3.4 defines the value as "an **evaluated** §4.2 expression/literal", so a
 * property path reads run state and a quoted literal yields its contents. A
 * `value` that is not a well-formed operand is stored as a plain string rather
 * than throwing: the commit phase never throws (A5/INV-4), and an author writing
 * a bare word means that word.
 *
 * Absent operands (an unset var, a vestigial property) collapse to `""` — the
 * string form of §4.2's "absent", so a predicate reading the key back sees an
 * empty value rather than the literal text `undefined`.
 */
export function evaluateValueExpression(
  raw: string,
  bindings: EvalBindings,
): string {
  let operand: Operand;
  try {
    operand = parseOperand(raw);
  } catch {
    return raw;
  }
  const value = evalOperand(operand, bindings);
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  return String(value);
}

// ── Comparisons ───────────────────────────────────────────────────────────────

function evalComparison(c: Comparison, b: EvalBindings): boolean {
  switch (c.operator) {
    case ">":
    case "<":
    case ">=":
    case "<=":
      return relational(
        c.operator,
        evalOperand(c.left, b),
        evalOperand(c.right, b),
      );
    case "==":
      return looseEquals(evalOperand(c.left, b), evalOperand(c.right, b));
    case "!=":
      return !looseEquals(evalOperand(c.left, b), evalOperand(c.right, b));
    case "IN":
      return member(evalOperand(c.right, b), evalOperand(c.left, b));
    case "NOT IN":
      return !member(evalOperand(c.right, b), evalOperand(c.left, b));
    case "CONTAINS":
      // Exact string membership with the array on the LEFT (backward-compatible).
      return member(evalOperand(c.left, b), evalOperand(c.right, b));
    case "MATCHES":
      // `pattern` was structured at parse time; glob it over the tag array.
      return matchesTags(evalOperand(c.left, b), c.pattern);
  }
}

// `a OP b` for numeric relational operators. Both sides coerce to number; a
// non-numeric / absent operand makes the comparison defined-false (INV-4).
function relational(
  op: ">" | "<" | ">=" | "<=",
  a: EvalValue,
  b: EvalValue,
): boolean {
  const x = toNumber(a);
  const y = toNumber(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  switch (op) {
    case ">":
      return x > y;
    case "<":
      return x < y;
    case ">=":
      return x >= y;
    case "<=":
      return x <= y;
  }
}

// `==` semantics. Absent equals only absent; arrays compare element-wise; scalars
// compare by canonical string so a string-valued `dynamic.vars.*` (§3.8 — "values
// are strings; coerce per predicate use") equals its numeric / boolean literal.
function looseEquals(a: EvalValue, b: EvalValue): boolean {
  if (a === undefined || b === undefined) return a === b;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr) return false;
    if (a.length !== b.length) return false;
    return a.every(
      (el, i) => String(el) === String((b as readonly unknown[])[i]),
    );
  }
  return String(a) === String(b);
}

// Exact string membership of `value` in `array` (the shared core of `IN`,
// `CONTAINS`, and `contains(...)`). A non-array haystack or absent needle is a
// defined non-match (INV-4).
function member(array: EvalValue, value: EvalValue): boolean {
  if (!Array.isArray(array) || value === undefined) return false;
  const needle = String(value);
  return array.some((el) => String(el) === needle);
}

// ── Operands ──────────────────────────────────────────────────────────────────

function evalOperand(op: Operand, b: EvalBindings): EvalValue {
  switch (op.type) {
    case "literal":
      return op.value;
    case "property":
      return bindProperty(op, b);
    case "function_call":
      return evalFunction(op, b);
  }
}

// ── Property binding (§4.2 reserved static.* / dynamic.*) ─────────────────────

function bindProperty(op: PropertyOperand, b: EvalBindings): EvalValue {
  return op.namespace === "static"
    ? bindStatic(op.path, b.candidate)
    : bindDynamic(op.path, b.state);
}

// `static.*` reads the current candidate entity (§4.2). Vestigial and unknown
// names — and any read with no candidate bound — return absent (INV-4).
function bindStatic(
  path: string[],
  candidate: EntityCandidate | undefined,
): EvalValue {
  if (candidate === undefined) return undefined;
  const entity = candidate.entity;
  switch (path.join(".")) {
    case "embedding_distance":
      return candidate.embedding_distance;
    case "archetype":
      return entity.archetype;
    case "tags":
      return entity.semantic_tags;
    case "local_coherence":
      return entity.state.local_coherence;
    case "prose":
      return entity.prose;
    case "source":
      return entity.source_span.source;
    // `static.edge_weight` / `static.cluster_id` are vestigial (§0.10.0 B2, D1):
    // no build stage produces them, so they read as absent.
    default:
      return undefined;
  }
}

// `dynamic.*` reads run state (§3.8). `dynamic.vars.<key>` is the string-valued
// scratch store (§0.9.0 A8); a null vector or unset key is absent (INV-4).
function bindDynamic(path: string[], state: SessionState): EvalValue {
  if (path[0] === "vars") {
    const key = path.slice(1).join(".");
    return key in state.vars ? state.vars[key] : undefined;
  }
  switch (path.join(".")) {
    case "visited_set":
      return state.visited_set;
    case "trace_centroid":
      return state.trace_centroid ?? undefined;
    case "momentum":
      return state.momentum ?? undefined;
    case "turn_count":
      return state.turn_count;
    case "path_coherence":
      return state.path_coherence;
    default:
      return undefined;
  }
}

// ── Reserved functions (§4.2) ─────────────────────────────────────────────────

function evalFunction(op: FunctionCallOperand, b: EvalBindings): EvalValue {
  const args = op.args.map((a) => evalOperand(a, b));
  switch (op.name) {
    case "contains":
      // contains(array, value) — exact membership, mirrors the CONTAINS operator.
      return member(args[0], args[1]);
    case "distance":
      // distance(vec, vec) — cosine distance over the two vectors, range [0,2].
      return cosineDistance(args[0], args[1]);
    case "recent":
      // recent(array, n) — the n most-recent tokens (the tail of visited_set).
      return recent(args[0], args[1]);
    case "matches":
      // matches(array, pattern) — glob, mirrors the MATCHES operator; the pattern
      // arg is a raw string structured here at evaluation time.
      return matchesTags(args[0], toPattern(args[1]));
  }
}

// Cosine distance `1 - cos(a,b)` in `[0,2]`. A non-vector, length-mismatched, or
// zero-magnitude operand yields absent rather than throwing (INV-4).
function cosineDistance(a: EvalValue, b: EvalValue): number | undefined {
  const va = toVector(a);
  const vb = toVector(b);
  if (
    va === undefined ||
    vb === undefined ||
    va.length !== vb.length ||
    va.length === 0
  ) {
    return undefined;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < va.length; i++) {
    const ai = va[i]!;
    const bi = vb[i]!;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return undefined;
  return 1 - dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// The `n` most-recent elements — the tail, since visited_set appends on visit.
// `n <= 0` is the empty tail; a non-array or non-numeric `n` is absent (INV-4).
function recent(array: EvalValue, n: EvalValue): readonly string[] | undefined {
  if (!Array.isArray(array)) return undefined;
  const count = toNumber(n);
  if (Number.isNaN(count)) return undefined;
  const k = Math.floor(count);
  if (k <= 0) return [];
  return (array as readonly string[]).slice(Math.max(0, array.length - k));
}

// Structure a raw `matches(...)` pattern argument, tolerating a non-string or
// malformed pattern as a defined non-match (INV-4 — no throw escapes evaluation).
function toPattern(value: EvalValue): MatchPattern | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return parseMatchPattern(value, -1);
  } catch (err) {
    if (err instanceof ParseError) return undefined;
    throw err;
  }
}

// ── MATCHES glob (§4.2 pattern grammar over §3.6 structured tags) ─────────────

/**
 * True iff one structured tag matches one §4.2 `MATCHES` pattern string.
 *
 * The same glob the `MATCHES` operator uses, exposed for the §0.9.0 (A13)
 * interpretation lookup, whose `by_tag` entries are "`pattern`" strings in that
 * grammar (§3.4). Sharing the implementation is the point: an author who learns
 * the pattern rules for a predicate must not find different rules in a lookup.
 *
 * A pattern that does not parse is a defined NON-MATCH rather than a throw
 * (INV-4) — a malformed lookup entry is legal and simply never matches.
 */
export function matchesTagPattern(tag: string, rawPattern: string): boolean {
  let pattern: MatchPattern;
  try {
    pattern = parseMatchPattern(rawPattern, -1);
  } catch {
    return false;
  }
  const parsed = parseTag(tag);
  if (parsed === null) return false;
  return (
    modifierMatches(pattern.modifier, parsed.modifier) &&
    segmentsMatch(pattern.segments, parsed.segments) &&
    valueMatches(pattern.value, parsed.value)
  );
}

// True iff any tag in `tags` matches `pattern`. A non-string-array haystack or an
// absent pattern is a defined non-match; an ill-formed tag string simply doesn't
// match (INV-4).
function matchesTags(
  tags: EvalValue,
  pattern: MatchPattern | undefined,
): boolean {
  if (pattern === undefined || !isStringArray(tags)) return false;
  return tags.some((raw) => {
    const parsed = parseTag(raw);
    if (parsed === null) return false;
    return (
      modifierMatches(pattern.modifier, parsed.modifier) &&
      segmentsMatch(pattern.segments, parsed.segments) &&
      valueMatches(pattern.value, parsed.value)
    );
  });
}

// A null pattern modifier requires an unmodified tag; `*` requires any modifier
// present; an ident requires that exact modifier (asymmetric — §4.2).
function modifierMatches(
  pattern: ModPattern | null,
  tagMod: string | null,
): boolean {
  if (pattern === null) return tagMod === null;
  if (pattern.kind === "wildcard") return tagMod !== null;
  return tagMod === pattern.value;
}

// A null pattern value requires no tag value; `*` requires any value present; a
// literal requires that exact value.
function valueMatches(
  pattern: ValPattern | null,
  tagVal: string | null,
): boolean {
  if (pattern === null) return tagVal === null;
  if (pattern.kind === "wildcard") return tagVal !== null;
  return tagVal === pattern.value;
}

// Glob the segment path: `*` consumes exactly one segment, `**` zero or more
// (§4.2). Recursive backtracking over the parsed segments.
function segmentsMatch(
  pattern: SegPattern[],
  segments: readonly string[],
): boolean {
  const head = pattern[0];
  if (head === undefined) return segments.length === 0;
  const rest = pattern.slice(1);
  if (head.kind === "wildcard_multi") {
    for (let i = 0; i <= segments.length; i++) {
      if (segmentsMatch(rest, segments.slice(i))) return true;
    }
    return false;
  }
  if (segments.length === 0) return false;
  if (head.kind === "wildcard") return segmentsMatch(rest, segments.slice(1));
  return head.value === segments[0] && segmentsMatch(rest, segments.slice(1));
}

// ── Coercions ─────────────────────────────────────────────────────────────────

// Coerce to number for relational compare: numbers pass through, numeric strings
// (§3.8 string-valued vars) parse, everything else is NaN (defined-false).
function toNumber(value: EvalValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

// A vector operand for `distance(...)` — an array of finite numbers, else absent.
function toVector(value: EvalValue): readonly number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((el) => typeof el === "number" && Number.isFinite(el))
    ? (value as readonly number[])
    : undefined;
}

function isStringArray(value: EvalValue): value is readonly string[] {
  return Array.isArray(value) && value.every((el) => typeof el === "string");
}
