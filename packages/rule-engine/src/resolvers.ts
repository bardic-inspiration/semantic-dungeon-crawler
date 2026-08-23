// packages/rule-engine/src/resolvers.ts
//
// SPEC §3.6.3 — REGISTRY-BOUNDED VALUES. A registered leaf carries an implied
// value; what that value *is* depends on the use case, so it is produced by a
// pluggable resolver: "a function `(parsedTag, registry) → resolvedValue`".
//
// §3.6.3 states the engine "guarantees the three defaults exist at startup but
// does not prevent replacement". Until SPEC 0.12.0 no §6.x Build list claimed
// them, so none existed — this module is that guarantee.
//
// The dispatch is engine machinery; the SET is configurable (§3.6.3).
//
// INV-1: pure. INV-2: no entropy. INV-4: a tag naming no registry path resolves
// to the non-leaf value rather than being rejected — the registry is advisory
// (§3.6.2: "unregistered tags are syntactically valid but orphaned").

import type { ModifierConfig, ParsedTag } from "schema";

/**
 * The keys-only vocabulary tree of §3.6.2, as the resolver sees it: the set of
 * registered segment paths, `:`-joined. The engine needs only membership and
 * child-count, so this narrow view keeps the resolver independent of how a
 * `tag-registry.yaml` happens to be parsed.
 */
export interface TagRegistryView {
  /** Every registered segment path, `:`-joined (e.g. `environment:terrain`). */
  paths: ReadonlySet<string>;
}

/** A resolved value per the §3.6.3 table. */
export type ResolvedValue = string | number | boolean | null;

/** §3.6.3: "a function `(parsedTag, registry) → resolvedValue`". */
export type Resolver = (
  tag: ParsedTag,
  registry: TagRegistryView,
) => ResolvedValue;

/** The empty registry — every path is unregistered, so every tag is a non-leaf. */
export const EMPTY_REGISTRY: TagRegistryView = { paths: new Set() };

/**
 * True when `segments` names a registered path with no registered children —
 * §3.6.3's "leaf terminal". A path absent from the registry is NOT a leaf: it is
 * orphaned (§3.6.2), and orphaned tags take the non-leaf column so an unbuilt or
 * stale registry degrades to "no implied value" rather than to a false leaf.
 */
export function isLeafPath(
  segments: readonly string[],
  registry: TagRegistryView,
): boolean {
  const path = segments.join(":");
  if (!registry.paths.has(path)) return false;
  const prefix = path + ":";
  for (const candidate of registry.paths) {
    if (candidate.startsWith(prefix)) return false;
  }
  return true;
}

// ── The three defaults (§3.6.3 table, verbatim) ──────────────────────────────

/** `match`: value string | `true` (leaf presence) | `true` (non-leaf). */
export const matchResolver: Resolver = (tag) =>
  tag.value !== null ? tag.value : true;

/** `display`: value string | terminal segment | `null` (non-leaf). */
export const displayResolver: Resolver = (tag, registry) => {
  if (tag.value !== null) return tag.value;
  if (!isLeafPath(tag.segments, registry)) return null;
  return tag.segments[tag.segments.length - 1] ?? null;
};

/** `numeric`: `Number(value)` | `1.0` (leaf presence) | `null` (non-leaf). */
export const numericResolver: Resolver = (tag, registry) => {
  if (tag.value !== null) return Number(tag.value);
  if (!isLeafPath(tag.segments, registry)) return null;
  return 1.0;
};

/** The names §3.6.3 guarantees exist at startup. */
export const DEFAULT_RESOLVERS: Readonly<Record<string, Resolver>> = {
  match: matchResolver,
  display: displayResolver,
  numeric: numericResolver,
};

/**
 * The dispatch. Built from the three defaults, which an author may replace or
 * extend (§3.6.3: the engine "does not prevent replacement").
 *
 * `Ruleset.resolvers` is typed `Record<string, string>` — "name → def" (§3.4) —
 * but the spec never defines what a *def string* means: §3.6.3 describes a
 * resolver as a function, and there is no grammar for expressing one. Rather
 * than invent a resolver language, this takes real functions, and the loader
 * surfaces an author's string defs as an unsupported-configuration warning
 * (INV-4: surfaced, never rejected). See the note filed against §3.6.3.
 */
export function createResolverSet(
  overrides: Readonly<Record<string, Resolver>> = {},
): Readonly<Record<string, Resolver>> {
  return { ...DEFAULT_RESOLVERS, ...overrides };
}

/**
 * Resolve one tag through a named resolver. An unknown resolver name yields
 * `null` rather than throwing — naming a resolver that does not exist is an
 * authoring mistake, and INV-4 makes authoring mistakes run (§3.6.2's stance for
 * the registry applies to its resolvers too).
 */
export function resolveTag(
  tag: ParsedTag,
  resolverName: string,
  registry: TagRegistryView,
  resolvers: Readonly<Record<string, Resolver>> = DEFAULT_RESOLVERS,
): ResolvedValue {
  const resolver = resolvers[resolverName];
  if (resolver === undefined) return null;
  return resolver(tag, registry);
}

// ── §3.6.1 modifier registry ─────────────────────────────────────────────────

/**
 * Look up a tag's `modifier,` prefix in the author's modifier registry (§3.6.1).
 *
 * §3.6.1 is explicit about the division: "The engine provides a grammar slot …
 * a parser that extracts the modifier token, and a modifier registry data
 * structure. **No modifiers are built into the engine** — zero is a valid
 * configuration." So this is the whole engine side: a lookup. What a modifier
 * *means* is author content, and the engine never assigns one a behavior.
 *
 * An unmodified tag, or one whose modifier the author never registered, yields
 * `undefined`. Per INV-4 an unregistered modifier is legal (§3.6: the engine
 * "MUST NOT reject tags for unregistered modifiers").
 */
export function lookupModifier(
  tag: ParsedTag,
  registry: Readonly<Record<string, ModifierConfig>> | undefined,
): ModifierConfig | undefined {
  if (tag.modifier === null || registry === undefined) return undefined;
  return registry[tag.modifier];
}
