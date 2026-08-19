import { describe, expect, it } from "vitest";
import { DefaultSegmenter, normalizeLineEndings } from "./segmentation";
import { DEFAULT_SEGMENTATION, type SegmentationConfig } from "./types";

const seg = new DefaultSegmenter();

describe("normalizeLineEndings", () => {
  it("converts CRLF and lone CR to LF", () => {
    expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});

describe("DefaultSegmenter — default (paragraphs, blank-line boundary, overlap 0)", () => {
  it("splits on blank lines into paragraph spans", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\n\nThird.";
    const spans = seg.segment(text);
    expect(spans.map((s) => s.text)).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third.",
    ]);
  });

  it("reports char offsets that slice back to the (trimmed) span text", () => {
    const text = "alpha\n\nbeta gamma";
    const normalized = normalizeLineEndings(text);
    for (const span of seg.segment(text)) {
      expect(normalized.slice(span.start, span.end)).toBe(span.text);
    }
  });

  it("normalizes CRLF before segmenting", () => {
    const text = "one\r\n\r\ntwo";
    expect(seg.segment(text).map((s) => s.text)).toEqual(["one", "two"]);
  });

  it("treats a blank-line-free blob as a single span (INV-4: structureless is legal)", () => {
    const text = "no paragraph breaks here just one long line of prose";
    const spans = seg.segment(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe(text);
  });

  it("does not throw on empty or whitespace-only input", () => {
    expect(seg.segment("")).toEqual([]);
    expect(seg.segment("   \n\n   \n")).toEqual([]);
  });

  it("uses the exported default config", () => {
    expect(DEFAULT_SEGMENTATION).toEqual({
      unit: "char",
      grouping: "boundary",
      overlap: 0,
      boundary: "blank-line",
    });
  });
});

describe("DefaultSegmenter — boundary variants", () => {
  it("splits on every newline for boundary: newline", () => {
    const config: SegmentationConfig = {
      unit: "char",
      grouping: "boundary",
      boundary: "newline",
    };
    expect(seg.segment("a\nb\nc", config).map((s) => s.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("splits on a literal delimiter for boundary: delimiter", () => {
    const config: SegmentationConfig = {
      unit: "char",
      grouping: "boundary",
      boundary: "delimiter",
      delimiter: "%%",
    };
    expect(seg.segment("a%%b%%c", config).map((s) => s.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("DefaultSegmenter — fixed grouping with overlap (word units)", () => {
  it("windows N units stepping (N - overlap)", () => {
    const config: SegmentationConfig = {
      unit: "word",
      grouping: "fixed",
      size: 3,
      overlap: 1,
    };
    const spans = seg.segment("one two three four five", config);
    // windows: [one two three], [three four five] — the second window already
    // reaches the end, so no orphan single-unit tail window is emitted.
    expect(spans.map((s) => s.text)).toEqual([
      "one two three",
      "three four five",
    ]);
  });

  it("tiles by sentence when unit is sentence", () => {
    const config: SegmentationConfig = {
      unit: "sentence",
      grouping: "fixed",
      size: 1,
      overlap: 0,
    };
    const spans = seg.segment("Hello there. How are you? Fine!", config);
    expect(spans.map((s) => s.text)).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
    ]);
  });

  it("tiles by token (pinned tokenizer) when unit is token", () => {
    const config: SegmentationConfig = {
      unit: "token",
      grouping: "fixed",
      size: 2,
      overlap: 0,
    };
    const spans = seg.segment("alpha beta gamma", config);
    expect(spans.length).toBeGreaterThan(0);
    // offsets remain valid slices
    const normalized = "alpha beta gamma";
    for (const s of spans)
      expect(normalized.slice(s.start, s.end)).toBe(s.text);
  });
});
