import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli, type CliIO } from "./cli";

const CORPUS_DIR = fileURLToPath(
  new URL("../test-assets/corpus", import.meta.url),
);

function collectingIO(): CliIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
}

const tempDirs: string[] = [];
async function tempGraphPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "corpus-builder-"));
  tempDirs.push(dir);
  return join(dir, "graph.json");
}

afterEach(() => {
  tempDirs.length = 0; // OS reclaims tmp; nothing persistent to clean
});

describe("corpus-builder CLI (§6.3 Exit)", () => {
  it("build --input DIR produces a valid graph.json + tag-registry.yaml", async () => {
    const graph = await tempGraphPath();
    const io = collectingIO();
    const code = await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph],
      io,
    );
    expect(code).toBe(0);
    expect(existsSync(graph)).toBe(true);
    expect(existsSync(join(graph, "..", "tag-registry.yaml"))).toBe(true);

    const bundle = JSON.parse(await readFile(graph, "utf8"));
    expect(bundle.header.substrate_version).toMatch(/^sv_[0-9a-f]{32}$/);
    expect(bundle.spans.length).toBeGreaterThan(10);
    for (const span of bundle.spans) {
      expect(span.source_refs.length).toBeGreaterThan(0);
    }
  });

  it("re-running the build produces a byte-identical graph.json (INV-2)", async () => {
    const graph1 = await tempGraphPath();
    const graph2 = await tempGraphPath();
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph1],
      collectingIO(),
    );
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph2],
      collectingIO(),
    );
    expect(await readFile(graph1, "utf8")).toBe(await readFile(graph2, "utf8"));
  });

  it("build --trace writes a byte-identical build-trace.json", async () => {
    const graph1 = await tempGraphPath();
    const graph2 = await tempGraphPath();
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph1, "--trace"],
      collectingIO(),
    );
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph2, "--trace"],
      collectingIO(),
    );
    const t1 = join(graph1, "..", "build-trace.json");
    const t2 = join(graph2, "..", "build-trace.json");
    expect(existsSync(t1)).toBe(true);
    expect(await readFile(t1, "utf8")).toBe(await readFile(t2, "utf8"));
  });

  it("inspect --node and inspect --trace run against the fixture without error", async () => {
    const graph = await tempGraphPath();
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph, "--trace"],
      collectingIO(),
    );
    const bundle = JSON.parse(await readFile(graph, "utf8"));
    const nodeId: string = bundle.spans[0].id;

    const nodeIO = collectingIO();
    expect(
      await runCli(["inspect", "--graph", graph, "--node", nodeId], nodeIO),
    ).toBe(0);
    expect(nodeIO.out.join("\n")).toContain("source_refs:");

    const traceIO = collectingIO();
    expect(
      await runCli(["inspect", "--graph", graph, "--trace"], traceIO),
    ).toBe(0);
    expect(traceIO.out.join("\n")).toContain("span_provenance");
  });

  it("eval runs against the fixture and reports without gating", async () => {
    const graph = await tempGraphPath();
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph],
      collectingIO(),
    );
    const io = collectingIO();
    expect(await runCli(["eval", "--graph", graph], io)).toBe(0);
    const report = io.out.join("\n");
    expect(report).toContain("nearest-neighbor spread");
    expect(report).toContain("tag coverage");
  });

  it("unknown command returns a non-zero exit code", async () => {
    const io = collectingIO();
    expect(await runCli(["frobnicate"], io)).toBe(2);
  });
});
