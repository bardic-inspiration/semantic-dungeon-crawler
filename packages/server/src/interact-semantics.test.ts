// SPEC §3.3 (A6) / §0.12.0 — what a non-transitioning interaction does.
//
// A6: "If no rule matches, the interaction is a no-op returning **the unchanged
// room**." A conformance audit found `POST /interact` advancing `turn_count`
// unconditionally and then re-resolving, and because the PRNG is seeded from
// `(session_seed, turn_count, normalized_query)` (§4.5), the re-resolution
// re-sampled — so reading a book handed the player a differently-populated room.
//
// The same audit found the server overloading `new_room.resolution_status` to
// report "the move resolved nowhere", making POST /interact disagree with an
// immediately-following GET /room/current about the same room. SPEC 0.12.0 gives
// that signal its own field, `InteractResponse.movement_blocked`.

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
    archetype: "prop",
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
    ...over,
  };
}

/** A room with several neighbours, so a re-sample would visibly reshuffle. */
function substrate(): GraphSpan[] {
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    { span: makeSpan("a", { archetype: "portal" }), embedding: [0.99, 0.14] },
    {
      span: makeSpan("book", { archetype: "readable" }),
      embedding: [0.95, 0.31],
    },
    { span: makeSpan("c", { archetype: "portal" }), embedding: [0.9, 0.44] },
    { span: makeSpan("d", { archetype: "prop" }), embedding: [0.7, 0.71] },
    { span: makeSpan("e", { archetype: "prop" }), embedding: [0.5, 0.87] },
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

function server(over: Partial<ServerConfig> = {}) {
  const s = createServer(makeConfig(over));
  const id = json<{ session_id: string }>(
    s.handle({ method: "GET", url: "/session/new?seed=42" }).body,
  ).session_id;
  return { s, id };
}

function room(s: ReturnType<typeof createServer>, id: string): string {
  return s.handle({ method: "GET", url: `/room/current?session_id=${id}` })
    .body;
}

function interact(
  s: ReturnType<typeof createServer>,
  id: string,
  object_id: string,
  affordance: string,
): InteractResponse {
  return json<InteractResponse>(
    s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id, affordance },
      }),
    }).body,
  );
}

describe("a local interaction returns the unchanged room (§3.3 A6)", () => {
  it("returns a new_room byte-identical to the room before it", () => {
    const { s, id } = server();
    const before = room(s, id);

    const res = interact(s, id, "book", "read");

    expect(res.transition_occurred).toBe(false);
    expect(JSON.stringify(res.new_room)).toBe(before);
  });

  it("leaves GET /room/current byte-identical afterwards too", () => {
    const { s, id } = server();
    const before = room(s, id);

    interact(s, id, "book", "read");

    expect(room(s, id)).toBe(before);
  });

  it("still records the input so replay reproduces it (§3.9)", () => {
    const { s, id } = server();
    interact(s, id, "book", "read");

    const log = json<unknown[]>(
      s.handle({ method: "GET", url: `/session/${id}/log` }).body,
    );
    expect(log).toHaveLength(1);
  });

  it("still applies commit-phase writes — A6 runs the same pipeline", () => {
    const ruleset: Ruleset = {
      spec_version: "0.12.0",
      layers: [
        {
          id: "on-read",
          scope: "global",
          mode: { priority: 1 },
          rules: [
            {
              predicate: "dynamic.turn_count >= 0",
              effect: { kind: "emit", text: "the page is damp" },
            },
          ],
        },
      ],
    };
    const { s, id } = server({ ruleset });

    const res = interact(s, id, "book", "read");
    expect(res.interaction_result.text).toBe("the page is damp");
  });
});

describe("movement_blocked reports a move that resolved nowhere (§3.3, §0.12.0)", () => {
  // Every candidate hard-forbidden: a movement affordance resolves to nothing.
  const FORBID_ALL: Ruleset = {
    spec_version: "0.12.0",
    layers: [
      {
        id: "sealed",
        scope: "global",
        mode: "override",
        rules: [
          {
            predicate: "static.embedding_distance >= 0",
            effect: { kind: "hard_forbid" },
          },
        ],
      },
    ],
  };

  it("sets movement_blocked when a movement affordance resolves nowhere", () => {
    const { s, id } = server({ ruleset: FORBID_ALL });
    const res = interact(s, id, "a", "traverse");

    expect(res.transition_occurred).toBe(false);
    expect(res.movement_blocked).toBe(true);
  });

  it("does not set it for a local interaction — that is not a blocked move", () => {
    const { s, id } = server();
    const res = interact(s, id, "book", "read");

    expect(res.movement_blocked ?? false).toBe(false);
  });

  it("does not set it for a successful move", () => {
    const { s, id } = server();
    const res = interact(s, id, "a", "traverse");

    expect(res.transition_occurred).toBe(true);
    expect(res.movement_blocked ?? false).toBe(false);
  });

  it("leaves new_room.resolution_status describing the ROOM, agreeing with GET /room/current", () => {
    const { s, id } = server({ ruleset: FORBID_ALL });
    const res = interact(s, id, "a", "traverse");

    const current = json<{ resolution_status: string }>(room(s, id));
    expect(res.new_room.resolution_status).toBe(current.resolution_status);
  });
});

describe("turn_count advances with position, so a stationary player's room is stable", () => {
  it("keeps the room stable across several local interactions", () => {
    const { s, id } = server();
    const before = room(s, id);

    interact(s, id, "book", "read");
    interact(s, id, "d", "inspect");
    interact(s, id, "e", "inspect");

    expect(room(s, id)).toBe(before);
  });

  it("changes the room when the player actually moves", () => {
    const { s, id } = server();
    const before = room(s, id);

    const res = interact(s, id, "a", "traverse");
    expect(res.transition_occurred).toBe(true);
    expect(room(s, id)).not.toBe(before);
  });
});
