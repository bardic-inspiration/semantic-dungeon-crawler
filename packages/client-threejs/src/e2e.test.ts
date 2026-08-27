// SPEC §6.6 / §5.1 / §5.2 — the Three.js adapter's minimum-viable movement loop end
// to end against a LIVE Phase 4 server: `GET /session/new` → `GET /room/current` →
// render → click → `POST /interact` → re-render the transition. This is the §6.6
// exit criterion ("a player can see a rendered room, click an object with an
// enter/traverse affordance, and observe a room transition") exercised over real
// HTTP, not a stub.
//
// `server` is a TEST-ONLY dependency (client-threejs/devDependencies): the adapter
// itself speaks only §5.1 over HTTP (INV-3) — the import merely stands up the real
// product server so the loop is driven over the wire. Nothing in `src/*` imports it.

import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { Ruleset } from "schema";
import { createHttpServer, type HttpServer, type ServerConfig } from "server";
import { handleClick } from "./interaction";
import { bootstrapSession, httpRoomClient } from "./session-bootstrap";

// Substrate types derived from the server's OWN config type, so this test — like
// the client it exercises — names no `rule-engine`/`corpus-builder` symbol (INV-3).
type GraphSpan = ServerConfig["substrate"]["spans"][number];
type SubstrateSpanView = GraphSpan["span"];

function makeSpan(
  id: string,
  over: Partial<SubstrateSpanView> = {},
): SubstrateSpanView {
  return {
    id: `vec:${id}`,
    semantic_tags: [],
    archetype: "prop",
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
    ...over,
  };
}

const RULESET: Ruleset = {
  spec_version: "0.1.0",
  layers: [],
  interpretation_lookup: {
    by_archetype: {
      container: {
        layout_hint: { scale: "large", density: 1, shape_bias: "" },
      },
    },
  },
};

function substrate(): GraphSpan[] {
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    { span: makeSpan("a", { archetype: "portal" }), embedding: [0.99, 0.14] },
    { span: makeSpan("b", { archetype: "portal" }), embedding: [0.95, 0.31] },
  ];
}

function startServer(
  over: Partial<Parameters<typeof createHttpServer>[0]> = {},
) {
  return createHttpServer({
    ruleset: RULESET,
    substrate: { spans: substrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  });
}

let running: HttpServer | undefined;
afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

async function baseUrlOf(server: HttpServer): Promise<string> {
  const { host, port } = await server.listen(0);
  return `http://${host}:${port}`;
}

describe("§6.6 live render → click → transition", () => {
  it("renders the live room, then a click POSTs /interact and re-renders", async () => {
    running = startServer();
    const client = httpRoomClient(await baseUrlOf(running));

    // Render: GET /session/new → GET /room/current → scene (room shell + objects).
    const { session, room, scene } = await bootstrapSession(client, {
      seed: 42,
    });
    expect(scene.getObjectByName(room.room.id)).toBeDefined();
    expect(scene.children.length).toBe(1 + room.objects.length);
    // The starting room offers at least one legal transition to click.
    expect(room.exits.length).toBeGreaterThan(0);

    // Click: a solid stand-in named after the exit's real trigger object, so the
    // raycast is unambiguous (picking archetype geometry is covered by the unit
    // tests). The interaction is resolved by the real server over POST /interact.
    const exit = room.exits[0]!;
    const clickScene = new THREE.Scene();
    const target = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial(),
    );
    target.name = exit.via_object_id;
    clickScene.add(target);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const response = await handleClick({
      client,
      sessionId: session.session_id,
      scene: clickScene,
      camera,
      room,
      pointer: new THREE.Vector2(0, 0),
    });

    // The server resolved the interaction into a room transition — a different
    // room than the one we started in — and the scene re-rendered to it.
    expect(response).not.toBeNull();
    expect(response!.transition_occurred).toBe(true);
    expect(response!.new_room.room.id).not.toBe(room.room.id);
    const names = clickScene.children.map((c) => c.name).sort();
    const expected = [
      response!.new_room.room.id,
      ...response!.new_room.objects.map((o) => o.id),
    ].sort();
    expect(names).toEqual(expected);
  });

  it("replays the click loop byte-identically for the same seed (INV-2)", async () => {
    running = startServer();
    const base = await baseUrlOf(running);

    const runOnce = async (): Promise<string> => {
      const client = httpRoomClient(base);
      const { session, room } = await bootstrapSession(client, { seed: 42 });
      const exit = room.exits[0]!;
      const scene = new THREE.Scene();
      const target = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial(),
      );
      target.name = exit.via_object_id;
      scene.add(target);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const response = await handleClick({
        client,
        sessionId: session.session_id,
        scene,
        camera,
        room,
        pointer: new THREE.Vector2(0, 0),
      });
      return JSON.stringify(response?.new_room);
    };

    const first = await runOnce();
    const second = await runOnce();
    // Same seed + same input ⇒ byte-identical re-resolution (INV-2 replay).
    expect(second).toBe(first);
    expect(first).not.toBe("undefined");
  });
});
