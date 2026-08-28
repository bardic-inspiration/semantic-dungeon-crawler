// packages/corpus-builder/src/minilm-embedding.ts
//
// SPEC §6.3 (embedding step) / §0.10.0 B2 — a REAL, model-based embedding provider
// for the swappable embedding stage, and the pre-alpha default (§2.1 config
// convention; `config.ts` registers it under `minilm`). It embeds text with a
// local, offline sentence-embedding model — `all-MiniLM-L6-v2` run through
// transformers.js (`@xenova/transformers`, ONNX/WASM) — so a build needs no API
// key and makes no network call during `embed()` once the weights are cached.
//
// Contrast with `HashingEmbeddingProvider` (embedding.ts): that one is the
// dependency-free, model-free TEST-MODE provider — instant and deterministic, but
// carrying no real semantic signal. This provider carries the semantic signal that
// gameplay feel (room similarity, drift) actually depends on, at the cost of a
// one-time model fetch. Vectors are returned RAW (un-normalized); the pipeline
// L2-normalizes at build time (fixing distance as cosine, §4.2), exactly as it
// does for every other provider.
//
// Determinism (INV-2): the model weights are pinned (model id + revision +
// quantization, all folded into `id`), and pinned weights are a pure function
// input ⇒ output — identical text yields an identical vector. Because `id` feeds
// `substrate_version` (§3.7.3), changing the pinned model/revision/quantization is
// a VISIBLE new build id, per `GRAPH_FORMAT.md`'s provenance rule — never silent
// drift.

import type { EmbeddingProvider } from "./embedding";

/** The pinned HuggingFace model repo (transformers.js-converted ONNX weights). */
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
/** Short, human-readable model tag folded into the provider `id`. */
const DEFAULT_MODEL_TAG = "all-MiniLM-L6-v2";
/**
 * The pinned model revision. `main` is the transformers.js default; pin it to a
 * commit SHA for a hard reproducibility guarantee — the SHA then rides in `id`
 * (and therefore `substrate_version`), so a re-pin is a visible new build.
 */
const DEFAULT_REVISION = "main";
/** all-MiniLM-L6-v2 emits a 384-dimensional sentence embedding. */
const MINILM_DIMENSIONS = 384;

/** Constructor knobs — all default to the pinned all-MiniLM-L6-v2 configuration. */
export interface MiniLmOptions {
  /** HuggingFace model repo id (transformers.js ONNX weights). */
  model?: string;
  /** Short model tag used in the provider `id`. */
  modelTag?: string;
  /** Pinned model revision (branch, tag, or commit SHA). */
  revision?: string;
  /** Use the quantized (int8) ONNX weights (smaller, faster). Default: true. */
  quantized?: boolean;
}

// transformers.js is loaded lazily on first `embed()` so that merely constructing
// or registering this provider (e.g. building the default registry, or running the
// hashing test-mode provider) never pulls the ONNX/WASM runtime into the process.
type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Local, offline, model-based embedding provider (all-MiniLM-L6-v2 via
 * transformers.js). The pre-alpha default. Weights are fetched once and cached by
 * transformers.js, after which `embed()` runs fully offline; the pinned identity
 * (`id`) rides into `substrate_version` for provenance.
 */
export class MiniLmEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number = MINILM_DIMENSIONS;

  private readonly model: string;
  private readonly revision: string;
  private readonly quantized: boolean;
  private extractor: Promise<FeatureExtractor> | undefined;

  constructor(options: MiniLmOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.revision = options.revision ?? DEFAULT_REVISION;
    this.quantized = options.quantized ?? true;
    const tag = options.modelTag ?? DEFAULT_MODEL_TAG;
    // `id` encodes model name + version + quantization + pinned revision, so any
    // change to the pinned weights changes `substrate_version` (provenance rule).
    this.id = `minilm-${tag}-${this.quantized ? "q" : "f"}-${this.revision}`;
  }

  /** Load (once) the pinned feature-extraction pipeline. */
  private load(): Promise<FeatureExtractor> {
    if (this.extractor === undefined) {
      this.extractor = import("@xenova/transformers")
        .then(({ pipeline }) =>
          pipeline("feature-extraction", this.model, {
            quantized: this.quantized,
            revision: this.revision,
          }),
        )
        .then((extractor) => extractor as unknown as FeatureExtractor)
        .catch((cause: unknown) => {
          // Reset so a transient first-fetch failure can be retried on a later call.
          this.extractor = undefined;
          throw new Error(
            `failed to load embedding model "${this.model}"@"${this.revision}" ` +
              `(transformers.js): ${(cause as Error).message}`,
            { cause },
          );
        });
    }
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    // Mean-pool token embeddings into one sentence vector; leave normalization to
    // the pipeline's build-time L2 step so distance stays cosine for every provider.
    const output = await extractor(texts, {
      pooling: "mean",
      normalize: false,
    });
    return output.tolist();
  }
}
