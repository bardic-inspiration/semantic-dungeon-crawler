// SPEC §5.1 / §6.5 / §0.11.0 (C2/C3) — the Phase 4 server scaffold (issue #85).
// Covers the read-side session/room surface: `GET /session/new` and
// `GET /room/current`, the base contract (JSON, `X-Spec-Version`, the single error
// envelope), seeded-session determinism (INV-2), the unknown-session 404, the
// degenerate `200` "stuck" resolution (C2), and the INV-3 guarantee that no engine
// internal (embeddings, graph, rule text) ever reaches a response body.
//
// Every assertion runs against the pure request handler (`createServer().handle`),
// so the contract is proven with no socket in the loop; `http.test.ts` proves the
// same contract survives the real `node:http` transport.

import { describe, it, expect } from "vitest";
import { isValidEntity, type Entity, type Ruleset } from "schema";
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

// A degenerate substrate: only the room, no neighbours to populate or exit through.
function degenerateSubstrate(): GraphSpan[] {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  return [span(room, [1, 0])];
}

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ruleset: RULESET,
    substrate: { spans: fullSubstrate(), start_ref: "vec:origin" },
    // Deterministic seed source so a server-chosen seed is predictable in tests.
    newSeed: () => 7,
    ...over,
  };
}

function getJson(body: string): unknown {
  return JSON.parse(body);
}

// ── GET /session/new ───────────────────────────────────────────────────────────

describe("GET /session/new (§5.1)", () => {
  it("creates a session and returns { session_id, seed } as application/json", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/session/new?seed=42" });

    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const body = getJson(res.body) as { session_id: string; seed: number };
    expect(typeof body.session_id).toBe("string");
    expect(body.session_id.length).toBeGreaterThan(0);
    expect(body.seed).toBe(42);
  });

  it("echoes the running spec_version in X-Spec-Version on every response (§3.5)", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/session/new" });
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
  });

  it("omitting seed yields a server-chosen seed", () => {
    const server = createServer(makeConfig({ newSeed: () => 99 }));
    const res = server.handle({ method: "GET", url: "/session/new" });
    const body = getJson(res.body) as { seed: number };
    expect(body.seed).toBe(99);
  });

  it("a malformed seed is a 400 via the error envelope", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "GET",
      url: "/session/new?seed=notanumber",
    });
    expect(res.status).toBe(400);
    const body = getJson(res.body) as {
      error: { code: string; message: string };
    };
    expect(typeof body.error.code).toBe("string");
    expect(typeof body.error.message).toBe("string");
  });
});

// ── GET /room/current ──────────────────────────────────────────────────────────

describe("GET /room/current (§5.1)", () => {
  function newSession(server: ReturnType<typeof createServer>): string {
    const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
    return (getJson(res.body) as { session_id: string }).session_id;
  }

  it("returns a schema-valid ResolvedRoomResponse routed through the engine", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });

    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");

    const body = getJson(res.body) as {
      room: unknown;
      objects: unknown[];
      exits: {
        target_entity_id: string;
        affordance_required: string;
        via_object_id: string;
        weight: number;
      }[];
      resolution_status: string;
    };

    // Schema validity: the room and every populated object satisfy §3.1.
    expect(isValidEntity(body.room)).toBe(true);
    expect((body.room as Entity).embedding_ref).toBe("vec:origin");
    expect(body.objects.length).toBeGreaterThan(0);
    expect(body.objects.every(isValidEntity)).toBe(true);

    // Exits are pre-computed transitions bound to populated objects (§3.2 A4).
    const objectIds = new Set((body.objects as Entity[]).map((o) => o.id));
    for (const exit of body.exits) {
      expect(objectIds.has(exit.via_object_id)).toBe(true);
      expect(typeof exit.target_entity_id).toBe("string");
      expect(typeof exit.weight).toBe("number");
    }
    expect(body.exits.length).toBeGreaterThan(0);
    expect(body.resolution_status).toBe("resolved");
  });

  it("never leaks engine internals — no raw embedding, graph, or rule text (INV-3)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });
    // The response is resolved JSON only: embedding_ref TOKENS are allowed, raw
    // vectors and any `commit`/`vars`/layer payload are not.
    expect(res.body).not.toContain("commit");
    expect(res.body).not.toContain('"embedding"');
    expect(res.body).not.toContain("0.99"); // a raw vector component from the substrate
  });

  it("is reproducible from the seed alone — same seed ⇒ byte-identical rooms (INV-2)", () => {
    const server = createServer(makeConfig());
    const a = newSession(server);
    const b = newSession(server); // second session, identical seed
    const ra = server.handle({
      method: "GET",
      url: `/room/current?session_id=${a}`,
    });
    const rb = server.handle({
      method: "GET",
      url: `/room/current?session_id=${b}`,
    });

    const stripSession = (body: string) => body; // room bodies carry no session_id
    expect(stripSession(ra.body)).toBe(stripSession(rb.body));
  });

  it("an unknown session_id is a 404 via the single error envelope, no leakage", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "GET",
      url: "/room/current?session_id=does-not-exist",
    });
    expect(res.status).toBe(404);
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    const body = getJson(res.body) as {
      error: { code: string; message: string };
    };
    expect(typeof body.error.code).toBe("string");
    expect(typeof body.error.message).toBe("string");
    // The envelope carries a code + message only — never ruleset/graph/stack (INV-3).
    expect(Object.keys(body)).toEqual(["error"]);
    expect(res.body).not.toContain("vec:");
    expect(res.body).not.toContain("Error:");
  });

  it("a missing session_id is a 400 malformed request", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/room/current" });
    expect(res.status).toBe(400);
  });

  it("a well-formed request that resolves to nothing is 200 with stuck (§0.11.0 C2)", () => {
    const server = createServer(
      makeConfig({
        substrate: { spans: degenerateSubstrate(), start_ref: "vec:origin" },
      }),
    );
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });

    expect(res.status).toBe(200);
    const body = getJson(res.body) as {
      objects: unknown[];
      exits: unknown[];
      resolution_status: string;
    };
    expect(body.objects).toEqual([]);
    expect(body.exits).toEqual([]);
    expect(body.resolution_status).toBe("stuck");
  });
});

// ── Base contract — unknown routes ─────────────────────────────────────────────

describe("base contract (§5.1)", () => {
  it("an unknown route is a 404 via the error envelope", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/nope" });
    expect(res.status).toBe(404);
    const body = getJson(res.body) as {
      error: { code: string; message: string };
    };
    expect(typeof body.error.code).toBe("string");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
  });

  it("an out-of-scope method on a known path is a 404 (no 405 in the code set)", () => {
    // POST /session/new (dev-mode ruleset binding) is issue #87; unimplemented here.
    const server = createServer(makeConfig());
    const res = server.handle({ method: "POST", url: "/session/new" });
    expect(res.status).toBe(404);
  });

  it("rejects a config whose start_ref names no substrate span (fail fast)", () => {
    expect(() =>
      createServer(
        makeConfig({
          substrate: { spans: fullSubstrate(), start_ref: "vec:ghost" },
        }),
      ),
    ).toThrow();
  });
});
