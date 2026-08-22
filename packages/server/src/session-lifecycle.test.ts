// SPEC §5.1 / §6.5 / §0.9.0 (A9/A10/A12) — issue #87. Rounds out the §5.1 surface
// beyond the read path (#85) and `/interact` (#86): dev-mode `POST /session/new`
// (A12 per-session ruleset binding, by value and by ref), `GET /session/{id}/log`
// (A9), `GET /session/{id}/registry` (A10), idempotent `DELETE /session/{id}`, and
// `GET /health`. Every assertion runs against the pure handler (`createServer().handle`)
// so the contract is proven with no socket in the loop.

import { describe, it, expect } from "vitest";
import type { AddressRegistryEntry, Entity, Ruleset } from "schema";
import type { GraphSpan } from "rule-engine";
import { createServer, type ServerConfig } from "./server";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function span(entity: Entity, embedding: number[]): GraphSpan {
  return { entity, embedding };
}

const RULESET: Ruleset = { spec_version: "0.1.0", layers: [] };

// A ruleset whose one global rule fires unconditionally and forbids every
// candidate — a bound session populates to nothing (`stuck`), an observable proof
// that the SESSION's ruleset, not the server-wide one, drove resolution.
const FORBID_ALL_RULESET: Ruleset = {
  spec_version: "0.1.0",
  layers: [
    {
      id: "wall",
      scope: "global",
      mode: { priority: 1 },
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "hard_forbid" },
        },
      ],
    },
  ],
};

// A room plus four traversal-capable neighbours — exits derive from them.
function fullSubstrate(): GraphSpan[] {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  return [
    span(room, [1, 0]),
    span(makeEntity("a", { affordances: ["traverse"] }), [0.99, 0.14]),
    span(makeEntity("b", { affordances: ["enter"] }), [0.9, 0.44]),
    span(makeEntity("c", { affordances: ["traverse"] }), [0.7, 0.71]),
    span(makeEntity("d", { affordances: ["traverse"] }), [0.5, 0.87]),
  ];
}

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ruleset: RULESET,
    substrate: { spans: fullSubstrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  };
}

function getJson(body: string): unknown {
  return JSON.parse(body);
}

function post(
  server: ReturnType<typeof createServer>,
  url: string,
  payload: unknown,
) {
  return server.handle({ method: "POST", url, body: JSON.stringify(payload) });
}

// ── POST /session/new — dev-mode ruleset binding (§0.9.0 A12) ────────────────────

describe("POST /session/new (§5.1, A12)", () => {
  it("binds an inline ruleset (by value) and returns { session_id, seed } when dev mode is on", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = post(server, "/session/new", {
      seed: 42,
      ruleset: RULESET,
    });

    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    const body = getJson(res.body) as { session_id: string; seed: number };
    expect(typeof body.session_id).toBe("string");
    expect(body.session_id.length).toBeGreaterThan(0);
    expect(body.seed).toBe(42);
  });

  it("binds a server-registered ruleset by reference (ruleset_ref)", () => {
    const server = createServer(
      makeConfig({
        devMode: true,
        rulesetRegistry: { "fixture-a": RULESET },
      }),
    );
    const res = post(server, "/session/new", { ruleset_ref: "fixture-a" });
    expect(res.status).toBe(200);
    const body = getJson(res.body) as { session_id: string; seed: number };
    expect(body.session_id.length).toBeGreaterThan(0);
    // Seed omitted ⇒ server-chosen from the injected entropy source.
    expect(body.seed).toBe(7);
  });

  it("the bound ruleset drives that session's resolution, not the server-wide one", () => {
    const server = createServer(makeConfig({ devMode: true }));

    // A session bound to a forbid-everything ruleset populates to nothing.
    const bound = getJson(
      post(server, "/session/new", {
        seed: 42,
        ruleset: FORBID_ALL_RULESET,
      }).body,
    ) as { session_id: string };
    const boundRoom = getJson(
      server.handle({
        method: "GET",
        url: `/room/current?session_id=${bound.session_id}`,
      }).body,
    ) as { exits: unknown[]; resolution_status: string };
    expect(boundRoom.exits).toEqual([]);
    expect(boundRoom.resolution_status).toBe("stuck");

    // A default session (server-wide empty ruleset) still resolves exits.
    const plain = getJson(
      server.handle({ method: "GET", url: "/session/new?seed=42" }).body,
    ) as { session_id: string };
    const plainRoom = getJson(
      server.handle({
        method: "GET",
        url: `/room/current?session_id=${plain.session_id}`,
      }).body,
    ) as { exits: unknown[]; resolution_status: string };
    expect(plainRoom.exits.length).toBeGreaterThan(0);
    expect(plainRoom.resolution_status).toBe("resolved");
  });

  it("an unknown ruleset_ref is a 404 via the error envelope, no leakage", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = post(server, "/session/new", { ruleset_ref: "nope" });
    expect(res.status).toBe(404);
    const body = getJson(res.body) as {
      error: { code: string; message: string };
    };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error.code).toBe("string");
  });

  it("a malformed inline ruleset is a 400", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = post(server, "/session/new", { ruleset: { layers: "nope" } });
    expect(res.status).toBe(400);
    const body = getJson(res.body) as { error: { code: string } };
    expect(typeof body.error.code).toBe("string");
  });

  it("a malformed JSON body is a 400", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = server.handle({
      method: "POST",
      url: "/session/new",
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });

  it("with dev mode off it is a 404 and the server-wide ruleset stands", () => {
    const server = createServer(makeConfig()); // devMode undefined ⇒ off
    const res = post(server, "/session/new", { ruleset: FORBID_ALL_RULESET });
    expect(res.status).toBe(404);
    const body = getJson(res.body) as {
      error: { code: string; message: string };
    };
    expect(Object.keys(body)).toEqual(["error"]);
    // No custom ruleset leaked into the response.
    expect(res.body).not.toContain("hard_forbid");

    // The server-wide read path is untouched — a GET session resolves normally.
    const plain = getJson(
      server.handle({ method: "GET", url: "/session/new?seed=42" }).body,
    ) as { session_id: string };
    const plainRoom = getJson(
      server.handle({
        method: "GET",
        url: `/room/current?session_id=${plain.session_id}`,
      }).body,
    ) as { resolution_status: string };
    expect(plainRoom.resolution_status).toBe("resolved");
  });
});

// ── GET /session/{id}/log (§0.9.0 A9) ────────────────────────────────────────────

describe("GET /session/{id}/log (§5.1, A9)", () => {
  function newSession(server: ReturnType<typeof createServer>): string {
    const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
    return (getJson(res.body) as { session_id: string }).session_id;
  }

  it("returns an empty InputLogEntry[] for a fresh session", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const res = server.handle({ method: "GET", url: `/session/${id}/log` });
    expect(res.status).toBe(200);
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    expect(getJson(res.body)).toEqual([]);
  });

  it("accumulates each player interact as an InputLogEntry (§3.9)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const exits = (
      getJson(
        server.handle({
          method: "GET",
          url: `/room/current?session_id=${id}`,
        }).body,
      ) as { exits: { via_object_id: string; affordance_required: string }[] }
    ).exits;
    const action = {
      object_id: exits[0]!.via_object_id,
      affordance: exits[0]!.affordance_required,
    };
    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({ session_id: id, action }),
    });

    const log = getJson(
      server.handle({ method: "GET", url: `/session/${id}/log` }).body,
    ) as { kind: string; action: typeof action }[];
    expect(log).toEqual([{ kind: "interact", action }]);
  });

  it("replaying the logged input against a same-seed session reproduces it byte-for-byte (INV-2)", () => {
    const server = createServer(makeConfig());
    const idA = newSession(server);
    // Walk a few turns to accumulate a log.
    for (let step = 0; step < 3; step++) {
      const exits = (
        getJson(
          server.handle({
            method: "GET",
            url: `/room/current?session_id=${idA}`,
          }).body,
        ) as {
          exits: { via_object_id: string; affordance_required: string }[];
        }
      ).exits;
      if (exits.length === 0) break;
      server.handle({
        method: "POST",
        url: "/interact",
        body: JSON.stringify({
          session_id: idA,
          action: {
            object_id: exits[0]!.via_object_id,
            affordance: exits[0]!.affordance_required,
          },
        }),
      });
    }
    const logA = getJson(
      server.handle({ method: "GET", url: `/session/${idA}/log` }).body,
    ) as {
      kind: "interact";
      action: { object_id: string; affordance: string };
    }[];
    expect(logA.length).toBeGreaterThan(0);

    // Replay: fresh same-seed session, re-POST the logged actions in order.
    const idB = server.handle({
      method: "GET",
      url: "/session/new?seed=42",
    });
    const bId = (getJson(idB.body) as { session_id: string }).session_id;
    for (const entry of logA) {
      server.handle({
        method: "POST",
        url: "/interact",
        body: JSON.stringify({ session_id: bId, action: entry.action }),
      });
    }
    const logB = getJson(
      server.handle({ method: "GET", url: `/session/${bId}/log` }).body,
    );
    // Same seed + same input-log ⇒ identical accumulated log (§3.9 / INV-2).
    expect(logB).toEqual(logA);
    // And the resolved rooms match byte-for-byte.
    const roomA = server.handle({
      method: "GET",
      url: `/room/current?session_id=${idA}`,
    }).body;
    const roomB = server.handle({
      method: "GET",
      url: `/room/current?session_id=${bId}`,
    }).body;
    expect(roomB).toBe(roomA);
  });

  it("an unknown session is a 404 via the error envelope", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/session/nope/log" });
    expect(res.status).toBe(404);
    const body = getJson(res.body) as { error: { code: string } };
    expect(typeof body.error.code).toBe("string");
  });
});

// ── GET /session/{id}/registry (§0.9.0 A10) ──────────────────────────────────────

describe("GET /session/{id}/registry (§5.1, A10)", () => {
  function newSession(server: ReturnType<typeof createServer>): string {
    const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
    return (getJson(res.body) as { session_id: string }).session_id;
  }

  it("returns an empty AddressLabel[] for a session with no player overlay", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/session/${id}/registry`,
    });
    expect(res.status).toBe(200);
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    expect(getJson(res.body)).toEqual([]);
  });

  it("projects player-provenance entries to { tag, label } only — never internals (INV-3)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    // Seed a mixed-provenance registry directly on the in-memory session.
    const session = server.sessions.get(id)!;
    const entries: AddressRegistryEntry[] = [
      {
        tag: "player.pin.altar",
        points_to: { kind: "coordinate", vector_ref: "vec:secret" },
        provenance: "player",
      },
      {
        tag: "build.seed.origin",
        points_to: { kind: "coordinate", vector_ref: "vec:origin" },
        provenance: "build",
      },
      {
        tag: "author.link.hub",
        points_to: { kind: "composite", member_tags: ["a", "b"] },
        provenance: "author_runtime",
      },
    ];
    session.registry.push(...entries);

    const res = server.handle({
      method: "GET",
      url: `/session/${id}/registry`,
    });
    expect(res.status).toBe(200);
    const labels = getJson(res.body) as { tag: string; label: string }[];

    // Only the player-provenance entry surfaces.
    expect(labels).toEqual([
      { tag: "player.pin.altar", label: "player.pin.altar" },
    ]);
    // Each object exposes exactly { tag, label } — no points_to/provenance.
    for (const l of labels) {
      expect(Object.keys(l).sort()).toEqual(["label", "tag"]);
    }
    // No reference/payload internals leak (INV-3).
    expect(res.body).not.toContain("points_to");
    expect(res.body).not.toContain("provenance");
    expect(res.body).not.toContain("vec:secret");
    expect(res.body).not.toContain("build");
    expect(res.body).not.toContain("author_runtime");
  });

  it("an unknown session is a 404 via the error envelope", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "GET",
      url: "/session/nope/registry",
    });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /session/{id} (idempotent) ────────────────────────────────────────────

describe("DELETE /session/{id} (§5.1)", () => {
  function newSession(server: ReturnType<typeof createServer>): string {
    const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
    return (getJson(res.body) as { session_id: string }).session_id;
  }

  it("returns 204 with no body and frees the in-memory session", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const res = server.handle({ method: "DELETE", url: `/session/${id}` });
    expect(res.status).toBe(204);
    expect(res.body).toBe("");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");

    // The session is gone — a follow-up read is a 404.
    const after = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });
    expect(after.status).toBe(404);
  });

  it("is idempotent — a double DELETE returns 204, 204 (never 404)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    expect(
      server.handle({ method: "DELETE", url: `/session/${id}` }).status,
    ).toBe(204);
    expect(
      server.handle({ method: "DELETE", url: `/session/${id}` }).status,
    ).toBe(204);
  });

  it("deleting an unknown session still returns 204 (idempotent by design)", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "DELETE", url: "/session/never" });
    expect(res.status).toBe(204);
  });
});

// ── GET /health ──────────────────────────────────────────────────────────────────

describe("GET /health (§5.1)", () => {
  it("returns { status: 'ok' } with X-Spec-Version", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/health" });
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    expect(getJson(res.body)).toEqual({ status: "ok" });
  });
});
