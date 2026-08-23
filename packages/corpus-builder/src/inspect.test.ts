import { describe, expect, it } from "vitest";
import {
  inspectNode,
  inspectTrace,
  parseVerbosity,
  VERBOSITY_LEVELS,
  type Verbosity,
} from "./inspect";
import { runBuild } from "./pipeline";
import type { ResolvedDocument } from "./sources/types";

const CORPUS: ResolvedDocument[] = [
  {
    source_id: "file:a.txt",
    title: "a",
    raw_text: "The forest was full of trees.\n\nA river ran past the garden.",
    metadata: {},
  },
];

describe("inspect", () => {
  it("prints a span's fields and its source_refs chain (--node)", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    const id = bundle.spans[0]!.id;
    const out = inspectNode(bundle, id, "info");
    expect(out).toContain(`id:              ${id}`);
    expect(out).toContain("source_refs:     file:a.txt");
    expect(out).toContain("prose:");
  });

  it("scales detail with the §5.4 level: prose at info, embedding at debug", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    const id = bundle.spans[0]!.id;
    // error / warn (default): base fields only.
    expect(inspectNode(bundle, id, "error")).not.toContain("prose:");
    expect(inspectNode(bundle, id, "warn")).not.toContain("embedding[0..8]");
    // info: adds prose (full entity fields), but not the raw embedding.
    expect(inspectNode(bundle, id, "info")).toContain("prose:");
    expect(inspectNode(bundle, id, "info")).not.toContain("embedding[0..8]");
    // debug: the most — adds the raw embedding vector.
    expect(inspectNode(bundle, id, "debug")).toContain("embedding[0..8]");
  });

  it("inspect --trace output grows monotonically error → warn → info → debug", async () => {
    const { buildTrace } = await runBuild({ documents: CORPUS, trace: true });
    const sizes = VERBOSITY_LEVELS.map(
      (level) =>
        inspectTrace(buildTrace!, level as Verbosity).split("\n").length,
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
    }
    // debug must produce the MOST output, never the least (the bug this fixes).
    expect(sizes[sizes.length - 1]!).toBeGreaterThan(sizes[0]!);
  });

  it("throws a clear error for an unknown node id", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    expect(() => inspectNode(bundle, "nope", "warn")).toThrow(
      /no span with id/,
    );
  });

  it("prints the BuildTrace stages (--trace)", async () => {
    const { buildTrace } = await runBuild({ documents: CORPUS, trace: true });
    const out = inspectTrace(buildTrace!, "warn");
    expect(out).toContain("embedding");
    expect(out).toContain("span_provenance");
  });

  it("parseVerbosity maps the §5.4 vocabulary, defaults to warn, rejects the rest", () => {
    // §5.4 default.
    expect(parseVerbosity(undefined)).toBe("warn");
    // Every §5.4 level is accepted verbatim.
    for (const level of VERBOSITY_LEVELS) {
      expect(parseVerbosity(level)).toBe(level);
    }
    // The old vocabulary is gone; unrecognized values surface as null (not
    // silently downgraded), so the CLI can reject them.
    expect(parseVerbosity("verbose")).toBeNull();
    expect(parseVerbosity("normal")).toBeNull();
    expect(parseVerbosity("bogus")).toBeNull();
  });
});
