// packages/corpus-builder/src/pipeline.ts
//
// SPEC §6.3 — the staged build-time pipeline harness. Runs, in order:
//   segmentation → embedding (+L2 normalize +fail-loud gate) → index construction
//   → tagging → local-coherence precompute → composition (restructure) →
//   substrate_version stamping → assemble `graph.json` substrate bundle + seed
//   `tag-registry.yaml`.
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
import {
  computeLocalCoherence,
  DEFAULT_COHERENCE_K,
  scoreLocalCoherence,
} from "./coherence";
import {
  selectComposition,
  type CompositionContext,
  type CompositionStrategy,
} from "./composition";
import { defaultIndexFactory, type IndexFactory } from "./index-flat";
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
  /**
   * §0.10.0 B2 index stage. Defaults to the exact flat k-NN factory. The one
   * index built here is used for the B5 coherence field and handed to the B6
   * composition stage — it is not the discarded object it once was. Its `id`
   * feeds `substrate_version` (a different index changes the coherence field).
   */
  index?: IndexFactory;
  /**
   * §0.10.0 B6 composition stage. Defaults to `selectComposition(restructure)`
   * (passthrough unless a strategy is named). Inject a strategy to plug one in
   * without editing the pipeline; its `id` feeds `substrate_version`.
   */
  composition?: CompositionStrategy;
  /**
   * Monotonic millisecond clock for the §2.1 duration metrics. A SIDE CHANNEL
   * only: durations reach `Metrics` and never the emitted artifacts, so a build
   * stays byte-identical across runs (§6.3 Exit) — the same reason
   * `BuildTrace.duration_ms` is written as `0` (see `build-trace.ts`).
   * Injectable so tests are deterministic; defaults to `performance.now()`.
   */
  clock?: () => number;
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
  /**
   * §6.3.1 `ResolvedDocument.metadata` ("subjects, authors, etc. — passed through
   * for tagging"), with the document's `title` folded in (#107) — §6.3.1 documents
   * both as tagger inputs but the pipeline was calling `tagger.tag(prose)` with
   * neither. The `Tagger` interface takes `tag(text, metadata?)`; a custom/model
   * tagger reads this, the default lexicon tagger ignores it (so the default build
   * stays byte-identical, INV-2).
   */
  metadata: Record<string, unknown>;
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
  const indexFactory = deps.index ?? defaultIndexFactory;
  const clock = deps.clock ?? (() => performance.now());

  // §2.1 — one helper so every stage reports the same way: a `.start` event, a
  // `.end` event, and a stage duration observation. §6.3 requires start/end and
  // duration from every named stage; before this they were emitted ad hoc and
  // two stages had no `.start` at all.
  const buildStarted = clock();
  function stage<T>(
    name: string,
    startFields: Record<string, unknown>,
    body: () => T,
    endFields: (result: T) => Record<string, unknown>,
  ): T {
    logger.log("info", `stage.${name}.start`, startFields);
    const started = clock();
    const result = body();
    metrics.observe(`stage.${name}.duration_ms`, clock() - started);
    logger.log("info", `stage.${name}.end`, endFields(result));
    return result;
  }

  // §2.1 build-time metric: "corpus size".
  metrics.observe("corpus.document_count", options.documents.length);
  const segmentation = options.segmentation ?? DEFAULT_SEGMENTATION;
  const restructure = options.restructure ?? null;
  // §0.10.0 B6 — the composition strategy is swappable. Default: resolve the
  // manifest `restructure` selector (passthrough unless a strategy is named).
  const composition =
    deps.composition ?? selectComposition(restructure, logger);
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
    // §6.3.1 — the tagger's metadata input: the document's `metadata` with its
    // dedicated `title` field folded in (title wins over any `metadata.title`).
    const docMetadata: Record<string, unknown> = {
      ...doc.metadata,
      title: doc.title,
    };
    for (const raw of rawSpans) {
      working.push({
        id: `${doc.source_id}:${raw.start}-${raw.end}`,
        source_id: doc.source_id,
        prose: raw.text,
        start: raw.start,
        end: raw.end,
        metadata: docMetadata,
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
  const embeddingStarted = clock();
  // §2.1 "embedding-call count" counts PROVIDER CALLS. `embed()` is batched — one
  // call covers every span — so incrementing by `working.length` here reported the
  // span count under a name that means something else.
  metrics.increment("embedding.call_count");
  const rawVectors = await embeddingProvider.embed(working.map((w) => w.prose));
  assertWellFormedEmbeddingSpace(rawVectors, embeddingProvider.dimensions);
  const vectors = rawVectors.map(l2Normalize);
  metrics.observe("stage.embedding.duration_ms", clock() - embeddingStarted);
  metrics.observe("embedding.vector_count", vectors.length);
  recorder?.recordStage("embedding", working.length, vectors.length);
  logger.log("info", "stage.embedding.end", {
    dimensions: embeddingProvider.dimensions,
    vectors: vectors.length,
  });

  // ---- Index construction (§0.10.0 B2) --------------------------------------
  // Built ONCE via the injected factory and actually used below — for the B5
  // coherence field and by the B6 composition stage. Not serialized: `graph.json`
  // ships the vectors and the runtime rebuilds this in O(n) (GRAPH_FORMAT.md);
  // `header.index` records which impl to rebuild.
  const index = stage(
    "index_construction",
    { vectors: vectors.length, index: indexFactory.id },
    () => indexFactory.build(vectors),
    (built) => ({ size: built.size }),
  );
  recorder?.recordStage("index_construction", vectors.length, index.size);

  // ---- Tagging --------------------------------------------------------------
  const taggingStarted = clock();
  logger.log("info", "stage.tagging.start", { spans: working.length });
  // §6.3.1 — pass each span's document metadata (incl. title) through to the
  // tagger (#107); the default lexicon tagger ignores it, custom taggers read it.
  const tagResults = working.map((w) => tagger.tag(w.prose, w.metadata));
  metrics.observe("stage.tagging.duration_ms", clock() - taggingStarted);
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
  const coherence = stage(
    "coherence_precompute",
    { vectors: vectors.length, k: coherenceK },
    () => computeLocalCoherence(vectors, coherenceK, index),
    (field) => ({
      k: Math.min(coherenceK, vectors.length - 1),
      values: field.length,
    }),
  );
  recorder?.recordStage(
    "coherence_precompute",
    vectors.length,
    coherence.length,
  );

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
  // The stage gets what a real composite needs (§0.10.0 B6): the build's embedding
  // provider and its index, so a composite it emits is embedded and coherence-
  // scored like any other span and fed back into the index. The default
  // passthrough ignores the context and returns spans unchanged (INV-2).
  const compositionCtx: CompositionContext = {
    embed: async (texts) =>
      (await embeddingProvider.embed(texts)).map(l2Normalize),
    index,
    coherenceK,
    scoreCoherence: (vector) => scoreLocalCoherence(index, vector, coherenceK),
  };
  // Timed by hand (not the sync `stage` helper) because a strategy may be async —
  // a real one embeds its composites, and embedding returns a Promise.
  logger.log("info", "stage.composition.start", {
    strategy: composition.id,
    spans: spans.length,
  });
  const compositionStarted = clock();
  spans = await composition.restructure(spans, compositionCtx);
  metrics.observe(
    "stage.composition.duration_ms",
    clock() - compositionStarted,
  );
  logger.log("info", "stage.composition.end", {
    strategy: composition.id,
    spans: spans.length,
  });

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
    indexId: indexFactory.id,
    compositionId: composition.id,
    coherenceK,
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
      index: indexFactory.id,
      segmentation,
      restructure,
      span_count: spans.length,
    },
    spans,
  };

  // §2.1 build-time metric: "build duration". Side channel only — never
  // serialized into `graph.json` or `build-trace.json` (§6.3 byte-identity).
  metrics.observe("build.duration_ms", clock() - buildStarted);

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
