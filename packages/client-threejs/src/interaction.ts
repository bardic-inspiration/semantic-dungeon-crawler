// packages/client-threejs/src/interaction.ts
//
// SPEC §5.2 / §6.6 — the `InteractionSystem` and the click pipeline that completes
// the minimum-viable movement loop: raycast on click → resolve the target entity
// id + affordance → `POST /interact` → hand the result to the `SyncSystem` for a
// re-render. This is the piece that lets a player click a door and walk through it.
//
// INV-3 is the hard boundary here: the client makes NO movement decision. It never
// inspects rules or reconstructs a graph — it reads the room's server-computed
// `exits` (§3.2) to learn which `object_id` + `affordance` triggers a transition,
// echoes exactly that back over `POST /interact`, and renders whatever room the
// server resolves. Clicking a non-exit object resolves to nothing, client-side.

import * as THREE from "three";
import type {
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import type { RoomApiClient } from "./session-bootstrap";
import { SyncSystem } from "./sync";

/**
 * Raycast a click into `scene` and return the entity id of the nearest hit
 * Object3D — the `Object3D.name` `populateScene` stamped with the entity's id — or
 * `null` when the ray hits nothing. `pointer` is in normalized device coordinates
 * (x/y each in [-1, 1]), the shape `Raycaster.setFromCamera` expects. The raycaster
 * is injectable so a caller can reuse one across clicks.
 */
export function pickEntityId(
  scene: THREE.Scene,
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  raycaster: THREE.Raycaster = new THREE.Raycaster(),
): string | null {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    // Walk up to the named entity Object3D — a hit may land on a child mesh of a
    // grouped archetype, but only the top-level object carries the entity id.
    let node: THREE.Object3D | null = hit.object;
    while (node !== null && node.name === "") node = node.parent;
    if (node !== null && node.name !== "") return node.name;
  }
  return null;
}

/**
 * Map a clicked object id to the interaction to POST, using the room's resolved
 * `exits` (§3.2) as the sole authority (INV-3): an exit names the `via_object_id`
 * that triggers it and the `affordance_required` to send. Returns the
 * `{ object_id, affordance }` action for the first exit through `objectId`, or
 * `null` when the object triggers no transition (e.g. the room shell, or a prop
 * with no movement affordance — non-`enter`/`traverse` verbs are out of scope for
 * the minimum-viable loop, #150).
 */
export function actionForObject(
  room: ResolvedRoomResponse,
  objectId: string,
): InteractRequest["action"] | null {
  const exit = room.exits.find((e) => e.via_object_id === objectId);
  if (exit === undefined) return null;
  return { object_id: objectId, affordance: exit.affordance_required };
}

/** What {@link InteractionSystem} and {@link handleClick} need to resolve a click. */
export interface ClickContext {
  /** The §5.1 surface to POST the interaction to. */
  client: RoomApiClient;
  /** The session the click belongs to (`GET /session/new`). */
  sessionId: string;
  /** The rendered scene to raycast against. */
  scene: THREE.Scene;
  /** The camera the scene is viewed through — raycasting is camera-relative. */
  camera: THREE.Camera;
  /** The current resolved room, whose `exits` say which clicks trigger a move. */
  room: ResolvedRoomResponse;
  /** The click position in normalized device coordinates (x/y in [-1, 1]). */
  pointer: THREE.Vector2;
  /** Optional raycaster to reuse across clicks. */
  raycaster?: THREE.Raycaster;
}

/**
 * SPEC §5.2 `InteractionSystem`: raycast the click, resolve the target entity id +
 * affordance, and `POST /interact`. Returns the server's {@link InteractResponse},
 * or `null` when the click resolved to no interaction (hit nothing, or hit an
 * object that triggers no transition) — so no request is sent for an inert click.
 */
export async function InteractionSystem(
  ctx: ClickContext,
): Promise<InteractResponse | null> {
  const entityId = pickEntityId(
    ctx.scene,
    ctx.camera,
    ctx.pointer,
    ctx.raycaster,
  );
  if (entityId === null) return null;
  const action = actionForObject(ctx.room, entityId);
  if (action === null) return null;
  return ctx.client.interact({ session_id: ctx.sessionId, action });
}

/**
 * The full §5.2 click pipeline: {@link InteractionSystem} → {@link SyncSystem}.
 * Raycasts the click, POSTs the interaction, and re-renders `ctx.scene` in place
 * to the room the server returns — the render → click → transition loop (§6.6).
 * Returns the {@link InteractResponse} (whose `new_room` is now on screen and
 * should become the caller's current room), or `null` for an inert click that
 * triggered no interaction and left the scene unchanged.
 */
export async function handleClick(
  ctx: ClickContext,
): Promise<InteractResponse | null> {
  const response = await InteractionSystem(ctx);
  if (response === null) return null;
  SyncSystem(ctx.scene, response);
  return response;
}
