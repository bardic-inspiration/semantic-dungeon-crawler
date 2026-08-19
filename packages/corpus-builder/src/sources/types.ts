// packages/corpus-builder/src/sources/types.ts
//
// SPEC §6.3.1 — corpus retrieval is a pluggable stage ahead of embedding, behind
// the `CorpusSource` interface (the same swappability convention §6.3 requires of
// the embedding provider). This phase implements Gutendex only; the interface
// anticipates non-Gutenberg sources (local filesystem, other APIs).

import type { SegmentationConfig } from "../types";

export interface CorpusSource {
  resolve(manifest: CorpusManifestEntry[]): Promise<ResolvedDocument[]>;
}

export interface ResolvedDocument {
  source_id: string; // e.g. "gutenberg:11"
  title: string;
  raw_text: string; // boilerplate-stripped
  metadata: Record<string, unknown>; // subjects, authors, etc. — passed through for tagging
}

/** One manifest entry — a source-specific document id plus an author note. */
export interface CorpusManifestEntry {
  id: number;
  note?: string;
}

/**
 * `corpus-manifest.json` schema (§6.3.1). `restructure` is the composition-stage
 * selector (§0.10.0 B6; `null` = passthrough). `segmentation` selects how the
 * `Segmenter` partitions raw text (§0.10.0 B1; default paragraphs/no-overlap).
 */
export interface CorpusManifest {
  source: string;
  restructure: string | null;
  segmentation?: SegmentationConfig;
  entries: CorpusManifestEntry[];
}
