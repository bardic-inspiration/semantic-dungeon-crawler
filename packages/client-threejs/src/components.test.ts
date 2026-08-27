// SPEC §5.2 — the ECS component projection: a component bundle per entity id,
// a verbatim copy of the resolved schema fields (INV-3).

import { describe, expect, it } from "vitest";
import type { Entity, ResolvedRoomResponse } from "schema";
import { buildComponentStore, toComponents } from "./components";

function makeEntity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    archetype: "prop",
    semantic_tags: ["object:token"],
    embedding_ref: "vec:0",
    affordances: ["inspect"],
    salience: 0.5,
    prose: "",
    source_span: { source: "test:0", char_ranges: "0-1" },
    contains: [],
    layout_hint: { scale: "small", density: 0.1, shape_bias: "scatter" },
    state: { local_coherence: 0.5, visited: false },
    ...overrides,
  };
}

function makeRoom(objects: Entity[]): ResolvedRoomResponse {
  return {
    room: makeEntity("room:0", {
      archetype: "container",
      layout_hint: { scale: "medium", density: 0.3, shape_bias: "radial" },
    }),
    objects,
    exits: [],
    resolution_status: "resolved",
  };
}

describe("toComponents (§5.2)", () => {
  it("projects exactly the six §5.2 component fields", () => {
    const c = toComponents(makeEntity("e:1"));
    expect(Object.keys(c).sort()).toEqual(
      [
        "affordances",
        "archetype",
        "layout_hint",
        "salience",
        "semantic_tags",
        "state",
      ].sort(),
    );
  });

  it("copies arrays and nested objects so components can be mutated independently", () => {
    const entity = makeEntity("e:1");
    const c = toComponents(entity);
    c.semantic_tags.push("mutated");
    c.affordances.push("take");
    c.layout_hint.density = 0.99;
    expect(entity.semantic_tags).toEqual(["object:token"]);
    expect(entity.affordances).toEqual(["inspect"]);
    expect(entity.layout_hint.density).toBe(0.1);
  });
});

describe("buildComponentStore (§5.2)", () => {
  it("keys a component bundle by entity id for the room and every object", () => {
    const resolved = makeRoom([makeEntity("obj:a"), makeEntity("obj:b")]);
    const store = buildComponentStore(resolved);
    expect(store.size).toBe(3);
    expect(store.has("room:0")).toBe(true);
    expect(store.get("obj:a")?.archetype).toBe("prop");
    expect(store.get("room:0")?.archetype).toBe("container");
  });

  it("handles a near-empty room (no objects)", () => {
    const store = buildComponentStore(makeRoom([]));
    expect(store.size).toBe(1);
    expect(store.has("room:0")).toBe(true);
  });
});
