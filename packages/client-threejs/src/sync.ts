// packages/client-threejs/src/sync.ts
//
// SPEC §5.2 / §6.6 — the `SyncSystem`: given the `InteractResponse` from a click,
// re-render the scene to show the transition. §5.2 frames it as "mutate components
// → trigger LayoutSystem + MeshResolutionSystem re-run for changed entities only";
// under §0.9.0 (A2) every resolution mints a fresh set of EPHEMERAL entity ids, so
// a room transition replaces the whole object set — the minimum-viable re-render
// clears the scene and repopulates it from `new_room` rather than diffing. It runs
// in place on the same `THREE.Scene` so a live renderer's reference survives the
// transition.
//
// It consumes only the resolved `new_room` (INV-3) and makes no movement decision —
// the server already resolved the transition; this only reflects the result.

import * as THREE from "three";
import type { InteractResponse, ResolvedRoomResponse } from "schema";
import { clearScene, populateScene } from "./scene";
import { NOOP_INSTRUMENTATION, type Instrumentation } from "./instrumentation";

/**
 * Re-render `scene` in place from an interaction's re-resolved room (§5.2). Returns
 * the `new_room` it rendered so the caller can carry it forward as the current room
 * — its `exits` drive the next click. `transition_occurred: false` (a local
 * interaction) still re-renders faithfully: `new_room` is a full re-resolution
 * (§3.3), so the scene always ends up matching exactly what the server returned.
 */
export function SyncSystem(
  scene: THREE.Scene,
  response: InteractResponse,
  instrumentation: Instrumentation = NOOP_INSTRUMENTATION,
): ResolvedRoomResponse {
  clearScene(scene);
  populateScene(scene, response.new_room);

  // §2.1 side channel — records the re-rendered room's size after the transition.
  // Diagnostic only: the scene above is already fully rebuilt regardless (INV-2).
  const { metrics, debugLog } = instrumentation;
  metrics.increment("sync.rerender.count");
  metrics.observe("room.object_count", response.new_room.objects.length);
  debugLog?.log("debug", "sync.rerendered", {
    transition_occurred: response.transition_occurred,
    object_count: response.new_room.objects.length,
    exit_count: response.new_room.exits.length,
  });

  return response.new_room;
}
