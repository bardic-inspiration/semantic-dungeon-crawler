// SPEC §5.2 / §6.6 — the `SyncSystem` re-renders a scene in place from a click's
// `InteractResponse`, showing the room transition (new objects render, matching a
// fresh `ResolvedRoomResponse`). Runs on the same `THREE.Scene` instance and frees
// the outgoing room's GPU resources.

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Entity, InteractResponse, ResolvedRoomResponse } from "schema";
import { renderRoom } from "./scene";
import { SyncSystem } from "./sync";

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

const startRoom: ResolvedRoomResponse = {
  room: makeEntity("resolved:hall:0", { archetype: "container" }),
  objects: [
    makeEntity("resolved:door:1", {
      archetype: "portal",
      affordances: ["enter"],
    }),
    makeEntity("resolved:book:2", { archetype: "readable" }),
  ],
  exits: [],
  resolution_status: "resolved",
};

const nextRoom: ResolvedRoomResponse = {
  room: makeEntity("resolved:vault:0", { archetype: "container" }),
  objects: [makeEntity("resolved:chest:9", { archetype: "prop" })],
  exits: [],
  resolution_status: "resolved",
};

function response(new_room: ResolvedRoomResponse): InteractResponse {
  return { new_room, transition_occurred: true, interaction_result: {} };
}

describe("SyncSystem (§5.2 / §6.6)", () => {
  it("re-renders the scene in place to the transition's new room", () => {
    const scene = renderRoom(startRoom);
    SyncSystem(scene, response(nextRoom));
    const names = scene.children.map((c) => c.name).sort();
    expect(names).toEqual(["resolved:vault:0", "resolved:chest:9"].sort());
    // The outgoing room's objects are gone — this is a transition, not an overlay.
    expect(scene.getObjectByName("resolved:door:1")).toBeUndefined();
  });

  it("keeps the same Scene instance so a live renderer's reference survives", () => {
    const scene = renderRoom(startRoom);
    const returned = SyncSystem(scene, response(nextRoom));
    // Same object identity, repopulated in place (1 room shell + 1 object).
    expect(scene.children.length).toBe(1 + nextRoom.objects.length);
    // Returns the rendered room so it can become the caller's current room.
    expect(returned).toBe(nextRoom);
  });

  it("disposes the outgoing room's geometry and material (no GPU leak)", () => {
    const scene = renderRoom(startRoom);
    const door = scene.getObjectByName("resolved:door:1") as THREE.Mesh;
    const disposeGeometry = vi.spyOn(door.geometry, "dispose");
    const disposeMaterial = vi.spyOn(
      door.material as THREE.Material,
      "dispose",
    );
    SyncSystem(scene, response(nextRoom));
    expect(disposeGeometry).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
  });

  it("re-renders faithfully for a local (non-movement) interaction", () => {
    // transition_occurred: false still returns a full re-resolution (§3.3); the
    // scene must match `new_room` exactly — here, the same room re-resolved.
    const scene = renderRoom(startRoom);
    SyncSystem(scene, {
      new_room: startRoom,
      transition_occurred: false,
      interaction_result: { text: "you read the book" },
    });
    expect(scene.children.length).toBe(1 + startRoom.objects.length);
    expect(scene.getObjectByName("resolved:hall:0")).toBeDefined();
  });
});
