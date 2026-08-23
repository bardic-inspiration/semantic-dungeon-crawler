// packages/corpus-builder/src/substrate-version.ts
//
// SPEC §3.7.3 / §6.3 — `substrate_version` is a content-hash/build-id stamped in
// the `graph.json` header and consumed by snapshot staleness (§3.7.3). It absorbs
// the identity of every pinned model/tokenizer/tagger (§0.10.0), so any of them
// changing is a VISIBLE new build id, never a silent drift.
//
// INV-2 (determinism, as a build-id guarantee, §4.5): a second build of unchanged
// input MUST yield an identical `substrate_version`. It is therefore a pure
// function of a CANONICAL representation of the inputs + pinned identities — no
// wall-clock, no map-iteration order, no unseeded value.
//
// The bar for inclusion is "does changing it change the bundle's contents"
// (GRAPH_FORMAT.md), which is why the index and composition identities are here
// (they alter the coherence field / emit composites) but the `CorpusSource`
// identity is NOT: retrieval feeds the resolved `documents`, which ARE hashed, so
// the same corpus fetched two ways is deliberately the same build — hashing the
// source would falsely fork the id on a content-preserving retrieval change.

import { createHash } from "node:crypto";

/** The inputs whose identity `substrate_version` binds (§0.10.0). */
export interface SubstrateVersionInputs {
  documents: { source_id: string; raw_text: string }[];
  segmentation: unknown;
  restructure: string | null;
  embeddingProviderId: string;
  tokenizerId: string | null;
  taggerId: string;
  /**
   * The B2 index-stage identity. The index is not serialized (built on load), but
   * the B5 `local_coherence` field is computed THROUGH it, so a different index
   * implementation changes every coherence value in the bundle — the same
   * "does changing it change the bundle's contents" test that puts `coherenceK`
   * and the embedding provider in this hash.
   */
  indexId: string;
  /**
   * The B6 composition-stage identity. The default (`passthrough`) leaves spans
   * untouched, but a swapped-in strategy emits composite spans, so it changes the
   * bundle's contents and is a visible new build id, not a silent drift.
   */
  compositionId: string;
  /**
   * The k of the B5 local-coherence precompute. Not a model identity, but it
   * changes every `local_coherence` value in the bundle, so §6.3's "any of them
   * changing is a visible new build id" applies to it exactly as it does to a
   * pinned model — and §3.7.3 derives snapshot staleness from this id.
   */
  coherenceK: number;
  formatVersion: string;
}

/**
 * Canonical JSON with keys emitted in sorted order at every level, so two
 * structurally-equal inputs hash identically regardless of construction order.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize(record[k]))
      .join(",") +
    "}"
  );
}

/**
 * Compute the build id. Documents are sorted by `source_id` so retrieval order
 * cannot fork the hash. Returns `sv_` + the first 32 hex chars of a SHA-256.
 */
export function computeSubstrateVersion(
  inputs: SubstrateVersionInputs,
): string {
  const documents = [...inputs.documents]
    .map((d) => ({ source_id: d.source_id, raw_text: d.raw_text }))
    .sort((a, b) =>
      a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0,
    );

  const canonical = canonicalize({
    documents,
    segmentation: inputs.segmentation,
    restructure: inputs.restructure,
    embeddingProviderId: inputs.embeddingProviderId,
    tokenizerId: inputs.tokenizerId,
    taggerId: inputs.taggerId,
    indexId: inputs.indexId,
    compositionId: inputs.compositionId,
    coherenceK: inputs.coherenceK,
    formatVersion: inputs.formatVersion,
  });

  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return "sv_" + digest.slice(0, 32);
}
