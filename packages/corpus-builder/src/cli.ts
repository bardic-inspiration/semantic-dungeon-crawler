// packages/corpus-builder/src/cli.ts
//
// SPEC §6.3 / §6.3.1 — the `corpus-builder` CLI: `build`, `inspect`, `eval`.
//   corpus-builder build   --input DIR --output FILE [--manifest FILE] [--trace] [--verbosity L]
//   corpus-builder inspect --graph FILE (--node ID | --trace) [--verbosity L]
//   corpus-builder eval    --graph FILE [--verbosity L]
//
// Command logic is factored so the pipeline/inspect/eval modules stay pure and
// I/O lives here (injectable `CliIO` — tests drive `runCli` without a subprocess).

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuildTrace } from "./build-trace";
import { evaluateBuild, formatEvalReport, parseRegistryText } from "./eval";
import { inspectNode, inspectTrace, parseVerbosity } from "./inspect";
import { NoopLogger, ConsoleLogger, type Logger } from "./instrumentation";
import { parseManifest } from "./manifest";
import {
  runBuild,
  serializeBuildTrace,
  serializeBundle,
  type BuildOptions,
} from "./pipeline";
import { GutendexSource } from "./sources/gutendex";
import { readDirectoryCorpus } from "./sources/filesystem";
import type { ResolvedDocument } from "./sources/types";
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

export async function runCli(
  argv: string[],
  io: CliIO = DEFAULT_IO,
): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const verbosity = parseVerbosity(
    typeof flags.verbosity === "string" ? flags.verbosity : undefined,
  );
  const logger: Logger =
    flags.verbosity === "verbose"
      ? new ConsoleLogger("debug")
      : new NoopLogger();

  try {
    switch (command) {
      case "build":
        return await cmdBuild(flags, io, logger);
      case "inspect":
        return await cmdInspect(flags, io, verbosity);
      case "eval":
        return await cmdEval(flags, io, verbosity);
      default:
        io.stderr(
          `unknown command "${command ?? ""}". Expected: build | inspect | eval`,
        );
        return 2;
    }
  } catch (err) {
    io.stderr(`error: ${(err as Error).message}`);
    return 1;
  }
}

async function cmdBuild(
  flags: Record<string, string | boolean>,
  io: CliIO,
  logger: Logger,
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
    if (manifest.source !== "gutendex") {
      throw new Error(
        `unsupported manifest source "${manifest.source}" (only "gutendex" this phase)`,
      );
    }
    documents = await new GutendexSource().resolve(manifest.entries);
  } else if (typeof flags.input === "string") {
    documents = await readDirectoryCorpus(flags.input);
  } else {
    throw new Error("build needs either --input DIR or --manifest FILE");
  }

  const options: BuildOptions = { documents, restructure, trace };
  if (segmentation !== undefined) options.segmentation = segmentation;
  const result = await runBuild(options, { logger });

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

  io.stdout(
    `built ${result.bundle.spans.length} span(s) → ${output} ` +
      `(substrate_version ${result.bundle.substrate_version})`,
  );
  return 0;
}

async function cmdInspect(
  flags: Record<string, string | boolean>,
  io: CliIO,
  verbosity: ReturnType<typeof parseVerbosity>,
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
  verbosity: ReturnType<typeof parseVerbosity>,
): Promise<number> {
  const graphPath = requireString(flags, "graph");
  const bundle = await loadBundle(graphPath);

  const registryPath = join(dirname(graphPath), REGISTRY_FILENAME);
  const registry = existsSync(registryPath)
    ? parseRegistryText(await readFile(registryPath, "utf8"))
    : undefined;

  io.stdout(formatEvalReport(evaluateBuild(bundle, registry), verbosity));
  return 0;
}

// Direct execution (e.g. `tsx src/cli.ts build …`). No-op when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
