// packages/corpus-builder/src/tokenizer.ts
//
// SPEC §0.10.0 B1 — `unit: token` segmentation "lazily loads a pinned Tokenizer
// (default cl100k_base) whose identity feeds substrate_version". This module
// ships the INTERFACE plus one deterministic default, following the B-series
// "interface now, richer impl later" pattern: a production BPE tokenizer
// (cl100k_base et al.) is a deferred swap-in behind `Tokenizer`. The default is
// a zero-dependency, deterministic approximate tokenizer whose PINNED identity
// (`id`) feeds `substrate_version`, so swapping it in is a visible build-id
// change, never a silent drift.

/** A pinned tokenizer. `id` is the identity that feeds `substrate_version`. */
export interface Tokenizer {
  readonly id: string;
  /** Tile `text` into token units with their char offsets in `text`. */
  tokenize(text: string): TokenUnit[];
}

export interface TokenUnit {
  text: string;
  start: number; // inclusive char offset
  end: number; // exclusive char offset
}

// GPT-style pre-tokenization pattern (contractions, words, numbers, punctuation
// runs, whitespace). Deterministic and dependency-free. This is APPROXIMATE
// sizing (§0.10.0 B1: "token-counting is approximate sizing, decoupled from the
// embedding provider's tokenizer"), not byte-accurate BPE.
const APPROX_TOKEN_PATTERN =
  /'(?:[sdmt]|ll|ve|re)|[\p{L}\p{M}]+|\p{N}+|[^\s\p{L}\p{N}]+|\s+/gu;

class ApproxTokenizer implements Tokenizer {
  readonly id = "approx-token-v1";

  tokenize(text: string): TokenUnit[] {
    const units: TokenUnit[] = [];
    for (const match of text.matchAll(APPROX_TOKEN_PATTERN)) {
      const raw = match[0];
      if (/^\s+$/u.test(raw)) continue; // whitespace is a separator, not a token
      const start = match.index;
      units.push({ text: raw, start, end: start + raw.length });
    }
    return units;
  }
}

let cached: Tokenizer | null = null;

/**
 * Lazily construct the pinned default tokenizer (§0.10.0 B1 "lazily loads"). Only
 * called when `unit: token` is selected, so `char`/`word`/`sentence` builds pay
 * nothing for it and leave `header.tokenizer` null.
 */
export function getDefaultTokenizer(): Tokenizer {
  if (cached === null) cached = new ApproxTokenizer();
  return cached;
}
