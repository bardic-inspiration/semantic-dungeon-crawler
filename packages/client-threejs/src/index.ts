// packages/client-threejs/src/index.ts
//
// SPEC §5.2 / §6.6 — public surface of the Three.js reference adapter's first
// slice: the ECS component projection and the two pure systems that turn a
// resolved room into a scene. Live server bootstrap (#149) and click-driven
// transitions (#150) build on top of these.

export type { Components, ComponentStore } from "./components";
export { buildComponentStore, toComponents } from "./components";
export { LayoutSystem } from "./layout-system";
export { MeshResolutionSystem } from "./mesh-resolution-system";
export { renderRoom } from "./scene";
