// @sdc/schema — the single source of truth for the wire/rule schemas (SPEC §3).
// Every other package imports these types; they are never duplicated (INV-5).

export type { Entity, Archetype, Affordance, LayoutHint, EntityState } from './entity';
export type {
  ResolvedRoomResponse,
  ResolvedExit,
  InteractRequest,
  InteractResponse,
  DebugTrace,
} from './protocol';
export type { Ruleset, Layer, RuleBlock, Effect, ScopeCondition } from './ruleset';
export { isValidEntity } from './validate';
