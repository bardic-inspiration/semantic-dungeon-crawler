import { describe, expect, it } from "vitest";
import {
  buildRegistryTree,
  emitTagRegistry,
  parseTagRegistry,
} from "./tag-registry";

describe("tag registry (§3.6.2, versioned per C5)", () => {
  const tags = [
    "environment:terrain:forest",
    "environment:built",
    "concept:economics",
    "density=0.7", // scalar value — path is `density`, value never registered
    "viz,material:stone", // modifier prefix — modifier never registered
  ];

  it("builds a keys-only tree of segment paths only", () => {
    const tree = buildRegistryTree(tags);
    expect(tree).toEqual({
      environment: { terrain: { forest: {} }, built: {} },
      concept: { economics: {} },
      density: {},
      material: { stone: {} }, // `viz,` modifier dropped; `material:stone` kept
    });
  });

  it("emits a version header and a keys-only tree, sorted and deterministic", () => {
    const tree = buildRegistryTree(tags);
    const yaml = emitTagRegistry(tree, "sv_abc123");
    expect(yaml).toBe(emitTagRegistry(buildRegistryTree(tags), "sv_abc123"));
    expect(yaml).toContain("substrate_version: sv_abc123");
    expect(yaml).toContain("tags:");
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("round-trips: parse recovers the version header and all paths", () => {
    const tree = buildRegistryTree(tags);
    const yaml = emitTagRegistry(tree, "sv_deadbeef");
    const parsed = parseTagRegistry(yaml);
    expect(parsed.substrate_version).toBe("sv_deadbeef");
    expect(parsed.paths.has("environment:terrain:forest")).toBe(true);
    expect(parsed.paths.has("environment")).toBe(true);
    expect(parsed.paths.has("material:stone")).toBe(true);
  });
});
