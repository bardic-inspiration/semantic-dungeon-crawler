import { describe, expect, it } from "vitest";
import entityFixture from "../../../fixtures/entity.example.json";
import {
  isValidEntity,
  isWellFormedTag,
  parseTag,
  type Entity,
} from "./entity";

// A minimal well-formed entity used as the mutation base for the guard cases.
function minimalEntity(): Entity {
  return {
    id: "resolved:room:0",
    archetype: "container",
    semantic_tags: ["environment:cave"],
    embedding_ref: "vec:1",
    affordances: ["enter"],
    salience: 0.5,
    prose: "",
    source_span: { source: "gutenberg:11", char_ranges: "0-10" },
    contains: [],
    layout_hint: { scale: "small", density: 0.2, shape_bias: "radial" },
    state: { local_coherence: 0.4, visited: false },
  };
}

describe("parseTag / §3.6 grammar", () => {
  it("parses a hierarchical segment path", () => {
    expect(parseTag("environment:terrain:forest")).toEqual({
      modifier: null,
      segments: ["environment", "terrain", "forest"],
      value: null,
      raw: "environment:terrain:forest",
    });
  });

  it("parses an explicit scalar value", () => {
    expect(parseTag("density=0.7")).toEqual({
      modifier: null,
      segments: ["density"],
      value: "0.7",
      raw: "density=0.7",
    });
  });

  it("parses a modifier-prefixed tag", () => {
    expect(parseTag("viz,material:stone")).toEqual({
      modifier: "viz",
      segments: ["material", "stone"],
      value: null,
      raw: "viz,material:stone",
    });
  });

  it("rejects malformed tags (empty segment, empty value, bad charset)", () => {
    expect(isWellFormedTag("environment::forest")).toBe(false); // empty middle segment
    expect(isWellFormedTag("Environment:cave")).toBe(false); // uppercase not in charset
    expect(isWellFormedTag("=x")).toBe(false); // no segment path
    expect(isWellFormedTag("foo=")).toBe(false); // empty value
    expect(isWellFormedTag("")).toBe(false);
  });

  it("accepts single-segment legacy tags and values carrying ':' and ','", () => {
    expect(isWellFormedTag("cave")).toBe(true);
    expect(isWellFormedTag("note=a,b:c=d")).toBe(true); // value_char admits , : =
  });
});

describe("isValidEntity / §3.1 well-formedness (INV-4)", () => {
  it("accepts a minimal well-formed entity", () => {
    expect(isValidEntity(minimalEntity())).toBe(true);
  });

  it("rejects an entity missing a required field", () => {
    const missing: Record<string, unknown> = { ...minimalEntity() };
    delete missing.embedding_ref;
    expect(isValidEntity(missing)).toBe(false);
  });

  it("rejects an entity with a malformed tag path", () => {
    const bad = { ...minimalEntity(), semantic_tags: ["environment::forest"] };
    expect(isValidEntity(bad)).toBe(false);
  });

  it("makes no coherence/taste judgement (a contradictory-but-typed entity is valid)", () => {
    const incoherent = {
      ...minimalEntity(),
      archetype: "prop",
      contains: ["resolved:room:9"], // a 'prop' that contains things — legal, INV-4
    };
    expect(isValidEntity(incoherent)).toBe(true);
  });
});

describe("fixtures/entity.example.json (§6.2 Exit)", () => {
  it("validates against Entity at runtime", () => {
    expect(isValidEntity(entityFixture)).toBe(true);
  });

  it("type-checks against Entity with zero TS errors when imported", () => {
    // A JSON import widens string fields (e.g. layout_hint.scale) to `string`, so
    // the guard is what narrows the imported value to `Entity`; the assignment
    // inside the guarded block is the type-level assertion §6.2 Exit asks for.
    expect(isValidEntity(entityFixture)).toBe(true);
    if (isValidEntity(entityFixture)) {
      const typed: Entity = entityFixture;
      expect(typed.archetype).toBe("container");
    }
  });
});
