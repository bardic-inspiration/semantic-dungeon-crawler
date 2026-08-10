// Ruleset schema — SPEC §3.4 (data shape; grammar lives in SPEC §4.2).
// A Ruleset is the unit an author shares/forks/versions.

export interface Ruleset {
  spec_version: string; // must match packages/schema version, see SPEC §3.5
  layers: Layer[];
}

export interface Layer {
  id: string;
  scope: 'global' | ScopeCondition; // global = always active; else activated by predicate
  mode: 'override' | 'yield' | { priority: number };
  rules: RuleBlock[];
}

export interface RuleBlock {
  predicate: string; // DSL expression (SPEC §4.2), evaluated against static+dynamic props
  effect: Effect;
}

export type Effect =
  { kind: 'hard_allow' } | { kind: 'hard_forbid' } | { kind: 'soft_reweight'; factor: number }; // multiplicative, applied once per move-decision

export type ScopeCondition = string; // DSL expression evaluated once per move to determine activation
