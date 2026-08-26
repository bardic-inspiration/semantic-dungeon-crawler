// packages/client-cli/src/verbosity.ts
//
// SPEC §5.4 — the `--verbosity` flag (and `SDC_LOG_LEVEL` env var) reuse the §2.1
// `Logger` levels. The levels are a nested ladder of DETAIL, each adding to the
// one below it:
//
//   error  transitions only          (the room header line)
//   warn   + salience-ordered objects with affordances, and exits   (default)
//   info   + full entity fields as pretty JSON
//   debug  + the raw DebugTrace (when server debug mode is on) and an
//          end-of-session Metrics summary (turns, requests, latency)
//
// Note the §2.1 severity order runs the OTHER way (`error` is most severe): a
// higher verbosity means MORE output, so `debug` is the most detailed. This module
// keeps that mapping in one place so `render`/`repl` agree on what each level shows.

import type { LogLevel } from "./instrumentation";

/** The `--verbosity` levels, identical to the §2.1 {@link LogLevel} union (§5.4). */
export type Verbosity = LogLevel;

const VALID: readonly Verbosity[] = ["error", "warn", "info", "debug"];

/** §5.4 default: `warn` — the standard room render (objects, affordances, exits). */
export const DEFAULT_VERBOSITY: Verbosity = "warn";

// How much a level shows, as a monotonic ladder. Each renderer gates its sections
// on `detailFor(level) >= N`, so a higher level is a strict superset of a lower one.
const DETAIL: Record<Verbosity, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/** Detail depth for a level: `error` 0 … `debug` 3. Higher shows strictly more. */
export function detailFor(level: Verbosity): number {
  return DETAIL[level];
}

/** True when the level's detail depth is at least `warn` (objects/exits shown). */
export function showsRoomBody(level: Verbosity): boolean {
  return detailFor(level) >= DETAIL.warn;
}

/** True when the level shows full entity JSON (`info` and up). */
export function showsFullEntities(level: Verbosity): boolean {
  return detailFor(level) >= DETAIL.info;
}

/** True when the level shows the `DebugTrace` and end-of-session summary (`debug`). */
export function showsDebug(level: Verbosity): boolean {
  return detailFor(level) >= DETAIL.debug;
}

/** True iff `value` names one of the four §2.1 levels. */
export function isVerbosity(value: string): value is Verbosity {
  return (VALID as readonly string[]).includes(value);
}

/**
 * Resolve the effective verbosity: the `--verbosity` flag wins over the
 * `SDC_LOG_LEVEL` env var, which wins over the {@link DEFAULT_VERBOSITY}. A
 * supplied-but-unknown value is a hard error — an author who typos a level should
 * hear about it, not silently get the default.
 */
export function resolveVerbosity(flag?: string, env?: string): Verbosity {
  const chosen = flag ?? env;
  if (chosen === undefined) return DEFAULT_VERBOSITY;
  if (!isVerbosity(chosen)) {
    throw new Error(
      `unknown verbosity "${chosen}" — expected one of: ${VALID.join(", ")}`,
    );
  }
  return chosen;
}
