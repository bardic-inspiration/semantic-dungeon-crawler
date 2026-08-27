// packages/client-cli/src/config.test.ts
//
// SPEC §2.1 "Config & errors" — the terminal client's reader for the one
// environment-driven config convention (`docs/config-conventions.md`). Selects the
// `Logger` sink and the `Metrics` backend; same env var names/vocabulary as the
// `corpus-builder` reference reader. INV-3: this is an operator diagnostic surface
// only — it imports no engine package (proved by the import-boundary lint rule).

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
} from "./instrumentation";

describe("§2.1 config convention — client-cli log sink (SDC_LOG_SINK)", () => {
  it("defaults to the console sink when unset, honoring the given writer", () => {
    expect(resolveLogSink({})).toBe("console");
    const lines: string[] = [];
    const log = makeLogger({}, "info", (l) => lines.push(l));
    expect(log).toBeInstanceOf(ConsoleLogger);
    log.log("warn", "cli.test");
    expect(lines).toEqual(["[warn] cli.test"]);
  });

  it("swaps to a noop sink from the env var alone", () => {
    const lines: string[] = [];
    const log = makeLogger({ SDC_LOG_SINK: "noop" }, "info", (l) =>
      lines.push(l),
    );
    expect(log).toBeInstanceOf(NoopLogger);
    log.log("warn", "cli.test");
    expect(lines).toEqual([]);
  });

  it("surfaces an unrecognized sink value", () => {
    expect(() => resolveLogSink({ SDC_LOG_SINK: "tty" })).toThrow(ConfigError);
  });
});

describe("§2.1 config convention — client-cli metrics backend (SDC_METRICS_BACKEND)", () => {
  it("defaults to the readable in-memory backend the §5.4 summary reads", () => {
    expect(resolveMetricsBackend({})).toBe("memory");
    const metrics = makeMetrics({});
    expect(metrics).toBeInstanceOf(InMemoryMetrics);
    metrics.increment("cli.turns");
    expect(metrics.snapshot().counters["cli.turns"]).toBe(1);
  });

  it("swaps to a noop backend that still snapshots empty (summary stays safe)", () => {
    const metrics = makeMetrics({ SDC_METRICS_BACKEND: "noop" });
    expect(metrics).toBeInstanceOf(NoopMetrics);
    metrics.increment("cli.turns");
    expect(metrics.snapshot()).toEqual({ counters: {}, gauges: {} });
  });

  it("surfaces an unrecognized backend value", () => {
    expect(() =>
      resolveMetricsBackend({ SDC_METRICS_BACKEND: "otel" }),
    ).toThrow(ConfigError);
  });
});
