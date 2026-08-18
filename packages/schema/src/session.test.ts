import { describe, expect, it } from "vitest";
import type { InputLogEntry, SessionState } from "./session";

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
      vars: {},
      registry: [],
      links: [],
      ended: false,
      input_log: [],
    };
    expect(state.turn_count).toBe(0);
    expect(state.session_seed).toBe(1234);
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
