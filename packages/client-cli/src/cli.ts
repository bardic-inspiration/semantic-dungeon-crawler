// packages/client-cli/src/cli.ts
//
// SPEC §5.4 — the terminal reference client's startup surface. It runs in one of
// two modes:
//
//   sdc-cli --render <room.json...>              conformance render (§5.3), no server
//   sdc-cli --server <url> [--script <path>]     drive a live session (§5.4)
//                          [--seed N] [--verbosity L]
//
// With `--script` the REPL replays a scripted input-log headlessly (byte-for-byte
// diffable, INV-2); without it, it reads stdin interactively. `--verbosity`
// (or `SDC_LOG_LEVEL`) reuses the §2.1 `Logger` levels. Rendered room output goes
// to `stdout`; operational logging goes to `stderr` (kept separate so the replay
// diff sees only content). The §2.1 config convention (`docs/config-conventions.md`)
// selects the `Logger` sink (`SDC_LOG_SINK`) and `Metrics` backend
// (`SDC_METRICS_BACKEND`); everything else is flags.

import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { httpApiClient } from "./api-client";
import { renderRoomFixtureFile } from "./fixtures";
import type { Logger, ReadableMetrics } from "./instrumentation";
import { ConfigError, makeLogger, makeMetrics } from "./config";
import { linesFromText, runRepl } from "./repl";
import { resolveVerbosity, type Verbosity } from "./verbosity";

export interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
  /** stdin as an async line source; only read in interactive REPL mode. */
  stdinLines?(): AsyncIterable<string>;
}

const USAGE = `sdc-cli — terminal reference client (SPEC §5.4)

  sdc-cli --render <room.json...>                render fixture rooms (§5.3), no server
  sdc-cli --server <url> [options]               drive a live session over §5.1

  --server <url>       base URL of a running server, e.g. http://127.0.0.1:8080
  --script <path>      scripted input-log file (one "<object_id> <affordance>" per
                       line) for headless replay; omit to read stdin interactively
  --render <path...>   render one or more ResolvedRoomResponse fixtures and exit
  --seed <n>           seed for GET /session/new (pins the session for replay)
  --verbosity <level>  error | warn | info | debug  (default warn; or SDC_LOG_LEVEL)
  --help               show this help`;

/** Flags + positional trailer, parsed from argv. `--render`/`--server` may repeat. */
function parseFlags(argv: readonly string[]): {
  flags: Record<string, string | boolean>;
  render: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const render: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    // `--render` collects every following non-flag token as a path, so multiple
    // fixtures can be rendered in one invocation (the §5.3 sweep).
    if (name === "render") {
      let j = i + 1;
      while (j < argv.length && !argv[j]!.startsWith("--"))
        render.push(argv[j++]!);
      i = j - 1;
      flags.render = true;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }
  return { flags, render };
}

function stdinLineSource(): AsyncIterable<string> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  return rl;
}

/**
 * Run the terminal client from argv. Returns a process exit code. Never throws for
 * an expected error (bad flags, missing server) — it prints to `stderr` and returns
 * a non-zero code, so a caller (or CI) can branch on the result.
 */
export async function main(
  argv: readonly string[],
  io: CliIo,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const { flags, render } = parseFlags(argv);

  if (flags.help === true) {
    io.stderr(USAGE);
    return 0;
  }

  let level: Verbosity;
  try {
    level = resolveVerbosity(
      typeof flags.verbosity === "string" ? flags.verbosity : undefined,
      env.SDC_LOG_LEVEL,
    );
  } catch (e) {
    io.stderr((e as Error).message);
    return 2;
  }

  // §5.3 conformance render mode — no server; print each fixture room.
  if (flags.render === true) {
    if (render.length === 0) {
      io.stderr("--render needs at least one fixture path");
      return 2;
    }
    for (const path of render) {
      try {
        for (const line of await renderRoomFixtureFile(path, level)) {
          io.stdout(line);
        }
      } catch (e) {
        io.stderr((e as Error).message);
        return 1;
      }
    }
    return 0;
  }

  // §5.4 live REPL mode.
  if (typeof flags.server !== "string") {
    io.stderr(USAGE);
    return 2;
  }

  let seed: number | undefined;
  if (typeof flags.seed === "string") {
    const parsed = Number(flags.seed);
    if (!Number.isInteger(parsed)) {
      io.stderr("--seed must be an integer");
      return 2;
    }
    seed = parsed;
  }

  // §2.1 — the `Logger` sink and `Metrics` backend come from the config convention
  // (`SDC_LOG_SINK` / `SDC_METRICS_BACKEND`); `--verbosity` still chooses the level.
  // Operational logging stays on `stderr`, separate from rendered output on stdout.
  let log: Logger;
  let metrics: ReadableMetrics;
  try {
    log = makeLogger(env, level, io.stderr);
    metrics = makeMetrics(env);
  } catch (e) {
    if (e instanceof ConfigError) {
      io.stderr(e.message);
      return 2;
    }
    throw e;
  }
  const client = httpApiClient(flags.server, { metrics });

  // Scripted replay reads a file; interactive mode reads stdin lines.
  let input: AsyncIterable<string>;
  if (typeof flags.script === "string") {
    let text: string;
    try {
      text = await readFile(flags.script, "utf8");
    } catch (e) {
      io.stderr(
        `script at "${flags.script}" could not be read: ${(e as Error).message}`,
      );
      return 1;
    }
    input = linesFromText(text);
  } else {
    input = io.stdinLines?.() ?? stdinLineSource();
  }

  try {
    await runRepl({
      client,
      input,
      out: io.stdout,
      metrics,
      level,
      log,
      ...(seed !== undefined ? { seed } : {}),
    });
  } catch (e) {
    // A network failure or a §5.1 error envelope surfaces here; report and exit
    // non-zero rather than crashing with a stack trace (INV-3 — no internals).
    io.stderr(`session failed: ${(e as Error).message}`);
    return 1;
  }
  return 0;
}
