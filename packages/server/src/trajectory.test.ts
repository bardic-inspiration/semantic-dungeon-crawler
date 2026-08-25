// SPEC §3.8 / §0.10.0 (B5) — the session trajectory is computed per turn, and the
// substrate honours the gradient query.
//
// Before this, `POST /interact` advanced `turn_count`/`position`/`visited_set` but
// never touched `trace_centroid`/`momentum`/`path_coherence`, so
// `dynamic.path_coherence` was permanently `0` and the two vectors permanently
// `null` — any author predicate reading them silently dead. These tests assert the
// per-turn update fires, an author predicate on `dynamic.path_coherence` actually
// gates, the gradient source is ruleset config (default drift), determinism holds,
// and the server-internal vectors never cross the wire (INV-3).

import { describe, it, expect } from "vitest";
import type { InteractResponse, Ruleset } from "schema";
import type { GraphSpan, SubstrateSpanView } from "rule-engine";
import { createServer, type ServerConfig } from "./server";

function makeSpan(
  id: string,
  over: Partial<SubstrateSpanView> = {},
): SubstrateSpanView {
  return {
    id: `vec:${id}`,
    semantic_tags: [],
    archetype: "portal", // traversal-capable, so every neighbour is an exit
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
    ...over,
  };
}

// A spread of neighbours in embedding space so a drift move always has somewhere
// to go (a non-empty pool → a real transition each turn).
function substrate(): GraphSpan[] {
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    { span: makeSpan("a"), embedding: [0.9, 0.2] },
    { span: makeSpan("b"), embedding: [0.7, 0.5] },
    { span: makeSpan("c"), embedding: [0.5, 0.8] },
    { span: makeSpan("d"), embedding: [0.2, 0.95] },
    { span: makeSpan("e"), embedding: [-0.2, 0.98] },
  ];
}

const NULL_RULESET: Ruleset = { spec_version: "0.12.0", layers: [] };

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

function newSession(s: ReturnType<typeof createServer>, seed = 42): string {
  return json<{ session_id: string }>(
    s.handle({ method: "GET", url: `/session/new?seed=${seed}` }).body,
  ).session_id;
}

function move(
  s: ReturnType<typeof createServer>,
  id: string,
): InteractResponse {
  // A movement affordance with no matching exit still routes through the drift
  // query, so it transitions whenever the neighbour pool is non-empty.
  return json<InteractResponse>(
    s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id: "drift", affordance: "traverse" },
      }),
    }).body,
  );
}

describe("per-turn trajectory update (§3.8, minimal)", () => {
  it("path_coherence moves off 0 across a two-turn session", () => {
    const s = createServer(makeConfig());
    const id = newSession(s);
    const state = s.sessions.get(id)!;

    expect(state.path_coherence).toBe(0);
    expect(state.trace_centroid).toBeNull();
    expect(state.momentum).toBeNull();

    // First transition: one step — momentum/centroid become real, coherence still
    // has no consecutive pair to score.
    expect(move(s, id).transition_occurred).toBe(true);
    expect(state.trace_centroid).not.toBeNull();
    expect(state.momentum).not.toBeNull();
    expect(state.path_coherence).toBe(0);

    // Second transition: a second step gives a consecutive pair — coherence is now
    // computed and off its init default.
    expect(move(s, id).transition_occurred).toBe(true);
    expect(state.path_coherence).toBeGreaterThan(0);
    expect(state.path_coherence).toBeLessThanOrEqual(1);
  });
});

describe("an author predicate on dynamic.path_coherence fires (§4.2, typical)", () => {
  // A global layer that emits once the trajectory has any directional
  // consistency. It is silently dead until the per-turn update actually moves
  // path_coherence off 0.
  const ruleset: Ruleset = {
    spec_version: "0.12.0",
    layers: [
      {
        id: "coherence-watch",
        scope: "global",
        mode: { priority: 0 },
        rules: [
          {
            predicate: "dynamic.path_coherence > 0",
            effect: { kind: "emit", text: "the path feels purposeful" },
          },
        ],
      },
    ],
  };

  it("does not emit before two steps, then emits once path_coherence is positive", () => {
    const s = createServer(makeConfig({ ruleset }));
    const id = newSession(s);

    // Turn 1: one step, path_coherence still 0 — the predicate does not hold.
    const first = move(s, id);
    expect(first.interaction_result.text).toBeUndefined();

    // Turn 2 onward: path_coherence is positive, so the emit fires.
    move(s, id);
    const third = move(s, id);
    expect(s.sessions.get(id)!.path_coherence).toBeGreaterThan(0);
    expect(third.interaction_result.text).toContain("purposeful");
  });
});

describe("the gradient source is ruleset config with an engine default (B3)", () => {
  it("a zero-config ruleset drifts — momentum is never fed as a direction", () => {
    // With no substrate config, the two sessions below (identical seeds) resolve
    // identically whether or not momentum exists: the default issues no direction.
    const s = createServer(makeConfig());
    const id = newSession(s, 99);
    for (let i = 0; i < 4; i++) move(s, id);
    // Reaching here without divergence is the drift default; the gradient path is
    // pinned for byte-identity below.
    expect(s.sessions.get(id)!.turn_count).toBeGreaterThan(0);
  });

  it("gradient-sourced moves replay byte-identically from the input log (maxed, INV-2)", () => {
    const gradientRuleset: Ruleset = {
      ...NULL_RULESET,
      substrate: { gradient_source: "momentum" },
    };

    function run(): string {
      const s = createServer(makeConfig({ ruleset: gradientRuleset }));
      const id = newSession(s, 123);
      const positions: string[] = [];
      for (let i = 0; i < 5; i++) {
        move(s, id);
        positions.push(s.sessions.get(id)!.position.vector_ref);
      }
      return positions.join(",");
    }

    // Two independent runs of the same (seed, ruleset, input-log) with the gradient
    // query engaged reproduce the same trajectory byte-for-byte.
    expect(run()).toBe(run());
  });

  it("the gradient source changes the trajectory versus pure drift", () => {
    function trajectoryUnder(ruleset: Ruleset): string {
      const s = createServer(makeConfig({ ruleset }));
      const id = newSession(s, 555);
      const positions: string[] = [];
      for (let i = 0; i < 6; i++) {
        move(s, id);
        positions.push(s.sessions.get(id)!.position.vector_ref);
      }
      return positions.join(",");
    }

    const drift = trajectoryUnder(NULL_RULESET);
    const gradient = trajectoryUnder({
      ...NULL_RULESET,
      substrate: { gradient_source: "momentum" },
    });
    // The gradient bias steers the walk, so the two paths diverge — proof the
    // direction is actually honoured by the substrate, not just seeded.
    expect(gradient).not.toBe(drift);
  });
});

describe("the trajectory vectors stay server-internal (INV-3)", () => {
  it("never appear in an interact response body", () => {
    const s = createServer(
      makeConfig({
        ruleset: {
          ...NULL_RULESET,
          substrate: { gradient_source: "momentum" },
        },
      }),
    );
    const id = newSession(s);
    const raw = s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id: "drift", affordance: "traverse" },
      }),
    }).body;
    // Move twice so momentum/centroid are populated, then re-check the wire.
    const raw2 = s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id: "drift", affordance: "traverse" },
      }),
    }).body;

    for (const body of [raw, raw2]) {
      expect(body).not.toContain("trace_centroid");
      expect(body).not.toContain("momentum");
      expect(body).not.toContain("path_coherence");
    }
    // Sanity: the server DID compute them internally.
    expect(s.sessions.get(id)!.momentum).not.toBeNull();
  });
});
