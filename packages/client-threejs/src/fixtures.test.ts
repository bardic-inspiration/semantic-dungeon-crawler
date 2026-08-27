// SPEC §5.3 / §6.6 — the graphical adapter's conformance sweep: render EVERY
// `fixtures/rooms/*.json` directly (server bypassed). This repeats, for the
// Three.js client, the conformance check `client-cli` exercised in Phase 4
// (§6.5) over the very same fixture set — no Three.js-specific fixture changes.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  isResolvedRoomResponse,
  parseRoomFixture,
  renderRoomFixtureFile,
} from "./fixtures";

const ROOMS_DIR = fileURLToPath(
  new URL("../../../fixtures/rooms", import.meta.url),
);
const roomFiles = readdirSync(ROOMS_DIR).filter((f) => f.endsWith(".json"));

describe("§5.3 / §6.6 conformance — render every fixtures/rooms/*.json offline", () => {
  it("finds the room fixtures on disk", () => {
    expect(roomFiles.length).toBeGreaterThan(0);
  });

  for (const name of roomFiles) {
    it(`renders ${name} into a scene without error (server bypassed)`, async () => {
      const path = `${ROOMS_DIR}/${name}`;
      const scene = await renderRoomFixtureFile(path);
      expect(scene).toBeInstanceOf(THREE.Scene);
      // One room shell + one Object3D per resolved object (§5.2).
      const room = parseRoomFixture(readFileSync(path, "utf8"), name);
      expect(scene.children.length).toBe(1 + room.objects.length);
      // Every child is named with its resolved entity id (§5.2) — the room and
      // each object, and nothing else.
      const names = scene.children.map((c) => c.name).sort();
      const expected = [room.room.id, ...room.objects.map((o) => o.id)].sort();
      expect(names).toEqual(expected);
    });
  }
});

describe("parseRoomFixture — well-formedness only (INV-4)", () => {
  it("accepts a well-formed (even empty/stuck) ResolvedRoomResponse", () => {
    const wellFormed = JSON.stringify({
      room: { id: "r", archetype: "container" },
      objects: [],
      exits: [],
      resolution_status: "stuck",
    });
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
