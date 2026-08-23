// packages/corpus-builder/src/types.ts
//
// Internal substrate-index types (SPEC §6.3, §0.8.0 re-scoping). `graph.json` is
// an INTERNAL-ONLY artifact (INV-3): it holds embedding vectors and the ANN
// index, and is consumed exclusively by `rule-engine` — never sent to a client.
// These types are versioned less strictly than the client-facing Section 3
// schema (§6.3 Exit) and are documented in GRAPH_FORMAT.md.

import type { SourceSpan } from "schema";

/** Build-artifact format version for `graph.json` (internal; see GRAPH_FORMAT.md). */
export const GRAPH_FORMAT_VERSION = "0.1.0";

/** How raw text is tiled into atomic units before grouping (§0.10.0 B1). */
export type SegmentUnit = "char" | "word" | "sentence" | "token";

/** How atomic units are assembled into spans (§0.10.0 B1). */
export type SegmentGrouping = "boundary" | "fixed";

/** Boundary marker kinds for `grouping: "boundary"` (§0.10.0 B1). */
export type BoundaryKind = "blank-line" | "newline" | "delimiter";

/**
 * Segmentation config — the `unit` × `grouping` partition axes (§0.10.0 B1).
 * Default is boundary/blank-line/overlap 0 (paragraphs), see `DEFAULT_SEGMENTATION`.
 */
export interface SegmentationConfig {
  unit: SegmentUnit;
  grouping: SegmentGrouping;
  boundary?: BoundaryKind; // for grouping: "boundary"; default "blank-line"
  delimiter?: string; // for boundary: "delimiter"
  size?: number; // for grouping: "fixed" — N units per span
  overlap?: number; // for grouping: "fixed" — units shared between adjacent spans
}

export const DEFAULT_SEGMENTATION: SegmentationConfig = {
  unit: "char",
  grouping: "boundary",
  boundary: "blank-line",
  overlap: 0,
};

/**
 * One resolved source-span index entry — the internal substrate node. It is NOT
 * a client `Entity`; it carries the raw embedding vector (INV-3: never leaves
 * the build artifact). `rule-engine` mints ephemeral `Entity` views from these
 * at query time (§3.1).
 */
export interface SubstrateSpan {
  id: string; // deterministic, replay-stable: `${source_id}:${start}-${end}`
  source_refs: string[]; // raw corpus document id(s) this span was built from (§6.3 provenance)
  source_span: SourceSpan; // client-facing positional provenance (§3.1)
  prose: string; // verbatim source excerpt (§3.1 A1)
  embedding: number[]; // L2-normalized vector (§0.10.0 B2) — INTERNAL, never sent to client
  semantic_tags: string[]; // structured tags (§3.6 grammar)
  archetype: string; // default archetype from the tagger (§3.4 A13)
  local_coherence: number; // embedding-neighborhood tightness, [0,1] (§0.10.0 B5)
}

/** The `graph.json` header — the substrate-build metadata block (§6.3, §3.7.3). */
export interface SubstrateHeader {
  substrate_version: string; // content-hash build id (§3.7.3); rebuild-stable
  dimensions: number; // provider-declared vector dimensionality (§0.10.0 B2)
  distance: "cosine"; // fixed distance metric (§4.2, §0.10.0 B2)
  distance_range: [number, number]; // [0, 2] for cosine over L2-normalized vectors
  embedding_provider: string; // provider identity (feeds substrate_version)
  tokenizer: string | null; // tokenizer identity if `unit: token` was used, else null
  tagger: string; // tagger identity (feeds substrate_version)
  index: string; // §0.10.0 B2 index-stage identity — the index is BUILT ON LOAD from the
  //              // shipped vectors (not serialized); this names which impl to rebuild (feeds substrate_version)
  segmentation: SegmentationConfig; // the partition config used
  restructure: string | null; // composition strategy selector (§6.3.1 B6); null = passthrough
  span_count: number;
}

/** The full internal substrate bundle serialized as `graph.json`. */
export interface SubstrateBundle {
  format_version: string; // GRAPH_FORMAT_VERSION
  substrate_version: string; // mirrors header.substrate_version for convenience
  header: SubstrateHeader;
  spans: SubstrateSpan[];
}
