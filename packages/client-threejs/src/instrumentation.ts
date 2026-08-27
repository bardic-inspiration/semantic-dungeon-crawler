// packages/client-threejs/src/instrumentation.ts
//
// SPEC §2.1 (Supporting Systems) / §5.2 / §6.7 — the `Logger` and `Metrics`
// interfaces, held here as `client-threejs`'s OWN per-package instance (§2.1:
// "one instance per package"), exactly as `rule-engine`, `corpus-builder`,
// `server`, and `client-cli` each keep their own copy of the same contract. This
// is the one package that lacked the surface (§6.7 Build: "Logging, metrics, and
// debug-flag wiring per §2.1 across all packages"); this file adds it. The adapter
// reports session bootstrap and click/sync flow through these interfaces — it does
// not reimplement logging or metrics.
//
// INV-3: this module imports NOTHING from `rule-engine`/`corpus-builder` (proved by
// the import-boundary lint rule/test) — it is standalone plumbing with no engine
// dependency and not even a `three` dependency. INV-2: logging/metrics are a
// SIDE CHANNEL that MUST NOT influence scene/session control flow, and are never
// serialized back to the server — a purely diagnostic, operator-facing surface.

/** The §2.1 log levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured, leveled logger (§2.1). One `log(level, event, fields)` method. */
export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}

/** Counters / gauges behind the minimal §2.1 write interface. */
export interface Metrics {
  increment(name: string, value?: number): void;
  observe(name: string, value: number): void;
}

/** The `{ counters, gauges }` snapshot a diagnostic reader reads back. */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
}

/** A {@link Metrics} whose accumulated state can be read back as a snapshot. */
export interface ReadableMetrics extends Metrics {
  snapshot(): MetricsSnapshot;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Browser-`console` sink, an acceptable default pre-alpha (§2.1, same swappability
 * convention as the embedding provider). Each level routes to the matching
 * `console` method (`debug`/`info`/`warn`/`error`) so a browser devtools filter can
 * separate them; `minLevel` gates verbosity. Under the §2.1 debug rule, debug-level
 * logging is gated *before* the call site builds expensive fields (see
 * {@link Instrumentation.debugLog}), so this only decides what to print.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly minLevel: LogLevel = "info",
    private readonly sink: (
      level: LogLevel,
      line: string,
    ) => void = defaultSink,
  ) {}

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line =
      fields && Object.keys(fields).length > 0
        ? `[${level}] ${event} ${JSON.stringify(fields)}`
        : `[${level}] ${event}`;
    this.sink(level, line);
  }
}

function defaultSink(level: LogLevel, line: string): void {
  const method = level === "debug" ? console.debug : console[level];
  method(line);
}

/** Discards everything — the default when no sink is supplied. */
export class NoopLogger implements Logger {
  log(): void {
    /* intentionally empty */
  }
}

/** In-memory logger, used by tests to assert emitted events. */
export class CollectingLogger implements Logger {
  readonly entries: {
    level: LogLevel;
    event: string;
    fields?: Record<string, unknown>;
  }[] = [];

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    this.entries.push(
      fields === undefined ? { level, event } : { level, event, fields },
    );
  }
}

/**
 * Discards every metric — the §2.1 "noop" backend an operator selects to pay zero
 * instrumentation cost. Still a {@link ReadableMetrics}: `snapshot()` returns an
 * empty `{ counters, gauges }` rather than failing when metrics are switched off.
 */
export class NoopMetrics implements ReadableMetrics {
  increment(): void {
    /* intentionally empty */
  }

  observe(): void {
    /* intentionally empty */
  }

  snapshot(): MetricsSnapshot {
    return { counters: {}, gauges: {} };
  }
}

/**
 * In-memory metrics (§2.1 in-memory default). `increment` accumulates counters
 * (bootstraps, clicks, transitions); `observe(name, value)` records a gauge as its
 * latest value (room object/exit counts). Diagnostic only — nothing in scene or
 * session control flow ever reads this back (INV-2).
 */
export class InMemoryMetrics implements ReadableMetrics {
  readonly #counters = new Map<string, number>();
  readonly #gauges = new Map<string, number>();

  increment(name: string, value = 1): void {
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + value);
  }

  observe(name: string, value: number): void {
    this.#gauges.set(name, value);
  }

  snapshot(): MetricsSnapshot {
    return {
      counters: sortedRecord(this.#counters),
      gauges: sortedRecord(this.#gauges),
    };
  }
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...map.keys()].sort()) out[key] = map.get(key)!;
  return out;
}

/**
 * The bundle the adapter's flows report through: a `Logger`, a `Metrics`, and the
 * debug-verbosity gate. `debugLog` mirrors the server's gate (§4.6 "gate before
 * construct"): it is `undefined` unless debug verbosity is on, so a
 * `debugLog?.log("debug", event, { …expensive fields })` call site is skipped
 * *before* its fields object is ever built — zero overhead when disabled, never
 * construct-then-discard.
 */
export interface Instrumentation {
  readonly logger: Logger;
  readonly metrics: Metrics;
  /** The gate: present iff debug verbosity is on; `undefined` otherwise. */
  readonly debugLog: Logger | undefined;
}

/** Options for {@link makeInstrumentation}. */
export interface InstrumentationOptions {
  /** Operational sink for `info`/`warn`/`error`; defaults to a {@link NoopLogger}. */
  logger?: Logger;
  /** Metrics backend; defaults to a {@link NoopMetrics}. */
  metrics?: Metrics;
  /**
   * Debug-verbosity flag (§2.1: "one flag gates both trace and elevated log
   * verbosity"). Off ⇒ `debugLog` is `undefined` and every debug call site is
   * gated before it constructs its fields (§4.6).
   */
  debug?: boolean;
}

/**
 * Assemble an {@link Instrumentation} bundle. With no options it is fully noop —
 * the zero-overhead default the flows fall back to when a caller wires nothing.
 */
export function makeInstrumentation(
  options: InstrumentationOptions = {},
): Instrumentation {
  const logger = options.logger ?? new NoopLogger();
  const metrics = options.metrics ?? new NoopMetrics();
  return {
    logger,
    metrics,
    debugLog: options.debug === true ? logger : undefined,
  };
}

/** The all-noop bundle the flows default to when a caller supplies none. */
export const NOOP_INSTRUMENTATION: Instrumentation = makeInstrumentation();
