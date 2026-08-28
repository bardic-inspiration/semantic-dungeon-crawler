// packages/corpus-builder/src/config.ts
//
// SPEC §2.1 "Config & errors" — the ONE environment-driven config convention that
// selects each swappable component, "rather than being hardcoded per package".
// The canonical naming scheme, defaults, and how to hook a new component in live
// in `docs/config-conventions.md`; this module is `corpus-builder`'s reader for it.
//
// `corpus-builder` is the only package that selects all three components §2.1
// names — the embedding provider (§6.3 build stage), the `Logger` sink, and the
// `Metrics` backend — so its convention reader is the reference implementation the
// `server` and `client-cli` readers mirror (same env var names, same value
// vocabulary, same "unknown value is surfaced, never silently defaulted" rule).

import { defaultEmbeddingProvider, type EmbeddingProvider } from "./embedding";
import { MiniLmEmbeddingProvider } from "./minilm-embedding";
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

/** The env vars that make up the §2.1 convention (see `docs/config-conventions.md`). */
export const ENV_EMBEDDING_PROVIDER = "SDC_EMBEDDING_PROVIDER";
export const ENV_LOG_SINK = "SDC_LOG_SINK";
export const ENV_METRICS_BACKEND = "SDC_METRICS_BACKEND";

export const LOG_SINKS = ["console", "noop"] as const;
export type LogSink = (typeof LOG_SINKS)[number];

export const METRICS_BACKENDS = ["memory", "noop"] as const;
export type MetricsBackend = (typeof METRICS_BACKENDS)[number];

/** The registered id of the pre-alpha default embedding provider (real, local model). */
export const DEFAULT_EMBEDDING_PROVIDER_ID = "minilm";

/**
 * The registered id of the deterministic hashing TEST-MODE provider: model-free,
 * offline, instant, but carrying no real semantic signal. Selected explicitly
 * (`SDC_EMBEDDING_PROVIDER=hashing`) for build-pipeline tests that do not concern
 * the embedding space.
 */
export const HASHING_EMBEDDING_PROVIDER_ID = "hashing";

/**
 * A malformed config selection (an env var set to an unrecognized value). Part of
 * the §2.1 "typed error taxonomy" posture: a bad config value is surfaced with the
 * accepted values, never silently coerced to a default.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Resolve one env var against a fixed value vocabulary. An unset or empty value
 * takes `fallback`; a recognized value is returned; anything else is a
 * {@link ConfigError} naming the accepted values.
 */
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

/**
 * The default embedding-provider registry (§6.3 / §0.10.0 B2): the pre-alpha
 * default `minilm` (real, local all-MiniLM-L6-v2 model) plus the `hashing`
 * test-mode provider, each under its id. Fresh per call so a caller can register an
 * additional provider without mutating shared state; the `minilm` instance is cheap
 * to construct — transformers.js is loaded lazily on its first `embed()`, never at
 * registration. Remote/API providers remain the deferred swap-in.
 */
export function defaultEmbeddingProviderRegistry(): Record<
  string,
  EmbeddingProvider
> {
  return {
    [DEFAULT_EMBEDDING_PROVIDER_ID]: new MiniLmEmbeddingProvider(),
    [HASHING_EMBEDDING_PROVIDER_ID]: defaultEmbeddingProvider,
  };
}

/**
 * Select the build's embedding provider from `SDC_EMBEDDING_PROVIDER` (default
 * `minilm`). Switchable without a code change at the call site: a provider
 * registered in `registry` is reachable by setting the env var to its key. An
 * unknown id is surfaced with what IS registered, never silently defaulted.
 */
export function resolveEmbeddingProvider(
  env: EnvLookup,
  registry: Record<
    string,
    EmbeddingProvider
  > = defaultEmbeddingProviderRegistry(),
): EmbeddingProvider {
  const raw = env[ENV_EMBEDDING_PROVIDER];
  const key =
    raw === undefined || raw === "" ? DEFAULT_EMBEDDING_PROVIDER_ID : raw;
  const provider = registry[key];
  if (provider === undefined) {
    throw new ConfigError(
      `unrecognized ${ENV_EMBEDDING_PROVIDER} "${key}" (registered: ${
        Object.keys(registry).join(", ") || "none"
      })`,
    );
  }
  return provider;
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
 * Construct the run's `Logger`, its sink chosen by {@link resolveLogSink} and its
 * `minLevel` chosen elsewhere (§5.4 `--verbosity` / `SDC_LOG_LEVEL`). Sink and
 * level are orthogonal knobs: `noop` discards regardless of level.
 */
export function makeLogger(env: EnvLookup, level: LogLevel): Logger {
  return resolveLogSink(env) === "noop"
    ? new NoopLogger()
    : new ConsoleLogger(level);
}

/** Construct the run's `Metrics`, its backend chosen by {@link resolveMetricsBackend}. */
export function makeMetrics(env: EnvLookup): Metrics {
  return resolveMetricsBackend(env) === "noop"
    ? new NoopMetrics()
    : new InMemoryMetrics();
}
