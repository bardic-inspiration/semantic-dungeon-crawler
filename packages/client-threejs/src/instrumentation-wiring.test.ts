// SPEC §2.1 / §5.2 / §6.7 — the Three.js adapter's session-bootstrap and
// interaction/sync flows report through the §2.1 `Logger`/`Metrics` side channel.
//
// Three guarantees under test: (1) an injected sink actually sees the flows'
// events/metrics; (2) the debug-verbosity flag gates the `debug`-level events —
// on emits them, off emits none (gate-before-construct, §4.6); (3) the side
// channel is non-interfering — the same scene/session/room results whether it is
// wired or fully noop (INV-2), and nothing it records is sent back to the server
// (INV-3).

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Entity, InteractResponse, ResolvedRoomResponse } from "schema";
import {
  bootstrapSession,
  type RoomApiClient,
  type SessionHandle,
} from "./session-bootstrap";
import {
  handleClick,
  InteractionSystem,
  type ClickContext,
} from "./interaction";
import { SyncSystem } from "./sync";
import {
  CollectingLogger,
  InMemoryMetrics,
  makeInstrumentation,
} from "./instrumentation";

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

const door = makeEntity("resolved:door:1", {
  archetype: "portal",
  affordances: ["enter"],
});

const room: ResolvedRoomResponse = {
  room: makeEntity("resolved:hall:0", { archetype: "container" }),
  objects: [door, makeEntity("resolved:book:2", { archetype: "readable" })],
  exits: [
    {
      target_entity_id: "query:north",
      via_object_id: "resolved:door:1",
      affordance_required: "enter",
      weight: 1,
    },
  ],
  resolution_status: "resolved",
};

function stubClient(): RoomApiClient {
  return {
    async newSession(seed?: number): Promise<SessionHandle> {
      return { session_id: "sess-1", seed: seed ?? 42 };
    },
    async roomCurrent(): Promise<ResolvedRoomResponse> {
      return room;
    },
    async interact(): Promise<InteractResponse> {
      return {
        new_room: room,
        transition_occurred: true,
        interaction_result: {},
      };
    },
  };
}

/** A scene where the door's Object3D is the sole raycast hit, so a click resolves. */
function sceneWithDoor(): {
  scene: THREE.Scene;
  camera: THREE.Camera;
  pointer: THREE.Vector2;
} {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.name = door.id;
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { scene, camera, pointer: new THREE.Vector2(0, 0) };
}

describe("bootstrapSession instrumentation (§2.1)", () => {
  it("reports bootstrap through an injected Logger/Metrics sink", async () => {
    const logger = new CollectingLogger();
    const metrics = new InMemoryMetrics();
    await bootstrapSession(stubClient(), {
      instrumentation: makeInstrumentation({ logger, metrics }),
    });

    const events = logger.entries.map((e) => e.event);
    expect(events).toContain("session.bootstrap.start");
    expect(events).toContain("session.bootstrap.ready");
    const snap = metrics.snapshot();
    expect(snap.counters["session.bootstrap.count"]).toBe(1);
    expect(snap.gauges["room.object_count"]).toBe(room.objects.length);
    expect(snap.gauges["room.exit_count"]).toBe(room.exits.length);
  });

  it("gates the debug room event on the debug flag (gate-before-construct, §4.6)", async () => {
    const off = new CollectingLogger();
    await bootstrapSession(stubClient(), {
      instrumentation: makeInstrumentation({ logger: off }),
    });
    expect(off.entries.some((e) => e.level === "debug")).toBe(false);

    const on = new CollectingLogger();
    await bootstrapSession(stubClient(), {
      instrumentation: makeInstrumentation({ logger: on, debug: true }),
    });
    expect(on.entries.some((e) => e.event === "session.room.rendered")).toBe(
      true,
    );
  });

  it("is non-interfering — the rendered scene is identical with vs without a sink (INV-2)", async () => {
    const plain = await bootstrapSession(stubClient());
    const instrumented = await bootstrapSession(stubClient(), {
      instrumentation: makeInstrumentation({
        logger: new CollectingLogger(),
        metrics: new InMemoryMetrics(),
        debug: true,
      }),
    });
    expect(instrumented.scene.children.map((c) => c.name).sort()).toEqual(
      plain.scene.children.map((c) => c.name).sort(),
    );
    expect(instrumented.room).toEqual(plain.room);
  });
});

describe("interaction/sync instrumentation (§2.1)", () => {
  function ctx(over: Partial<ClickContext> = {}): ClickContext {
    const { scene, camera, pointer } = sceneWithDoor();
    return {
      client: stubClient(),
      sessionId: "sess-1",
      scene,
      camera,
      room,
      pointer,
      ...over,
    };
  }

  it("counts a resolved click and its transition through the injected Metrics", async () => {
    const logger = new CollectingLogger();
    const metrics = new InMemoryMetrics();
    await handleClick(
      ctx({
        instrumentation: makeInstrumentation({ logger, metrics, debug: true }),
      }),
    );
    const snap = metrics.snapshot();
    expect(snap.counters["interact.clicks"]).toBe(1);
    expect(snap.counters["interact.count"]).toBe(1);
    expect(snap.counters["interact.transitions"]).toBe(1);
    expect(snap.counters["sync.rerender.count"]).toBe(1);
    expect(logger.entries.some((e) => e.event === "interact.resolved")).toBe(
      true,
    );
  });

  it("counts an inert click (hit an object with no exit) without an interact call", async () => {
    const metrics = new InMemoryMetrics();
    // A room whose only object triggers no exit ⇒ actionForObject returns null.
    const inertRoom: ResolvedRoomResponse = { ...room, exits: [] };
    const response = await InteractionSystem(
      ctx({
        room: inertRoom,
        instrumentation: makeInstrumentation({ metrics }),
      }),
    );
    expect(response).toBeNull();
    const snap = metrics.snapshot();
    expect(snap.counters["interact.clicks"]).toBe(1);
    expect(snap.counters["interact.inert"]).toBe(1);
    expect(snap.counters["interact.count"]).toBeUndefined();
  });

  it("gates interact debug events on the debug flag (§4.6)", async () => {
    const off = new CollectingLogger();
    await handleClick(
      ctx({ instrumentation: makeInstrumentation({ logger: off }) }),
    );
    expect(off.entries.some((e) => e.level === "debug")).toBe(false);
  });

  it("SyncSystem re-renders identically with vs without a sink (INV-2)", () => {
    const response: InteractResponse = {
      new_room: room,
      transition_occurred: false,
      interaction_result: {},
    };
    const plain = new THREE.Scene();
    SyncSystem(plain, response);
    const withSink = new THREE.Scene();
    SyncSystem(
      withSink,
      response,
      makeInstrumentation({
        metrics: new InMemoryMetrics(),
        logger: new CollectingLogger(),
        debug: true,
      }),
    );
    expect(withSink.children.map((c) => c.name).sort()).toEqual(
      plain.children.map((c) => c.name).sort(),
    );
  });
});
