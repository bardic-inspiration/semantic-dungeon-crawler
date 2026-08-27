// packages/client-threejs/src/scene.ts
//
// SPEC §5.2 / §6.6 — assemble a `THREE.Scene` from a single `ResolvedRoomResponse`
// by driving the two §5.2 systems: `MeshResolutionSystem` turns each entity's
// archetype into an Object3D, and `LayoutSystem` positions the objects using the
// container room's `layout_hint`. This is the "render room + objects" step of the
// §6.6 minimum viable scene, done offline from a hand-fed payload — no server,
// no interaction yet (session bootstrap is #149, click transitions are #150).
//
// The whole path consumes resolved JSON only (INV-3): it reads the room and its
// resolved objects, and nothing about embeddings, the index, or rule definitions.

import * as THREE from "three";
import type { ResolvedRoomResponse } from "schema";
import { LayoutSystem } from "./layout-system";
import { MeshResolutionSystem } from "./mesh-resolution-system";

/**
 * Build a `THREE.Scene` for a resolved room: the container room at the origin
 * plus one positioned Object3D per resolved object. Each object's id is copied
 * onto its `Object3D.name` so a later `InteractionSystem` (#150) can map a
 * raycast hit back to the entity id it must echo to the server (§5.2).
 */
export function renderRoom(resolved: ResolvedRoomResponse): THREE.Scene {
  const scene = new THREE.Scene();

  // The room is a container entity; render its shell at the origin (§5.2).
  const roomObject = MeshResolutionSystem(
    resolved.room.archetype,
    resolved.room.semantic_tags,
  );
  roomObject.name = resolved.room.id;
  scene.add(roomObject);

  // Objects are laid out by the room's `layout_hint` (§5.2 LayoutSystem).
  const positions = LayoutSystem(resolved.objects, resolved.room.layout_hint);
  for (const object of resolved.objects) {
    const objectMesh = MeshResolutionSystem(
      object.archetype,
      object.semantic_tags,
    );
    objectMesh.name = object.id;
    const position = positions.get(object.id);
    if (position !== undefined) objectMesh.position.copy(position);
    scene.add(objectMesh);
  }

  return scene;
}
