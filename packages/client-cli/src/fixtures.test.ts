// SPEC §5.3 — the fixture parse guard: well-formedness only (INV-4), no coherence.

import { describe, expect, it } from "vitest";
import { isResolvedRoomResponse, parseRoomFixture } from "./fixtures";

const wellFormed = JSON.stringify({
  room: { id: "r", archetype: "container" },
  objects: [],
  exits: [],
  resolution_status: "stuck",
});

describe("parseRoomFixture", () => {
  it("accepts a well-formed (even empty/stuck) ResolvedRoomResponse", () => {
    const room = parseRoomFixture(wellFormed, "inline");
    expect(room.resolution_status).toBe("stuck");
    expect(isResolvedRoomResponse(room)).toBe(true);
  });

  it("rejects invalid JSON with a clear, labeled error", () => {
    expect(() => parseRoomFixture("{not json", "bad.json")).toThrow(
      /bad\.json: not valid JSON/,
    );
  });

  it("rejects JSON that is not a ResolvedRoomResponse", () => {
    expect(() => parseRoomFixture('{"foo":1}', "x.json")).toThrow(
      /not a ResolvedRoomResponse/,
    );
    expect(isResolvedRoomResponse({ room: {}, objects: [] })).toBe(false);
  });
});
