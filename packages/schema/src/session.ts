// packages/schema/src/session.ts
//
// SPEC §3.8 (Session State, A8) and §3.9 (Input Log, A9) — the determinism-replay
// surface (INV-2). SessionState is the in-memory run-state the solver reads and
// every `dynamic.*` predicate (§4.2) resolves against; it is SERVER-INTERNAL
// (INV-3), except the derived `ended` flag surfaced on InteractResponse (§3.3).
// This is the in-memory shape, not persistence (durability is post-alpha, §6.8).

import type { Affordance } from "./entity";
import type {
  AddressRegistryEntry,
  LinkRecord,
  PrimitiveExposure,
} from "./overlay";

// §3.8 — a substrate coordinate by ref, never a raw vector (INV-3).
export type CoordinateRef = { vector_ref: string };

// §3.9 — the artifact INV-2 is defined against: only player/author INPUTS are
// logged; rule-driven scratch/overlay writes are deterministic consequences and
// re-derive on replay.
export type InputLogEntry =
  | { kind: "interact"; action: { object_id: string; affordance: Affordance } }
  | {
      kind: "primitive";
      primitive: PrimitiveExposure["primitive"];
      args?: Record<string, string>;
    };

export interface SessionState {
  session_id: string;
  session_seed: number; // §4.5: the only entropy source
  position: CoordinateRef; // §0.9.0 (A3): live substrate coordinate, by ref (INV-3)
  turn_count: number; // dynamic.turn_count
  trace_centroid: number[] | null; // dynamic.trace_centroid (vector, server-internal)
  momentum: number[] | null; // dynamic.momentum
  path_coherence: number; // §0.10.0 (B5): dynamic.path_coherence — engine-computed trajectory tightness
  visited_set: string[]; // dynamic.visited_set — overlay ADDRESS-TOKENS (A3), not ephemeral ids
  vars: Record<string, string>; // §0.9.0 (A8): dynamic.vars.* scratch — write target for `write` effects
  registry: AddressRegistryEntry[]; // §0.9.0: the PLAYER-overlay layer (provenance "player")
  links: LinkRecord[]; // player-overlay links (§3.7.2)
  ended: boolean; // §0.9.0 (A7): set by the `end` effect; surfaced as InteractResponse.session_ended
  input_log: InputLogEntry[]; // §0.9.0 (A9): accumulated player inputs (§3.9)
}
