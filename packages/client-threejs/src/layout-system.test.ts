// SPEC §5.2 — `LayoutSystem` is a pure, deterministic (INV-2) mapping from the
// resolved entities and the container `layout_hint` to a position per entity id.

import { describe, expect, it } from "vitest";
import type { Entity, LayoutHint } from "schema";
import { LayoutSystem } from "./layout-system";

function makeEntity(id: string, salience: number): Entity {
  return {
    id,
    archetype: "prop",
    semantic_tags: ["object:token"],
    embedding_ref: "vec:0",
    affordances: ["inspect"],
    salience,
    prose: "",
    source_span: { source: "test:0", char_ranges: "0-1" },
    contains: [],
    layout_hint: { scale: "small", density: 0.1, shape_bias: "scatter" },
    state: { local_coherence: 0.5, visited: false },
  };
}

const hint = (
  shape_bias: string,
  scale: LayoutHint["scale"] = "medium",
  density = 0.5,
): LayoutHint => ({ scale, density, shape_bias });

const entities = [
  makeEntity("e:1", 0.9),
  makeEntity("e:2", 0.5),
  makeEntity("e:3", 0.2),
  makeEntity("e:4", 0.1),
];

describe("LayoutSystem (§5.2)", () => {
  it("returns exactly one position per entity id", () => {
    const positions = LayoutSystem(entities, hint("scatter"));
    expect(positions.size).toBe(entities.length);
    for (const e of entities) expect(positions.has(e.id)).toBe(true);
  });

  it("radial places every entity equidistant from the origin on the ground plane", () => {
    const positions = LayoutSystem(entities, hint("radial"));
    const radii = [...positions.values()].map((v) => Math.hypot(v.x, v.z));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    for (const v of positions.values()) expect(v.y).toBeCloseTo(0, 6);
  });

  it("vertical stacks along Y in salience order (most salient at the base)", () => {
    const positions = LayoutSystem(entities, hint("vertical"));
    expect(positions.get("e:1")!.y).toBeLessThan(positions.get("e:2")!.y);
    expect(positions.get("e:2")!.y).toBeLessThan(positions.get("e:3")!.y);
  });

  it("is deterministic (INV-2): identical inputs give identical positions", () => {
    const a = LayoutSystem(entities, hint("scatter"));
    const b = LayoutSystem(entities, hint("scatter"));
    for (const e of entities) {
      expect(b.get(e.id)!.toArray()).toEqual(a.get(e.id)!.toArray());
    }
  });

  it("is order-independent: input order does not change any position (INV-2)", () => {
    const forward = LayoutSystem(entities, hint("scatter"));
    const reversed = LayoutSystem([...entities].reverse(), hint("scatter"));
    for (const e of entities) {
      expect(reversed.get(e.id)!.toArray()).toEqual(
        forward.get(e.id)!.toArray(),
      );
    }
  });

  it("uses only seeded placement — no wall-clock/randomness drift between runs", () => {
    // Two separate calls with the same inputs must agree byte-for-byte.
    const first = LayoutSystem(entities, hint("grid"));
    const second = LayoutSystem(entities, hint("grid"));
    for (const e of entities) {
      expect(second.get(e.id)!.toArray()).toEqual(first.get(e.id)!.toArray());
    }
  });

  it("handles an empty entity list without error", () => {
    expect(LayoutSystem([], hint("radial")).size).toBe(0);
  });
});
