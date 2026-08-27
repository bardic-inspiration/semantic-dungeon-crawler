// SPEC §5.2 / §6.6 — the click pipeline: raycast a click → map the hit to a
// movement action from the room's `exits` (INV-3) → `POST /interact` → re-render.
// Raycast picking is tested with solid boxes at known positions so the geometry is
// unambiguous; the archetype→shape mapping itself lives in mesh-resolution-system.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type {
  Entity,
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import {
  actionForObject,
  handleClick,
  InteractionSystem,
  pickEntityId,
  type ClickContext,
} from "./interaction";
import type { RoomApiClient, SessionHandle } from "./session-bootstrap";

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

/** A room whose one exit is triggered by clicking `door` with `enter`. */
const room: ResolvedRoomResponse = {
  room: makeEntity("resolved:hall:0", { archetype: "container" }),
  objects: [
    makeEntity("door", { archetype: "portal", affordances: ["enter"] }),
    makeEntity("book", { archetype: "readable", affordances: ["read"] }),
  ],
  exits: [
    {
      target_entity_id: "resolved:vault:0",
      affordance_required: "enter",
      via_object_id: "door",
      weight: 1,
    },
  ],
  resolution_status: "resolved",
};

const nextRoom: ResolvedRoomResponse = {
  room: makeEntity("resolved:vault:0", { archetype: "container" }),
  objects: [makeEntity("chest", { archetype: "prop" })],
  exits: [],
  resolution_status: "resolved",
};

/** A stub §5.1 client that records the interaction it was asked to POST. */
function stubClient(
  response: InteractResponse = {
    new_room: nextRoom,
    transition_occurred: true,
    interaction_result: {},
  },
): RoomApiClient & { readonly requests: InteractRequest[] } {
  const requests: InteractRequest[] = [];
  return {
    requests,
    async newSession(seed?: number): Promise<SessionHandle> {
      return { session_id: "sess-1", seed: seed ?? 42 };
    },
    async roomCurrent(): Promise<ResolvedRoomResponse> {
      return room;
    },
    async interact(request: InteractRequest): Promise<InteractResponse> {
      requests.push(request);
      return response;
    },
  };
}

/**
 * A scene holding one solid box named `name` at the origin, viewed by a camera on
 * +Z looking at it. A click at screen center (NDC 0,0) raycasts straight onto the
 * box, so picking is deterministic regardless of archetype shape.
 */
function boxSceneLookingAt(name: string): {
  scene: THREE.Scene;
  camera: THREE.Camera;
} {
  const scene = new THREE.Scene();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial(),
  );
  box.name = name;
  scene.add(box);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { scene, camera };
}

const CENTER = new THREE.Vector2(0, 0);

describe("actionForObject (§3.2 / INV-3)", () => {
  it("maps an exit's via_object_id to its { object_id, affordance }", () => {
    expect(actionForObject(room, "door")).toEqual({
      object_id: "door",
      affordance: "enter",
    });
  });

  it("returns null for an object that triggers no exit (non-movement click)", () => {
    expect(actionForObject(room, "book")).toBeNull();
  });

  it("returns null for the room shell itself", () => {
    expect(actionForObject(room, "resolved:hall:0")).toBeNull();
  });
});

describe("pickEntityId (§5.2 raycast)", () => {
  it("returns the entity id of the object under the click", () => {
    const { scene, camera } = boxSceneLookingAt("door");
    expect(pickEntityId(scene, camera, CENTER)).toBe("door");
  });

  it("returns null when the ray hits nothing", () => {
    const { scene, camera } = boxSceneLookingAt("door");
    // A corner of the NDC frame — off the box entirely.
    expect(
      pickEntityId(scene, camera, new THREE.Vector2(0.95, 0.95)),
    ).toBeNull();
  });

  it("returns the nearest object when the ray passes through two", () => {
    const scene = new THREE.Scene();
    const near = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial(),
    );
    near.name = "near";
    near.position.set(0, 0, 2);
    const far = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial(),
    );
    far.name = "far";
    far.position.set(0, 0, -2);
    scene.add(near, far);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(pickEntityId(scene, camera, CENTER)).toBe("near");
  });
});

describe("InteractionSystem (§5.2)", () => {
  it("raycasts a click on an enterable object and POSTs the interaction", async () => {
    const { scene, camera } = boxSceneLookingAt("door");
    const client = stubClient();
    const ctx: ClickContext = {
      client,
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer: CENTER,
    };
    const response = await InteractionSystem(ctx);
    expect(client.requests).toEqual([
      {
        session_id: "sess-1",
        action: { object_id: "door", affordance: "enter" },
      },
    ]);
    expect(response?.new_room.room.id).toBe("resolved:vault:0");
  });

  it("sends nothing when the click hits an object with no exit", async () => {
    const { scene, camera } = boxSceneLookingAt("book");
    const client = stubClient();
    const response = await InteractionSystem({
      client,
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer: CENTER,
    });
    expect(response).toBeNull();
    expect(client.requests).toEqual([]);
  });

  it("sends nothing when the click hits empty space", async () => {
    const { scene, camera } = boxSceneLookingAt("door");
    const client = stubClient();
    const response = await InteractionSystem({
      client,
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer: new THREE.Vector2(0.95, 0.95),
    });
    expect(response).toBeNull();
    expect(client.requests).toEqual([]);
  });
});

describe("handleClick — the full render → click → transition pipeline (§6.6)", () => {
  it("POSTs the interaction and re-renders the scene to the new room", async () => {
    const { scene, camera } = boxSceneLookingAt("door");
    const client = stubClient();
    const response = await handleClick({
      client,
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer: CENTER,
    });
    // The interaction was sent…
    expect(client.requests[0]?.action.object_id).toBe("door");
    // …and the scene now shows the destination room, not the door.
    const names = scene.children.map((c) => c.name).sort();
    expect(names).toEqual(["resolved:vault:0", "chest"].sort());
    expect(response?.new_room).toBe(nextRoom);
  });

  it("leaves the scene untouched for an inert click", async () => {
    const { scene, camera } = boxSceneLookingAt("book");
    const before = scene.children.map((c) => c.name);
    const client = stubClient();
    const response = await handleClick({
      client,
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer: CENTER,
    });
    expect(response).toBeNull();
    expect(scene.children.map((c) => c.name)).toEqual(before);
    expect(client.requests).toEqual([]);
  });
});
