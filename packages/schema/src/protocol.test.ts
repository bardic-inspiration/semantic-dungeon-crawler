import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import type {
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "./protocol";

function containerEntity(): Entity {
  return {
    id: "resolved:room:0",
    archetype: "container",
    semantic_tags: ["environment:hall"],
    embedding_ref: "vec:1",
    affordances: ["enter"],
    salience: 0.9,
    prose: "A cold stone hall.",
    source_span: { source: "gutenberg:11", char_ranges: "0-18" },
    contains: [],
    layout_hint: { scale: "large", density: 0.5, shape_bias: "vertical" },
    state: { local_coherence: 0.6, visited: true },
  };
}

describe("§3.2 ResolvedRoomResponse", () => {
  it("type-checks a fully-resolved room with one exit", () => {
    const response: ResolvedRoomResponse = {
      room: containerEntity(),
      objects: [
        {
          ...containerEntity(),
          id: "resolved:door:1",
          archetype: "portal",
          affordances: ["traverse"],
        },
      ],
      exits: [
        {
          target_entity_id: "query:token:abc",
          affordance_required: "traverse",
          via_object_id: "resolved:door:1",
          weight: 0.7,
        },
      ],
      resolution_status: "resolved",
    };
    expect(response.exits[0]?.via_object_id).toBe("resolved:door:1");
  });

  it("represents a degenerate (stuck) resolution as a valid 200 shape (C2)", () => {
    const stuck: ResolvedRoomResponse = {
      room: containerEntity(),
      objects: [],
      exits: [],
      resolution_status: "stuck",
    };
    expect(stuck.objects).toHaveLength(0);
    expect(stuck.resolution_status).toBe("stuck");
  });
});

describe("§3.3 request/response shapes", () => {
  it("type-checks an InteractRequest", () => {
    const request: InteractRequest = {
      session_id: "s-1",
      action: { object_id: "resolved:door:1", affordance: "traverse" },
    };
    expect(request.action.affordance).toBe("traverse");
  });

  it("type-checks a local (non-movement) InteractResponse with an emitted result", () => {
    const response: InteractResponse = {
      new_room: {
        room: containerEntity(),
        objects: [],
        exits: [],
        resolution_status: "resolved",
      },
      transition_occurred: false,
      interaction_result: {
        text: "You read the faded inscription.",
        revealed: [],
      },
    };
    expect(response.transition_occurred).toBe(false);
    expect(response.interaction_result.text).toContain("inscription");
  });
});
