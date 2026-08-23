// packages/rule-engine/src/interpretation.ts
//
// SPEC §0.9.0 (A13) — the INTERPRETATION LOOKUP. Half of `Entity` (§3.1) has no
// producer in the substrate: a build artifact carries a span's text, tags,
// provenance, and coherence, but `affordances`, `salience`, and `layout_hint`
// are stated as "produced by the interpretation lookup at resolution", and
// `archetype` is a build-time default the lookup may override.
//
// §3.7.1 says the same thing structurally: "Object types are **not** registry
// entry kinds — they are interpretations applied to a resolved reference at
// render/rule-evaluation time." So interpretation runs on the way OUT of a
// substrate query, before predicates see a candidate — which is why a predicate
// reading `static.archetype` sees the INTERPRETED archetype, not the tagger's.
//
// INV-1: pure, headless. INV-2: a pure function of (span, ruleset), no entropy.
// INV-3: reads substrate span data, never an embedding vector.
// INV-4: an interpretation that produces nonsense is legal and runs.

import type {
  Affordance,
  Archetype,
  Entity,
  InterpretationEntry,
  InterpretationLookup,
  LayoutHint,
  SourceSpan,
} from "schema";
import { matchesTagPattern } from "./evaluate";

/**
 * The substrate data a build artifact actually holds for one span — everything
 * §6.3's pipeline produces, and nothing it doesn't. This is what the graph
 * stores; an `Entity` is minted from it per resolution (§3.1: "minted on demand,
 * not read from a fixed build-time node table").
 */
export interface SubstrateSpanView {
  /** Durable span id. Becomes `Entity.embedding_ref` (GRAPH_FORMAT.md). */
  id: string;
  /** Structured tags (§3.6 grammar) the tagger produced. */
  semantic_tags: string[];
  /** The tagger's build-time default archetype (§6.3 B4); the lookup may override. */
  archetype: string;
  /** Verbatim source excerpt (§3.1 A1) — client-facing. */
  prose: string;
  /** Positional provenance for `prose` (§3.1 A1) — client-facing. */
  source_span: SourceSpan;
  /** Embedding-neighbourhood tightness, `[0,1]` (§0.10.0 B5). */
  local_coherence: number;
}

/**
 * The engine's default interpretation, keyed by archetype (§3.4: "engine ships
 * defaults"). §3.1 fixes the archetype vocabulary and says a `container`
 * "implies 'enter'/'traverse' affordances typically present"; §3.2 (A4) makes
 * `enter`/`traverse` the default movement affordances and `portal` a movement
 * archetype. Everything else here — the specific affordance sets, the salience
 * numbers, the layout hints — is an ENGINE CHOICE the spec does not enumerate.
 *
 * It lives in one table, exported, so it is a default an author overrides rather
 * than a literal scattered through the resolution path. An author's
 * `interpretation_lookup` (§3.4) layers over it; nothing here is mandatory.
 */
export const DEFAULT_INTERPRETATION: Record<string, InterpretationEntry> = {
  container: {
    affordances: ["enter", "traverse"],
    layout_hint: { scale: "large", density: 0.5, shape_bias: "radial" },
    salience: 0.6,
  },
  portal: {
    affordances: ["traverse"],
    layout_hint: { scale: "medium", density: 0.0, shape_bias: "vertical" },
    salience: 0.7,
  },
  readable: {
    affordances: ["read", "inspect"],
    layout_hint: { scale: "small", density: 0.0, shape_bias: "flat" },
    salience: 0.5,
  },
  actor: {
    affordances: ["speak", "inspect"],
    layout_hint: { scale: "medium", density: 0.0, shape_bias: "vertical" },
    salience: 0.7,
  },
  prop: {
    affordances: ["inspect"],
    layout_hint: { scale: "small", density: 0.0, shape_bias: "compact" },
    salience: 0.4,
  },
};

/**
 * Applied when no default and no author entry matches. `Archetype` is an open
 * string (§3.1), so an unknown archetype is legal and lands here (INV-4).
 *
 * Note `layout_hint` is a COMPLETE {@link LayoutHint}, not a `Partial` — every
 * later layer merges over it field by field, so this is what guarantees the
 * minted `Entity` always carries all three required fields.
 */
const FALLBACK: {
  affordances: Affordance[];
  layout_hint: LayoutHint;
  salience: number;
} = {
  affordances: ["inspect"],
  layout_hint: { scale: "medium", density: 0.0, shape_bias: "" },
  salience: 0.5,
};

/** One span's fully-resolved interpretation — every `Entity` field A13 owns. */
export interface ResolvedInterpretation {
  archetype: Archetype;
  affordances: Affordance[];
  layout_hint: LayoutHint;
  salience: number;
}

/**
 * Resolve the interpretation for one span, most-general to most-specific:
 *
 *   1. the engine fallback,
 *   2. {@link DEFAULT_INTERPRETATION} for the span's build-time archetype,
 *   3. the author's `by_archetype` entry for that archetype,
 *   4. the author's FIRST matching `by_tag` entry, in array order (§3.4).
 *
 * Later layers override earlier ones field by field, so an author supplying only
 * `salience` keeps the default affordances. §3.4 fixes `by_tag` as "first match
 * wins, in array order" but does not say how `by_archetype` and `by_tag`
 * combine; treating `by_tag` as the more specific of the two is an ENGINE CHOICE
 * — a tag pattern selects a narrower set than an archetype does.
 *
 * Note step 3/4 key on the span's BUILD-TIME archetype, not on an archetype an
 * earlier layer just set. Chaining would let a lookup rewrite its own key and
 * make resolution order-dependent (and non-terminating in the general case).
 */
export function resolveInterpretation(
  span: SubstrateSpanView,
  lookup: InterpretationLookup | undefined,
): ResolvedInterpretation {
  const layers: InterpretationEntry[] = [];

  const engineDefault = DEFAULT_INTERPRETATION[span.archetype];
  if (engineDefault) layers.push(engineDefault);

  const byArchetype = lookup?.by_archetype?.[span.archetype];
  if (byArchetype) layers.push(byArchetype);

  const byTag = lookup?.by_tag?.find((entry) =>
    span.semantic_tags.some((tag) => matchesTagPattern(tag, entry.pattern)),
  );
  if (byTag) layers.push(byTag.interpretation);

  let archetype: Archetype = span.archetype;
  let affordances: Affordance[] = [...FALLBACK.affordances];
  let layout: LayoutHint = { ...FALLBACK.layout_hint };
  let salience = FALLBACK.salience;

  for (const layer of layers) {
    if (layer.archetype !== undefined) archetype = layer.archetype;
    if (layer.affordances !== undefined) affordances = [...layer.affordances];
    if (layer.layout_hint !== undefined) {
      layout = { ...layout, ...layer.layout_hint };
    }
    if (layer.salience !== undefined) salience = layer.salience;
  }

  return { archetype, affordances, layout_hint: layout, salience };
}

/**
 * Mint the client-facing `Entity` (§3.1) for one resolved span.
 *
 * `visitedSet` derives `state.visited` — §3.1 makes it "runtime-derived … not a
 * stored per-entity field". It is compared against `embedding_ref` today; §3.8
 * specifies overlay ADDRESS-TOKENS there instead, which is issue #108's scope,
 * so this reads whatever `visited_set` currently holds and will follow it.
 *
 * `Entity.id` is likewise the durable span id for now. §3.1 (A2) specifies an
 * EPHEMERAL per-resolution id whose durable counterpart is the address-token —
 * also #108. Interpretation does not depend on which it is.
 *
 * Per INV-4 no value is range-checked: an author salience of 40 is legal and is
 * passed through, because judging it would be taste-policing.
 */
export function mintEntity(
  span: SubstrateSpanView,
  lookup: InterpretationLookup | undefined,
  visitedSet: readonly string[],
): Entity {
  const interpretation = resolveInterpretation(span, lookup);
  return {
    id: span.id,
    archetype: interpretation.archetype,
    semantic_tags: [...span.semantic_tags],
    embedding_ref: span.id,
    affordances: interpretation.affordances,
    salience: interpretation.salience,
    prose: span.prose,
    source_span: span.source_span,
    // §3.1 (A3): the child address-tokens of this entity's `composite` registry
    // entry. The overlay is #109's scope and B6's composition strategies are
    // deferred, so no composite exists to resolve — empty is correct today.
    contains: [],
    layout_hint: interpretation.layout_hint,
    state: {
      local_coherence: span.local_coherence,
      visited: visitedSet.includes(span.id),
    },
  };
}
