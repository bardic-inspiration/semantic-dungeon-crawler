// packages/client-threejs/src/components.ts
//
// SPEC §5.2 — the "Components" row of the ECS mapping for the Three.js reference
// adapter: a plain object keyed by entity id holding a DIRECT COPY of the schema
// fields the renderer draws from — `{ archetype, semantic_tags, affordances,
// salience, layout_hint, state }` — with no client-side reinterpretation.
//
// This is resolved output only (INV-3): the component copies exactly the
// `ResolvedRoomResponse` entity fields and never reconstructs graph structure,
// embeddings, or rule definitions client-side (SPEC §5.2 "Adapter MUST NOT").

import type {
  Affordance,
  Archetype,
  Entity,
  EntityState,
  LayoutHint,
  ResolvedRoomResponse,
} from "schema";

/**
 * The per-entity component bundle (SPEC §5.2). A verbatim projection of the
 * schema fields the adapter renders from — no derived or reinterpreted data.
 */
export interface Components {
  archetype: Archetype;
  semantic_tags: string[];
  affordances: Affordance[];
  salience: number;
  layout_hint: LayoutHint;
  state: EntityState;
}

/** The ECS component store: components keyed by `Entity.id` (SPEC §5.2). */
export type ComponentStore = Map<string, Components>;

/**
 * Project a resolved `Entity` onto its §5.2 component bundle. Arrays and nested
 * objects are shallow-copied so a later `SyncSystem` (Phase 5, #150) can mutate a
 * component without writing back through to the wire payload it came from.
 */
export function toComponents(entity: Entity): Components {
  return {
    archetype: entity.archetype,
    semantic_tags: [...entity.semantic_tags],
    affordances: [...entity.affordances],
    salience: entity.salience,
    layout_hint: { ...entity.layout_hint },
    state: { ...entity.state },
  };
}

/**
 * Build the component store for a whole `ResolvedRoomResponse` — the container
 * room plus its resolved objects — keyed by entity id (SPEC §5.2). The room is
 * an entity too, so it gets a component entry alongside the objects.
 */
export function buildComponentStore(
  resolved: ResolvedRoomResponse,
): ComponentStore {
  const store: ComponentStore = new Map();
  store.set(resolved.room.id, toComponents(resolved.room));
  for (const object of resolved.objects) {
    store.set(object.id, toComponents(object));
  }
  return store;
}
