import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import { isValidResolvedExit, isValidResolvedRoomResponse } from "./protocol";
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

describe("isValidResolvedExit (§3.2 A4)", () => {
  function exit() {
    return {
      target_entity_id: "query:token:abc",
      affordance_required: "traverse",
      via_object_id: "resolved:door:1",
      weight: 0.7,
    };
  }

  it("accepts a well-formed exit", () => {
    expect(isValidResolvedExit(exit())).toBe(true);
  });

  it("makes no coherence judgement — an out-of-[0,1] weight is still well-formed (INV-4)", () => {
    expect(isValidResolvedExit({ ...exit(), weight: -3 })).toBe(true);
    expect(isValidResolvedExit({ ...exit(), weight: 42 })).toBe(true);
  });

  it("rejects a missing or mistyped required field", () => {
    expect(isValidResolvedExit({ ...exit(), weight: "0.7" })).toBe(false);
    expect(isValidResolvedExit({ ...exit(), via_object_id: 1 })).toBe(false);
    const withoutTarget: Record<string, unknown> = { ...exit() };
    delete withoutTarget.target_entity_id;
    expect(isValidResolvedExit(withoutTarget)).toBe(false);
    expect(isValidResolvedExit(null)).toBe(false);
    expect(isValidResolvedExit("exit")).toBe(false);
  });
});

describe("isValidResolvedRoomResponse (§3.2)", () => {
  function response(): ResolvedRoomResponse {
    return {
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
  }

  it("accepts a fully-resolved room", () => {
    expect(isValidResolvedRoomResponse(response())).toBe(true);
  });

  it("accepts a degenerate (stuck) room — empty objects/exits, C2 open status", () => {
    const stuck: ResolvedRoomResponse = {
      room: containerEntity(),
      objects: [],
      exits: [],
      resolution_status: "stuck",
    };
    expect(isValidResolvedRoomResponse(stuck)).toBe(true);
  });

  it("accepts an author-added resolution_status (C2 open union)", () => {
    expect(
      isValidResolvedRoomResponse({
        ...response(),
        resolution_status: "sealed",
      }),
    ).toBe(true);
  });

  it("rejects a response whose room or an object is not a valid Entity", () => {
    expect(
      isValidResolvedRoomResponse({ ...response(), room: { id: "x" } }),
    ).toBe(false);
    expect(
      isValidResolvedRoomResponse({
        ...response(),
        objects: [{ id: "broken" }],
      }),
    ).toBe(false);
  });

  it("rejects a malformed exit or a non-string resolution_status", () => {
    expect(
      isValidResolvedRoomResponse({
        ...response(),
        exits: [{ target_entity_id: "t" }],
      }),
    ).toBe(false);
    expect(
      isValidResolvedRoomResponse({ ...response(), resolution_status: 200 }),
    ).toBe(false);
  });

  it("rejects a non-object / null / missing-array shape", () => {
    expect(isValidResolvedRoomResponse(null)).toBe(false);
    expect(isValidResolvedRoomResponse("room")).toBe(false);
    const withoutObjects: Record<string, unknown> = { ...response() };
    delete withoutObjects.objects;
    expect(isValidResolvedRoomResponse(withoutObjects)).toBe(false);
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
