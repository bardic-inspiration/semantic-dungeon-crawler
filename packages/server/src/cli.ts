// packages/server/src/cli.ts
//
// SPEC §0.9.0 (A12) — the server's startup surface. The substrate bundle is
// "a server-wide startup config (e.g. `--graph <path>`); a corpus rebuild means
// a server restart, consistent with in-memory, one-world-per-server sessions".
//
// Until now `createServer` could only be called from a test: the package had no
// `bin`, nothing read `--graph`, and `graph.json` was never loaded from disk. So
// the Phase 2 pipeline and the Phase 4 runtime had never actually met.
//
//   sdc-server --graph <path> [--ruleset <path>] [--port N] [--host H]
//              [--start-ref <id>] [--dev] [--debug] [--metrics]
//
// The §2.1 environment-driven config convention (`docs/config-conventions.md`)
// selects the `Logger` sink (`SDC_LOG_SINK`) and `Metrics` backend
// (`SDC_METRICS_BACKEND`); the `--debug` flag still chooses the log level. Flags
// remain the surface for everything else.

import { readFile } from "node:fs/promises";
import type { Ruleset } from "schema";
import {
  SPEC_VERSION,
  isWellFormedRuleset,
  MalformedRulesetError,
} from "schema";
import { loadSubstrate } from "./graph-loader";
import { createHttpServer } from "./http";
import type { Logger, Metrics } from "./instrumentation";
import { ConfigError, makeLogger, makeMetrics, type EnvLookup } from "./config";

export interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

const USAGE = `sdc-server --graph <graph.json> [options]

  --graph <path>       substrate bundle to serve (required, §A12)
  --ruleset <path>     server-wide ruleset JSON; default is the null ruleset
  --start-ref <id>     span id a fresh session starts at; default: first span
  --port <n>           default 0 (ephemeral)
  --host <h>           default 127.0.0.1 (localhost only, §0.11.0 C3)
  --dev                enable per-session ruleset binding (§A12)
  --debug              enable DebugTrace + debug logging (§2.1, §4.6)
  --metrics            expose GET /metrics (§2.1)`;

function parseFlags(argv: readonly string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

const NULL_RULESET: Ruleset = { spec_version: SPEC_VERSION, layers: [] };

/**
 * Start a server from argv. Returns the process exit code; resolves only once
 * the socket is listening, so a caller can await readiness.
 */
export async function main(
  argv: readonly string[],
  io: CliIo,
  env: EnvLookup = process.env,
): Promise<{ code: number; close?: () => Promise<void> }> {
  const flags = parseFlags(argv);

  if (flags.help === true || typeof flags.graph !== "string") {
    io.stderr(USAGE);
    return { code: typeof flags.graph === "string" ? 0 : 2 };
  }

  // §2.1 — the `Logger` sink and `Metrics` backend come from the config convention;
  // the `--debug` flag chooses the log level. An unrecognized env value is a usage
  // error (exit 2), surfaced with the accepted values.
  let logger: Logger;
  let metrics: Metrics;
  try {
    logger = makeLogger(env, flags.debug === true ? "debug" : "info");
    metrics = makeMetrics(env);
  } catch (e) {
    if (e instanceof ConfigError) {
      io.stderr(e.message);
      return { code: 2 };
    }
    throw e;
  }

  let substrate;
  try {
    substrate = await loadSubstrate(flags.graph);
  } catch (e) {
    // A malformed build artifact fails loud and early rather than surfacing as a
    // confusing 500 on the first request (§6.3's fail-loud discipline).
    io.stderr((e as Error).message);
    return { code: 1 };
  }

  let ruleset = NULL_RULESET;
  if (typeof flags.ruleset === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(flags.ruleset, "utf8"));
    } catch (e) {
      io.stderr(
        `ruleset at "${flags.ruleset}" could not be read: ${(e as Error).message}`,
      );
      return { code: 1 };
    }
    // §2.1 / §6.7 taxonomy — a malformed ruleset at LOAD time is a
    // `MalformedRulesetError` (the wrong SHAPE, INV-4 — never an incoherence
    // judgement). At startup it fails loud rather than surfacing as a confusing
    // 500 on the first session, the same fail-loud line the graph loader draws.
    if (!isWellFormedRuleset(parsed)) {
      io.stderr(
        new MalformedRulesetError(
          `ruleset at "${flags.ruleset}" is not a well-formed ruleset (needs a string spec_version and a layers array)`,
        ).message,
      );
      return { code: 1 };
    }
    ruleset = parsed;
  }

  // §0.11.0 (C5) — `authored_against` is ADVISORY. Drift against the live
  // substrate is surfaced, never a rejection (INV-4), exactly as §3.7.3 treats
  // snapshot staleness.
  if (
    ruleset.authored_against !== undefined &&
    ruleset.authored_against !== substrate.substrate_version
  ) {
    logger.log("warn", "ruleset.substrate_drift", {
      authored_against: ruleset.authored_against,
      live: substrate.substrate_version,
    });
  }
  // §3.4 / §3.6.3 — the spec types `resolvers` as `Record<string, string>` but
  // never defines what a def string means, so an author's entries cannot be
  // interpreted. Surfaced, not rejected.
  if (
    ruleset.resolvers !== undefined &&
    Object.keys(ruleset.resolvers).length > 0
  ) {
    logger.log("warn", "ruleset.resolvers_unsupported", {
      names: Object.keys(ruleset.resolvers),
    });
  }

  // §A12 default: a fresh session starts at the first span in corpus order.
  // Deterministic and stable per bundle; it claims no session-start semantics
  // beyond satisfying `start_ref`'s existing "must name one of spans" contract.
  const start_ref =
    typeof flags["start-ref"] === "string"
      ? flags["start-ref"]
      : substrate.spans[0]!.span.id;

  const http = createHttpServer({
    ruleset,
    substrate: { spans: substrate.spans, start_ref },
    logger,
    metrics,
    ...(flags.dev === true ? { devMode: true } : {}),
    ...(flags.debug === true ? { debug: true } : {}),
    ...(flags.metrics === true ? { metricsEnabled: true } : {}),
  });
  const port = typeof flags.port === "string" ? Number(flags.port) : 0;
  const bound = await http.listen(
    Number.isFinite(port) ? port : 0,
    typeof flags.host === "string" ? flags.host : undefined,
  );

  logger.log("info", "server.listening", {
    ...bound,
    spans: substrate.spans.length,
    substrate_version: substrate.substrate_version,
    start_ref,
  });
  io.stdout(`listening on http://${bound.host}:${bound.port}`);

  return { code: 0, close: () => http.close() };
}
