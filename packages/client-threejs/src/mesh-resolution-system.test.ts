// SPEC §5.2 — `MeshResolutionSystem` is the pure `(archetype, semantic_tags) →
// THREE.Object3D` lookup, extensible and with a fallback for open archetypes.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MeshResolutionSystem } from "./mesh-resolution-system";

describe("MeshResolutionSystem (§5.2)", () => {
  it("resolves each known archetype to an Object3D", () => {
    for (const archetype of [
      "container",
      "portal",
      "readable",
      "actor",
      "prop",
    ]) {
      const object = MeshResolutionSystem(archetype, []);
      expect(object).toBeInstanceOf(THREE.Object3D);
    }
  });

  it("falls back to a default Object3D for an unknown/author-defined archetype (§3.1 open union)", () => {
    const object = MeshResolutionSystem("author:sculpture", []);
    expect(object).toBeInstanceOf(THREE.Object3D);
  });

  it("carries the resolved semantic_tags onto userData as a copy (§3.6.1 hook)", () => {
    const tags = ["object:dust", "render,tint=warm"];
    const object = MeshResolutionSystem("prop", tags);
    expect(object.userData.archetype).toBe("prop");
    expect(object.userData.semantic_tags).toEqual(tags);
    // A copy, not the caller's array reference.
    expect(object.userData.semantic_tags).not.toBe(tags);
  });

  it("is deterministic: two calls for the same archetype produce the same geometry type", () => {
    const a = MeshResolutionSystem("container", []) as THREE.Mesh;
    const b = MeshResolutionSystem("container", []) as THREE.Mesh;
    expect(a.geometry.type).toBe(b.geometry.type);
  });
});
