// SPEC §5.2 / §6.6 — `renderRoom` assembles a scene from a single hand-fed
// `ResolvedRoomResponse`: the container room plus one positioned Object3D per
// resolved object. Server bootstrap (#149) and click transitions (#150) are out
// of scope here; the full fixtures/rooms/*.json sweep is #151.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Entity, ResolvedRoomResponse } from "schema";
import { renderRoom } from "./scene";

function makeEntity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    archetype: "prop",
    semantic_tags: ["object:token"],
    embedding_ref: "vec:0",
    affordances: ["inspect"],
    salience: 0.5,
    prose: "",
    source_span: { source: "test:0", char_ranges: "0-1" },
    contains: [],
    layout_hint: { scale: "small", density: 0.1, shape_bias: "scatter" },
    state: { local_coherence: 0.5, visited: false },
    ...overrides,
  };
}

const handFed: ResolvedRoomResponse = {
  room: makeEntity("resolved:hall:0", {
    archetype: "container",
    layout_hint: { scale: "medium", density: 0.4, shape_bias: "radial" },
  }),
  objects: [
    makeEntity("resolved:door:1", {
      archetype: "portal",
      affordances: ["enter"],
    }),
    makeEntity("resolved:book:2", { archetype: "readable", salience: 0.8 }),
  ],
  exits: [],
  resolution_status: "resolved",
};

describe("renderRoom (§5.2 / §6.6)", () => {
  it("renders a single hand-fed ResolvedRoomResponse without error", () => {
    expect(() => renderRoom(handFed)).not.toThrow();
  });

  it("produces a scene with the room plus one Object3D per object", () => {
    const scene = renderRoom(handFed);
    expect(scene).toBeInstanceOf(THREE.Scene);
    // 1 room shell + 2 objects.
    expect(scene.children.length).toBe(3);
  });

  it("names each Object3D with its entity id (for the later InteractionSystem)", () => {
    const scene = renderRoom(handFed);
    const names = scene.children.map((c) => c.name).sort();
    expect(names).toEqual(
      ["resolved:book:2", "resolved:door:1", "resolved:hall:0"].sort(),
    );
  });

  it("positions objects (not the room) via the LayoutSystem", () => {
    const scene = renderRoom(handFed);
    const room = scene.getObjectByName("resolved:hall:0")!;
    expect(room.position.toArray()).toEqual([0, 0, 0]);
    // With a radial container hint the two objects sit off the origin.
    const door = scene.getObjectByName("resolved:door:1")!;
    expect(Math.hypot(door.position.x, door.position.z)).toBeGreaterThan(0);
  });

  it("renders a near-empty room (no objects) — just the room shell", () => {
    const scene = renderRoom({ ...handFed, objects: [] });
    expect(scene.children.length).toBe(1);
  });

  it("renders one fixtures/rooms/*.json offline without error (§6.6 / §5.3)", () => {
    // A single fixture, server bypassed; the full sweep is #151.
    const path = fileURLToPath(
      new URL(
        "../../../fixtures/rooms/empty-antechamber.json",
        import.meta.url,
      ),
    );
    const fixture = JSON.parse(
      readFileSync(path, "utf8"),
    ) as ResolvedRoomResponse;
    expect(() => renderRoom(fixture)).not.toThrow();
    const scene = renderRoom(fixture);
    expect(scene.children.length).toBe(1 + fixture.objects.length);
  });
});
