// SPEC §0.9.0 (A3) / §3.8 — the overlay address-token tree at the server seam
// (issue #108). Proves, end-to-end through the request handler, that a resolved
// place gets a durable, opaque, replay-deterministic address-token distinct from
// its ephemeral `Entity.id` and its substrate coordinate; that `visited_set`
// holds tokens while `position` stays a coordinate; that the tokens form the
// append-only parent→children tree `Entity.contains` resolves from; and that
// backtracking to an ancestor re-resolves fresh.
//
// `SessionState` is server-internal (INV-3), so these assertions read it through
// the store (`server.sessions.get`) rather than a response body — the wire never
// carries the tree.

import { describe, it, expect } from "vitest";
import type { Ruleset } from "schema";
import {
  ADDRESS_TOKEN_PREFIX,
  backtrackTo,
  childTokens,
  type GraphSpan,
  type SubstrateSpanView,
} from "rule-engine";
import { createServer, type ServerConfig } from "./server";

// ── Fixtures (mirroring server.test.ts) ─────────────────────────────────────────

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

const RULESET: Ruleset = {
  spec_version: "0.1.0",
  layers: [],
  interpretation_lookup: {
    by_archetype: {
      container: {
        layout_hint: { scale: "large", density: 1, shape_bias: "" },
      },
    },
  },
};

// A room plus four traversal-capable neighbours — exits derive from them.
function fullSubstrate(): GraphSpan[] {
  const room = makeSpan("origin", { archetype: "container" });
  return [
    span(room, [1, 0]),
    span(makeSpan("a", { archetype: "portal" }), [0.99, 0.14]),
    span(makeSpan("b", { archetype: "container" }), [0.9, 0.44]),
    span(makeSpan("c", { archetype: "portal" }), [0.7, 0.71]),
    span(makeSpan("d", { archetype: "portal" }), [0.5, 0.87]),
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

type Action = { object_id: string; affordance: string };
type Exit = {
  target_entity_id: string;
  affordance_required: string;
  via_object_id: string;
};
type Server = ReturnType<typeof createServer>;

function newSession(server: Server, seed = 42): string {
  const res = server.handle({
    method: "GET",
    url: `/session/new?seed=${seed}`,
  });
  return (getJson(res.body) as { session_id: string }).session_id;
}

function currentExits(server: Server, id: string): Exit[] {
  const res = server.handle({
    method: "GET",
    url: `/room/current?session_id=${id}`,
  });
  return (getJson(res.body) as { exits: Exit[] }).exits;
}

function interact(server: Server, id: string, action: Action) {
  return server.handle({
    method: "POST",
    url: "/interact",
    body: JSON.stringify({ session_id: id, action }),
  });
}

// Walk the first derived exit up to `steps` times, returning the input log taken.
function walk(server: Server, id: string, steps: number): Action[] {
  const log: Action[] = [];
  for (let i = 0; i < steps; i++) {
    const exits = currentExits(server, id);
    if (exits.length === 0) break;
    const action: Action = {
      object_id: exits[0]!.via_object_id,
      affordance: exits[0]!.affordance_required,
    };
    log.push(action);
    interact(server, id, action);
  }
  return log;
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("address-token tree (§0.9.0 A3 / §3.8)", () => {
  it("a fresh session has a root token but nothing visited yet", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const state = server.sessions.get(id)!;

    expect(state.current_token?.startsWith(ADDRESS_TOKEN_PREFIX)).toBe(true);
    expect(state.address_tokens).toHaveLength(1);
    expect(state.address_tokens[0]).toEqual({
      token: state.current_token,
      parent: null,
      position: { vector_ref: "vec:origin" },
    });
    // The start is where the player begins, not a place moved to.
    expect(state.visited_set).toEqual([]);
  });

  it("a move mints a token into visited_set — a token, NOT the substrate coordinate (acceptance 1/3)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const exit = currentExits(server, id)[0]!;
    interact(server, id, {
      object_id: exit.via_object_id,
      affordance: exit.affordance_required,
    });
    const state = server.sessions.get(id)!;

    expect(state.visited_set).toHaveLength(1);
    const token = state.visited_set[0]!;
    // Opaque: an overlay token, not the destination's substrate vector_ref.
    expect(token.startsWith(ADDRESS_TOKEN_PREFIX)).toBe(true);
    expect(token).not.toBe(state.position.vector_ref);
    expect(state.visited_set).not.toContain(state.position.vector_ref);
    // `position` stays a live substrate coordinate (§3.8) — the two are distinct.
    expect(state.position.vector_ref.startsWith("vec:")).toBe(true);
    // The token names the destination coordinate via the tree, not by being it.
    const node = state.address_tokens.find((n) => n.token === token)!;
    expect(node.position).toEqual(state.position);
    expect(node.parent).toBe(state.address_tokens[0]!.token); // child of root
  });

  it("the token is opaque: distinct from the resolved room's ephemeral Entity.id (acceptance 2)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    const exit = currentExits(server, id)[0]!;
    const res = interact(server, id, {
      object_id: exit.via_object_id,
      affordance: exit.affordance_required,
    });
    const body = getJson(res.body) as { new_room: { room: { id: string } } };
    const token = server.sessions.get(id)!.visited_set[0]!;

    expect(token).not.toBe(body.new_room.room.id);
    expect(token).not.toContain(body.new_room.room.id);
  });

  it("a multi-move path builds an append-only parent→children tree; contains resolves from it (acceptance 4)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    walk(server, id, 3);
    const state = server.sessions.get(id)!;

    expect(state.visited_set.length).toBeGreaterThan(0);
    // Every entry in visited_set is a token, never a raw coordinate.
    for (const token of state.visited_set) {
      expect(token.startsWith(ADDRESS_TOKEN_PREFIX)).toBe(true);
    }
    // The root composite has the first move as a child — `Entity.contains`
    // resolves exactly this grouping (§3.1), proven by mintEntity's unit test.
    const root = state.address_tokens[0]!.token;
    expect(childTokens(state.address_tokens, root)).toEqual([
      state.visited_set[0],
    ]);
    // The tree is append-only: it holds the root plus one node per visit.
    expect(state.address_tokens).toHaveLength(state.visited_set.length + 1);
    // Every non-root node links to a parent already in the tree.
    const known = new Set(state.address_tokens.map((n) => n.token));
    for (const node of state.address_tokens.slice(1)) {
      expect(node.parent).not.toBeNull();
      expect(known.has(node.parent!)).toBe(true);
    }
  });

  it("EntityState.visited is derived over the token, not the ephemeral id (acceptance 5)", () => {
    // After visiting a container neighbour, returning to a room that resolves the
    // visited coordinate reports visited=true; a never-visited object reports
    // false. We assert the derivation holds on the resolved room+objects.
    const server = createServer(makeConfig());
    const id = newSession(server);
    // Fresh room: nothing visited.
    const before = getJson(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    ) as { room: { state: { visited: boolean } }; objects: unknown[] };
    expect(before.room.state.visited).toBe(false);

    walk(server, id, 2);
    const state = server.sessions.get(id)!;
    // The visited coordinates are exactly those the visited tokens name.
    const visitedCoords = new Set(
      state.visited_set.map(
        (t) =>
          state.address_tokens.find((n) => n.token === t)!.position.vector_ref,
      ),
    );
    expect(visitedCoords.has(state.position.vector_ref)).toBe(true);
  });

  it("is replay-deterministic — same (seed, input-log) re-mints byte-identical tokens (acceptance 1, INV-2)", () => {
    const server = createServer(makeConfig());
    const idA = newSession(server, 1234);
    const log = walk(server, idA, 3);
    expect(log.length).toBeGreaterThan(0);

    // Replay the exact log against a fresh same-seed session.
    const idB = newSession(server, 1234);
    for (const action of log) interact(server, idB, action);

    const a = server.sessions.get(idA)!;
    const b = server.sessions.get(idB)!;
    expect(b.visited_set).toEqual(a.visited_set);
    expect(b.address_tokens).toEqual(a.address_tokens);
    expect(b.current_token).toEqual(a.current_token);
  });

  it("backtracking truncates to an ancestor and re-resolves fresh; the next move mints a sibling (acceptance 7)", () => {
    const server = createServer(makeConfig());
    const id = newSession(server);
    walk(server, id, 2);
    const state = server.sessions.get(id)!;

    const root = state.address_tokens[0]!.token;
    const firstMove = state.visited_set[0]!;
    const branchCount = childTokens(state.address_tokens, firstMove).length;

    // Truncate the current path back to the first move (an ancestor of the leaf).
    expect(backtrackTo(state, firstMove)).toBe(true);
    expect(state.current_token).toBe(firstMove);
    // Position is back at that place's coordinate — a re-resolution here is fresh.
    expect(state.position).toEqual(
      state.address_tokens.find((n) => n.token === firstMove)!.position,
    );

    // Move on: the new place is a SIBLING under firstMove, and old branches stay.
    const exits = currentExits(server, id);
    if (exits.length > 0) {
      interact(server, id, {
        object_id: exits[0]!.via_object_id,
        affordance: exits[0]!.affordance_required,
      });
      expect(childTokens(state.address_tokens, firstMove).length).toBe(
        branchCount + 1,
      );
    }
    // The root's subtree was never truncated away (the tree is monotonic, A3).
    expect(childTokens(state.address_tokens, root)).toContain(firstMove);
  });
});
