// packages/corpus-builder/src/config.test.ts
//
// SPEC §2.1 "Config & errors" — the one environment-driven config convention that
// selects each swappable component (embedding provider, log sink, metrics backend)
// rather than hardcoding it per package. These tests prove the convention actually
// changes which implementation gets constructed from an env lookup alone.

import { describe, expect, it } from "vitest";
import {
  ConfigError,
  defaultEmbeddingProviderRegistry,
  makeLogger,
  makeMetrics,
  resolveEmbeddingProvider,
  resolveLogSink,
  resolveMetricsBackend,
} from "./config";
import {
  ConsoleLogger,
  InMemoryMetrics,
  NoopLogger,
  NoopMetrics,
} from "./instrumentation";
import {
  defaultEmbeddingProvider,
  HashingEmbeddingProvider,
  type EmbeddingProvider,
} from "./embedding";
import { MiniLmEmbeddingProvider } from "./minilm-embedding";

describe("§2.1 config convention — embedding provider (SDC_EMBEDDING_PROVIDER)", () => {
  it("defaults to the local minilm provider when unset", () => {
    // Pre-alpha default is the real, model-based provider; the hashing provider is
    // the opt-in test mode. Constructing it is cheap (the model loads lazily on
    // first embed()), so resolving the default touches no network here.
    expect(resolveEmbeddingProvider({})).toBeInstanceOf(
      MiniLmEmbeddingProvider,
    );
    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "" }),
    ).toBeInstanceOf(MiniLmEmbeddingProvider);
    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "minilm" }),
    ).toBeInstanceOf(MiniLmEmbeddingProvider);
  });

  it("selects the hashing test-mode provider from the env var alone", () => {
    // `hashing` is the shared, model-free test-mode instance — reachable by the
    // env var with no code change at the call site.
    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "hashing" }),
    ).toBe(defaultEmbeddingProvider);
  });

  it("selects a different registered provider from the env var alone", () => {
    // A fake provider registered alongside the defaults: the env var — no code
    // change at the call site — decides which one is constructed/returned.
    const fake: EmbeddingProvider = {
      id: "fake-test-provider",
      dimensions: 4,
      embed: (texts) => Promise.resolve(texts.map(() => [1, 0, 0, 0])),
    };
    const registry = { ...defaultEmbeddingProviderRegistry(), fake };

    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "fake" }, registry),
    ).toBe(fake);
    expect(
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "hashing" }, registry),
    ).toBeInstanceOf(HashingEmbeddingProvider);
  });

  it("surfaces an unknown provider id rather than silently defaulting", () => {
    expect(() =>
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "nope" }),
    ).toThrow(ConfigError);
    expect(() =>
      resolveEmbeddingProvider({ SDC_EMBEDDING_PROVIDER: "nope" }),
    ).toThrow(/registered: minilm, hashing/);
  });
});

describe("§2.1 config convention — log sink (SDC_LOG_SINK)", () => {
  it("defaults to the console sink when unset", () => {
    expect(resolveLogSink({})).toBe("console");
    expect(makeLogger({}, "info")).toBeInstanceOf(ConsoleLogger);
  });

  it("swaps the constructed logger to a noop sink from the env var alone", () => {
    expect(resolveLogSink({ SDC_LOG_SINK: "noop" })).toBe("noop");
    expect(makeLogger({ SDC_LOG_SINK: "noop" }, "info")).toBeInstanceOf(
      NoopLogger,
    );
    expect(makeLogger({ SDC_LOG_SINK: "console" }, "info")).toBeInstanceOf(
      ConsoleLogger,
    );
  });

  it("surfaces an unrecognized sink value", () => {
    expect(() => resolveLogSink({ SDC_LOG_SINK: "syslog" })).toThrow(
      ConfigError,
    );
  });
});

describe("§2.1 config convention — metrics backend (SDC_METRICS_BACKEND)", () => {
  it("defaults to the in-memory backend when unset", () => {
    expect(resolveMetricsBackend({})).toBe("memory");
    expect(makeMetrics({})).toBeInstanceOf(InMemoryMetrics);
  });

  it("swaps the constructed metrics to a noop backend from the env var alone", () => {
    expect(resolveMetricsBackend({ SDC_METRICS_BACKEND: "noop" })).toBe("noop");
    expect(makeMetrics({ SDC_METRICS_BACKEND: "noop" })).toBeInstanceOf(
      NoopMetrics,
    );
    expect(makeMetrics({ SDC_METRICS_BACKEND: "memory" })).toBeInstanceOf(
      InMemoryMetrics,
    );
  });

  it("surfaces an unrecognized backend value", () => {
    expect(() =>
      resolveMetricsBackend({ SDC_METRICS_BACKEND: "prometheus" }),
    ).toThrow(ConfigError);
  });
});
