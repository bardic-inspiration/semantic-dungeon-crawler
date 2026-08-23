import { describe, expect, it } from "vitest";
import type { AddressToken, InputLogEntry, SessionState } from "./session";

describe("§3.8 SessionState", () => {
  it("type-checks a fresh session at turn 0", () => {
    const state: SessionState = {
      session_id: "s-1",
      session_seed: 1234,
      position: { vector_ref: "vec:origin" },
      turn_count: 0,
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
    };
    expect(state.turn_count).toBe(0);
    expect(state.session_seed).toBe(1234);
    expect(state.address_tokens).toEqual([]);
    expect(state.current_token).toBeNull();
  });

  it("type-checks an address-token tree distinct from the substrate position (§0.9.0 A3)", () => {
    // The durable handle (token) is not the live coordinate: `visited_set` holds
    // tokens, `position` stays a substrate coordinate, and the tree records the
    // parent→children grouping that IS `Entity.contains`.
    const root: AddressToken = {
      token: "ovl:root",
      parent: null,
      position: { vector_ref: "vec:origin" },
    };
    const child: AddressToken = {
      token: "ovl:child",
      parent: "ovl:root",
      position: { vector_ref: "vec:next" },
    };
    const state: SessionState = {
      session_id: "s-2",
      session_seed: 7,
      position: { vector_ref: "vec:next" },
      turn_count: 1,
      trace_centroid: null,
      momentum: null,
      path_coherence: 0,
      visited_set: [child.token],
      address_tokens: [root, child],
      current_token: child.token,
      vars: {},
      registry: [],
      links: [],
      ended: false,
      input_log: [],
    };
    // visited_set holds a token, not the substrate coordinate.
    expect(state.visited_set).toEqual(["ovl:child"]);
    expect(state.visited_set).not.toContain(state.position.vector_ref);
    expect(state.address_tokens[1]?.parent).toBe("ovl:root");
  });
});

describe("§3.9 Input Log", () => {
  it("type-checks a replayable log of two moves (an interact and a primitive)", () => {
    const log: InputLogEntry[] = [
      {
        kind: "interact",
        action: { object_id: "resolved:door:1", affordance: "traverse" },
      },
      { kind: "primitive", primitive: "bookmark", args: { name: "home" } },
    ];
    expect(log).toHaveLength(2);
    expect(log[0]?.kind).toBe("interact");
    expect(log[1]?.kind).toBe("primitive");
  });
});
