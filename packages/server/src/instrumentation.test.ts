// SPEC §2.1 / §5.1 — the runtime `Logger`/`Metrics` supporting systems. The
// server reports through these interfaces (it does not reimplement them); this
// covers the in-memory default's counter/gauge accumulation and the deterministic
// `{ counters, gauges }` snapshot `GET /metrics` reads.

import { describe, it, expect } from "vitest";
import {
  CollectingLogger,
  InMemoryMetrics,
  NoopLogger,
  isReadableMetrics,
  type Logger,
  type Metrics,
} from "./instrumentation";

describe("InMemoryMetrics (§2.1)", () => {
  it("accumulates counters via increment (default step 1, explicit step honored)", () => {
    const m = new InMemoryMetrics();
    m.increment("http.requests");
    m.increment("http.requests");
    m.increment("interact.turns", 3);
    const snap = m.snapshot();
    expect(snap.counters["http.requests"]).toBe(2);
    expect(snap.counters["interact.turns"]).toBe(3);
  });

  it("records gauges via observe as the latest value (point-in-time)", () => {
    const m = new InMemoryMetrics();
    m.observe("sessions.active", 1);
    m.observe("sessions.active", 5);
    m.observe("sessions.active", 2);
    expect(m.snapshot().gauges["sessions.active"]).toBe(2);
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
    // Serializing twice from the same state is byte-identical.
    expect(JSON.stringify(m.snapshot())).toBe(JSON.stringify(m.snapshot()));
  });

  it("is diagnostic-only — a snapshot is a copy, not a live handle (INV-2)", () => {
    const m = new InMemoryMetrics();
    m.increment("x");
    const snap = m.snapshot();
    m.increment("x");
    // The earlier snapshot did not change under a later write.
    expect(snap.counters["x"]).toBe(1);
    expect(m.snapshot().counters["x"]).toBe(2);
  });
});

describe("isReadableMetrics (§5.1)", () => {
  it("is true for the in-memory default and false for a write-only sink", () => {
    expect(isReadableMetrics(new InMemoryMetrics())).toBe(true);
    const writeOnly: Metrics = { increment() {}, observe() {} };
    expect(isReadableMetrics(writeOnly)).toBe(false);
  });
});

describe("Logger sinks (§2.1)", () => {
  it("CollectingLogger captures level/event/fields; NoopLogger discards", () => {
    const log = new CollectingLogger();
    log.log("info", "http.request", { status: 200 });
    log.log("warn", "something");
    expect(log.entries).toEqual([
      { level: "info", event: "http.request", fields: { status: 200 } },
      { level: "warn", event: "something" },
    ]);
    // NoopLogger is a no-op — nothing to assert but that it never throws.
    const noop: Logger = new NoopLogger();
    expect(() => noop.log("error", "x")).not.toThrow();
  });
});
