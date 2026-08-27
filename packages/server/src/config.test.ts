// packages/server/src/config.test.ts
//
// SPEC §2.1 "Config & errors" — the server's reader for the one environment-driven
// config convention (`docs/config-conventions.md`). The server selects two of the
// three swappable components: the `Logger` sink and the `Metrics` backend. Same env
// var names and value vocabulary as `corpus-builder`'s reference reader.

import { describe, expect, it } from "vitest";
import {
  ConfigError,
  makeLogger,
  makeMetrics,
  resolveLogSink,
  resolveMetricsBackend,
} from "./config";
import {
  ConsoleLogger,
  InMemoryMetrics,
  NoopLogger,
  NoopMetrics,
  isReadableMetrics,
} from "./instrumentation";

describe("§2.1 config convention — server log sink (SDC_LOG_SINK)", () => {
  it("defaults to the console sink when unset", () => {
    expect(resolveLogSink({})).toBe("console");
    expect(makeLogger({}, "info")).toBeInstanceOf(ConsoleLogger);
  });

  it("swaps the constructed logger to a noop sink from the env var alone", () => {
    expect(makeLogger({ SDC_LOG_SINK: "noop" }, "info")).toBeInstanceOf(
      NoopLogger,
    );
    expect(makeLogger({ SDC_LOG_SINK: "console" }, "debug")).toBeInstanceOf(
      ConsoleLogger,
    );
  });

  it("surfaces an unrecognized sink value", () => {
    expect(() => resolveLogSink({ SDC_LOG_SINK: "journald" })).toThrow(
      ConfigError,
    );
  });
});

describe("§2.1 config convention — server metrics backend (SDC_METRICS_BACKEND)", () => {
  it("defaults to the readable in-memory backend when unset", () => {
    expect(resolveMetricsBackend({})).toBe("memory");
    const metrics = makeMetrics({});
    expect(metrics).toBeInstanceOf(InMemoryMetrics);
    // GET /metrics needs a snapshot-able backend; the default provides one.
    expect(isReadableMetrics(metrics)).toBe(true);
  });

  it("swaps to a noop backend that still snapshots empty (GET /metrics stays safe)", () => {
    const metrics = makeMetrics({ SDC_METRICS_BACKEND: "noop" });
    expect(metrics).toBeInstanceOf(NoopMetrics);
    expect(isReadableMetrics(metrics)).toBe(true);
    metrics.increment("server.requests");
    expect((metrics as NoopMetrics).snapshot()).toEqual({
      counters: {},
      gauges: {},
    });
  });

  it("surfaces an unrecognized backend value", () => {
    expect(() =>
      resolveMetricsBackend({ SDC_METRICS_BACKEND: "statsd" }),
    ).toThrow(ConfigError);
  });
});
