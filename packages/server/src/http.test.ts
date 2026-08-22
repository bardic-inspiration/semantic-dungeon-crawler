// SPEC §5.1 / §0.11.0 (C3) — the real `node:http` transport for the Phase 4
// scaffold. `server.test.ts` proves the request-handling contract against the pure
// handler; this proves the same contract holds end-to-end over a socket, and that
// the server binds to localhost (C3: single-user, local, trusted-operator).

import { describe, it, expect, afterEach } from "vitest";
import type { Entity, Ruleset } from "schema";
import type { GraphSpan } from "rule-engine";
import { createHttpServer, type HttpServer } from "./http";

function makeEntity(id: string, over: Partial<Entity> = {}): Entity {
  return {
    id,
    archetype: "prop",
    semantic_tags: [],
    embedding_ref: `vec:${id}`,
    affordances: [],
    salience: 0.5,
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    contains: [],
    layout_hint: { scale: "medium", density: 0.5, shape_bias: "" },
    state: { local_coherence: 0.5, visited: false },
    ...over,
  };
}

const RULESET: Ruleset = { spec_version: "0.1.0", layers: [] };

function substrate(): GraphSpan[] {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  return [
    { entity: room, embedding: [1, 0] },
    {
      entity: makeEntity("a", { affordances: ["traverse"] }),
      embedding: [0.99, 0.14],
    },
  ];
}

let running: HttpServer | undefined;

afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

describe("createHttpServer (§5.1, C3)", () => {
  it("serves the session/room happy path over HTTP, bound to localhost", async () => {
    running = createHttpServer({
      ruleset: RULESET,
      substrate: { spans: substrate(), start_ref: "vec:origin" },
      newSeed: () => 7,
    });
    const { host, port } = await running.listen(0);
    expect(host).toBe("127.0.0.1");

    const base = `http://${host}:${port}`;
    const newRes = await fetch(`${base}/session/new?seed=42`);
    expect(newRes.status).toBe(200);
    expect(newRes.headers.get("content-type")).toBe("application/json");
    expect(newRes.headers.get("x-spec-version")).toBe("0.1.0");
    const { session_id } = (await newRes.json()) as { session_id: string };

    const roomRes = await fetch(
      `${base}/room/current?session_id=${session_id}`,
    );
    expect(roomRes.status).toBe(200);
    expect(roomRes.headers.get("x-spec-version")).toBe("0.1.0");
    const room = (await roomRes.json()) as {
      room: Entity;
      resolution_status: string;
    };
    expect(room.room.embedding_ref).toBe("vec:origin");
    expect(room.resolution_status).toBe("resolved");
  });

  it("routes a POST /interact body through the transport into an InteractResponse", async () => {
    running = createHttpServer({
      ruleset: RULESET,
      substrate: { spans: substrate(), start_ref: "vec:origin" },
      newSeed: () => 7,
    });
    const { host, port } = await running.listen(0);
    const base = `http://${host}:${port}`;

    const { session_id } = (await (
      await fetch(`${base}/session/new?seed=42`)
    ).json()) as { session_id: string };
    const { exits } = (await (
      await fetch(`${base}/room/current?session_id=${session_id}`)
    ).json()) as {
      exits: { via_object_id: string; affordance_required: string }[];
    };

    const res = await fetch(`${base}/interact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id,
        action: {
          object_id: exits[0]!.via_object_id,
          affordance: exits[0]!.affordance_required,
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-spec-version")).toBe("0.1.0");
    const body = (await res.json()) as {
      new_room: { room: Entity };
      transition_occurred: boolean;
    };
    expect(typeof body.new_room.room.embedding_ref).toBe("string");
    expect(body.transition_occurred).toBe(true);
  });

  it("returns the 404 error envelope over HTTP for an unknown session", async () => {
    running = createHttpServer({
      ruleset: RULESET,
      substrate: { spans: substrate(), start_ref: "vec:origin" },
    });
    const { host, port } = await running.listen(0);
    const res = await fetch(
      `http://${host}:${port}/room/current?session_id=nope`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(typeof body.error.code).toBe("string");
  });
});
