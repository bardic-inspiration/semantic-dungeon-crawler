// packages/corpus-builder/src/manifest.ts
//
// SPEC §6.3.1 — parse `corpus-manifest.json`. Validates well-formedness only
// (INV-4): a manifest naming a deferred `restructure` strategy or an unusual
// `segmentation` config parses fine; it is the pipeline's job to surface, not
// reject. Applies documented defaults (`restructure: null`).

import type { CorpusManifest, CorpusManifestEntry } from "./sources/types";
import type { SegmentationConfig } from "./types";

export function parseManifest(text: string): CorpusManifest {
  const data = JSON.parse(text) as Record<string, unknown>;

  if (typeof data.source !== "string") {
    throw new Error("manifest: `source` must be a string");
  }
  if (!Array.isArray(data.entries)) {
    throw new Error("manifest: `entries` must be an array");
  }

  const entries: CorpusManifestEntry[] = data.entries.map((raw, i) => {
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "number") {
      throw new Error(`manifest: entries[${i}].id must be a number`);
    }
    return typeof entry.note === "string"
      ? { id: entry.id, note: entry.note }
      : { id: entry.id };
  });

  const restructure =
    data.restructure === undefined || data.restructure === null
      ? null
      : String(data.restructure);

  const manifest: CorpusManifest = {
    source: data.source,
    restructure,
    entries,
  };
  if (data.segmentation !== undefined) {
    manifest.segmentation = data.segmentation as SegmentationConfig;
  }
  return manifest;
}
