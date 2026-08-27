// packages/server/src/config.ts
//
// SPEC §2.1 "Config & errors" — the server's reader for the ONE environment-driven
// config convention (canonical scheme, defaults, and hook-in guidance in
// `docs/config-conventions.md`). The server selects two of the three swappable
// components §2.1 names: the `Logger` sink (`SDC_LOG_SINK`) and the `Metrics`
// backend (`SDC_METRICS_BACKEND`) — the embedding provider is a build-time concern,
// owned by `corpus-builder`'s reader. Same env var names, value vocabulary, and
// "unknown value is surfaced, never silently defaulted" rule as that reader.

import {
  ConsoleLogger,
  InMemoryMetrics,
  NoopLogger,
  NoopMetrics,
  type Logger,
  type LogLevel,
  type Metrics,
} from "./instrumentation";

/** An environment lookup — injectable so tests drive it without `process.env`. */
export type EnvLookup = Record<string, string | undefined>;

/** The env vars this package reads (see `docs/config-conventions.md`). */
export const ENV_LOG_SINK = "SDC_LOG_SINK";
export const ENV_METRICS_BACKEND = "SDC_METRICS_BACKEND";

export const LOG_SINKS = ["console", "noop"] as const;
export type LogSink = (typeof LOG_SINKS)[number];

export const METRICS_BACKENDS = ["memory", "noop"] as const;
export type MetricsBackend = (typeof METRICS_BACKENDS)[number];

/**
 * A malformed config selection (an env var set to an unrecognized value), surfaced
 * with the accepted values rather than silently coerced — the §2.1 "Config &
 * errors" posture.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function selectEnum<T extends string>(
  env: EnvLookup,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if ((choices as readonly string[]).includes(raw)) return raw as T;
  throw new ConfigError(
    `unrecognized ${name} "${raw}" (expected: ${choices.join(" | ")})`,
  );
}

/** Select the `Logger` sink from `SDC_LOG_SINK` (default `console`). */
export function resolveLogSink(env: EnvLookup): LogSink {
  return selectEnum(env, ENV_LOG_SINK, LOG_SINKS, "console");
}

/** Select the `Metrics` backend from `SDC_METRICS_BACKEND` (default `memory`). */
export function resolveMetricsBackend(env: EnvLookup): MetricsBackend {
  return selectEnum(env, ENV_METRICS_BACKEND, METRICS_BACKENDS, "memory");
}

/**
 * Construct the server's `Logger`, its sink chosen by {@link resolveLogSink} and
 * its `minLevel` chosen elsewhere (the `--debug` flag, §2.1/§4.6). Sink and level
 * are orthogonal: `noop` discards regardless of level.
 */
export function makeLogger(env: EnvLookup, level: LogLevel): Logger {
  return resolveLogSink(env) === "noop"
    ? new NoopLogger()
    : new ConsoleLogger(level);
}

/**
 * Construct the server's `Metrics`, its backend chosen by
 * {@link resolveMetricsBackend}. Both backends are snapshot-able, so `GET /metrics`
 * stays well-formed under either.
 */
export function makeMetrics(env: EnvLookup): Metrics {
  return resolveMetricsBackend(env) === "noop"
    ? new NoopMetrics()
    : new InMemoryMetrics();
}
