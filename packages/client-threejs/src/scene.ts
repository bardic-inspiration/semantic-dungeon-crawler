// packages/client-threejs/src/scene.ts
//
// SPEC §5.2 / §6.6 — assemble a `THREE.Scene` from a single `ResolvedRoomResponse`
// by driving the two §5.2 systems: `MeshResolutionSystem` turns each entity's
// archetype into an Object3D, and `LayoutSystem` positions the objects using the
// container room's `layout_hint`. This is the "render room + objects" step of the
// §6.6 minimum viable scene. `populateScene`/`clearScene` factor the same build so
// the `SyncSystem` (#150) can re-run it in place after a click transition.
//
// The whole path consumes resolved JSON only (INV-3): it reads the room and its
// resolved objects, and nothing about embeddings, the index, or rule definitions.

import * as THREE from "three";
import type { ResolvedRoomResponse } from "schema";
import { LayoutSystem } from "./layout-system";
import { MeshResolutionSystem } from "./mesh-resolution-system";

/**
 * Populate `scene` with a resolved room: the container room at the origin plus one
 * positioned Object3D per resolved object. Each object's id is copied onto its
 * `Object3D.name` so the `InteractionSystem` (#150) can map a raycast hit back to
 * the entity id it must echo to the server (§5.2). Adds to whatever `scene` already
 * holds — call {@link clearScene} first to re-render a transition into it.
 */
export function populateScene(
  scene: THREE.Scene,
  resolved: ResolvedRoomResponse,
): void {
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
}

/**
 * Remove and dispose everything in `scene`, so it can be repopulated with a fresh
 * room (the `SyncSystem` re-render after a transition, #150). Geometries and
 * materials are freed because they hold GPU resources the garbage collector can't
 * reclaim on its own; the `Scene` instance itself is kept so a live renderer's
 * reference stays valid across the transition.
 */
export function clearScene(scene: THREE.Scene): void {
  for (const child of [...scene.children]) {
    scene.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
  }
}

/**
 * Build a fresh `THREE.Scene` for a resolved room — the offline, hand-fed render
 * path (§5.2 / §6.6). A thin wrapper over {@link populateScene} on a new scene.
 */
export function renderRoom(resolved: ResolvedRoomResponse): THREE.Scene {
  const scene = new THREE.Scene();
  populateScene(scene, resolved);
  return scene;
}
