// packages/corpus-builder/src/instrumentation.ts
//
// SPEC §2.1 (Supporting Systems) — the `Logger` and `Metrics` interfaces the
// build-time pipeline reports through. These are the SAME interfaces `server`
// uses at runtime (§6.3: "not a parallel mechanism"), one instance per package.
//
// Logging/metrics are a SIDE CHANNEL: they MUST NOT influence control flow
// (INV-2) and MUST NOT be a path by which graph/embedding internals reach a
// client (INV-3). In `corpus-builder` there is no client, but the discipline is
// the same — instrumentation never feeds back into pipeline output.

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured, leveled logger (§2.1). One `log(level, event, fields)` method. */
export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}

/** Counters / gauges / histograms behind a minimal interface (§2.1). */
export interface Metrics {
  increment(name: string, value?: number): void;
  observe(name: string, value: number): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Console sink, acceptable default pre-alpha (§2.1, same swappability convention
 * as the embedding provider). Writes to `stderr` so it never contaminates a
 * `stdout` artifact stream. `minLevel` gates verbosity — debug-level logging is
 * gated *before* the call site constructs expensive fields (§2.1 debug rule), so
 * this only decides what to print.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const line =
      fields && Object.keys(fields).length > 0
        ? `[${level}] ${event} ${JSON.stringify(fields)}`
        : `[${level}] ${event}`;
    process.stderr.write(line + "\n");
  }
}

/** Discards everything — the default when no verbosity is requested. */
export class NoopLogger implements Logger {
  log(): void {
    /* intentionally empty */
  }
}

/** In-memory logger, used by tests to assert emitted events/warnings. */
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

  warnings(): string[] {
    return this.entries.filter((e) => e.level === "warn").map((e) => e.event);
  }
}

/**
 * In-memory metrics default (§2.1). Diagnostic only — pipeline stages MUST NOT
 * read this state back (that would let output depend on prior instrumentation,
 * violating INV-2).
 */
export class InMemoryMetrics implements Metrics {
  readonly counters = new Map<string, number>();
  readonly observations = new Map<string, number[]>();

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  observe(name: string, value: number): void {
    const bucket = this.observations.get(name);
    if (bucket) bucket.push(value);
    else this.observations.set(name, [value]);
  }
}
