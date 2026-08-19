// packages/rule-engine/src/instrumentation.ts
//
// SPEC §2.1 (Supporting Systems) — the `Logger` interface this package reports
// through. Same shape `corpus-builder`/`server` use, one instance per package
// (§2.1: "not a parallel mechanism"). The §4.3 "messy resolution" warning
// (conflicting `override` layers, INV-4) is emitted here at `warn`.
//
// Logging is a SIDE CHANNEL: it MUST NOT influence control flow (INV-2) and MUST
// NOT be a path by which rule/graph/embedding internals reach a client (INV-3).
// It never feeds back into resolution output — a logged warning changes nothing
// a replay observes.

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured, leveled logger (§2.1). One `log(level, event, fields)` method. */
export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}

/** Discards everything — the default when no sink is supplied. */
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

  /** The `event` strings of every `warn`-level entry, in emission order. */
  warnings(): string[] {
    return this.entries.filter((e) => e.level === "warn").map((e) => e.event);
  }
}
