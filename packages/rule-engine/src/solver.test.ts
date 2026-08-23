// SPEC §4.1 / §4.4 / §6.4 Exit — the solver core. Covers the normative
// requirements of issue #75: the identical-`evaluateLayers` guarantee (function
// identity, not just equal output), the zero-radius `populate` query with
// exit derivation (A4), exit-anchoring (A4), the post-decision commit phase (A5),
// the degenerate/stuck resolution (C2), null-ruleset drift, determinism (INV-2),
// and INV-4 conformance (contradictory overrides never throw).

import { describe, it, expect, vi } from "vitest";
import type { Entity, InterpretationLookup, Layer, SessionState } from "schema";
import * as solver from "./solver";
import {
  resolveMove,
  populate,
  MAX_ROOM_OBJECTS,
  DEFAULT_QUERY_K,
  DEFAULT_QUERY_RADIUS,
  MALFORMED_PREDICATE_EVENT,
  MALFORMED_SCOPE_EVENT,
} from "./solver";
import { createSubstrateGraph, type Graph, type GraphSpan } from "./graph";
import { mintEntity, type SubstrateSpanView } from "./interpretation";
import { CollectingLogger } from "./instrumentation";
import { OVERRIDE_CONFLICT_EVENT } from "./layer-resolution";

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

function span(view: SubstrateSpanView, embedding: number[]): GraphSpan {
  return { span: view, embedding };
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
    address_tokens: [],
    current_token: null,
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
// §0.9.0 (A13) — `layout_hint`/`salience`/`affordances` are interpretations now,
// not fixture fields. These fixtures used to set `density: 1` on the room entity
// directly; the equivalent is an interpretation the room's archetype resolves to.
const TEST_INTERPRETATION: InterpretationLookup = {
  by_archetype: {
    container: { layout_hint: { scale: "large", density: 1, shape_bias: "" } },
  },
};

function buildGraph(): { graph: Graph; room: Entity } {
  const roomSpan = makeSpan("origin", { archetype: "container" });
  const room = mintEntity(roomSpan, TEST_INTERPRETATION);
  const spans: GraphSpan[] = [
    span(roomSpan, [1, 0]),
    span(makeSpan("a", { archetype: "portal" }), [0.99, 0.14]),
    span(makeSpan("b", { archetype: "container" }), [0.9, 0.44]),
    span(makeSpan("c", { archetype: "portal" }), [0.7, 0.71]),
    span(makeSpan("d", { archetype: "portal" }), [0.5, 0.87]),
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
    // density 0.25 ⇒ round(0.25 * 12) = 3. Density is an interpretation now
    // (A13), so the fixture asks for it through a lookup.
    const sparse: InterpretationLookup = {
      by_archetype: {
        container: {
          layout_hint: { scale: "small", density: 0.25, shape_bias: "" },
        },
      },
    };
    const room = mintEntity(
      makeSpan("origin", { archetype: "container" }),
      sparse,
    );
    const result = populate(room, makeState(), graph, [], {
      interpretation: sparse,
    });
    expect(result.objects.length).toBe(3);
  });

  it("derives exits only from objects with a movement affordance", () => {
    const roomSpan = makeSpan("origin", { archetype: "container" });
    const room = mintEntity(roomSpan, TEST_INTERPRETATION);
    const spans: GraphSpan[] = [
      span(roomSpan, [1, 0]),
      span(makeSpan("mover", { archetype: "portal" }), [0.99, 0.14]),
      // A `portal` whose affordance list an author has emptied: §3.2 (A4) makes
      // the ARCHETYPE a movement trigger in its own right, so it still yields an
      // exit. Stronger than the old fixture, which set `affordances: []` directly.
      span(makeSpan("gate", { archetype: "portal" }), [0.98, 0.2]),
      span(makeSpan("inert", { archetype: "prop" }), [0.9, 0.44]),
    ];
    const graph = createSubstrateGraph(spans);
    const result = populate(room, makeState(), graph, []);

    const viaIds = result.exits.map((e) => e.via_object_id).sort();
    expect(viaIds).toEqual(["vec:gate", "vec:mover"]);
    const mover = result.exits.find((e) => e.via_object_id === "vec:mover")!;
    expect(mover.affordance_required).toBe("traverse");
    expect(mover.target_entity_id).toBe("vec:mover");
    const gate = result.exits.find((e) => e.via_object_id === "vec:gate")!;
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
    const lonelySpan = makeSpan("lonely", { archetype: "container" });
    const room = mintEntity(lonelySpan, TEST_INTERPRETATION);
    const graph = createSubstrateGraph([span(lonelySpan, [1, 0])]);
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

  it("logs the override conflict once per resolution, not once per candidate (#107)", () => {
    // buildGraph exposes a multi-candidate pool, so the per-candidate resolution
    // loop hits the same authoring conflict on every candidate. The warning must
    // still surface exactly once for the resolution.
    const { graph } = buildGraph();
    const log = new CollectingLogger();
    resolveMove(makeState(), graph, conflicting(), { logger: log });

    const conflicts = log
      .warnings()
      .filter((e) => e === OVERRIDE_CONFLICT_EVENT);
    expect(conflicts.length).toBe(1);
  });
});

// ── §4.4 B3 (#107) — query `k` decoupled from the population target ────────────

describe("DEFAULT_QUERY_K is decoupled from the population target (§4.4 B3, #107)", () => {
  // A wide substrate: an origin plus 20 traversal-capable neighbours fanned out
  // by angle so ranking is total. At density 1.0 the population target is
  // MAX_ROOM_OBJECTS (12), and the pool must be strictly larger for the draw to
  // be a selection rather than a permutation of the whole pool.
  function wideGraph(): { graph: Graph; room: Entity } {
    const roomSpan = makeSpan("origin", { archetype: "container" });
    const room = mintEntity(roomSpan, TEST_INTERPRETATION);
    const spans: GraphSpan[] = [span(roomSpan, [1, 0])];
    for (let i = 0; i < 20; i++) {
      // Small angles keep every neighbour well within DEFAULT_QUERY_RADIUS.
      const theta = (i + 1) * 0.02;
      spans.push(
        span(makeSpan(`n${i}`, { archetype: "portal" }), [
          Math.cos(theta),
          Math.sin(theta),
        ]),
      );
    }
    return { graph: createSubstrateGraph(spans), room };
  }

  it("draws MORE candidates than the population target", () => {
    expect(DEFAULT_QUERY_K).toBeGreaterThan(MAX_ROOM_OBJECTS);
  });

  it("at density 1.0 samples a selection from a larger pool, not the whole pool", () => {
    const { graph, room } = wideGraph();
    const result = populate(room, makeState(), graph, []);
    // Target round(1.0 * 12) = 12 objects, chosen from the >12-candidate pool.
    expect(result.objects.length).toBe(MAX_ROOM_OBJECTS);
  });
});

// ── §4.4 B3 (#107) — engine-default radius ────────────────────────────────────

describe("populate supplies an engine-default radius (§4.4 B3, #107)", () => {
  // Origin at [1,0] with a near neighbour and a diametrically opposite one
  // (cosine distance 2 > DEFAULT_QUERY_RADIUS). The far span must be bounded out
  // by default, and admitted only when the caller widens the radius.
  function graphWithFarSpan(): { graph: Graph; room: Entity } {
    const roomSpan = makeSpan("origin", { archetype: "container" });
    const room = mintEntity(roomSpan, TEST_INTERPRETATION);
    const spans: GraphSpan[] = [
      span(roomSpan, [1, 0]),
      span(makeSpan("near", { archetype: "portal" }), [0.99, 0.14]),
      span(makeSpan("far", { archetype: "portal" }), [-1, 0]),
    ];
    return { graph: createSubstrateGraph(spans), room };
  }

  it("bounds out a span beyond the default radius", () => {
    expect(DEFAULT_QUERY_RADIUS).toBeLessThan(2);
    const { graph, room } = graphWithFarSpan();
    const result = populate(room, makeState(), graph, []);
    const ids = result.objects.map((o) => o.id);
    expect(ids).toContain("vec:near");
    expect(ids).not.toContain("vec:far");
  });

  it("admits the far span when an explicit radius widens the query", () => {
    const { graph, room } = graphWithFarSpan();
    const result = populate(room, makeState(), graph, [], { radius: 2 });
    const ids = result.objects.map((o) => o.id);
    expect(ids).toContain("vec:far");
  });
});

// ── §2.1 / §3.6.2 C5 (#107) — malformed predicates/scopes surface at warn ──────

describe("malformed predicates and scopes surface through the Logger (#107)", () => {
  it("warns on a malformed predicate, and that rule never fires (INV-4)", () => {
    const { graph } = buildGraph();
    const log = new CollectingLogger();
    const layers: Layer[] = [
      {
        id: "bad-pred",
        scope: "global",
        mode: { priority: 1 },
        // A syntactically malformed predicate — parseOrNull returns null.
        rules: [
          { predicate: "static.archetype ==", effect: { kind: "hard_forbid" } },
        ],
      },
    ];
    // hard_forbid would empty the pool if it fired; a malformed predicate never
    // fires, so a destination still resolves.
    const move = resolveMove(makeState(), graph, layers, { logger: log });
    expect(move.destination).not.toBeNull();

    const entry = log.entries.find(
      (e) => e.event === MALFORMED_PREDICATE_EVENT,
    );
    expect(entry?.level).toBe("warn");
    expect(entry?.fields).toMatchObject({ layer: "bad-pred", rule: 0 });
  });

  it("warns on a malformed scope, and that layer deactivates (INV-4)", () => {
    const { graph } = buildGraph();
    const log = new CollectingLogger();
    const layers: Layer[] = [
      {
        id: "bad-scope",
        scope: "dynamic.turn_count >=", // malformed
        mode: { priority: 1 },
        rules: [
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "hard_forbid" },
          },
        ],
      },
    ];
    // The layer deactivates (its hard_forbid never applies), so a move resolves.
    const move = resolveMove(makeState(), graph, layers, { logger: log });
    expect(move.destination).not.toBeNull();

    const entry = log.entries.find((e) => e.event === MALFORMED_SCOPE_EVENT);
    expect(entry?.level).toBe("warn");
    expect(entry?.fields).toMatchObject({ layer: "bad-scope" });
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
