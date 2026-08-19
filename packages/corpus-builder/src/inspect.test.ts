import { describe, expect, it } from "vitest";
import { inspectNode, inspectTrace, parseVerbosity } from "./inspect";
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
    const out = inspectNode(bundle, id, "normal");
    expect(out).toContain(`id:              ${id}`);
    expect(out).toContain("source_refs:     file:a.txt");
    expect(out).toContain("prose:");
  });

  it("shows the embedding preview only at verbose", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    const id = bundle.spans[0]!.id;
    expect(inspectNode(bundle, id, "quiet")).not.toContain("embedding[0..8]");
    expect(inspectNode(bundle, id, "verbose")).toContain("embedding[0..8]");
  });

  it("throws a clear error for an unknown node id", async () => {
    const { bundle } = await runBuild({ documents: CORPUS });
    expect(() => inspectNode(bundle, "nope", "normal")).toThrow(
      /no span with id/,
    );
  });

  it("prints the BuildTrace stages (--trace)", async () => {
    const { buildTrace } = await runBuild({ documents: CORPUS, trace: true });
    const out = inspectTrace(buildTrace!, "normal");
    expect(out).toContain("embedding");
    expect(out).toContain("span_provenance");
  });

  it("parseVerbosity defaults unknown values to normal", () => {
    expect(parseVerbosity(undefined)).toBe("normal");
    expect(parseVerbosity("verbose")).toBe("verbose");
    expect(parseVerbosity("bogus")).toBe("normal");
  });
});
