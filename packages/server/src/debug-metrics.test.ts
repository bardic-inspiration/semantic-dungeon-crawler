// SPEC §2.1 / §4.6 / §5.1 — the flag-gated introspection endpoints (issue #88):
// `GET /debug/trace` (server debug flag) and `GET /metrics` (metrics flag), plus
// the §2.1 `Logger`/`Metrics` wiring at the server's request boundary.
//
// Every assertion runs against the pure request handler (`createServer().handle`).
// The two invariants under test: the debug flag is SERVER config, never a client
// field (INV-3, §4.6); and with a flag off its endpoint is a `404` and no trace
// work is done (zero overhead, §4.6).

import { describe, it, expect } from "vitest";
import type { DebugTrace, Entity, Ruleset } from "schema";
import type { GraphSpan } from "rule-engine";
import { createServer, type ServerConfig } from "./server";
import { CollectingLogger, InMemoryMetrics } from "./instrumentation";

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

function newSession(server: ReturnType<typeof createServer>): string {
  const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
  return (getJson(res.body) as { session_id: string }).session_id;
}

function isSchemaValidDebugTrace(value: unknown): value is DebugTrace {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  if (!Array.isArray(t.candidates_initial)) return false;
  if (!t.candidates_initial.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(t.per_layer)) return false;
  for (const layer of t.per_layer as Record<string, unknown>[]) {
    if (typeof layer.layer_id !== "string") return false;
    if (typeof layer.activated !== "boolean") return false;
    if (!Array.isArray(layer.rules_fired)) return false;
  }
  if (!(
    t.final_hard_decision_source === null ||
    typeof t.final_hard_decision_source === "string"
  )) {
    return false;
  }
  return (
    typeof t.final_soft_scores === "object" && t.final_soft_scores !== null
  );
}

// ── GET /debug/trace (§4.6 / §5.1) ─────────────────────────────────────────────

describe("GET /debug/trace (§4.6 / §5.1)", () => {
  it("with debug mode ON returns the last resolution's schema-valid DebugTrace", () => {
    const server = createServer(makeConfig({ debug: true }));
    const id = newSession(server);
    // A resolution has to happen before there is a trace to expose.
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });

    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.headers["X-Spec-Version"]).toBe("0.1.0");
    expect(isSchemaValidDebugTrace(getJson(res.body))).toBe(true);
  });

  it("exposes the trace of the LAST resolution (a later interact overwrites it)", () => {
    const server = createServer(makeConfig({ debug: true }));
    const id = newSession(server);
    const room = getJson(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    ) as { exits: { via_object_id: string; affordance_required: string }[] };
    const exit = room.exits[0]!;
    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: {
          object_id: exit.via_object_id,
          affordance: exit.affordance_required,
        },
      }),
    });

    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    expect(res.status).toBe(200);
    expect(isSchemaValidDebugTrace(getJson(res.body))).toBe(true);
  });

  it("with debug mode OFF the endpoint is a 404 and no trace work is done (§4.6)", () => {
    const server = createServer(makeConfig()); // debug undefined ⇒ off
    const id = newSession(server);
    // Drive a full resolution: even so, with the flag off nothing is traced.
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });

    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "debug_disabled",
    );
  });

  it("no DebugTrace is built when the flag is off — the normal response carries none", () => {
    const server = createServer(makeConfig()); // debug off
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });
    // The resolution ran with no recorder, so the resolved body has no debug field.
    expect(res.body).not.toContain("debug");
    expect(res.body).not.toContain("candidates_initial");
  });

  it("the debug flag is checked FIRST — off wins over a missing session_id (flag gate precedes all work)", () => {
    const server = createServer(makeConfig()); // debug off
    const res = server.handle({ method: "GET", url: "/debug/trace" });
    // A missing session_id would be a 400 if the flag were on; off short-circuits
    // to a 404 before any request validation, proving zero trace work.
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "debug_disabled",
    );
  });

  it("is SERVER config only — no client field can turn debug on (INV-3)", () => {
    const server = createServer(makeConfig()); // debug off
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });
    // A `debug`/`enabled` query field cannot flip the server flag.
    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}&debug=true&enabled=true`,
    });
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "debug_disabled",
    );
  });

  it("a POST /interact body field cannot enable tracing (INV-3)", () => {
    const server = createServer(makeConfig()); // debug off
    const id = newSession(server);
    const room = getJson(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    ) as { exits: { via_object_id: string; affordance_required: string }[] };
    const exit = room.exits[0]!;
    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        debug: true, // an attacker-supplied flag — must be ignored
        action: {
          object_id: exit.via_object_id,
          affordance: exit.affordance_required,
        },
      }),
    });
    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    expect(res.status).toBe(404);
  });

  it("with debug ON, an unknown session is a 404 unknown_session", () => {
    const server = createServer(makeConfig({ debug: true }));
    const res = server.handle({
      method: "GET",
      url: "/debug/trace?session_id=nope",
    });
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "unknown_session",
    );
  });

  it("with debug ON, a session that has resolved nothing yet is a 404 no_trace", () => {
    const server = createServer(makeConfig({ debug: true }));
    const id = newSession(server); // fresh — no room/current or interact yet
    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "no_trace",
    );
  });

  it("with debug ON, a missing session_id is a 400 bad_request", () => {
    const server = createServer(makeConfig({ debug: true }));
    const res = server.handle({ method: "GET", url: "/debug/trace" });
    expect(res.status).toBe(400);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "bad_request",
    );
  });

  it("never leaks engine internals in the trace body beyond the §4.6 shape (INV-3)", () => {
    const server = createServer(makeConfig({ debug: true }));
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });
    const res = server.handle({
      method: "GET",
      url: `/debug/trace?session_id=${id}`,
    });
    // The trace carries entity ids and scores, never raw embeddings or vectors.
    expect(res.body).not.toContain('"embedding"');
    expect(res.body).not.toContain("0.99");
  });
});

// ── GET /metrics (§2.1 / §5.1) ──────────────────────────────────────────────────

describe("GET /metrics (§2.1 / §5.1)", () => {
  it("with metrics disabled (default) is a 404 metrics_disabled", () => {
    const server = createServer(makeConfig());
    const res = server.handle({ method: "GET", url: "/metrics" });
    expect(res.status).toBe(404);
    expect((getJson(res.body) as { error: { code: string } }).error.code).toBe(
      "metrics_disabled",
    );
  });

  it("with metrics enabled returns a { counters, gauges } snapshot from the §2.1 Metrics interface", () => {
    const server = createServer(
      makeConfig({ metricsEnabled: true, clock: () => 1000 }),
    );
    const id = newSession(server);
    const room = getJson(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    ) as { exits: { via_object_id: string; affordance_required: string }[] };
    const exit = room.exits[0]!;
    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: {
          object_id: exit.via_object_id,
          affordance: exit.affordance_required,
        },
      }),
    });

    const res = server.handle({ method: "GET", url: "/metrics" });
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const snap = getJson(res.body) as {
      counters: Record<string, number>;
      gauges: Record<string, number>;
    };
    expect(typeof snap.counters).toBe("object");
    expect(typeof snap.gauges).toBe("object");
    // A request counter accrued across the boundary, and one interact turn.
    expect(snap.counters["http.requests"]).toBeGreaterThan(0);
    expect(snap.counters["interact.turns"]).toBe(1);
    // Gauges: a live session count and a request-latency reading (0 under a fixed clock).
    expect(snap.gauges["sessions.active"]).toBe(1);
    expect(snap.gauges["http.request.duration_ms"]).toBe(0);
  });

  it("reuses the injected §2.1 Metrics sink — it does not reimplement one", () => {
    const metrics = new InMemoryMetrics();
    const server = createServer(makeConfig({ metricsEnabled: true, metrics }));
    server.handle({ method: "GET", url: "/health" });
    // The very sink we injected saw the request-boundary writes.
    expect(metrics.snapshot().counters["http.requests"]).toBe(1);
  });

  it("a write-only Metrics sink yields an empty snapshot rather than throwing", () => {
    const server = createServer(
      makeConfig({
        metricsEnabled: true,
        metrics: { increment() {}, observe() {} },
      }),
    );
    const res = server.handle({ method: "GET", url: "/metrics" });
    expect(res.status).toBe(200);
    expect(getJson(res.body)).toEqual({ counters: {}, gauges: {} });
  });
});

// ── §2.1 Logger/Metrics wiring at the request boundary ──────────────────────────

describe("§2.1 request-boundary instrumentation", () => {
  it("reports every request through the injected Logger (method, url, status)", () => {
    const logger = new CollectingLogger();
    const server = createServer(makeConfig({ logger }));
    server.handle({ method: "GET", url: "/health" });
    const entry = logger.entries.find((e) => e.event === "http.request");
    expect(entry).toBeDefined();
    expect(entry!.fields).toMatchObject({
      method: "GET",
      url: "/health",
      status: 200,
    });
  });

  it("instrumentation is a pure side channel — it never alters the response (INV-2)", () => {
    const withLog = createServer(
      makeConfig({
        logger: new CollectingLogger(),
        metrics: new InMemoryMetrics(),
      }),
    );
    const without = createServer(makeConfig());
    const a = withLog.handle({ method: "GET", url: "/session/new?seed=42" });
    const b = without.handle({ method: "GET", url: "/session/new?seed=42" });
    expect(a.status).toBe(b.status);
    expect(a.body).toBe(b.body);
  });
});
