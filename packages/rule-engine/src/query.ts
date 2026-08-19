// packages/rule-engine/src/query.ts
//
// SPEC §4.4 / §0.10.0 (B3) — the substrate `Query` shape. One unified shape,
// matching the §3.7.4 `Query` primitive; the §8 glossary's nearest-neighbor /
// region / gradient kinds are parameterizations (k alone; k + radius;
// k + direction), not separate types.
//
// `origin` is a `CoordinateRef` (INV-3): a reference into the substrate index,
// never a raw float vector. Floats are a determinism hazard (§4.5) — the solver
// rounds the player's live position to the nearest STORED index coordinate and
// passes it here by ref, so `normalized_query` (and therefore the PRNG seed) is
// derived from a discretized token, never a drifting float.
//
// This type is scoped to the rule engine (§4 spec surface). The build-time index
// lookup that produces the ref, and the query's live execution against a
// `graph.json`, are the solver's concern (their own issues); this issue defines
// only the seeding/canonicalization the query feeds.

import type { CoordinateRef } from "schema";

export interface Query {
  origin: CoordinateRef; // the player's live position, by ref (INV-3)
  k: number; // candidates to draw
  radius?: number; // optional cosine-distance cutoff (region queries)
  direction?: number[]; // optional gradient bias, e.g. dynamic.momentum
  filter?: unknown; // optional author-supplied tag/archetype prefilter
}
