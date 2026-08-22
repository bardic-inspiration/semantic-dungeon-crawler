// packages/schema/src/protocol.ts
//
// SPEC §3.2 (Resolved Room Response), §3.3 (Session / Move Request,
// InteractionResult), and the §4.6 DebugTrace the response carries when server
// debug mode is on. This is the ONLY entity data a client ever sees (INV-3):
// resolved output, never embeddings, the index, rule definitions, or internal ids.

import type { Affordance, Entity } from "./entity";
import { isValidEntity } from "./entity";
import type { Effect } from "./ruleset";

// §3.2 (C2) — OPEN string union (like Archetype/Affordance): adding a value is a
// MINOR bump (§3.5). "stuck" = a well-formed resolution left no legal exit.
export type ResolutionStatus = "resolved" | "stuck" | string;

// §3.2 (A4) — a pre-computed legal transition, NOT a raw graph edge. Derived from
// a populated object whose affordance set includes a movement affordance.
export interface ResolvedExit {
  target_entity_id: string; // a resolvable query/address TOKEN; the client echoes it back
  affordance_required: Affordance; // which interaction triggers this
  via_object_id: string; // which object in `objects[]` is the trigger
  weight: number; // soft-bias hint; client MAY use for visuals, MUST NOT alter the server decision
}

// §4.6 — optional, off by default; present in a response only when server debug
// mode is on (never a client-supplied parameter). Its wire shape is fixed here;
// the logic that fills it is the solver, Phase 3 (§6.4).
export interface DebugTrace {
  candidates_initial: string[];
  per_layer: {
    layer_id: string;
    activated: boolean;
    rules_fired: {
      rule_index: number;
      effect: Effect;
      matched_entities: string[];
    }[];
  }[];
  final_hard_decision_source: string | null; // layer_id that produced the winning hard decision
  final_soft_scores: Record<string, number>;
}

// §3.2 — what GET /room/current returns. Population is fully resolved server-side
// (§4.4); the client receives the final list, no further logic required.
export interface ResolvedRoomResponse {
  room: Entity; // archetype: "container", the current node
  objects: Entity[]; // fully resolved, filtered, sampled — final list
  exits: ResolvedExit[]; // pre-computed legal transitions
  resolution_status: ResolutionStatus; // §0.11.0 (C2): always a 200; "stuck" is a valid game state
  debug?: DebugTrace; // present only if debug mode enabled server-side (§4.6)
}

// §3.3 — the client's only input shape.
export interface InteractRequest {
  session_id: string;
  action: {
    object_id: string;
    affordance: Affordance;
  };
}

// §3.3 (A6) — per-interaction output, especially when nothing moved. `text`/`revealed`
// are author-emitted; `effects_summary` is auto-derived from commit-phase writes.
export interface InteractionResult {
  text?: string; // author-emitted text (e.g. the fuller passage a `read` returns)
  revealed?: string[]; // entity ids surfaced by the interaction, if any
  effects_summary?: string[]; // human-readable summary of commit-phase writes (debug/UX), auto-derived
}

// §3.3 — POST /interact response; a full re-resolution, same shape as the room GET.
export interface InteractResponse {
  new_room: ResolvedRoomResponse;
  transition_occurred: boolean; // false if the interaction was local (e.g. "read" a book, no movement)
  interaction_result: InteractionResult; // §0.9.0 (A6)
  session_ended?: boolean; // §0.9.0 (A7): true once an author rule fired the `end` effect
}

/**
 * Structural well-formedness guard for a `ResolvedExit` (SPEC §3.2 A4). Checks
 * the four required fields are present with the right primitive type. Per INV-4
 * this is a WELL-FORMEDNESS check only: it makes no coherence judgement — it does
 * not require `weight` to fall in any range, nor `via_object_id` to name an object
 * that appears in the response's `objects[]` (that cross-reference is a server
 * behavior guarantee, not a shape invariant).
 */
export function isValidResolvedExit(value: unknown): value is ResolvedExit {
  if (typeof value !== "object" || value === null) return false;
  const exit = value as Record<string, unknown>;
  if (typeof exit.target_entity_id !== "string") return false;
  if (typeof exit.affordance_required !== "string") return false;
  if (typeof exit.via_object_id !== "string") return false;
  if (typeof exit.weight !== "number") return false;
  return true;
}

/**
 * Structural well-formedness guard for a `ResolvedRoomResponse` (SPEC §3.2) — the
 * conformance predicate the §5.3 fixture suite and the §6.5 round-trip test assert
 * against. A response is well-formed iff its `room` and every `objects[]` entry are
 * valid `Entity`s (§3.1), every `exits[]` entry is a valid `ResolvedExit`,
 * `resolution_status` is a string (the §0.11.0 C2 open union — "resolved",
 * "stuck", or an author-added value), and any `debug` present is an object.
 * Per INV-4 it makes no coherence/taste judgement (INV-3: this validates resolved
 * output shape, never engine internals). Composes {@link isValidEntity} so a room
 * response is exactly as strict about its entities as `Entity` itself.
 */
export function isValidResolvedRoomResponse(
  value: unknown,
): value is ResolvedRoomResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;

  if (!isValidEntity(response.room)) return false;

  if (!Array.isArray(response.objects)) return false;
  if (!response.objects.every(isValidEntity)) return false;

  if (!Array.isArray(response.exits)) return false;
  if (!response.exits.every(isValidResolvedExit)) return false;

  if (typeof response.resolution_status !== "string") return false;

  // `debug` is optional (§4.6) and only ever present with server debug mode on;
  // when present it must at least be an object. Its full `DebugTrace` shape is an
  // engine-internal view (INV-3), not part of the client-facing fixture contract.
  if (
    response.debug !== undefined &&
    (typeof response.debug !== "object" || response.debug === null)
  ) {
    return false;
  }

  return true;
}
