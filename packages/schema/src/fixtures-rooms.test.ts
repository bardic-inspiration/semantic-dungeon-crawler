// SPEC §6.5 / §5.3 (issue #89) — the static conformance check over
// `fixtures/rooms/*.json`. These hand-curated `ResolvedRoomResponse` payloads are
// the §5.3 conformance set: they must validate against the Phase 1 `schema` types
// DIRECTLY, with no server and no engine in the loop, so any third-party adapter
// can be checked against them without this project's involvement. This suite is the
// server-independent half of #89; `packages/server/src/conformance-roundtrip.test.ts`
// is the live round-trip half.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidResolvedRoomResponse } from "./protocol";
import type { Entity, ResolvedRoomResponse } from "./index";

// Resolve `fixtures/rooms/` from this test file so the suite is independent of the
// process working directory (repo-root ← packages/schema/src).
const ROOMS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rooms",
);

function loadFixtures(): { name: string; data: unknown }[] {
  return readdirSync(ROOMS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      data: JSON.parse(readFileSync(join(ROOMS_DIR, name), "utf8")) as unknown,
    }));
}

const FIXTURES = loadFixtures();

// The canonical wire keys (§3.1 / §3.2). Fixtures carrying only these prove the set
// is engine-agnostic (§5.3): no Three.js / renderer-specific fields are baked in, so
// Phase 5 consumes them unchanged.
const ENTITY_KEYS = new Set([
  "id",
  "archetype",
  "semantic_tags",
  "embedding_ref",
  "affordances",
  "salience",
  "prose",
  "source_span",
  "contains",
  "layout_hint",
  "state",
]);
const RESPONSE_KEYS = new Set([
  "room",
  "objects",
  "exits",
  "resolution_status",
  "debug",
]);
const EXIT_KEYS = new Set([
  "target_entity_id",
  "affordance_required",
  "via_object_id",
  "weight",
]);

function extraKeys(obj: object, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

describe("fixtures/rooms conformance set (§6.5, §5.3)", () => {
  it("curates ~10 hand-authored room fixtures", () => {
    // "a set of ~10" (§6.5) — enough to span archetype variety; a floor guards
    // against the suite silently emptying.
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(FIXTURES.map((f) => f.name))(
    "%s validates against ResolvedRoomResponse (§3.2), standalone",
    (name) => {
      const fixture = FIXTURES.find((f) => f.name === name)!;
      expect(isValidResolvedRoomResponse(fixture.data)).toBe(true);
    },
  );

  it.each(FIXTURES.map((f) => f.name))(
    "%s is engine-agnostic — only canonical wire keys, no renderer fields (§5.3)",
    (name) => {
      const response = FIXTURES.find((f) => f.name === name)!
        .data as ResolvedRoomResponse;
      const entities: Entity[] = [response.room, ...response.objects];
      for (const entity of entities) {
        expect(extraKeys(entity, ENTITY_KEYS)).toEqual([]);
      }
      expect(extraKeys(response, RESPONSE_KEYS)).toEqual([]);
      for (const exit of response.exits) {
        expect(extraKeys(exit, EXIT_KEYS)).toEqual([]);
      }
    },
  );

  it("every fixture room is a container archetype (the current node, §3.2)", () => {
    for (const { data } of FIXTURES) {
      expect((data as ResolvedRoomResponse).room.archetype).toBe("container");
    }
  });
});

// The §6.5 archetype-variety minimums, asserted over the set as a whole so the
// suite fails loudly if a required case is dropped.
describe("fixtures/rooms archetype-variety minimums (§6.5)", () => {
  const responses = FIXTURES.map((f) => f.data as ResolvedRoomResponse);

  it("includes a container with 5+ objects", () => {
    expect(responses.some((r) => r.objects.length >= 5)).toBe(true);
  });

  it("includes a near-empty room (0–1 objects)", () => {
    expect(responses.some((r) => r.objects.length <= 1)).toBe(true);
  });

  it("includes an all-soft-weighted population (every exit a soft 0<w<1 bias, 2+ exits)", () => {
    expect(
      responses.some(
        (r) =>
          r.exits.length >= 2 &&
          r.exits.every((e) => e.weight > 0 && e.weight < 1),
      ),
    ).toBe(true);
  });

  it("includes a room exercising the portal archetype", () => {
    expect(
      responses.some((r) => r.objects.some((o) => o.archetype === "portal")),
    ).toBe(true);
  });

  it("includes a degenerate 'stuck' resolution (a valid 200 shape, C2)", () => {
    expect(responses.some((r) => r.resolution_status === "stuck")).toBe(true);
  });
});
