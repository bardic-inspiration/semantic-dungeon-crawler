// packages/schema/src/overlay.ts
//
// SPEC §3.7 — the Tier-3 overlay type surface: the inert Address Registry
// (§3.7.1), Links (§3.7.2), the Snapshot header staleness is checked against
// (§3.7.3), and the primitive-exposure shapes (§3.7.4). The overlay is fully
// deterministic and reversible (INV-2). Types only — primitive EXECUTION and
// registry mutation are the engine, Phase 3 (§6.4).

import type { Entity } from "./entity";

export type Provenance = "build" | "author_runtime" | "player";

// §3.7.3 — a frozen, self-contained re-approximation of a stochastic substrate
// query, bound to the `substrate_version` current at creation time. It stays
// readable across rebuilds; consumers derive `stale` by comparing versions.
export interface Snapshot {
  substrate_version: string; // the substrate-build id this resolution was bound to (§6.3)
  resolved_payload: Entity[]; // self-contained frozen result; readable regardless of later rebuilds
}

// §3.7.1 — what a registry entry points to. `coordinate` names a substrate point
// by ref (INV-3, never a raw vector); `composite` is grouping only, never computation.
export type EntryReference =
  | { kind: "coordinate"; vector_ref: string }
  | { kind: "snapshot"; snapshot: Snapshot }
  | { kind: "composite"; member_tags: string[] };

// §3.7.1 — a pure name→reference map entry. Registry CONTENTS are server-internal;
// only player-provenance names/labels reach the client (INV-3, via `AddressLabel`).
export interface AddressRegistryEntry {
  tag: string; // the address/name (a structured tag, §3.6 grammar)
  points_to: EntryReference;
  provenance: Provenance;
}

// §3.7.2 — a directed, typed edge between two addresses; a separate table from
// `composite` grouping, equally inert and deterministic.
export interface LinkRecord {
  from: string; // an address (tag) in the registry
  to: string; // an address (tag) in the registry
  kind: string; // open string — interpretation-defined (see §3.5 versioning)
  provenance: Provenance;
}

// §3.7.4 — which overlay primitives a ruleset exposes, gated by a §4.2 predicate
// rather than a parallel permission system. `Effect`/`InputLogEntry` reference
// this member union as `PrimitiveExposure["primitive"]`.
export interface PrimitiveExposure {
  primitive: "pin" | "bookmark" | "snapshot" | "link" | "query" | "compose";
  exposure: "player" | "author_only" | "both";
  when?: string; // optional §4.2 DSL predicate, e.g. "dynamic.turn_count > 5"
}

// §5.1 (A10) — the client-facing projection of a player-provenance registry entry
// returned by `GET /session/{id}/registry`: a name and its display label, no
// references or payloads (INV-3 refinement, §0).
export interface AddressLabel {
  tag: string;
  label: string;
}
