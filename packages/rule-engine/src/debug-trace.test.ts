// SPEC §4.6 / §6.4 — the engine-side `DebugTrace`. Covers issue #76's normative
// requirements: the §4.6 trace shape faithfully recorded over a fixture
// resolution (an activated + a skipped layer, one winning hard decision); the
// flag gate as SERVER config, never client-supplied; zero overhead on the hot
// path when disabled (asserted via a prototype spy — gate-before-construct, not
// construct-then-discard); and INV-2 byte-identical resolved output with the
// flag on vs off.

import { describe, it, expect, vi } from "vitest";
import type { Entity, Layer, SessionState } from "schema";
import { resolveMove, populate } from "./solver";
import { createDebugTrace, DebugTraceRecorder } from "./debug-trace";
import { createSubstrateGraph, type Graph, type GraphSpan } from "./graph";

// ── Fixtures (mirrors solver.test.ts) ─────────────────────────────────────────

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

// Origin plus four traversal-capable neighbours; nearer angle = nearer candidate,
// so the query ranks them a, b, c, d.
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

// A ruleset with an ACTIVATED global layer (a hard_allow firing on every
// candidate, plus a soft_reweight firing only on the nearest one) and a SKIPPED
// scoped layer (its scope never holds at turn_count 1).
function fixtureLayers(): Layer[] {
  return [
    {
      id: "gate",
      scope: "global",
      mode: { priority: 1 },
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "hard_allow" },
        },
        {
          predicate: "static.embedding_distance < 0.05",
          effect: { kind: "soft_reweight", factor: 0.5 },
        },
      ],
    },
    {
      id: "far-only",
      scope: "dynamic.turn_count > 999",
      mode: { priority: 1 },
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "hard_forbid" },
        },
      ],
    },
  ];
}

// ── The gate — SERVER config, never client-supplied (§4.6) ────────────────────

describe("createDebugTrace — the flag gate (§4.6)", () => {
  it("constructs a recorder only when the flag is enabled", () => {
    expect(createDebugTrace({ enabled: true })).toBeInstanceOf(
      DebugTraceRecorder,
    );
  });

  it("returns undefined when disabled — nothing is constructed", () => {
    expect(createDebugTrace({ enabled: false })).toBeUndefined();
  });

  it("returns undefined for absent config (the hot-path default)", () => {
    expect(createDebugTrace()).toBeUndefined();
  });
});

// ── Faithful trace content over a fixture resolution (§4.6) ───────────────────

describe("DebugTrace content over a fixture resolution (§4.6)", () => {
  it("records candidates, per-layer activation/fires, hard source, soft scores", () => {
    const { graph } = buildGraph();
    const move = resolveMove(makeState(), graph, fixtureLayers(), {
      debug: { enabled: true },
    });
    const trace = move.debug!;
    expect(trace).toBeDefined();

    // Initial candidate pool, nearest-first, before any filtering.
    expect(trace.candidates_initial).toEqual(["a", "b", "c", "d"]);

    // Both layers appear, in declaration order; only "gate" activated.
    expect(trace.per_layer.map((l) => l.layer_id)).toEqual([
      "gate",
      "far-only",
    ]);
    const gate = trace.per_layer.find((l) => l.layer_id === "gate")!;
    const farOnly = trace.per_layer.find((l) => l.layer_id === "far-only")!;

    expect(gate.activated).toBe(true);
    expect(farOnly.activated).toBe(false);
    expect(farOnly.rules_fired).toEqual([]); // a skipped layer fires nothing

    // gate rule 0 (hard_allow) fired for every candidate; rule 1 (soft_reweight)
    // only for the nearest, "a".
    expect(gate.rules_fired).toEqual([
      {
        rule_index: 0,
        effect: { kind: "hard_allow" },
        matched_entities: ["a", "b", "c", "d"],
      },
      {
        rule_index: 1,
        effect: { kind: "soft_reweight", factor: 0.5 },
        matched_entities: ["a"],
      },
    ]);

    // The winning hard decision came from "gate".
    expect(trace.final_hard_decision_source).toBe("gate");

    // Soft scores: "a" carries the 0.5 reweight, the rest stay at 1.
    expect(trace.final_soft_scores).toEqual({ a: 0.5, b: 1, c: 1, d: 1 });
  });

  it("records a null hard-decision source when no hard decision fired", () => {
    const { graph } = buildGraph();
    const softOnly: Layer[] = [
      {
        id: "soft",
        scope: "global",
        mode: { priority: 1 },
        rules: [
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "soft_reweight", factor: 0.9 },
          },
        ],
      },
    ];
    const move = resolveMove(makeState(), graph, softOnly, {
      debug: { enabled: true },
    });
    expect(move.debug!.final_hard_decision_source).toBeNull();
  });

  it("populate also carries a trace when the flag is on", () => {
    const { graph, room } = buildGraph();
    const result = populate(room, makeState(), graph, fixtureLayers(), {
      debug: { enabled: true },
    });
    expect(result.debug).toBeDefined();
    expect(result.debug!.candidates_initial).toEqual(["a", "b", "c", "d"]);
    expect(result.debug!.final_hard_decision_source).toBe("gate");
  });
});

// ── Zero overhead when disabled — gate before construct (§4.6) ────────────────

describe("zero overhead on the hot path when disabled (§4.6)", () => {
  it("does no trace work when the flag is off (recorder never constructed)", () => {
    const { graph } = buildGraph();
    const spies = [
      vi.spyOn(DebugTraceRecorder.prototype, "recordCandidates"),
      vi.spyOn(DebugTraceRecorder.prototype, "registerLayer"),
      vi.spyOn(DebugTraceRecorder.prototype, "recordRuleFired"),
      vi.spyOn(DebugTraceRecorder.prototype, "recordSoftScore"),
      vi.spyOn(DebugTraceRecorder.prototype, "build"),
    ];

    // Flag OFF (both the explicit-disabled and the absent-config paths).
    resolveMove(makeState(), graph, fixtureLayers());
    resolveMove(makeState(), graph, fixtureLayers(), {
      debug: { enabled: false },
    });
    populate(buildGraph().room, makeState(), graph, fixtureLayers());
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    // Flag ON — the same methods now run, proving the gate was what suppressed them.
    resolveMove(makeState(), graph, fixtureLayers(), {
      debug: { enabled: true },
    });
    for (const spy of spies) expect(spy).toHaveBeenCalled();

    for (const spy of spies) spy.mockRestore();
  });

  it("omits the debug field from the resolution when disabled", () => {
    const { graph, room } = buildGraph();
    expect(
      resolveMove(makeState(), graph, fixtureLayers()).debug,
    ).toBeUndefined();
    expect(
      populate(room, makeState(), graph, fixtureLayers()).debug,
    ).toBeUndefined();
  });
});

// ── INV-2 — enabling the trace does not change resolution output (§4.6) ───────

describe("INV-2 — flag on vs off is byte-identical resolved output (§4.6)", () => {
  it("resolveMove output is identical apart from the added debug field", () => {
    const { graph } = buildGraph();
    const off = resolveMove(makeState(), graph, fixtureLayers());
    const { debug, ...onRest } = resolveMove(
      makeState(),
      graph,
      fixtureLayers(),
      {
        debug: { enabled: true },
      },
    );
    expect(debug).toBeDefined();
    expect(JSON.stringify(onRest)).toBe(JSON.stringify(off));
  });

  it("populate output is identical apart from the added debug field", () => {
    const { graph, room } = buildGraph();
    const off = populate(room, makeState(), graph, fixtureLayers());
    const { debug, ...onRest } = populate(
      room,
      makeState(),
      graph,
      fixtureLayers(),
      {
        debug: { enabled: true },
      },
    );
    expect(debug).toBeDefined();
    expect(JSON.stringify(onRest)).toBe(JSON.stringify(off));
  });
});
