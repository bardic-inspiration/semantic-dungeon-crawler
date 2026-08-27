// SPEC §5.1 / §5.2 / §6.6 — session bootstrap: drive `GET /session/new` then
// `GET /room/current` against the Phase 4 server and render the returned room via
// the #148 systems (`renderRoom`). Click interaction / transitions are #150; the
// full fixtures/rooms/*.json sweep is #151.

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type {
  Entity,
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import { NetworkFailureError } from "schema";
import {
  bootstrapSession,
  httpRoomClient,
  RoomApiError,
  type RoomApiClient,
  type SessionHandle,
} from "./session-bootstrap";

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

const room: ResolvedRoomResponse = {
  room: makeEntity("resolved:hall:0", {
    archetype: "container",
    layout_hint: { scale: "medium", density: 0.4, shape_bias: "radial" },
  }),
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

/** A `RoomApiClient` stub recording call order and the session id threaded through. */
function stubClient(): RoomApiClient & {
  readonly calls: string[];
  readonly seenSessionId: () => string | undefined;
} {
  const calls: string[] = [];
  let seenSessionId: string | undefined;
  return {
    calls,
    seenSessionId: () => seenSessionId,
    async newSession(seed?: number): Promise<SessionHandle> {
      calls.push(seed === undefined ? "newSession" : `newSession:${seed}`);
      return { session_id: "sess-1", seed: seed ?? 42 };
    },
    async roomCurrent(sessionId: string): Promise<ResolvedRoomResponse> {
      calls.push("roomCurrent");
      seenSessionId = sessionId;
      return room;
    },
    async interact(request: InteractRequest): Promise<InteractResponse> {
      calls.push("interact");
      seenSessionId = request.session_id;
      return {
        new_room: room,
        transition_occurred: true,
        interaction_result: {},
      };
    },
  };
}

describe("bootstrapSession (§5.1 / §5.2 / §6.6)", () => {
  it("calls GET /session/new then GET /room/current, in that order", async () => {
    const client = stubClient();
    await bootstrapSession(client);
    expect(client.calls).toEqual(["newSession", "roomCurrent"]);
  });

  it("threads the new session's id into the GET /room/current call", async () => {
    const client = stubClient();
    const result = await bootstrapSession(client);
    expect(result.session.session_id).toBe("sess-1");
    expect(client.seenSessionId()).toBe("sess-1");
  });

  it("renders the returned room via the #148 systems (room shell + one Object3D per object)", async () => {
    const client = stubClient();
    const { scene } = await bootstrapSession(client);
    expect(scene).toBeInstanceOf(THREE.Scene);
    // 1 room shell + 2 objects — the same projection renderRoom produces.
    expect(scene.children.length).toBe(1 + room.objects.length);
  });

  it("rendered content matches the ResolvedRoomResponse payload (room + objects)", async () => {
    const client = stubClient();
    const { scene, room: returned } = await bootstrapSession(client);
    const names = scene.children.map((c) => c.name).sort();
    const expected = [returned.room.id, ...returned.objects.map((o) => o.id)];
    expect(names).toEqual(expected.sort());
    // The container room sits at the origin; objects are laid out off it.
    expect(scene.getObjectByName(returned.room.id)!.position.toArray()).toEqual(
      [0, 0, 0],
    );
  });

  it("forwards an explicit seed to GET /session/new for replay (INV-2)", async () => {
    const client = stubClient();
    const { session } = await bootstrapSession(client, { seed: 7 });
    expect(client.calls[0]).toBe("newSession:7");
    expect(session.seed).toBe(7);
  });
});

describe("httpRoomClient (§5.1)", () => {
  function jsonResponse(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("GET /session/new returns the parsed { session_id, seed } handle", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { session_id: "s-9", seed: 3 }));
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    const handle = await client.newSession();
    expect(fetchStub).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/session/new",
      expect.objectContaining({ method: "GET" }),
    );
    expect(handle).toEqual({ session_id: "s-9", seed: 3 });
  });

  it("GET /session/new?seed= pins the seed when one is supplied", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { session_id: "s-9", seed: 11 }));
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    await client.newSession(11);
    expect(fetchStub).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/session/new?seed=11",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("GET /room/current sends the session id and returns the resolved room", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, room));
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    const resolved = await client.roomCurrent("sess-1");
    expect(fetchStub).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/room/current?session_id=sess-1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(resolved.room.id).toBe("resolved:hall:0");
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { session_id: "s-9", seed: 3 }));
    const client = httpRoomClient("http://127.0.0.1:8080/", {
      fetch: fetchStub,
    });
    await client.newSession();
    expect(fetchStub).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/session/new",
      expect.anything(),
    );
  });

  it("POST /interact sends the InteractRequest body and returns the InteractResponse", async () => {
    const response: InteractResponse = {
      new_room: room,
      transition_occurred: true,
      interaction_result: {},
    };
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, response));
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    const request: InteractRequest = {
      session_id: "sess-1",
      action: { object_id: "resolved:door:1", affordance: "enter" },
    };
    const result = await client.interact(request);
    expect(fetchStub).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/interact",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }),
    );
    expect(result.transition_occurred).toBe(true);
    expect(result.new_room.room.id).toBe("resolved:hall:0");
  });

  it("raises RoomApiError from the §5.1 error envelope on a non-2xx response", async () => {
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(404, {
        error: { code: "not_found", message: "no session" },
      }),
    );
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    await expect(client.roomCurrent("nope")).rejects.toMatchObject({
      name: "RoomApiError",
      status: 404,
      code: "not_found",
    });
    await expect(client.roomCurrent("nope")).rejects.toBeInstanceOf(
      RoomApiError,
    );
  });

  it("a transport failure surfaces as a typed NetworkFailureError (§2.1 / §6.7)", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));
    const client = httpRoomClient("http://127.0.0.1:9", { fetch: fetchStub });
    const err = await client.newSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkFailureError);
    expect((err as NetworkFailureError).code).toBe("network_failure");
    expect((err as NetworkFailureError).cause).toBeInstanceOf(TypeError);
  });

  it("bootstrapSession drives a full render over the HTTP client", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { session_id: "s-1", seed: 0 }))
      .mockResolvedValueOnce(jsonResponse(200, room));
    const client = httpRoomClient("http://127.0.0.1:8080", {
      fetch: fetchStub,
    });
    const { scene } = await bootstrapSession(client);
    expect(scene.children.length).toBe(1 + room.objects.length);
  });
});
