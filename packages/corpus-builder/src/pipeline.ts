// packages/corpus-builder/src/pipeline.ts
//
// SPEC §6.3 — the staged build-time pipeline harness. Runs, in order:
//   segmentation → embedding (+L2 normalize +fail-loud gate) → tagging →
//   composition (restructure) → local-coherence precompute → substrate_version
//   stamping → assemble `graph.json` substrate bundle + seed `tag-registry.yaml`.
//
// Composition runs AFTER embedding and tagging (§0.10.0 B6). Every stage reports
// through the SAME §2.1 `Logger`/`Metrics` interfaces `server` uses (not a
// parallel mechanism). The whole pipeline is a PURE FUNCTION of its inputs +
// pinned stage identities — no wall-clock, no unseeded ordering — so a rebuild of
// unchanged input is byte-identical (INV-2, §6.3 Exit).

import type { BuildTrace } from "./build-trace";
import { BuildTraceRecorder } from "./build-trace";
import {
  assertWellFormedEmbeddingSpace,
  defaultEmbeddingProvider,
  l2Normalize,
  type EmbeddingProvider,
} from "./embedding";
import { computeLocalCoherence, DEFAULT_COHERENCE_K } from "./coherence";
import { selectComposition } from "./composition";
import { FlatIndex } from "./index-flat";
import {
  InMemoryMetrics,
  NoopLogger,
  type Logger,
  type Metrics,
} from "./instrumentation";
import {
  defaultSegmenter,
  tokenizerIdentityFor,
  type Segmenter,
} from "./segmentation";
import { buildRegistryTree, emitTagRegistry } from "./tag-registry";
import { defaultTagger, type Tagger } from "./tagging";
import { computeSubstrateVersion } from "./substrate-version";
import {
  DEFAULT_SEGMENTATION,
  GRAPH_FORMAT_VERSION,
  type SegmentationConfig,
  type SubstrateBundle,
  type SubstrateSpan,
} from "./types";
import type { ResolvedDocument } from "./sources/types";

export interface BuildOptions {
  documents: ResolvedDocument[];
  segmentation?: SegmentationConfig;
  restructure?: string | null;
  trace?: boolean;
}

export interface BuildDeps {
  segmenter?: Segmenter;
  embeddingProvider?: EmbeddingProvider;
  tagger?: Tagger;
  logger?: Logger;
  metrics?: Metrics;
  coherenceK?: number;
}

export interface BuildResult {
  bundle: SubstrateBundle;
  registryYaml: string;
  buildTrace: BuildTrace | null;
}

interface WorkingSpan {
  id: string;
  source_id: string;
  prose: string;
  start: number;
  end: number;
}

export async function runBuild(
  options: BuildOptions,
  deps: BuildDeps = {},
): Promise<BuildResult> {
  const logger = deps.logger ?? new NoopLogger();
  const metrics = deps.metrics ?? new InMemoryMetrics();
  const segmenter = deps.segmenter ?? defaultSegmenter;
  const embeddingProvider = deps.embeddingProvider ?? defaultEmbeddingProvider;
  const tagger = deps.tagger ?? defaultTagger;
  const coherenceK = deps.coherenceK ?? DEFAULT_COHERENCE_K;
  const segmentation = options.segmentation ?? DEFAULT_SEGMENTATION;
  const restructure = options.restructure ?? null;
  const recorder = options.trace ? new BuildTraceRecorder() : null;

  // ---- Segmentation ---------------------------------------------------------
  logger.log("info", "stage.segmentation.start", {
    documents: options.documents.length,
  });
  const working: WorkingSpan[] = [];
  for (const doc of options.documents) {
    const rawSpans = segmenter.segment(doc.raw_text, segmentation);
    if (rawSpans.length === 0) {
      logger.log("warn", "segmentation.empty_document", {
        source_id: doc.source_id,
      });
    }
    for (const raw of rawSpans) {
      working.push({
        id: `${doc.source_id}:${raw.start}-${raw.end}`,
        source_id: doc.source_id,
        prose: raw.text,
        start: raw.start,
        end: raw.end,
      });
    }
  }
  metrics.observe("segmentation.span_count", working.length);
  logger.log("info", "stage.segmentation.end", { spans: working.length });

  if (working.length === 0) {
    throw new Error(
      "no spans produced from the input corpus (need source material to build)",
    );
  }

  // ---- Embedding (+ L2 normalize + fail-loud gate) --------------------------
  logger.log("info", "stage.embedding.start", { spans: working.length });
  const rawVectors = await embeddingProvider.embed(working.map((w) => w.prose));
  assertWellFormedEmbeddingSpace(rawVectors, embeddingProvider.dimensions);
  const vectors = rawVectors.map(l2Normalize);
  metrics.increment("embedding.call_count", working.length);
  recorder?.recordStage("embedding", working.length, vectors.length);
  logger.log("info", "stage.embedding.end", {
    dimensions: embeddingProvider.dimensions,
  });

  // ---- Index construction ---------------------------------------------------
  const index = new FlatIndex(vectors);
  recorder?.recordStage("index_construction", vectors.length, index.size);
  logger.log("info", "stage.index_construction.end", { size: index.size });

  // ---- Tagging --------------------------------------------------------------
  logger.log("info", "stage.tagging.start", { spans: working.length });
  const tagResults = working.map((w) => tagger.tag(w.prose));
  let orphanSpans = 0;
  for (const r of tagResults) if (r.tags.length === 0) orphanSpans++;
  recorder?.recordStage(
    "tagging",
    working.length,
    working.length,
    orphanSpans > 0 ? [`${orphanSpans} span(s) received no tags (orphan)`] : [],
  );
  logger.log("info", "stage.tagging.end", { orphan_spans: orphanSpans });

  // ---- Local-coherence precompute -------------------------------------------
  const coherence = computeLocalCoherence(vectors, coherenceK);
  recorder?.recordStage(
    "coherence_precompute",
    vectors.length,
    coherence.length,
  );
  logger.log("info", "stage.coherence_precompute.end", {
    k: Math.min(coherenceK, vectors.length - 1),
  });

  // ---- Assemble spans -------------------------------------------------------
  let spans: SubstrateSpan[] = working.map((w, i) => ({
    id: w.id,
    source_refs: [w.source_id],
    source_span: { source: w.source_id, char_ranges: `${w.start}-${w.end}` },
    prose: w.prose,
    embedding: vectors[i]!,
    semantic_tags: tagResults[i]!.tags,
    archetype: tagResults[i]!.archetype,
    local_coherence: coherence[i]!,
  }));

  // ---- Composition (restructure) — after embedding + tagging (B6) -----------
  spans = selectComposition(restructure, logger).restructure(spans);

  // ---- substrate_version stamping -------------------------------------------
  const substrateVersion = computeSubstrateVersion({
    documents: options.documents.map((d) => ({
      source_id: d.source_id,
      raw_text: d.raw_text,
    })),
    segmentation,
    restructure,
    embeddingProviderId: embeddingProvider.id,
    tokenizerId: tokenizerIdentityFor(segmentation),
    taggerId: tagger.id,
    formatVersion: GRAPH_FORMAT_VERSION,
  });

  const bundle: SubstrateBundle = {
    format_version: GRAPH_FORMAT_VERSION,
    substrate_version: substrateVersion,
    header: {
      substrate_version: substrateVersion,
      dimensions: embeddingProvider.dimensions,
      distance: "cosine",
      distance_range: [0, 2],
      embedding_provider: embeddingProvider.id,
      tokenizer: tokenizerIdentityFor(segmentation),
      tagger: tagger.id,
      segmentation,
      restructure,
      span_count: spans.length,
    },
    spans,
  };

  const registryTree = buildRegistryTree(spans.flatMap((s) => s.semantic_tags));
  const registryYaml = emitTagRegistry(registryTree, substrateVersion);

  const buildTrace = recorder
    ? recorder.finish(
        Object.fromEntries(spans.map((s) => [s.id, s.source_refs])),
      )
    : null;

  return { bundle, registryYaml, buildTrace };
}

/** Deterministic serialization of the substrate bundle (INV-2). Trailing newline. */
export function serializeBundle(bundle: SubstrateBundle): string {
  return JSON.stringify(bundle, null, 2) + "\n";
}

/** Deterministic serialization of a build trace (INV-2). Trailing newline. */
export function serializeBuildTrace(trace: BuildTrace): string {
  return JSON.stringify(trace, null, 2) + "\n";
}
