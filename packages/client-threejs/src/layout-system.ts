// packages/client-threejs/src/layout-system.ts
//
// SPEC §5.2 — `LayoutSystem`, the pure `(Entity[], layout_hint) → Map<id,
// THREE.Vector3>` mapping. This is "the primary creative surface for adapter
// authors — same schema, different LayoutSystem = different spatial feel": it
// reads only the resolved entities and the container's `layout_hint` and returns
// a target position per entity id, computing nothing about movement or rules
// (INV-3).
//
// Determinism (INV-2): positions are a pure function of the inputs — entities are
// ordered by salience (id tie-break) and placement uses only that order plus a
// stable hash of the id, never `Math.random`/`Date.now`. Same inputs ⇒ identical
// positions, so a replayed session lays out byte-for-byte the same.

import * as THREE from "three";
import type { Entity, LayoutHint } from "schema";

/** Base placement radius / spacing per `layout_hint.scale` (SPEC §3.1). */
const SCALE_EXTENT: Record<LayoutHint["scale"], number> = {
  small: 2,
  medium: 4,
  large: 6,
};

/**
 * A stable 32-bit FNV-1a hash of a string, used to derive deterministic
 * scatter offsets from an entity id (INV-2 — no unseeded randomness).
 */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Map a 32-bit hash to a signed unit fraction in [-1, 1). */
function signedUnit(hash: number): number {
  return (hash >>> 0) / 0x80000000 - 1;
}

/**
 * Place one entity given its position in the salience-ordered list and the
 * container's layout hint. `shape_bias` (SPEC §3.1, an open, adapter-interpreted
 * string) selects the arrangement; `density` widens or tightens the spread.
 */
function placeEntity(
  entity: Entity,
  index: number,
  count: number,
  hint: LayoutHint,
): THREE.Vector3 {
  const extent = SCALE_EXTENT[hint.scale] * (0.5 + hint.density);

  switch (hint.shape_bias) {
    case "radial": {
      // Evenly spaced on a circle in the XZ ground plane.
      const angle = count === 0 ? 0 : (2 * Math.PI * index) / count;
      return new THREE.Vector3(
        Math.cos(angle) * extent,
        0,
        Math.sin(angle) * extent,
      );
    }
    case "vertical": {
      // Stacked upward, most-salient (index 0) at the base.
      return new THREE.Vector3(0, index * (0.5 + hint.density), 0);
    }
    case "scatter": {
      // Deterministic pseudo-scatter in the ground plane from the id hash.
      const hash = hashId(entity.id);
      const x = signedUnit(hash) * extent;
      const z = signedUnit(Math.imul(hash, 0x01000193) >>> 0) * extent;
      return new THREE.Vector3(x, 0, z);
    }
    default: {
      // Row-major grid in the ground plane — the neutral fallback for any
      // other (author-defined) `shape_bias`.
      const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
      const spacing = 1 + hint.density;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const offset = (columns - 1) / 2;
      return new THREE.Vector3((column - offset) * spacing, 0, row * spacing);
    }
  }
}

/**
 * SPEC §5.2 `LayoutSystem`: pure mapping from the resolved entities and the
 * container's `layout_hint` to a target position per entity id. Entities are
 * placed in salience-descending order (id tie-break) so the arrangement is fully
 * deterministic regardless of the order the server emitted them in (INV-2).
 */
export function LayoutSystem(
  entities: readonly Entity[],
  layoutHint: LayoutHint,
): Map<string, THREE.Vector3> {
  const ordered = [...entities].sort(
    (a, b) =>
      b.salience - a.salience || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const positions = new Map<string, THREE.Vector3>();
  ordered.forEach((entity, index) => {
    positions.set(
      entity.id,
      placeEntity(entity, index, ordered.length, layoutHint),
    );
  });
  return positions;
}
