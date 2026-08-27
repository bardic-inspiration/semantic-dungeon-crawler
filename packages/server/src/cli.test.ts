// SPEC §0.9.0 (A12) / §2.1 / §6.7 — the server startup surface (`main`). Covers
// the taxonomy member that fires at LOAD time: a malformed `--ruleset` file is a
// `MalformedRulesetError` (the wrong SHAPE, INV-4 — never an incoherence
// judgement) and fails loud (stderr + non-zero exit), the same fail-loud line the
// graph loader draws, rather than surfacing as a confusing 500 on the first
// session. A well-formed-but-incoherent ruleset loads fine (INV-4).

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main, type CliIo } from "./cli";

// A minimal valid substrate bundle so `main` reaches the ruleset load (the graph
// must load first). Matches the `graph-loader` contract: a `substrate_version`
// plus one non-empty span with an embedding and a `source_span`.
const GRAPH = JSON.stringify({
  substrate_version: "test-1",
  spans: [
    {
      id: "vec:origin",
      embedding: [1, 0],
      archetype: "container",
      semantic_tags: [],
      source_span: { source: "test", char_ranges: "0-1" },
    },
  ],
});

let dir: string | undefined;
let closer: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (closer) {
    await closer();
    closer = undefined;
  }
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function tmpFiles(files: Record<string, string>): Record<string, string> {
  dir = mkdtempSync(join(tmpdir(), "sdc-cli-"));
  const paths: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    writeFileSync(p, content);
    paths[name] = p;
  }
  return paths;
}

function collectingIo(): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
}

describe("sdc-server startup ruleset load (§2.1 / §6.7 taxonomy)", () => {
  it("a malformed --ruleset fails loud (exit 1) with the malformed_ruleset message", async () => {
    const paths = tmpFiles({
      "graph.json": GRAPH,
      // Valid JSON, but the WRONG shape — no `layers` array.
      "ruleset.json": JSON.stringify({ spec_version: "0.1.0" }),
    });
    const io = collectingIo();
    const result = await main(
      ["--graph", paths["graph.json"]!, "--ruleset", paths["ruleset.json"]!],
      io,
    );
    expect(result.code).toBe(1);
    expect(result.close).toBeUndefined(); // never started listening
    expect(io.err.join("\n")).toMatch(/well-formed ruleset/);
  });

  it("a well-formed-but-incoherent --ruleset loads and the server starts (INV-4)", async () => {
    const paths = tmpFiles({
      "graph.json": GRAPH,
      "ruleset.json": JSON.stringify({
        spec_version: "0.1.0",
        layers: [
          {
            id: "wall",
            scope: "global",
            mode: { priority: 1 },
            rules: [
              {
                predicate: "static.embedding_distance >= 0",
                effect: { kind: "hard_forbid" },
              },
            ],
          },
        ],
      }),
    });
    const io = collectingIo();
    const result = await main(
      ["--graph", paths["graph.json"]!, "--ruleset", paths["ruleset.json"]!],
      io,
    );
    expect(result.code).toBe(0);
    closer = result.close;
    expect(result.close).toBeDefined();
  });
});
