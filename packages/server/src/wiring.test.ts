// SPEC §2.1 / §4.3 / §3.4 — the integration seams between `server` and
// `rule-engine`, and the §2.1 supporting systems that depend on them.
//
// Every assertion here is about something the engine ALREADY supports which the
// server did not pass through. A conformance audit found four such seams; each
// one silently disabled a spec-mandated behavior without failing a build or a
// test, because the engine's own unit tests exercise the option directly and the
// server's own tests never asserted the option was supplied.
//
// The failure mode under test is therefore "the caller drops it", not "the
// feature is missing" — which is why these live at the request boundary and drive
// `createServer().handle` rather than calling the solver.

import { describe, it, expect } from "vitest";
import type { Entity, Ruleset } from "schema";
import { SPEC_VERSION } from "schema";
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

/**
 * An origin room at density 1 plus four neighbours. Two carry the engine-default
 * movement affordances (`enter`/`traverse`); two carry the non-default `squeeze`,
 * which only becomes a movement affordance if the ruleset's
 * `movement_affordances` reaches `populate` (§3.4, A4).
 */
function substrate(): GraphSpan[] {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  return [
    span(room, [1, 0]),
    span(makeEntity("a", { affordances: ["traverse"] }), [0.99, 0.14]),
    span(makeEntity("b", { affordances: ["enter"] }), [0.9, 0.44]),
    span(makeEntity("c", { affordances: ["squeeze"] }), [0.7, 0.71]),
    span(makeEntity("d", { affordances: ["squeeze"] }), [0.5, 0.87]),
  ];
}

const NULL_RULESET: Ruleset = { spec_version: "0.1.0", layers: [] };

/**
 * §4.3 rule 3 / §6.4 Exit — two `override`-mode layers producing contradictory
 * hard decisions. Legal under INV-4: it must resolve by declaration order and log
 * a warning, never throw.
 */
const CONFLICTING_RULESET: Ruleset = {
  spec_version: "0.1.0",
  layers: [
    {
      id: "allow-all",
      scope: "global",
      mode: "override",
      rules: [
        {
          predicate: 'static.archetype == "prop"',
          effect: { kind: "hard_allow" },
        },
      ],
    },
    {
      id: "forbid-all",
      scope: "global",
      mode: "override",
      rules: [
        {
          predicate: 'static.archetype == "prop"',
          effect: { kind: "hard_forbid" },
        },
      ],
    },
  ],
};

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ruleset: NULL_RULESET,
    substrate: { spans: substrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  };
}

function json<T>(body: string): T {
  return JSON.parse(body) as T;
}

function newSession(server: ReturnType<typeof createServer>): string {
  return json<{ session_id: string }>(
    server.handle({ method: "GET", url: "/session/new?seed=42" }).body,
  ).session_id;
}

// ── W1: the §4.3 messy-resolution warning must reach the server's sink ────────

describe("W1 — §4.3 override-conflict warning reaches the server Logger (§2.1, §6.4 Exit)", () => {
  it("emits a warn through the injected sink when GET /room/current resolves", () => {
    const logger = new CollectingLogger();
    const server = createServer(
      makeConfig({ ruleset: CONFLICTING_RULESET, logger }),
    );
    const id = newSession(server);

    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });
    expect(res.status).toBe(200); // INV-4: contradiction is legal, never an error

    const warns = logger.entries.filter(
      (e) => e.level === "warn" && /override|conflict/.test(e.event),
    );
    expect(warns.length).toBeGreaterThan(0);
  });

  it("emits it for POST /interact resolution too", () => {
    const logger = new CollectingLogger();
    const server = createServer(
      makeConfig({ ruleset: CONFLICTING_RULESET, logger }),
    );
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });
    logger.entries.length = 0;

    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id: "a", affordance: "traverse" },
      }),
    });

    expect(
      logger.entries.some(
        (e) => e.level === "warn" && /override|conflict/.test(e.event),
      ),
    ).toBe(true);
  });

  it("stays quiet for a null ruleset — the warning is about conflict, not about resolving", () => {
    const logger = new CollectingLogger();
    const server = createServer(makeConfig({ logger }));
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });

    expect(
      logger.entries.some(
        (e) => e.level === "warn" && /override|conflict/.test(e.event),
      ),
    ).toBe(false);
  });
});

// ── W2: Ruleset.movement_affordances must reach populate ──────────────────────

describe("W2 — Ruleset.movement_affordances reaches populate (§3.4 A4)", () => {
  function exitsFor(
    ruleset: Ruleset,
  ): { via_object_id: string; affordance_required: string }[] {
    const server = createServer(makeConfig({ ruleset }));
    const id = newSession(server);
    return json<{
      exits: { via_object_id: string; affordance_required: string }[];
    }>(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    ).exits;
  }

  it("derives exits from the engine defaults when the ruleset declares none", () => {
    const exits = exitsFor(NULL_RULESET);
    const affordances = exits.map((e) => e.affordance_required);

    expect(affordances.length).toBeGreaterThan(0);
    expect(affordances.every((a) => a === "enter" || a === "traverse")).toBe(
      true,
    );
    expect(affordances).not.toContain("squeeze");
  });

  it("derives exits from an authored movement affordance instead", () => {
    const exits = exitsFor({
      spec_version: "0.1.0",
      layers: [],
      movement_affordances: ["squeeze"],
    });
    const affordances = exits.map((e) => e.affordance_required);

    // The author replaced the movement set: `squeeze` now moves, `traverse` does not.
    expect(affordances).toContain("squeeze");
    expect(affordances).not.toContain("traverse");
  });
});

// ── W4: one debug flag gates the trace AND log verbosity ──────────────────────

describe("W4 — the debug flag gates log verbosity as well as the trace (§2.1)", () => {
  it("emits debug-level events when the flag is on", () => {
    const logger = new CollectingLogger();
    const server = createServer(makeConfig({ debug: true, logger }));
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });

    expect(logger.entries.some((e) => e.level === "debug")).toBe(true);
  });

  it("emits none when the flag is off — gated before construction, not filtered after", () => {
    const logger = new CollectingLogger();
    const server = createServer(makeConfig({ logger }));
    const id = newSession(server);
    server.handle({ method: "GET", url: `/room/current?session_id=${id}` });

    expect(logger.entries.some((e) => e.level === "debug")).toBe(false);
  });
});

// ── W5: §2.1 names rule-evaluation duration per move as a runtime metric ──────

describe("W5 — §2.1 runtime metrics include rule-evaluation duration per move", () => {
  it("observes a resolution-duration metric on POST /interact", () => {
    const metrics = new InMemoryMetrics();
    let now = 0;
    const server = createServer(
      makeConfig({ metrics, metricsEnabled: true, clock: () => (now += 5) }),
    );
    const id = newSession(server);

    server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id: "a", affordance: "traverse" },
      }),
    });

    const snapshot = metrics.snapshot();
    const keys = [
      ...Object.keys(snapshot.counters),
      ...Object.keys(snapshot.gauges),
    ];
    expect(
      keys.some((k) => /resolution|resolve/.test(k) && /duration|ms/.test(k)),
    ).toBe(true);
  });
});

// ── §5.1 — X-Spec-Version is the ENGINE's version, not the ruleset's ─────────

describe("X-Spec-Version echoes the running spec_version (§5.1, §3.5)", () => {
  const MISMATCHED: Ruleset = { spec_version: "0.1.0", layers: [] };

  it("does not change when the loaded ruleset declares a different version", () => {
    const server = createServer(makeConfig({ ruleset: MISMATCHED }));
    const res = server.handle({ method: "GET", url: "/health" });

    expect(res.headers["X-Spec-Version"]).toBe(SPEC_VERSION);
    expect(res.headers["X-Spec-Version"]).not.toBe(MISMATCHED.spec_version);
  });

  it("still loads and runs a ruleset whose spec_version disagrees (INV-4)", () => {
    const server = createServer(makeConfig({ ruleset: MISMATCHED }));
    const id = newSession(server);
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });

    // INV-4: the engine does not police author content. A version mismatch is
    // surfaced, never a rejection.
    expect(res.status).toBe(200);
  });

  it("is the engine's version on error and 204 responses too", () => {
    const server = createServer(makeConfig({ ruleset: MISMATCHED }));

    const notFound = server.handle({ method: "GET", url: "/nope" });
    expect(notFound.status).toBe(404);
    expect(notFound.headers["X-Spec-Version"]).toBe(SPEC_VERSION);

    const deleted = server.handle({
      method: "DELETE",
      url: "/session/unknown-session",
    });
    expect(deleted.status).toBe(204);
    expect(deleted.headers["X-Spec-Version"]).toBe(SPEC_VERSION);
  });

  it("is not per-session — a dev-mode session binding its own ruleset gets the same header", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = server.handle({
      method: "POST",
      url: "/session/new",
      body: JSON.stringify({
        seed: 1,
        ruleset: { spec_version: "9.9.9", layers: [] },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers["X-Spec-Version"]).toBe(SPEC_VERSION);
  });
});
