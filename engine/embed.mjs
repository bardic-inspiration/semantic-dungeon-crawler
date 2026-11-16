// Embedding providers: turn passages into vectors. A project names one in
// its config (`embeddings: { provider: "minilm" }`).
//
//   minilm   all-MiniLM-L6-v2, run locally through transformers.js. Real
//            semantic signal. Downloads the model (about 90 MB) on first use.
//   hashing  Word hashing. No model and no download, instant and
//            deterministic, but it only knows shared words, not meaning.
//            For tests and for trying the pipeline offline.
import { hashText } from "./random.mjs";

const providers = {
  minilm: ({ model = "Xenova/all-MiniLM-L6-v2", batch = 64 } = {}) => ({
    id: `minilm:${model}`,
    async embed(texts) {
      const { pipeline } = await import("@xenova/transformers");
      const extractor = await pipeline("feature-extraction", model);
      const out = [];
      for (let i = 0; i < texts.length; i += batch) {
        const result = await extractor(texts.slice(i, i + batch), { pooling: "mean", normalize: true });
        out.push(...result.tolist());
      }
      return out;
    },
  }),

  hashing: ({ dim = 64 } = {}) => ({
    id: `hashing:${dim}`,
    async embed(texts) {
      return texts.map((text) => {
        const v = new Array(dim).fill(0);
        for (const word of text.toLowerCase().match(/[a-z']+/g) ?? []) {
          const h = hashText(word);
          v[h % dim] += h & 0x10000 ? 1 : -1;
        }
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  }),
};

/** The provider a config names: `{ id, embed(texts) -> number[][] }`. */
export function embedder({ provider = "minilm", ...options } = {}) {
  const make = providers[provider];
  if (!make) {
    throw new Error(`embeddings: unknown provider "${provider}" (have: ${Object.keys(providers).join(", ")})`);
  }
  return make(options);
}
