// SPEC §4.1 / §4.4 / §6.4 Exit — the solver core. Covers the normative
// requirements of issue #75: the identical-`evaluateLayers` guarantee (function
// identity, not just equal output), the zero-radius `populate` query with
// exit derivation (A4), exit-anchoring (A4), the post-decision commit phase (A5),
// the degenerate/stuck resolution (C2), null-ruleset drift, determinism (INV-2),
// and INV-4 conformance (contradictory overrides never throw).

import { describe, it, expect, vi } from "vitest";
import type { Entity, Layer, SessionState } from "schema";
import * as solver from "./solver";
import { resolveMove, populate, MAX_ROOM_OBJECTS } from "./solver";
import { createSubstrateGraph, type Graph, type GraphSpan } from "./graph";
import { CollectingLogger } from "./instrumentation";
import { OVERRIDE_CONFLICT_EVENT } from "./layer-resolution";

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

function makeState(over: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "s1",
    session_seed: 42,
    position: { vector_ref: "vec:origin" },
    turn_count: 1,
    trace_centroid: null,
    momentum: null,
    path_coherence: 0,
    visited_set: [],
    vars: {},
    registry: [],
    links: [],
    ended: false,
    input_log: [],
    ...over,
  };
}

// A small substrate: an origin span plus four neighbours, all traversal-capable
// so exits derive from them. Vectors are 2-D; nearer angle = nearer candidate.
function buildGraph(): { graph: Graph; room: Entity } {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  const spans: GraphSpan[] = [
    span(room, [1, 0]),
    span(makeEntity("a", { affordances: ["traverse"] }), [0.99, 0.14]),
    span(makeEntity("b", { affordances: ["enter"] }), [0.9, 0.44]),
    span(makeEntity("c", { affordances: ["traverse"] }), [0.7, 0.71]),
    span(makeEntity("d", { affordances: ["traverse"] }), [0.5, 0.87]),
  ];
  return { graph: createSubstrateGraph(spans), room };
}

/** A global layer whose rule fires unconditionally (`embedding_distance >= 0`). */
function globalLayer(
  id: string,
  mode: Layer["mode"],
  effect: Layer["rules"][number]["effect"],
): Layer {
  return {
    id,
    scope: "global",
    mode,
    rules: [{ predicate: "static.embedding_distance >= 0", effect }],
  };
}

// ── §4.4 / §6.4 Exit — the identical-evaluateLayers guarantee ─────────────────

describe("resolveMove and populate call the identical evaluateLayers (§4.4, §6.4)", () => {
  it("both entry points route through solverCore.evaluateLayers (same reference)", () => {
    const { graph, room } = buildGraph();
    const spy = vi.spyOn(solver.solverCore, "evaluateLayers");

    resolveMove(makeState(), graph, []);
    expect(spy).toHaveBeenCalledTimes(1);
    const usedByMove = spy.mock.calls.length;

    spy.mockClear();
    populate(room, makeState(), graph, []);
    expect(spy).toHaveBeenCalledTimes(1);

    // The same spy observed both — proving one shared function, not two equal ones.
    expect(usedByMove).toBe(1);
    expect(solver.solverCore.evaluateLayers).toBe(spy);
    spy.mockRestore();
  });
});

// ── §6.4 Exit — null-ruleset relativistic drift ───────────────────────────────

describe("null-ruleset drift (§6.4 Exit)", () => {
  it("resolves a move against plain neighbours with no errors and no throw", () => {
    const { graph } = buildGraph();
    let move!: ReturnType<typeof resolveMove>;
    expect(() => {
      move = resolveMove(makeState(), graph, []);
    }).not.toThrow();
    expect(move.destination).not.toBeNull();
    expect(move.resolution_status).toBe("resolved");
  });

  it("populates a room and derives exits under an empty ruleset", () => {
    const { graph, room } = buildGraph();
    const result = populate(room, makeState(), graph, []);
    expect(result.objects.length).toBeGreaterThan(0);
    expect(result.exits.length).toBeGreaterThan(0);
    expect(result.resolution_status).toBe("resolved");
  });
});

// ── §4.4 — zero-radius query, object count, exit derivation (A4) ───────────────

describe("populate — zero-radius query and exit derivation (§4.4, A4)", () => {
  it("samples round(density * MAX_ROOM_OBJECTS) objects, capped by the pool", () => {
    const { graph, room } = buildGraph();
    // density 1 ⇒ target 12, but the pool holds only 4 neighbours → 4 objects.
    const result = populate(room, makeState(), graph, []);
    expect(MAX_ROOM_OBJECTS).toBe(12);
    expect(result.objects.length).toBe(4);
  });

  it("scales the object count down by density", () => {
    const { graph } = buildGraph();
    // density 0.25 ⇒ round(0.25 * 12) = 3.
    const room = makeEntity("origin", {
      archetype: "container",
      embedding_ref: "vec:origin",
      layout_hint: { scale: "small", density: 0.25, shape_bias: "" },
    });
    const result = populate(room, makeState(), graph, []);
    expect(result.objects.length).toBe(3);
  });

  it("derives exits only from objects with a movement affordance", () => {
    const room = makeEntity("origin", {
      archetype: "container",
      embedding_ref: "vec:origin",
      layout_hint: { scale: "large", density: 1, shape_bias: "" },
    });
    const spans: GraphSpan[] = [
      span(room, [1, 0]),
      span(makeEntity("mover", { affordances: ["traverse"] }), [0.99, 0.14]),
      span(
        makeEntity("gate", { archetype: "portal", affordances: [] }),
        [0.98, 0.2],
      ),
      span(makeEntity("inert", { affordances: ["inspect"] }), [0.9, 0.44]),
    ];
    const graph = createSubstrateGraph(spans);
    const result = populate(room, makeState(), graph, []);

    const viaIds = result.exits.map((e) => e.via_object_id).sort();
    expect(viaIds).toEqual(["gate", "mover"]);
    const mover = result.exits.find((e) => e.via_object_id === "mover")!;
    expect(mover.affordance_required).toBe("traverse");
    expect(mover.target_entity_id).toBe("vec:mover");
    const gate = result.exits.find((e) => e.via_object_id === "gate")!;
    expect(gate.affordance_required).toBe("traverse"); // portal is traversal-capable
  });
});

// ── §0.9.0 (A4) — exit-anchoring ──────────────────────────────────────────────

describe("resolveMove — exit-anchoring (A4)", () => {
  function recordingGraph(inner: Graph, sink: string[]): Graph {
    return {
      query: (q) => {
        sink.push(q.origin.vector_ref);
        return inner.query(q);
      },
    };
  }

  it("anchors candidates to the interacted object's seeded query", () => {
    const { graph } = buildGraph();
    const seen: string[] = [];
    // A hard_allow layer keeps the anchored path from falling through to drift.
    const layers = [
      globalLayer("keep", { priority: 1 }, { kind: "hard_allow" }),
    ];
    resolveMove(makeState(), recordingGraph(graph, seen), layers, {
      anchor: { target_ref: "vec:c" },
    });
    expect(seen).toContain("vec:c");
    expect(seen).not.toContain("vec:origin");
  });

  it("leaves the null-drift path unchanged (queries the player position)", () => {
    const { graph } = buildGraph();
    const seen: string[] = [];
    resolveMove(makeState(), recordingGraph(graph, seen), []);
    expect(seen).toEqual(["vec:origin"]);
  });

  it("falls through to drift when no hard decision engages an anchored move", () => {
    const { graph } = buildGraph();
    const seen: string[] = [];
    // No layers → no hard decision → anchored query, then drift re-query.
    resolveMove(makeState(), recordingGraph(graph, seen), [], {
      anchor: { target_ref: "vec:c" },
    });
    expect(seen).toEqual(["vec:c", "vec:origin"]);
  });
});

// ── §4.1 (A5) — the post-decision commit phase ────────────────────────────────

describe("commit phase (§4.1 A5)", () => {
  it("applies write/emit/end effects in declaration order, last-write-wins", () => {
    const { graph } = buildGraph();
    const layers: Layer[] = [
      {
        id: "authoring",
        scope: "global",
        mode: { priority: 1 },
        rules: [
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "write", target: "flag", value: "first" },
          },
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "write", target: "flag", value: "second" },
          },
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "emit", text: "you step through" },
          },
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "end" },
          },
        ],
      },
    ];
    const move = resolveMove(makeState(), graph, layers);
    // `first`/`second` are bare words, not well-formed §4.2 operands, so they
    // store as plain strings — an author writing a bare word means that word.
    // Evaluated-expression values are covered in `commit-values.test.ts`.
    expect(move.commit.vars.flag).toBe("second"); // last-write-wins
    expect(move.commit.emits).toEqual([{ text: "you step through" }]);
    expect(move.commit.ended).toBe(true);
  });

  it("never throws and does not affect candidate filtering", () => {
    const { graph } = buildGraph();
    const layers: Layer[] = [
      {
        id: "writes-only",
        scope: "global",
        mode: { priority: 1 },
        rules: [
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "write", target: "x", value: "1" },
          },
        ],
      },
    ];
    let move!: ReturnType<typeof resolveMove>;
    expect(() => {
      move = resolveMove(makeState(), graph, layers);
    }).not.toThrow();
    // The write did not filter anything out — a destination still resolves.
    expect(move.destination).not.toBeNull();
    expect(move.commit.vars.x).toBe("1");
  });
});

// ── §0.11.0 (C2) — the degenerate / stuck resolution ──────────────────────────

describe("empty / stuck resolution (§0.11.0 C2)", () => {
  it("resolves a move to stuck when every candidate is hard-forbidden", () => {
    const { graph } = buildGraph();
    const layers = [
      globalLayer("wall", { priority: 1 }, { kind: "hard_forbid" }),
    ];
    const move = resolveMove(makeState(), graph, layers);
    expect(move.destination).toBeNull();
    expect(move.resolution_status).toBe("stuck");
  });

  it("populates an all-hard_forbid room to empty objects / exits → stuck", () => {
    const { graph, room } = buildGraph();
    const layers = [
      globalLayer("wall", { priority: 1 }, { kind: "hard_forbid" }),
    ];
    const result = populate(room, makeState(), graph, layers);
    expect(result.objects).toEqual([]);
    expect(result.exits).toEqual([]);
    expect(result.resolution_status).toBe("stuck");
  });

  it("resolves a zero-neighbour substrate to an empty room, never throwing", () => {
    const room = makeEntity("lonely", {
      archetype: "container",
      embedding_ref: "vec:lonely",
      layout_hint: { scale: "small", density: 1, shape_bias: "" },
    });
    const graph = createSubstrateGraph([span(room, [1, 0])]);
    let result!: ReturnType<typeof populate>;
    expect(() => {
      result = populate(
        room,
        makeState({ position: { vector_ref: "vec:lonely" } }),
        graph,
        [],
      );
    }).not.toThrow();
    expect(result.objects).toEqual([]);
    expect(result.exits).toEqual([]);
    expect(result.resolution_status).toBe("stuck");
  });
});

// ── INV-4 — contradictory overrides never throw (§6.4 Exit) ───────────────────

describe("INV-4 conformance — contradictory overrides (§6.4 Exit)", () => {
  function conflicting(): Layer[] {
    // Two override layers with a non-global scope (so neither is the other's
    // enclosing parent) — they stay unanchored in declaration order.
    const rule = (effect: Layer["rules"][number]["effect"]) => ({
      predicate: "static.embedding_distance >= 0",
      effect,
    });
    return [
      {
        id: "ov-first",
        scope: "dynamic.turn_count >= 0",
        mode: "override",
        rules: [rule({ kind: "hard_allow" })],
      },
      {
        id: "ov-second",
        scope: "dynamic.turn_count >= 0",
        mode: "override",
        rules: [rule({ kind: "hard_forbid" })],
      },
    ];
  }

  it("does not throw, resolves by declaration order, and logs a warning", () => {
    const { graph } = buildGraph();
    const log = new CollectingLogger();
    let move!: ReturnType<typeof resolveMove>;
    expect(() => {
      move = resolveMove(makeState(), graph, conflicting(), { logger: log });
    }).not.toThrow();

    // ov-first (hard_allow) is walked first → its decision stands → candidates
    // survive → a destination resolves despite the later hard_forbid override.
    expect(move.destination).not.toBeNull();
    expect(log.warnings()).toContain(OVERRIDE_CONFLICT_EVENT);
  });
});

// ── §4.5 (INV-2) — determinism ────────────────────────────────────────────────

describe("determinism (§4.5, INV-2)", () => {
  it("gives byte-identical move output across two independent runs", () => {
    const run = () => {
      const { graph } = buildGraph();
      return resolveMove(makeState(), graph, []);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("gives byte-identical room population across two independent runs", () => {
    const run = () => {
      const { graph, room } = buildGraph();
      return populate(room, makeState(), graph, []);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("changes the draw as the seed components advance", () => {
    const { graph, room } = buildGraph();
    // Same pool across turns; the seed advances with turn_count, so the sampled
    // object ORDER is not identical across every turn (§4.5 seed-relativity).
    const orderings = [1, 2, 3, 4, 5, 6].map((turn) =>
      populate(room, makeState({ turn_count: turn }), graph, [])
        .objects.map((o) => o.id)
        .join(","),
    );
    expect(new Set(orderings).size).toBeGreaterThan(1);
  });
});
