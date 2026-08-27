// packages/client-threejs/src/mesh-resolution-system.ts
//
// SPEC §5.2 — `MeshResolutionSystem`, the pure `(archetype, semantic_tags) →
// THREE.Object3D` mapping: the "archetype → matter" lookup. It is an extensible
// lookup table keyed by `Entity.archetype` (SPEC §3.1), with a neutral fallback
// so an unknown/author-defined archetype still renders (archetype is an open
// union — §3.1). It consumes only resolved fields (INV-3): archetype and the
// entity's `semantic_tags`, never embeddings, ids into the graph, or rules.

import * as THREE from "three";
import type { Archetype } from "schema";

/** A factory for the base Object3D of one archetype. */
type MeshFactory = () => THREE.Object3D;

function mesh(geometry: THREE.BufferGeometry, color: number): THREE.Object3D {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
}

/**
 * The archetype → primitive lookup. A deliberately small, legible set of shapes
 * (a fork extends this table, not the engine): a container reads as an enclosing
 * shell, a portal as a ring, a readable as a slim slab, an actor as an upright
 * capsule, a prop as a small cube.
 */
const ARCHETYPE_MESHES: Record<string, MeshFactory> = {
  container: () => mesh(new THREE.BoxGeometry(8, 4, 8), 0x334455),
  portal: () => mesh(new THREE.TorusGeometry(0.8, 0.2, 8, 24), 0x8844cc),
  readable: () => mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), 0xccaa55),
  actor: () => mesh(new THREE.CapsuleGeometry(0.3, 1, 4, 8), 0xcc5544),
  prop: () => mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0x999999),
};

/** The fallback for any archetype not in the lookup (archetype is open — §3.1). */
const DEFAULT_MESH: MeshFactory = () =>
  mesh(new THREE.BoxGeometry(1, 1, 1), 0x777777);

/**
 * SPEC §5.2 `MeshResolutionSystem`: resolve an entity's archetype to a base
 * `THREE.Object3D`. The resolved `semantic_tags` are carried onto the object's
 * `userData` so an adapter author can drive further visual choices from them —
 * e.g. filtering tags by an author-defined rendering-hint modifier (SPEC §3.6.1)
 * — without this reference table having to know any specific tag.
 */
export function MeshResolutionSystem(
  archetype: Archetype,
  semanticTags: readonly string[],
): THREE.Object3D {
  const factory = ARCHETYPE_MESHES[archetype] ?? DEFAULT_MESH;
  const object = factory();
  object.userData.archetype = archetype;
  object.userData.semantic_tags = [...semanticTags];
  return object;
}
