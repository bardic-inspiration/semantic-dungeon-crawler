// SPEC §3.6.3 / §3.6.1 — resolver dispatch and the modifier registry.
//
// §3.6.3 says the engine "guarantees the three defaults exist at startup". Until
// SPEC 0.12.0 assigned them a package, none did — the guarantee was simply false.

import { describe, it, expect } from "vitest";
import { parseTag } from "schema";
import {
  DEFAULT_RESOLVERS,
  EMPTY_REGISTRY,
  createResolverSet,
  isLeafPath,
  lookupModifier,
  resolveTag,
  type TagRegistryView,
} from "./resolvers";

function tag(raw: string) {
  const parsed = parseTag(raw);
  if (parsed === null) throw new Error(`fixture tag does not parse: ${raw}`);
  return parsed;
}

// `environment:terrain` has a child, so it is a non-leaf; `environment:terrain:forest`
// and `mood:tense` are registered leaves.
const REGISTRY: TagRegistryView = {
  paths: new Set([
    "environment",
    "environment:terrain",
    "environment:terrain:forest",
    "mood",
    "mood:tense",
  ]),
};

describe("the three defaults exist at startup (§3.6.3)", () => {
  it("ships exactly match, display and numeric", () => {
    expect(Object.keys(DEFAULT_RESOLVERS).sort()).toEqual([
      "display",
      "match",
      "numeric",
    ]);
  });
});

describe("§3.6.3 resolver table", () => {
  // | Resolver | Explicit =value | Leaf terminal | Non-leaf |
  // | match    | the value string| true          | true     |
  // | display  | the value string| terminal seg  | null     |
  // | numeric  | Number(value)   | 1.0           | null     |
  const cases: [string, string, unknown][] = [
    ["match", "density=0.7", "0.7"],
    ["match", "environment:terrain:forest", true],
    ["match", "environment:terrain", true],
    ["display", "density=0.7", "0.7"],
    ["display", "environment:terrain:forest", "forest"],
    ["display", "environment:terrain", null],
    ["numeric", "density=0.7", 0.7],
    ["numeric", "environment:terrain:forest", 1.0],
    ["numeric", "environment:terrain", null],
  ];

  for (const [resolver, raw, expected] of cases) {
    it(`${resolver}("${raw}") → ${JSON.stringify(expected)}`, () => {
      expect(resolveTag(tag(raw), resolver, REGISTRY)).toBe(expected);
    });
  }
});

describe("leaf detection (§3.6.3 rule 3)", () => {
  it("a registered path with no registered children is a leaf", () => {
    expect(isLeafPath(["environment", "terrain", "forest"], REGISTRY)).toBe(
      true,
    );
  });

  it("a registered path with children is not", () => {
    expect(isLeafPath(["environment", "terrain"], REGISTRY)).toBe(false);
  });

  it("an UNREGISTERED path is not a leaf — orphaned, not implied", () => {
    // §3.6.2: unregistered tags are "syntactically valid but orphaned". Treating
    // one as a leaf would invent an implied value from a registry that never
    // mentioned it, so an empty or stale registry degrades to "no implied
    // value" rather than to a false leaf.
    expect(isLeafPath(["creature", "hostile"], REGISTRY)).toBe(false);
    expect(resolveTag(tag("creature:hostile"), "display", REGISTRY)).toBeNull();
  });

  it("resolves against an empty registry without throwing (INV-4)", () => {
    expect(resolveTag(tag("mood:tense"), "numeric", EMPTY_REGISTRY)).toBeNull();
    expect(resolveTag(tag("mood:tense"), "match", EMPTY_REGISTRY)).toBe(true);
  });
});

describe("the resolver set is configurable (§3.6.3)", () => {
  it("lets an author add a resolver", () => {
    const set = createResolverSet({ shout: (t) => t.raw.toUpperCase() });
    expect(resolveTag(tag("mood:tense"), "shout", REGISTRY, set)).toBe(
      "MOOD:TENSE",
    );
  });

  it("lets an author replace a default — the engine does not prevent it", () => {
    const set = createResolverSet({ match: () => "replaced" });
    expect(resolveTag(tag("mood:tense"), "match", REGISTRY, set)).toBe(
      "replaced",
    );
  });

  it("still guarantees the untouched defaults", () => {
    const set = createResolverSet({ match: () => "replaced" });
    expect(
      resolveTag(tag("environment:terrain:forest"), "display", REGISTRY, set),
    ).toBe("forest");
  });

  it("yields null for an unknown resolver name rather than throwing (INV-4)", () => {
    expect(resolveTag(tag("mood:tense"), "nope", REGISTRY)).toBeNull();
  });
});

describe("§3.6.1 modifier registry", () => {
  it("returns the author's config for a registered modifier", () => {
    const config = { route: "visual" };
    expect(lookupModifier(tag("viz,material:stone"), { viz: config })).toBe(
      config,
    );
  });

  it("returns undefined for an unmodified tag", () => {
    expect(lookupModifier(tag("material:stone"), { viz: {} })).toBeUndefined();
  });

  it("returns undefined for an unregistered modifier — legal per §3.6/INV-4", () => {
    expect(lookupModifier(tag("viz,material:stone"), {})).toBeUndefined();
  });

  it("treats zero configured modifiers as valid (§3.6.1)", () => {
    expect(
      lookupModifier(tag("viz,material:stone"), undefined),
    ).toBeUndefined();
  });
});
