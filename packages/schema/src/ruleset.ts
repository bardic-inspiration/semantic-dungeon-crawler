// packages/schema/src/ruleset.ts
//
// SPEC §3.4 — the ruleset DATA SHAPE (the §4.2 DSL grammar/parser is Phase 3).
// A ruleset is structured JSON/YAML; the DSL appears only inside
// predicate/scope/value strings. The ruleset is the single authored bundle
// (§8) — layers plus the registries, interpretation lookup, primitive exposure,
// and movement affordances. Well-formed-but-incoherent rulesets are legal (INV-4).

import type {
  Affordance,
  Archetype,
  LayoutHint,
  ModifierConfig,
} from "./entity";
import type { PrimitiveExposure } from "./overlay";

// §3.4 (A13) — interpretation applied to a resolved substrate result at
// render/rule time. Engine ships defaults; authors override per archetype/tag.
export interface InterpretationEntry {
  archetype?: Archetype;
  affordances?: Affordance[];
  layout_hint?: Partial<LayoutHint>;
  salience?: number; // 0.0–1.0 default salience for matches
}

export interface InterpretationLookup {
  by_archetype?: Record<string, InterpretationEntry>;
  by_tag?: { pattern: string; interpretation: InterpretationEntry }[]; // first match wins, in array order
}

// §0.10.0 (B3) — where a substrate `Query.direction` (the gradient bias) is
// sourced from. `"momentum"` feeds the session's `dynamic.momentum` (§3.8) into
// the movement query so drift is biased along the recent trajectory; `"none"`
// (the ENGINE DEFAULT) issues no direction, so a zero-config world stays pure
// relativistic drift (§0/§1). Adding the parameterization does not change the
// zero-config behavior — it only unlocks the gradient query B3 already reserved.
export type GradientSource = "none" | "momentum";

// §0.10.0 (B3) — the substrate-query knobs B3 names as "ruleset config with
// engine defaults" (the same authored bundle as movement-affordances / the
// interpretation lookup). Every field is OPTIONAL with an engine default, so a
// ruleset that omits the block resolves exactly as before (INV-4).
export interface SubstrateRulesetConfig {
  gradient_source?: GradientSource; // default "none" (relativistic drift, §0)
}

// §4.2 DSL expression evaluated once per move to determine layer activation.
export type ScopeCondition = string;

// §3.4 — the Effect taxonomy. Traversal-control effects filter/weight the move
// decision (§4.3); write/primitive/emit/end are applied in the deterministic
// post-decision commit phase (§4.1, A5/A6/A7), last-write-wins, never throwing.
export type Effect =
  | { kind: "hard_allow" }
  | { kind: "hard_forbid" }
  | { kind: "soft_reweight"; factor: number } // multiplicative, once per move-decision
  | { kind: "write"; target: string; value: string } // set dynamic.vars.<key> to an evaluated §4.2 expression/literal
  | {
      kind: "primitive";
      primitive: PrimitiveExposure["primitive"];
      args?: Record<string, string>;
    } // invoke an overlay primitive (§3.7.4)
  | { kind: "emit"; text?: string; reveal?: string[] } // append to InteractResponse.interaction_result (§3.3, A6)
  | { kind: "end" }; // fire the author-triggered session-ended flag (§3.3, A7)

export interface RuleBlock {
  predicate: string; // §4.2 DSL expression, evaluated against static+dynamic props
  effect: Effect;
}

export interface Layer {
  id: string;
  scope: "global" | ScopeCondition; // global = always active; else activated by predicate
  mode: "override" | "yield" | { priority: number };
  rules: RuleBlock[];
}

// §3.4 — the single authored bundle. All non-`layers` fields are author content;
// adding/removing entries is NOT an engine version bump (§3.5) — only changing the
// mechanism that reads them is.
export interface Ruleset {
  spec_version: string; // must match packages/schema version (§3.5)
  authored_against?: string; // §0.11.0 (C5): OPTIONAL substrate_version — ADVISORY only, surfaces drift, never rejects
  layers: Layer[];
  modifier_registry?: Record<string, ModifierConfig>; // §3.6.1 — author-defined modifier behavior
  resolvers?: Record<string, string>; // §3.6.3 — resolver overrides/additions (name → def)
  interpretation_lookup?: InterpretationLookup; // §0.9.0 (A13)
  primitive_exposure?: PrimitiveExposure[]; // §3.7.4 — which overlay primitives players may invoke
  movement_affordances?: Affordance[]; // §0.9.0 (A4) — engine default ["enter","traverse"] (+ portal archetype)
  substrate?: SubstrateRulesetConfig; // §0.10.0 (B3) — substrate-query config (gradient source); engine defaults when omitted
}
