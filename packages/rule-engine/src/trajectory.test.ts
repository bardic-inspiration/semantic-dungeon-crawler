// SPEC §3.8 / §0.10.0 (B5) — the per-turn trajectory triple.
//
// `trace_centroid`, `momentum`, and `path_coherence` are declared on
// `SessionState` but, before this, nothing computed them: `path_coherence` stayed
// `0` and the two vectors stayed `null` forever, so every author predicate
// reading them was silently dead. These tests pin the pure trajectory math
// (`computeTrajectory`) and the `Graph`-backed accessor (`trajectoryEmbeddings` /
// `updateTrajectory`).

import { describe, it, expect } from "vitest";
import type { SessionState } from "schema";
import {
  computeTrajectory,
  trajectoryEmbeddings,
  updateTrajectory,
  INITIAL_TRAJECTORY,
  MOMENTUM_DECAY,
} from "./trajectory";
import { createSubstrateGraph, type GraphSpan } from "./graph";
import type { SubstrateSpanView } from "./interpretation";

function makeSpan(id: string): SubstrateSpanView {
  return {
    id,
    semantic_tags: [],
    archetype: "prop",
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
  };
}

describe("computeTrajectory (§3.8 / B5)", () => {
  it("returns the init triple for an empty trajectory", () => {
    expect(computeTrajectory([])).toEqual(INITIAL_TRAJECTORY);
  });

  it("with only a start position, centroid/momentum stay null and coherence 0", () => {
    // The start is where the player began, not a visited place — no visited
    // positions to average, no completed step to build momentum from.
    expect(computeTrajectory([[1, 0]])).toEqual({
      trace_centroid: null,
      momentum: null,
      path_coherence: 0,
    });
  });

  it("after one step: centroid is the visited point, momentum the step, coherence still 0", () => {
    // One step is not two, so there is no consecutive pair to align — coherence
    // holds the init default (B5: "<2 steps ... stays at the init default").
    const t = computeTrajectory([
      [0, 0],
      [1, 0],
    ]);
    expect(t.trace_centroid).toEqual([1, 0]);
    expect(t.momentum).toEqual([1, 0]);
    expect(t.path_coherence).toBe(0);
  });

  it("a straight path scores maximal directional consistency (coherence → 1)", () => {
    // Steps [1,0] then [1,0]: perfectly aligned, cos = 1, mapped to 1.
    const t = computeTrajectory([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(t.path_coherence).toBeCloseTo(1);
    // centroid is the mean of the two VISITED points (start excluded).
    expect(t.trace_centroid).toEqual([1.5, 0]);
  });

  it("backtracking scores minimal consistency (coherence → 0)", () => {
    // Steps [1,0] then [-1,0]: opposed, cos = -1, mapped to 0.
    const t = computeTrajectory([
      [0, 0],
      [1, 0],
      [0, 0],
    ]);
    expect(t.path_coherence).toBeCloseTo(0);
  });

  it("orthogonal wandering lands mid-range (coherence → 0.5)", () => {
    const t = computeTrajectory([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(t.path_coherence).toBeCloseTo(0.5);
  });

  it("momentum is the EMA fold over the ordered steps", () => {
    // steps: [1,0], [0,1]. momentum = decay·[1,0] + (1-decay)·[0,1].
    const t = computeTrajectory([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(t.momentum).toEqual([MOMENTUM_DECAY, 1 - MOMENTUM_DECAY]);
  });

  it("path_coherence is always within [0,1]", () => {
    for (const occupied of [
      [
        [0, 0],
        [3, 1],
        [1, -2],
        [-4, 5],
      ],
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ],
    ]) {
      const { path_coherence } = computeTrajectory(occupied);
      expect(path_coherence).toBeGreaterThanOrEqual(0);
      expect(path_coherence).toBeLessThanOrEqual(1);
    }
  });
});

// Build a minimal session whose token tree encodes a start plus a linear visit
// chain, so `trajectoryEmbeddings` has a real path to resolve embeddings for.
function sessionWithPath(refs: string[]): SessionState {
  const [start, ...visited] = refs;
  const address_tokens = [
    { token: "root", parent: null, position: { vector_ref: start! } },
    ...visited.map((ref, i) => ({
      token: `t${i}`,
      parent: i === 0 ? "root" : `t${i - 1}`,
      position: { vector_ref: ref },
    })),
  ];
  return {
    session_id: "s",
    session_seed: 1,
    position: { vector_ref: refs[refs.length - 1]! },
    turn_count: visited.length,
    trace_centroid: null,
    momentum: null,
    path_coherence: 0,
    visited_set: visited.map((_, i) => `t${i}`),
    address_tokens,
    current_token: address_tokens[address_tokens.length - 1]!.token,
    vars: {},
    registry: [],
    links: [],
    ended: false,
    input_log: [],
  };
}

describe("trajectoryEmbeddings / updateTrajectory over the Graph seam", () => {
  const spans: GraphSpan[] = [
    { span: makeSpan("vec:a"), embedding: [0, 0] },
    { span: makeSpan("vec:b"), embedding: [1, 0] },
    { span: makeSpan("vec:c"), embedding: [2, 0] },
  ];
  const graph = createSubstrateGraph(spans);

  it("resolves the chronological occupied embeddings [start, ...visited]", () => {
    const state = sessionWithPath(["vec:a", "vec:b", "vec:c"]);
    expect(trajectoryEmbeddings(state, graph)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it("drops a coordinate the substrate has no embedding for (INV-4)", () => {
    const state = sessionWithPath(["vec:a", "vec:missing", "vec:c"]);
    expect(trajectoryEmbeddings(state, graph)).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });

  it("writes the computed triple back onto the session state", () => {
    const state = sessionWithPath(["vec:a", "vec:b", "vec:c"]);
    updateTrajectory(state, graph);
    expect(state.trace_centroid).toEqual([1.5, 0]);
    expect(state.momentum).toEqual([1, 0]);
    expect(state.path_coherence).toBeCloseTo(1);
  });
});
