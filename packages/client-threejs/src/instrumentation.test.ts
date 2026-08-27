// SPEC §2.1 / §5.2 / §6.7 — the Three.js adapter's `Logger`/`Metrics` supporting
// systems. Covers the in-memory backend's counter/gauge accumulation, the
// leveled console sink, and the debug-verbosity gate: with debug off, a
// `debugLog?.log(...)` call site must be skipped *before* it constructs its
// fields (§4.6 gate-before-construct, "zero overhead when disabled").

import { describe, it, expect } from "vitest";
import {
  CollectingLogger,
  ConsoleLogger,
  InMemoryMetrics,
  NoopLogger,
  NoopMetrics,
  makeInstrumentation,
  NOOP_INSTRUMENTATION,
  type Logger,
  type LogLevel,
} from "./instrumentation";

describe("InMemoryMetrics (§2.1)", () => {
  it("accumulates counters via increment (default step 1, explicit step honored)", () => {
    const m = new InMemoryMetrics();
    m.increment("interact.clicks");
    m.increment("interact.clicks");
    m.increment("interact.transitions", 3);
    const snap = m.snapshot();
    expect(snap.counters["interact.clicks"]).toBe(2);
    expect(snap.counters["interact.transitions"]).toBe(3);
  });

  it("records gauges via observe as the latest value (point-in-time)", () => {
    const m = new InMemoryMetrics();
    m.observe("room.object_count", 5);
    m.observe("room.object_count", 2);
    expect(m.snapshot().gauges["room.object_count"]).toBe(2);
  });

  it("snapshots to a { counters, gauges } shape with keys sorted for stable output", () => {
    const m = new InMemoryMetrics();
    m.increment("b.counter");
    m.increment("a.counter");
    m.observe("z.gauge", 1);
    m.observe("m.gauge", 2);
    const snap = m.snapshot();
    expect(Object.keys(snap.counters)).toEqual(["a.counter", "b.counter"]);
    expect(Object.keys(snap.gauges)).toEqual(["m.gauge", "z.gauge"]);
    expect(JSON.stringify(m.snapshot())).toBe(JSON.stringify(m.snapshot()));
  });

  it("NoopMetrics still snapshots to an empty, well-formed shape", () => {
    expect(new NoopMetrics().snapshot()).toEqual({ counters: {}, gauges: {} });
  });
});

describe("Logger sinks (§2.1)", () => {
  it("CollectingLogger captures level/event/fields; NoopLogger discards", () => {
    const log = new CollectingLogger();
    log.log("info", "session.bootstrap.ready", { session_id: "s1" });
    log.log("warn", "something");
    expect(log.entries).toEqual([
      {
        level: "info",
        event: "session.bootstrap.ready",
        fields: { session_id: "s1" },
      },
      { level: "warn", event: "something" },
    ]);
    const noop: Logger = new NoopLogger();
    expect(() => noop.log("error", "x")).not.toThrow();
  });

  it("ConsoleLogger gates by minLevel and routes each level to its sink", () => {
    const seen: { level: LogLevel; line: string }[] = [];
    const log = new ConsoleLogger("info", (level, line) =>
      seen.push({ level, line }),
    );
    log.log("debug", "hidden"); // below minLevel — dropped
    log.log("info", "shown", { a: 1 });
    log.log("error", "boom");
    expect(seen.map((s) => s.level)).toEqual(["info", "error"]);
    expect(seen[0]!.line).toBe('[info] shown {"a":1}');
  });
});

describe("makeInstrumentation debug gate (§2.1 / §4.6)", () => {
  it("defaults to a fully-noop bundle with no debugLog", () => {
    const instr = makeInstrumentation();
    expect(instr.debugLog).toBeUndefined();
    expect(NOOP_INSTRUMENTATION.debugLog).toBeUndefined();
    // The noop bundle never throws and records nothing observable.
    expect(() => instr.logger.log("info", "x")).not.toThrow();
  });

  it("with debug OFF, a debug call site is gated BEFORE its fields are built", () => {
    const logger = new CollectingLogger();
    const instr = makeInstrumentation({ logger }); // debug off ⇒ debugLog undefined

    let fieldsBuilt = false;
    const buildFields = (): Record<string, unknown> => {
      fieldsBuilt = true;
      return { expensive: true };
    };

    // The real call shape: optional chaining short-circuits argument evaluation, so
    // `buildFields()` never runs when the gate is closed — not construct-then-discard.
    instr.debugLog?.log("debug", "expensive.event", buildFields());

    expect(fieldsBuilt).toBe(false);
    expect(logger.entries).toEqual([]);
  });

  it("with debug ON, the debug call site fires against the configured sink", () => {
    const logger = new CollectingLogger();
    const instr = makeInstrumentation({ logger, debug: true });

    let fieldsBuilt = false;
    const buildFields = (): Record<string, unknown> => {
      fieldsBuilt = true;
      return { expensive: true };
    };

    instr.debugLog?.log("debug", "expensive.event", buildFields());

    expect(fieldsBuilt).toBe(true);
    expect(logger.entries).toEqual([
      { level: "debug", event: "expensive.event", fields: { expensive: true } },
    ]);
  });
});
