// Wire protocol schema — SPEC §3.2, §3.3, §4.6.
// ResolvedRoomResponse is the ONLY shape the client ever sees (INV-3): the
// server resolves population fully; the client performs no further logic.

import type { Entity, Affordance } from './entity';
import type { Effect } from './ruleset';

// SPEC §3.2 — what GET /room/current returns.
export interface ResolvedRoomResponse {
  room: Entity; // archetype: "container", the current node
  objects: Entity[]; // fully resolved, filtered, sampled — final list, no further logic required
  exits: ResolvedExit[]; // pre-computed legal transitions, NOT raw graph edges
  debug?: DebugTrace; // present only if debug mode enabled server-side (SPEC §4.6)
}

export interface ResolvedExit {
  target_entity_id: string;
  affordance_required: Affordance; // which interaction on which object triggers this
  via_object_id: string; // which object in `objects[]` is the trigger
  weight: number; // soft-bias hint; client MAY use for visual strength, MUST NOT alter server decision
}

// SPEC §3.3 — session / move request + response.
export interface InteractRequest {
  session_id: string;
  action: {
    object_id: string;
    affordance: Affordance;
  };
}

export interface InteractResponse {
  new_room: ResolvedRoomResponse; // full re-resolution, same shape as GET /room/current
  transition_occurred: boolean; // false if interaction was local (e.g. "read" a book, no movement)
}

// SPEC §4.6 — optional debug trace, off by default, never client-supplied.
export interface DebugTrace {
  candidates_initial: string[];
  per_layer: {
    layer_id: string;
    activated: boolean;
    rules_fired: { rule_index: number; effect: Effect; matched_entities: string[] }[];
  }[];
  final_hard_decision_source: string | null; // layer_id that produced the winning hard decision
  final_soft_scores: Record<string, number>;
}
