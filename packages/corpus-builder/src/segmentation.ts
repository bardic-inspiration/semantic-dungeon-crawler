// packages/corpus-builder/src/segmentation.ts
//
// SPEC §6.3 (segmentation step) / §0.10.0 B1 — the `Segmenter` stage. It
// PARTITIONS raw text into source spans: a PURE FUNCTION OF CHARACTERS (no
// embeddings, no tags read), over two axes: `unit` (char/word/sentence/token) ×
// `grouping` (boundary | fixed with overlap). Default: boundary on blank lines,
// overlap 0 (paragraphs). Line endings are normalized (CRLF→LF) FIRST.
// Structureless / half-sentence corpora are legal (INV-4) — they segment without
// error, they are not rejected.

import { getDefaultTokenizer, type Tokenizer } from "./tokenizer";
import { DEFAULT_SEGMENTATION, type SegmentationConfig } from "./types";

/** One partitioned span with its char offsets in the normalized source text. */
export interface RawSpan {
  text: string;
  start: number; // inclusive char offset into the normalized text
  end: number; // exclusive char offset
}

export interface Segmenter {
  segment(text: string, config?: SegmentationConfig): RawSpan[];
}

/** CRLF/CR → LF. Applied before any partitioning so offsets are LF-relative. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

interface Unit {
  start: number;
  end: number;
}

/** Tile normalized text into atomic units of `unit`, with char offsets. */
function tileUnits(
  text: string,
  unit: SegmentationConfig["unit"],
  tokenizer: Tokenizer,
): Unit[] {
  switch (unit) {
    case "char": {
      const units: Unit[] = [];
      for (let i = 0; i < text.length; i++)
        units.push({ start: i, end: i + 1 });
      return units;
    }
    case "word": {
      const units: Unit[] = [];
      for (const m of text.matchAll(/\S+/g)) {
        units.push({ start: m.index, end: m.index + m[0].length });
      }
      return units;
    }
    case "sentence": {
      // Zero-dependency regex tiling: a run of non-terminator chars plus its
      // trailing sentence terminator(s). Deterministic; not linguistically exact.
      const units: Unit[] = [];
      for (const m of text.matchAll(/[^.!?]*[.!?]+|\S[^.!?]*$/g)) {
        const raw = m[0];
        if (raw.trim().length === 0) continue;
        units.push({ start: m.index, end: m.index + raw.length });
      }
      return units;
    }
    case "token": {
      return tokenizer
        .tokenize(text)
        .map((t) => ({ start: t.start, end: t.end }));
    }
  }
}

function boundaryRegex(config: SegmentationConfig): RegExp {
  const kind = config.boundary ?? "blank-line";
  switch (kind) {
    case "blank-line":
      return /\n[ \t]*\n+/g; // one-or-more blank lines
    case "newline":
      return /\n/g;
    case "delimiter": {
      const delimiter = config.delimiter ?? "\n\n";
      // Escape regex metacharacters in the literal delimiter.
      const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, "g");
    }
  }
}

function trimToSpan(text: string, start: number, end: number): RawSpan | null {
  // Trim surrounding whitespace but keep offsets pointing at real characters.
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  if (e <= s) return null;
  return { text: text.slice(s, e), start: s, end: e };
}

/**
 * Default `Segmenter` (§0.10.0 B1). For `grouping: "boundary"` it splits the
 * normalized text at the boundary marker; for `grouping: "fixed"` it tiles into
 * `unit` atoms and slides a window of `size` atoms stepping `size - overlap`.
 */
export class DefaultSegmenter implements Segmenter {
  segment(
    text: string,
    config: SegmentationConfig = DEFAULT_SEGMENTATION,
  ): RawSpan[] {
    const normalized = normalizeLineEndings(text);
    if (config.grouping === "boundary") {
      return this.segmentByBoundary(normalized, config);
    }
    return this.segmentFixed(normalized, config);
  }

  private segmentByBoundary(
    text: string,
    config: SegmentationConfig,
  ): RawSpan[] {
    const regex = boundaryRegex(config);
    const spans: RawSpan[] = [];
    let cursor = 0;
    for (const m of text.matchAll(regex)) {
      const span = trimToSpan(text, cursor, m.index);
      if (span) spans.push(span);
      cursor = m.index + m[0].length;
    }
    const tail = trimToSpan(text, cursor, text.length);
    if (tail) spans.push(tail);
    return spans;
  }

  private segmentFixed(text: string, config: SegmentationConfig): RawSpan[] {
    const size = Math.max(1, config.size ?? 1);
    const overlap = Math.max(0, Math.min(config.overlap ?? 0, size - 1));
    const step = size - overlap;
    const tokenizer =
      config.unit === "token" ? getDefaultTokenizer() : NULL_TOKENIZER;
    const units = tileUnits(text, config.unit, tokenizer);
    const spans: RawSpan[] = [];
    for (let i = 0; i < units.length; i += step) {
      const window = units.slice(i, i + size);
      if (window.length === 0) break;
      const start = window[0]!.start;
      const end = window[window.length - 1]!.end;
      const span = trimToSpan(text, start, end);
      if (span) spans.push(span);
      if (i + size >= units.length) break;
    }
    return spans;
  }
}

// `tileUnits` only dereferences the tokenizer for `unit: "token"`; a shared
// no-op keeps the non-token paths from constructing one.
const NULL_TOKENIZER: Tokenizer = {
  id: "none",
  tokenize: () => [],
};

/** Resolve which tokenizer identity (if any) a config pins — feeds substrate_version. */
export function tokenizerIdentityFor(
  config: SegmentationConfig,
): string | null {
  return config.unit === "token" ? getDefaultTokenizer().id : null;
}

export const defaultSegmenter = new DefaultSegmenter();
