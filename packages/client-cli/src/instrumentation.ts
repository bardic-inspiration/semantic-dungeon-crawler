// packages/client-cli/src/instrumentation.ts
//
// SPEC §2.1 (Supporting Systems) / §5.4 — the `Logger` and `Metrics` interfaces,
// held here as `client-cli`'s OWN per-package instance (§2.1: "one instance per
// package"), exactly as `rule-engine`, `corpus-builder`, and `server` each keep
// their own copy of the same contract. §5.4 makes the terminal client "a display
// surface for" both systems: it reuses the `Logger` levels as its `--verbosity`
// levels and reads the `Metrics` snapshot for the end-of-session summary — it does
// not reimplement logging or metrics, it renders through them.
//
// INV-3: `client-cli` imports wire types from `schema` only and speaks the §5.1
// REST API over HTTP — nothing here reaches into `rule-engine`/`corpus-builder`.
// This file defines the display-surface plumbing with no engine dependency at all.

/** The §2.1 log levels, reused as the `--verbosity` levels (§5.4). */
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

/** The `{ counters, gauges }` snapshot the end-of-session summary reads (§5.4). */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
}

/** A {@link Metrics} whose accumulated state can be read back for the summary. */
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
 * Console sink for OPERATIONAL messages (session lifecycle, bad input), written
 * to `stderr` so it never contaminates the rendered room output on `stdout` — the
 * separation the byte-for-byte replay diff (§5.4, INV-2) depends on. `minLevel`
 * gates verbosity, matching the §2.1 `ConsoleLogger` the other packages ship.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly minLevel: LogLevel = "info",
    private readonly sink: (line: string) => void = (line) =>
      process.stderr.write(line + "\n"),
  ) {}

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line =
      fields && Object.keys(fields).length > 0
        ? `[${level}] ${event} ${JSON.stringify(fields)}`
        : `[${level}] ${event}`;
    this.sink(line);
  }
}

/** Discards everything — the default when no operational sink is supplied. */
export class NoopLogger implements Logger {
  log(): void {
    /* intentionally empty */
  }
}

/** In-memory logger, used by tests to assert emitted operational events. */
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
 * In-memory metrics (§2.1 in-memory default). `increment` accumulates counters
 * (turns, requests); `observe(name, value)` records a gauge as its latest value
 * (request latency). `snapshot()` reads them back for the §5.4 end-of-session
 * summary. Diagnostic only — nothing in resolution ever reads this (INV-2).
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
