// packages/corpus-builder/src/minilm-embedding.test.ts
//
// SPEC §6.3 / §0.10.0 B2 — the real, local, model-based embedding provider.
//
// Two tiers of test:
//   - OFFLINE (always run): identity/provenance, declared dimensionality, and that
//     the §2.1 registry resolves `minilm` to this provider. None touch the model.
//   - MODEL (opt-in): deterministic output, uniform dimensions, and the C4
//     fail-loud gate passing on a representative multi-document corpus. These need
//     the pinned weights, which transformers.js fetches once from the network, so
//     they run only when `SDC_RUN_MINILM_TESTS=1` (and self-skip if the weights are
//     unreachable). Enable them in an environment with model access — e.g. the #164
//     first-corpus evaluation — to exercise the real embedding space.

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertWellFormedEmbeddingSpace,
  EmbeddingSpaceError,
} from "./embedding";
import { MiniLmEmbeddingProvider } from "./minilm-embedding";
import {
  defaultEmbeddingProviderRegistry,
  resolveEmbeddingProvider,
} from "./config";

const CORPUS_DIR = join(__dirname, "..", "test-assets", "corpus");

describe("MiniLmEmbeddingProvider — identity & shape (offline)", () => {
  it("declares all-MiniLM-L6-v2's 384 dimensions", () => {
    expect(new MiniLmEmbeddingProvider().dimensions).toBe(384);
  });

  it("encodes model name + version + quantization + revision in its id (provenance)", () => {
    // The id feeds substrate_version, so it must move when the pinned model does.
    expect(new MiniLmEmbeddingProvider().id).toBe(
      "minilm-all-MiniLM-L6-v2-q-main",
    );
    // A different pin ⇒ a different id ⇒ a visibly different build.
    expect(new MiniLmEmbeddingProvider({ quantized: false }).id).toBe(
      "minilm-all-MiniLM-L6-v2-f-main",
    );
    expect(new MiniLmEmbeddingProvider({ revision: "abc1234" }).id).toBe(
      "minilm-all-MiniLM-L6-v2-q-abc1234",
    );
  });

  it("embeds an empty batch without loading the model", async () => {
    expect(await new MiniLmEmbeddingProvider().embed([])).toEqual([]);
  });
});

describe("§2.1 registry — minilm resolves to MiniLmEmbeddingProvider (offline)", () => {
  it("is the default provider when SDC_EMBEDDING_PROVIDER is unset", () => {
    const provider = resolveEmbeddingProvider({});
    expect(provider).toBeInstanceOf(MiniLmEmbeddingProvider);
    expect(provider.id).toBe("minilm-all-MiniLM-L6-v2-q-main");
  });

  it("resolves the explicit `minilm` id to MiniLmEmbeddingProvider", () => {
    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "minilm" }),
    ).toBeInstanceOf(MiniLmEmbeddingProvider);
  });

  it("registers minilm alongside the hashing test-mode provider", () => {
    expect(Object.keys(defaultEmbeddingProviderRegistry())).toEqual([
      "minilm",
      "hashing",
    ]);
  });
});

// ── Opt-in model tests (need the pinned weights) ──────────────────────────────
const RUN_MODEL_TESTS = process.env.SDC_RUN_MINILM_TESTS === "1";

describe.runIf(RUN_MODEL_TESTS)(
  "MiniLmEmbeddingProvider — real model output",
  () => {
    const provider = new MiniLmEmbeddingProvider();

    async function corpusTexts(): Promise<string[]> {
      const files = [
        "forest.txt",
        "town.txt",
        "market.txt",
        "science.txt",
        "poem.txt",
      ];
      return Promise.all(
        files.map((f) => readFile(join(CORPUS_DIR, f), "utf8")),
      );
    }

    it("is deterministic: identical text ⇒ identical vector (INV-2)", async () => {
      const [a] = await provider.embed(["the quick brown fox"]);
      const [b] = await provider.embed(["the quick brown fox"]);
      expect(a).toEqual(b);
    }, 120_000);

    it("produces uniform 384-dim vectors for every input", async () => {
      const vectors = await provider.embed(await corpusTexts());
      expect(vectors.length).toBe(5);
      for (const v of vectors) expect(v).toHaveLength(provider.dimensions);
    }, 120_000);

    it("passes the C4 fail-loud gate on a representative multi-document corpus", async () => {
      const vectors = await provider.embed(await corpusTexts());
      expect(() =>
        assertWellFormedEmbeddingSpace(vectors, provider.dimensions),
      ).not.toThrow(EmbeddingSpaceError);
    }, 120_000);
  },
);
