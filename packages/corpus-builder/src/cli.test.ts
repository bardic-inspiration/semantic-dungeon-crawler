import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli, type CliDeps, type CliIO } from "./cli";
import { ConsoleLogger, type LogLevel } from "./instrumentation";
import { HashingEmbeddingProvider } from "./embedding";
import type { CorpusSource, ResolvedDocument } from "./sources/types";

/**
 * Capture what the wired `Logger` actually prints at the resolved level — the
 * real `ConsoleLogger` gating, just aimed at a buffer instead of `stderr`. Also
 * records the level the CLI resolved, so a test can assert the flag/env/default
 * precedence §5.4 requires.
 */
function capturingDeps(env?: Record<string, string | undefined>): CliDeps & {
  logs: string[];
  levels: LogLevel[];
} {
  const logs: string[] = [];
  const levels: LogLevel[] = [];
  const deps: CliDeps = {
    makeLogger: (level) => {
      levels.push(level);
      return new ConsoleLogger(level, (line) => logs.push(line));
    },
  };
  if (env) deps.env = env;
  return { ...deps, logs, levels };
}

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

// ── §2.1 — the embedding provider is selected by the config convention ────────
//
// `SDC_EMBEDDING_PROVIDER` picks the build's provider from the registry with NO
// code change at the call site: the same `build` argv, a different env var, yields
// a graph built by a different provider (a different `substrate_version`).

describe("corpus-builder build — SDC_EMBEDDING_PROVIDER (§2.1)", () => {
  async function buildWith(
    env: Record<string, string | undefined>,
  ): Promise<{ code: number; substrateVersion?: string; err: string[] }> {
    const graph = await tempGraphPath();
    const io = collectingIO();
    // Two well-formed providers under distinct ids; their ids feed
    // `substrate_version`, so selecting one vs the other is observable in the build.
    const deps: CliDeps = {
      env,
      embeddingProviders: {
        hashing: new HashingEmbeddingProvider(256),
        wide: new HashingEmbeddingProvider(128),
      },
    };
    const code = await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph],
      io,
      deps,
    );
    if (code !== 0) return { code, err: io.err };
    const bundle = JSON.parse(await readFile(graph, "utf8"));
    return {
      code,
      substrateVersion: bundle.header.substrate_version,
      err: io.err,
    };
  }

  it("the env var alone changes which provider builds the graph", async () => {
    const defaulted = await buildWith({});
    const wide = await buildWith({ SDC_EMBEDDING_PROVIDER: "wide" });
    const hashing = await buildWith({ SDC_EMBEDDING_PROVIDER: "hashing" });

    expect(defaulted.code).toBe(0);
    expect(wide.code).toBe(0);
    expect(hashing.code).toBe(0);
    // Unset defaults to `hashing`; the explicit `wide` selection differs from it.
    expect(hashing.substrateVersion).toBe(defaulted.substrateVersion);
    expect(wide.substrateVersion).not.toBe(defaulted.substrateVersion);
  });

  it("an unknown provider id is surfaced as a usage error (exit 2)", async () => {
    const { code, err } = await buildWith({ SDC_EMBEDDING_PROVIDER: "gpt" });
    expect(code).toBe(2);
    expect(err.join("\n")).toMatch(/SDC_EMBEDDING_PROVIDER.*registered:/s);
  });
});

// ── §6.3.1 (C9) — the CorpusSource seam is reachable from the CLI ─────────────
//
// Before this, `build --manifest` threw for any `source` other than "gutendex",
// so the §6.3.1 seam could not be exercised. The seam is now a registry: a
// registered source resolves; an unregistered one is reported, not special-cased.

describe("corpus-builder build — CorpusSource registry (§6.3.1)", () => {
  async function writeManifest(source: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "corpus-builder-manifest-"));
    tempDirs.push(dir);
    const path = join(dir, "corpus-manifest.json");
    await writeFile(
      path,
      JSON.stringify({ source, entries: [{ id: 1 }] }),
      "utf8",
    );
    return path;
  }

  const fakeSource: CorpusSource = {
    resolve: (): Promise<ResolvedDocument[]> =>
      Promise.resolve([
        {
          source_id: "custom:1",
          title: "Custom",
          raw_text:
            "A river ran east through the forest.\n\n" +
            "Gold set the market price of grain and cloth.",
          metadata: {},
        },
      ]),
  };

  it("resolves a manifest through an injected (non-Gutendex) source", async () => {
    const manifest = await writeManifest("custom");
    const graph = await tempGraphPath();
    const code = await runCli(
      ["build", "--manifest", manifest, "--output", graph],
      collectingIO(),
      { sources: { custom: fakeSource } },
    );
    expect(code).toBe(0);
    const bundle = JSON.parse(await readFile(graph, "utf8"));
    expect(bundle.spans.length).toBeGreaterThan(0);
    expect(bundle.spans[0].source_refs).toContain("custom:1");
  });

  it("reports an unregistered source instead of hardcoding it away", async () => {
    const manifest = await writeManifest("nope");
    const io = collectingIO();
    const code = await runCli(
      ["build", "--manifest", manifest, "--output", await tempGraphPath()],
      io,
      { sources: { custom: fakeSource } },
    );
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain('unknown manifest source "nope"');
    expect(io.err.join("\n")).toContain("custom");
  });
});

describe("corpus-builder --verbosity (§5.4 / §6.3.1)", () => {
  async function buildAt(
    args: string[],
    env?: Record<string, string | undefined>,
  ): Promise<{ logs: string[]; levels: LogLevel[]; code: number }> {
    const graph = await tempGraphPath();
    const deps = capturingDeps(env);
    const code = await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph, ...args],
      collectingIO(),
      deps,
    );
    return { logs: deps.logs, levels: deps.levels, code };
  }

  it("defaults to warn, suppressing the info-level per-stage events (§5.4)", async () => {
    const { levels, logs, code } = await buildAt([]);
    expect(code).toBe(0);
    expect(levels).toEqual(["warn"]);
    expect(logs.some((l) => l.includes("stage.segmentation.start"))).toBe(
      false,
    );
  });

  it("--verbosity=info emits the §6.3 per-stage Logger events", async () => {
    const { levels, logs } = await buildAt(["--verbosity=info"]);
    expect(levels).toEqual(["info"]);
    expect(logs.some((l) => l.includes("stage.segmentation.start"))).toBe(true);
    expect(logs.some((l) => l.includes("stage.embedding.end"))).toBe(true);
  });

  it("--verbosity=debug produces the MOST output, not the least", async () => {
    const info = await buildAt(["--verbosity=info"]);
    const debug = await buildAt(["--verbosity=debug"]);
    const error = await buildAt(["--verbosity=error"]);
    expect(debug.levels).toEqual(["debug"]);
    expect(debug.logs.length).toBeGreaterThanOrEqual(info.logs.length);
    expect(debug.logs.length).toBeGreaterThan(error.logs.length);
  });

  it("honours SDC_LOG_LEVEL as the env fallback (§5.4)", async () => {
    const { levels, logs } = await buildAt([], { SDC_LOG_LEVEL: "info" });
    expect(levels).toEqual(["info"]);
    expect(logs.some((l) => l.includes("stage.segmentation.start"))).toBe(true);
  });

  it("an explicit --verbosity flag overrides SDC_LOG_LEVEL", async () => {
    const { levels } = await buildAt(["--verbosity=error"], {
      SDC_LOG_LEVEL: "debug",
    });
    expect(levels).toEqual(["error"]);
  });

  it("surfaces an unrecognized value instead of silently downgrading", async () => {
    const io = collectingIO();
    const code = await runCli(
      [
        "build",
        "--input",
        CORPUS_DIR,
        "--output",
        "/dev/null",
        "--verbosity=verbose",
      ],
      io,
      capturingDeps(),
    );
    expect(code).toBe(2);
    expect(io.err.join("\n")).toMatch(/unrecognized --verbosity "verbose"/);
    expect(io.err.join("\n")).toContain("error | warn | info | debug");
  });

  it("eval reuses the Logger — emitting eval.report at info", async () => {
    const graph = await tempGraphPath();
    await runCli(
      ["build", "--input", CORPUS_DIR, "--output", graph],
      collectingIO(),
    );
    const deps = capturingDeps();
    const code = await runCli(
      ["eval", "--graph", graph, "--verbosity=info"],
      collectingIO(),
      deps,
    );
    expect(code).toBe(0);
    expect(deps.logs.some((l) => l.includes("eval.report"))).toBe(true);
  });
});
