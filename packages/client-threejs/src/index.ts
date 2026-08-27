// packages/client-threejs/src/index.ts
//
// SPEC §5.2 / §6.6 — public surface of the Three.js reference adapter: the ECS
// component projection and the pure systems that turn a resolved room into a
// scene, the live-server session bootstrap (#149) that feeds them a real
// `ResolvedRoomResponse`, and the click pipeline (#150) — `InteractionSystem` →
// `SyncSystem` — that turns a click into a `POST /interact` room transition.

export type { Components, ComponentStore } from "./components";
export { buildComponentStore, toComponents } from "./components";
export { LayoutSystem } from "./layout-system";
export { MeshResolutionSystem } from "./mesh-resolution-system";
export { clearScene, populateScene, renderRoom } from "./scene";
export {
  isResolvedRoomResponse,
  parseRoomFixture,
  renderRoomFixtureFile,
} from "./fixtures";
export { SyncSystem } from "./sync";
export type { ClickContext } from "./interaction";
export {
  actionForObject,
  handleClick,
  InteractionSystem,
  pickEntityId,
} from "./interaction";
export type {
  BootstrapOptions,
  HttpRoomClientOptions,
  RoomApiClient,
  SessionBootstrap,
  SessionHandle,
} from "./session-bootstrap";
export {
  bootstrapSession,
  httpRoomClient,
  RoomApiError,
} from "./session-bootstrap";
export type {
  Instrumentation,
  InstrumentationOptions,
  Logger,
  LogLevel,
  Metrics,
  MetricsSnapshot,
  ReadableMetrics,
} from "./instrumentation";
export {
  CollectingLogger,
  ConsoleLogger,
  InMemoryMetrics,
  makeInstrumentation,
  NoopLogger,
  NoopMetrics,
  NOOP_INSTRUMENTATION,
} from "./instrumentation";
