// packages/client-cli/src/index.ts
//
// SPEC §5.4 / §6.5 (Phase 4) — the terminal reference client. A REPL that speaks
// the §5.1 REST API over stdin/stdout (§5.4): render rooms, drive a live server
// session end-to-end, replay a scripted input-log headlessly (byte-for-byte
// diffable, INV-2), and render `fixtures/rooms/*.json` directly for §5.3
// conformance. `--verbosity` (or `SDC_LOG_LEVEL`) reuses the §2.1 `Logger` levels
// and the end-of-session summary reads the §2.1 `Metrics` snapshot — the client is
// a display surface for both, not a reimplementation.
//
// INV-3: this package imports wire-protocol types from `schema` ONLY — never
// `rule-engine` or `corpus-builder`. It is just an HTTP client against §5.1, with
// no privileged access to engine internals (enforced mechanically by issue #92).

export { main as runCli } from "./cli";
export type { CliIo } from "./cli";

export { httpApiClient, ApiError } from "./api-client";
export type { ApiClient, HttpApiClientOptions } from "./api-client";

export { runRepl, parseActionLine, linesFromText } from "./repl";
export type { ReplOptions } from "./repl";

export {
  renderRoom,
  renderInteraction,
  renderTrace,
  renderMetricsSummary,
  salienceOrdered,
} from "./render";

export {
  renderRoomFixtureFile,
  parseRoomFixture,
  isResolvedRoomResponse,
} from "./fixtures";

export {
  resolveVerbosity,
  detailFor,
  isVerbosity,
  DEFAULT_VERBOSITY,
  showsRoomBody,
  showsFullEntities,
  showsDebug,
} from "./verbosity";
export type { Verbosity } from "./verbosity";

export {
  ConsoleLogger,
  NoopLogger,
  CollectingLogger,
  InMemoryMetrics,
  NoopMetrics,
} from "./instrumentation";
export type {
  LogLevel,
  Logger,
  Metrics,
  MetricsSnapshot,
  ReadableMetrics,
} from "./instrumentation";

// §2.1 environment-driven config convention (docs/config-conventions.md).
export {
  ConfigError,
  makeLogger,
  makeMetrics,
  resolveLogSink,
  resolveMetricsBackend,
  LOG_SINKS,
  METRICS_BACKENDS,
  ENV_LOG_SINK,
  ENV_METRICS_BACKEND,
} from "./config";
export type { EnvLookup, LogSink, MetricsBackend } from "./config";
