// packages/client-threejs/src/index.ts
//
// SPEC §5.2 / §6.6 — public surface of the Three.js reference adapter: the ECS
// component projection and the two pure systems that turn a resolved room into a
// scene, plus the live-server session bootstrap (#149) that feeds them a real
// `ResolvedRoomResponse`. Click-driven transitions (#150) build on top of these.

export type { Components, ComponentStore } from "./components";
export { buildComponentStore, toComponents } from "./components";
export { LayoutSystem } from "./layout-system";
export { MeshResolutionSystem } from "./mesh-resolution-system";
export { renderRoom } from "./scene";
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
