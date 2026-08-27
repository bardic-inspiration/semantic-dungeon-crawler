// packages/corpus-builder/src/cli.ts
//
// SPEC §6.3 / §6.3.1 — the `corpus-builder` CLI: `build`, `inspect`, `eval`.
//   corpus-builder build   --input DIR --output FILE [--manifest FILE] [--trace] [--verbosity L]
//   corpus-builder inspect --graph FILE (--node ID | --trace) [--verbosity L]
//   corpus-builder eval    --graph FILE [--nn-k K] [--verbosity L]
//
// Command logic is factored so the pipeline/inspect/eval modules stay pure and
// I/O lives here (injectable `CliIO` — tests drive `runCli` without a subprocess).

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuildTrace } from "./build-trace";
import {
  evaluateBuild,
  formatEvalReport,
  parseRegistryText,
  reportEvalMetrics,
} from "./eval";
import {
  inspectNode,
  inspectTrace,
  parseVerbosity,
  VERBOSITY_LEVELS,
  type Verbosity,
} from "./inspect";
import { InMemoryMetrics, type Logger, type LogLevel } from "./instrumentation";
import {
  ConfigError,
  defaultEmbeddingProviderRegistry,
  makeLogger,
  makeMetrics,
  resolveEmbeddingProvider,
  type EnvLookup,
} from "./config";
import type { EmbeddingProvider } from "./embedding";
import { parseManifest } from "./manifest";
import {
  runBuild,
  serializeBuildTrace,
  serializeBundle,
  type BuildOptions,
} from "./pipeline";
import { GutendexSource } from "./sources/gutendex";
import { readDirectoryCorpus } from "./sources/filesystem";
import type { CorpusSource, ResolvedDocument } from "./sources/types";
import type { SegmentationConfig, SubstrateBundle } from "./types";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

const DEFAULT_IO: CliIO = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
};

const REGISTRY_FILENAME = "tag-registry.yaml";
const TRACE_FILENAME = "build-trace.json";

/** Minimal flag parser: `--flag value`, `--flag=value`, and boolean `--flag`. */
function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
      flags[body] = args[++i]!;
    } else {
      flags[body] = true;
    }
  }
  return flags;
}

function requireString(
  flags: Record<string, string | boolean>,
  name: string,
): string {
  const value = flags[name];
  if (typeof value !== "string") throw new Error(`missing required --${name}`);
  return value;
}

async function loadBundle(path: string): Promise<SubstrateBundle> {
  return JSON.parse(await readFile(path, "utf8")) as SubstrateBundle;
}

/** Injectable seams so tests can observe the wired logger and env without a subprocess. */
export interface CliDeps {
  /**
   * Override the run's `Logger` construction from the resolved level. Default: the
   * §2.1 convention (`makeLogger`, reading `SDC_LOG_SINK`); a test injects this to
   * capture output without the env var.
   */
  makeLogger?(level: LogLevel): Logger;
  /**
   * Environment lookup for the §2.1 config convention (`SDC_LOG_LEVEL`,
   * `SDC_LOG_SINK`, `SDC_METRICS_BACKEND`, `SDC_EMBEDDING_PROVIDER`). Default:
   * `process.env`.
   */
  env?: EnvLookup;
  /**
   * §2.1 embedding-provider registry, keyed by `SDC_EMBEDDING_PROVIDER`. Default:
   * `{ hashing: defaultEmbeddingProvider }`. Registering another provider makes it
   * reachable from `build` via the env var without editing the call site.
   */
  embeddingProviders?: Record<string, EmbeddingProvider>;
  /**
   * §6.3.1 `CorpusSource` registry, keyed by a manifest's `source`. Retrieval is
   * the pipeline's first, pluggable stage (`docs/design/0004`), and it happens
   * here — before `runBuild` receives resolved documents — so this is where the
   * seam lives. Default: `{ gutendex: GutendexSource }` (this phase ships
   * Gutendex only). Registering another source makes it reachable from `build`
   * without editing the CLI; an unknown `source` is reported, not hardcoded-away.
   */
  sources?: Record<string, CorpusSource>;
}

/**
 * §5.4 verbosity resolution: an explicit `--verbosity` flag wins, then the
 * `SDC_LOG_LEVEL` env var, then the `warn` default. An unrecognized value is
 * surfaced (returned as `{ error }`) rather than silently downgraded.
 */
function resolveVerbosity(
  flags: Record<string, string | boolean>,
  env: string | undefined,
): { level: LogLevel } | { error: string } {
  const flagValue =
    typeof flags.verbosity === "string" ? flags.verbosity : undefined;
  const envValue = env !== undefined && env.length > 0 ? env : undefined;
  const raw = flagValue ?? envValue;
  const level = parseVerbosity(raw);
  if (level === null) {
    const source = flagValue !== undefined ? "--verbosity" : "SDC_LOG_LEVEL";
    return {
      error: `unrecognized ${source} "${raw}" (expected: ${VERBOSITY_LEVELS.join(" | ")})`,
    };
  }
  return { level };
}

export async function runCli(
  argv: string[],
  io: CliIO = DEFAULT_IO,
  deps: CliDeps = {},
): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  const env = deps.env ?? process.env;
  const resolved = resolveVerbosity(flags, env.SDC_LOG_LEVEL);
  if ("error" in resolved) {
    io.stderr(`error: ${resolved.error}`);
    return 2;
  }
  const level = resolved.level;

  const sources = deps.sources ?? { gutendex: new GutendexSource() };
  const providers =
    deps.embeddingProviders ?? defaultEmbeddingProviderRegistry();

  try {
    // §5.4: `--verbosity` IS the `Logger`'s `minLevel`. §2.1: `SDC_LOG_SINK` picks
    // the sink (console vs noop) — an orthogonal knob resolved by `makeLogger`. The
    // CLI does not reimplement filtering; it hands the level to one logger and lets
    // it gate. `deps.makeLogger` overrides both for tests.
    const logger: Logger = deps.makeLogger
      ? deps.makeLogger(level)
      : makeLogger(env, level);

    switch (command) {
      case "build":
        return await cmdBuild(flags, io, logger, sources, env, providers);
      case "inspect":
        return await cmdInspect(flags, io, level);
      case "eval":
        return await cmdEval(flags, io, level, logger);
      default:
        io.stderr(
          `unknown command "${command ?? ""}". Expected: build | inspect | eval`,
        );
        return 2;
    }
  } catch (err) {
    // §2.1 "Config & errors": a bad config selection is a usage error (exit 2),
    // surfaced with the accepted values — distinct from a runtime build failure (1).
    if (err instanceof ConfigError) {
      io.stderr(`error: ${err.message}`);
      return 2;
    }
    io.stderr(`error: ${(err as Error).message}`);
    return 1;
  }
}

async function cmdBuild(
  flags: Record<string, string | boolean>,
  io: CliIO,
  logger: Logger,
  sources: Record<string, CorpusSource>,
  env: EnvLookup,
  providers: Record<string, EmbeddingProvider>,
): Promise<number> {
  const output = requireString(flags, "output");
  const trace = flags.trace === true;

  let documents: ResolvedDocument[];
  let segmentation: SegmentationConfig | undefined;
  let restructure: string | null = null;

  if (typeof flags.manifest === "string") {
    const manifest = parseManifest(await readFile(flags.manifest, "utf8"));
    restructure = manifest.restructure;
    segmentation = manifest.segmentation;
    // §6.3.1 — resolve the manifest's `source` against the CorpusSource registry.
    // The seam is reachable: a registered non-Gutendex source builds here without
    // a CLI edit; an unregistered one is reported (with what IS registered), not
    // silently special-cased.
    const source = sources[manifest.source];
    if (source === undefined) {
      throw new Error(
        `unknown manifest source "${manifest.source}" (registered: ${Object.keys(sources).join(", ") || "none"})`,
      );
    }
    documents = await source.resolve(manifest.entries);
  } else if (typeof flags.input === "string") {
    documents = await readDirectoryCorpus(flags.input);
  } else {
    throw new Error("build needs either --input DIR or --manifest FILE");
  }

  const options: BuildOptions = { documents, restructure, trace };
  if (segmentation !== undefined) options.segmentation = segmentation;
  // §2.1 — the embedding provider is selected by the config convention
  // (`SDC_EMBEDDING_PROVIDER`), not hardcoded here; default is the deterministic
  // hashing provider. An unknown id throws `ConfigError` (surfaced as exit 2).
  const embeddingProvider = resolveEmbeddingProvider(env, providers);
  // §2.1 — a real `Metrics` sink, backend selected by `SDC_METRICS_BACKEND`
  // (default in-memory), read back below. `runBuild` used to fall back to an
  // internal one that was discarded on return, so every build-time metric the
  // section names was recorded into an object nothing could reach.
  const metrics = makeMetrics(env);
  const result = await runBuild(options, {
    logger,
    metrics,
    embeddingProvider,
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializeBundle(result.bundle), "utf8");
  await writeFile(
    join(dirname(output), REGISTRY_FILENAME),
    result.registryYaml,
    "utf8",
  );
  if (result.buildTrace) {
    await writeFile(
      join(dirname(output), TRACE_FILENAME),
      serializeBuildTrace(result.buildTrace),
      "utf8",
    );
  }

  // §2.1 — report the recorded metrics through the same `Logger`, so a build is
  // as inspectable as a runtime request. Durations stay OUT of stdout and out of
  // every artifact: they vary run to run and §6.3 Exit requires byte-identical
  // output. Only the in-memory backend records readable counters/observations; a
  // `noop` backend (operator opt-out) reports nulls rather than crashing.
  const recorded = metrics instanceof InMemoryMetrics ? metrics : undefined;
  const durations = recorded?.observations.get("build.duration_ms");
  logger.log("info", "build.metrics", {
    documents: documents.length,
    spans: result.bundle.spans.length,
    embedding_calls: recorded?.counters.get("embedding.call_count") ?? null,
    build_duration_ms: durations?.[durations.length - 1] ?? null,
  });

  io.stdout(
    `built ${result.bundle.spans.length} span(s) → ${output} ` +
      `(substrate_version ${result.bundle.substrate_version})`,
  );
  return 0;
}

async function cmdInspect(
  flags: Record<string, string | boolean>,
  io: CliIO,
  verbosity: Verbosity,
): Promise<number> {
  const graphPath = requireString(flags, "graph");
  const bundle = await loadBundle(graphPath);

  if (flags.trace === true) {
    const tracePath = join(dirname(graphPath), TRACE_FILENAME);
    if (!existsSync(tracePath)) {
      throw new Error(
        `no ${TRACE_FILENAME} beside ${graphPath} (was the build run with --trace?)`,
      );
    }
    const trace = JSON.parse(await readFile(tracePath, "utf8")) as BuildTrace;
    io.stdout(inspectTrace(trace, verbosity));
    return 0;
  }

  if (typeof flags.node === "string") {
    io.stdout(inspectNode(bundle, flags.node, verbosity));
    return 0;
  }

  throw new Error("inspect needs --node ID or --trace");
}

async function cmdEval(
  flags: Record<string, string | boolean>,
  io: CliIO,
  verbosity: Verbosity,
  logger: Logger,
): Promise<number> {
  const graphPath = requireString(flags, "graph");
  const bundle = await loadBundle(graphPath);

  const registryPath = join(dirname(graphPath), REGISTRY_FILENAME);
  const registry = existsSync(registryPath)
    ? parseRegistryText(await readFile(registryPath, "utf8"))
    : undefined;

  // §0.11.0 C4 — optional k for the k-NN nearest-neighbour spread (#107);
  // `evaluateBuild` applies DEFAULT_NN_K when omitted.
  const nnK =
    typeof flags["nn-k"] === "string" ? Number(flags["nn-k"]) : undefined;
  if (nnK !== undefined && !Number.isFinite(nnK)) {
    throw new Error("--nn-k must be a number");
  }

  const report = evaluateBuild(bundle, registry, nnK);
  // §0.11.0 C4 — `eval` reuses the same `Logger`/`Metrics` as the build. The
  // report flows through the side channel (never gating, INV-4) as well as stdout.
  reportEvalMetrics(report, logger, new InMemoryMetrics());
  io.stdout(formatEvalReport(report, verbosity));
  return 0;
}

// Direct execution (e.g. `tsx src/cli.ts build …`). No-op when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
