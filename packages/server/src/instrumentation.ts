// packages/server/src/instrumentation.ts
//
// SPEC §2.1 (Supporting Systems) — the `Logger` and `Metrics` interfaces the
// runtime `server` reports through. These are the SAME interfaces `corpus-builder`
// (§6.3) and `rule-engine` report through, one instance per package (§2.1: "not a
// parallel mechanism") — the server wires them in at its request boundaries, it
// does not reimplement logging/metrics. The interface contract is identical:
// `log(level, event, fields)` for the `Logger`, `increment`/`observe` for the
// `Metrics`.
//
// Logging/metrics are a SIDE CHANNEL: they MUST NOT influence control flow
// (INV-2) and MUST NOT be a path by which graph/rule/embedding internals reach a
// client (INV-3). The server records only operator-facing request metadata
// (method, route, status) — never ruleset text, graph data, or session internals.

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

/** The `{ counters, gauges }` snapshot `GET /metrics` returns (§5.1). */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
}

/**
 * A {@link Metrics} whose accumulated state can be read back as a
 * {@link MetricsSnapshot}. `GET /metrics` needs this: the §2.1 write interface
 * (`increment`/`observe`) is intentionally write-only, so the endpoint reads
 * through this narrow extension rather than widening the base interface.
 */
export interface ReadableMetrics extends Metrics {
  snapshot(): MetricsSnapshot;
}

/** True when `m` can produce a {@link MetricsSnapshot} for `GET /metrics`. */
export function isReadableMetrics(m: Metrics): m is ReadableMetrics {
  return typeof (m as Partial<ReadableMetrics>).snapshot === "function";
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Console sink, an acceptable default pre-alpha (§2.1, same swappability
 * convention as the embedding provider). Writes to `stderr` so log output never
 * contaminates a response written to a socket. `minLevel` gates verbosity — under
 * the §2.1 debug rule, debug-level logging is gated *before* the call site builds
 * expensive fields, so this only decides what to print.
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
 * Discards every metric — the §2.1 "noop" metrics backend an operator selects to
 * pay zero instrumentation cost. Still a {@link ReadableMetrics}: `snapshot()`
 * returns an empty `{ counters, gauges }`, so `GET /metrics` stays well-formed (an
 * empty snapshot) instead of failing when metrics are switched off.
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
 * In-memory metrics default (§2.1). `increment` accumulates counters;
 * `observe(name, value)` records a gauge as its latest value — the point-in-time
 * reading `GET /metrics` reports (`{ counters, gauges }`, §5.1). Diagnostic only:
 * resolution (`resolveMove`/`populate`, §4.1/§4.4) MUST NOT read this state back,
 * so it can never influence output (INV-2).
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

  /**
   * A `{ counters, gauges }` snapshot with keys sorted, so the serialized
   * `GET /metrics` body is stable across calls with the same recorded state.
   */
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
