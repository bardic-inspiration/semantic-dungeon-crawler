// SPEC §3.3 (A6) / §0.12.0 / §0.13.0 — what a non-transitioning interaction does,
// and how `turn_count` advances.
//
// A6: "If no rule matches, the interaction is a no-op returning **the unchanged
// room**." §0.13.0 makes that stability STRUCTURAL: the PRNG is seeded from
// `(session_seed, normalized_query)` (§4.5) and `normalized_query` carries the
// discretized position, so a stationary player re-seeds identically no matter how
// many turns elapse. `turn_count` is therefore free to be a pure runtime metric
// (§3.8): it advances once per resolved `POST /interact` — movement, blocked move,
// and local interaction alike — and no longer needs the old freeze-while-stationary
// workaround that A6 used to depend on.
//
// A conformance audit had also found the server overloading
// `new_room.resolution_status` to report "the move resolved nowhere", making POST
// /interact disagree with an immediately-following GET /room/current about the same
// room. SPEC 0.12.0 gives that signal its own field,
// `InteractResponse.movement_blocked`.

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

describe("a stationary player's room is stable — structural under §0.13.0 (§3.3 A6)", () => {
  it("keeps the room stable across several local interactions", () => {
    const { s, id } = server();
    const before = room(s, id);

    interact(s, id, "book", "read");
    interact(s, id, "d", "inspect");
    interact(s, id, "e", "inspect");

    // Stable even though `turn_count` advanced 0→3: the §4.5 seed no longer reads
    // it, only the (unchanged) position via `normalized_query` (§0.13.0).
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

// §3.8 / §0.13.0 — `turn_count` advances once per resolved interaction, whatever
// the interaction did. A global layer that emits `t<turn_count>` lets a test read
// `dynamic.turn_count` off `interaction_result.text`: the emit runs in the same
// commit phase A6 runs, BEFORE the post-resolution increment, so each interact
// reports the count it resolved AT, and the sequence exposes the +1 per turn.
describe("turn_count advances once per resolved interaction (§3.8, §0.13.0)", () => {
  function turnCountProbe(): Ruleset {
    const rules = Array.from({ length: 9 }, (_unused, n) => ({
      predicate: `dynamic.turn_count == ${n}`,
      effect: { kind: "emit" as const, text: `t${n}` },
    }));
    return {
      spec_version: "0.12.0",
      layers: [{ id: "probe", scope: "global", mode: { priority: 1 }, rules }],
    };
  }

  /** The `turn_count` this interaction resolved at, read off the probe's emit. */
  function turnAt(res: InteractResponse): number {
    const text = res.interaction_result.text ?? "";
    return Number(text.replace(/^t/, ""));
  }

  it("advances by exactly 1 on each local (non-movement) interaction", () => {
    const { s, id } = server({ ruleset: turnCountProbe() });

    expect(turnAt(interact(s, id, "book", "read"))).toBe(0);
    expect(turnAt(interact(s, id, "d", "inspect"))).toBe(1);
    expect(turnAt(interact(s, id, "e", "inspect"))).toBe(2);
  });

  it("advances on a successful move, continuous with the surrounding turns", () => {
    const { s, id } = server({ ruleset: turnCountProbe() });

    // local at t0, then a move at t1 (transition), then a local at t2 in the new
    // room — an unbroken 0,1,2 across the movement boundary.
    expect(turnAt(interact(s, id, "book", "read"))).toBe(0);

    const moved = interact(s, id, "a", "traverse");
    expect(moved.transition_occurred).toBe(true);
    expect(turnAt(moved)).toBe(1);

    // A non-movement affordance is local wherever the move landed (its object_id
    // is not validated against the room), so this reads turn_count 2.
    expect(turnAt(interact(s, id, "probe", "read"))).toBe(2);
  });

  it("advances on a blocked move — the player stood still but the turn counted", () => {
    // Every candidate hard-forbidden AND the probe: a movement affordance resolves
    // nowhere, yet the commit phase still fires the probe's emit.
    const blockedProbe: Ruleset = {
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
        ...turnCountProbe().layers,
      ],
    };
    const { s, id } = server({ ruleset: blockedProbe });

    const first = interact(s, id, "a", "traverse");
    expect(first.movement_blocked).toBe(true);
    expect(turnAt(first)).toBe(0);

    const second = interact(s, id, "a", "traverse");
    expect(second.movement_blocked).toBe(true);
    expect(turnAt(second)).toBe(1);
  });
});

// §4.5 / §0.13.0 (INV-2) — the replay guarantee over a session that exercises all
// three interaction outcomes. With `turn_count` out of the seed, the only thing
// that could still differ between two runs is the input log itself; identical
// inputs must therefore reproduce every byte.
describe("determinism across a mixed movement / blocked / local session (§4.5, §0.13.0)", () => {
  // A raw-body POST so the comparison is over the exact bytes the server emitted,
  // not a re-serialization of parsed objects (which would hide key-order drift).
  function interactRaw(
    s: ReturnType<typeof createServer>,
    id: string,
    object_id: string,
    affordance: string,
  ): string {
    return s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id, affordance },
      }),
    }).body;
  }

  // One global override layer that seals every candidate off ONCE a turn has
  // passed (`turn_count >= 1`). The opening `traverse` (turn 0) is unsealed and
  // moves; the next `traverse` (turn ≥1) resolves nowhere and is a blocked move;
  // `read` never moves and is local regardless. One ruleset, one session, all
  // three outcomes — and every turn is scripted, so replay is exact.
  const MIXED: Ruleset = {
    spec_version: "0.12.0",
    layers: [
      {
        id: "seal-after-first-turn",
        scope: "global",
        mode: "override",
        rules: [
          {
            predicate:
              "static.embedding_distance >= 0 AND dynamic.turn_count >= 1",
            effect: { kind: "hard_forbid" },
          },
        ],
      },
    ],
  };

  const SCRIPT: { object_id: string; affordance: string }[] = [
    { object_id: "a", affordance: "traverse" }, // move    — origin → elsewhere, 0→1
    { object_id: "x", affordance: "traverse" }, // blocked — now sealed, turn 1→2
    { object_id: "x", affordance: "read" }, // local   — sealed but read moves nothing, 2→3
    { object_id: "x", affordance: "traverse" }, // blocked — still sealed, turn 3→4
  ];

  /** Drive one fresh session through SCRIPT and collect the raw response frames. */
  function run(): string[] {
    const { s, id } = server({ ruleset: MIXED });
    const frames = [room(s, id)];
    for (const a of SCRIPT)
      frames.push(interactRaw(s, id, a.object_id, a.affordance));
    return frames;
  }

  it("exercises a real move, a blocked move, and local interactions in one run", () => {
    const { s, id } = server({ ruleset: MIXED });
    const moved = interact(s, id, "a", "traverse");
    expect(moved.transition_occurred).toBe(true); // the move
    const blocked = interact(s, id, "x", "traverse");
    expect(blocked.movement_blocked).toBe(true); // the blocked move
    const local = interact(s, id, "x", "read");
    expect(local.transition_occurred).toBe(false); // a local interaction
    expect(local.movement_blocked ?? false).toBe(false);
  });

  it("reproduces byte-identical frames across two independent runs", () => {
    expect(run().join(" ")).toBe(run().join(" "));
  });

  it("revisiting the same coordinate yields the same room, whatever turn it is (§0.13.0)", () => {
    // The room seeds on position via `normalized_query`, not on `turn_count`, so a
    // coordinate resolves identically no matter how many turns have elapsed since
    // it was first seen — the structural form of "return to a coordinate, get the
    // same room". Here `turn_count` climbs 0→3 while the player never leaves origin.
    const { s, id } = server();
    const firstVisit = room(s, id);

    interact(s, id, "book", "read");
    interact(s, id, "d", "inspect");
    interact(s, id, "e", "inspect");

    expect(room(s, id)).toBe(firstVisit);
  });
});
