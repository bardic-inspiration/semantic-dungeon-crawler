import { describe, it, expect } from "vitest";
import { parse, ParseError } from "./parser";
import type { Expression } from "./parser";

// SPEC §4.2 — the parser turns a `predicate`/`scope` string into an AST.
// Parsing is well-formedness ONLY (INV-4): no evaluation, no coherence checks.

describe("parse — §4.2 example predicates → AST shape", () => {
  it("example 1: CONTAINS + a numeric comparison joined by AND", () => {
    const ast = parse(
      'static.tags CONTAINS "mood:tense" AND dynamic.turn_count > 5',
    );
    expect(ast).toEqual<Expression>({
      type: "expression",
      operators: ["AND"],
      terms: [
        {
          type: "comparison",
          operator: "CONTAINS",
          left: { type: "property", namespace: "static", path: ["tags"] },
          right: {
            type: "literal",
            literalType: "string",
            value: "mood:tense",
          },
        },
        {
          type: "comparison",
          operator: ">",
          left: {
            type: "property",
            namespace: "dynamic",
            path: ["turn_count"],
          },
          right: { type: "literal", literalType: "number", value: 5 },
        },
      ],
    });
  });

  it("example 2: MATCHES with a parsed pattern AND an == comparison", () => {
    const ast = parse(
      'static.tags MATCHES "theme:*" AND static.archetype == "container"',
    );
    expect(ast).toEqual<Expression>({
      type: "expression",
      operators: ["AND"],
      terms: [
        {
          type: "comparison",
          operator: "MATCHES",
          left: { type: "property", namespace: "static", path: ["tags"] },
          right: { type: "literal", literalType: "string", value: "theme:*" },
          pattern: {
            type: "match_pattern",
            modifier: null,
            segments: [
              { kind: "segment", value: "theme" },
              { kind: "wildcard" },
            ],
            value: null,
            raw: "theme:*",
          },
        },
        {
          type: "comparison",
          operator: "==",
          left: {
            type: "property",
            namespace: "static",
            path: ["archetype"],
          },
          right: {
            type: "literal",
            literalType: "string",
            value: "container",
          },
        },
      ],
    });
  });

  it("example 3: two MATCHES comparisons joined by OR", () => {
    const ast = parse(
      'static.tags MATCHES "creature:hostile:**" OR static.tags MATCHES "environment:terrain:cave"',
    );
    expect(ast.operators).toEqual(["OR"]);
    expect(ast.terms).toHaveLength(2);
    expect(ast.terms[0]?.pattern?.segments).toEqual([
      { kind: "segment", value: "creature" },
      { kind: "segment", value: "hostile" },
      { kind: "wildcard_multi" },
    ]);
    expect(ast.terms[1]?.pattern?.segments).toEqual([
      { kind: "segment", value: "environment" },
      { kind: "segment", value: "terrain" },
      { kind: "segment", value: "cave" },
    ]);
  });
});

describe("parse — properties", () => {
  it("parses dynamic.vars.KEY scratch-store refs (§0.9.0 A8, any author key)", () => {
    const ast = parse("dynamic.vars.danger_level > 3");
    expect(ast.terms[0]?.left).toEqual({
      type: "property",
      namespace: "dynamic",
      path: ["vars", "danger_level"],
    });
  });

  it("preserves an uppercase author key in dynamic.vars", () => {
    const ast = parse('dynamic.vars.QUEST_STAGE == "start"');
    expect(ast.terms[0]?.left).toEqual({
      type: "property",
      namespace: "dynamic",
      path: ["vars", "QUEST_STAGE"],
    });
  });

  it("accepts each reserved static.* property namespace", () => {
    const ast = parse("static.embedding_distance < 0.4");
    expect(ast.terms[0]?.left).toEqual({
      type: "property",
      namespace: "static",
      path: ["embedding_distance"],
    });
  });
});

describe("parse — literals", () => {
  it("parses number literals (integer, decimal, negative)", () => {
    expect(parse("dynamic.turn_count == 5").terms[0]?.right).toEqual({
      type: "literal",
      literalType: "number",
      value: 5,
    });
    expect(parse("static.embedding_distance <= 0.25").terms[0]?.right).toEqual({
      type: "literal",
      literalType: "number",
      value: 0.25,
    });
    expect(parse("static.local_coherence > -1").terms[0]?.right).toEqual({
      type: "literal",
      literalType: "number",
      value: -1,
    });
  });

  it("parses boolean literals on a function-call comparison", () => {
    expect(
      parse('contains(static.tags, "x") == false').terms[0]?.right,
    ).toEqual({ type: "literal", literalType: "boolean", value: false });
  });

  it("keeps ':' and '=' inside a quoted string literal (§3.6 tag data)", () => {
    expect(parse('static.tags CONTAINS "density=0.7"').terms[0]?.right).toEqual(
      {
        type: "literal",
        literalType: "string",
        value: "density=0.7",
      },
    );
  });
});

describe("parse — reserved functions and arity", () => {
  it("parses contains(array, value) at arity 2", () => {
    const ast = parse('contains(static.tags, "mood:tense") == true');
    expect(ast.terms[0]?.left).toEqual({
      type: "function_call",
      name: "contains",
      args: [
        { type: "property", namespace: "static", path: ["tags"] },
        { type: "literal", literalType: "string", value: "mood:tense" },
      ],
    });
  });

  it("parses distance(vec, vec) at arity 2", () => {
    const ast = parse(
      "distance(dynamic.trace_centroid, dynamic.momentum) < 1.0",
    );
    expect(ast.terms[0]?.left).toMatchObject({
      type: "function_call",
      name: "distance",
    });
  });

  it("parses recent(dynamic.visited_set, n) at arity 2", () => {
    const ast = parse("recent(dynamic.visited_set, 3) != 0");
    expect(ast.terms[0]?.left).toMatchObject({
      type: "function_call",
      name: "recent",
    });
  });

  it("parses matches(array, pattern) at arity 2", () => {
    const ast = parse('matches(static.tags, "theme:*") == true');
    expect(ast.terms[0]?.left).toMatchObject({
      type: "function_call",
      name: "matches",
    });
  });

  it("rejects an unknown function name as a parse error", () => {
    expect(() => parse("frobnicate(static.tags) == true")).toThrow(ParseError);
  });

  it("rejects a reserved function called at the wrong arity", () => {
    expect(() => parse("contains(static.tags) == true")).toThrow(
      /arity|argument/i,
    );
    expect(() =>
      parse(
        "distance(dynamic.momentum, dynamic.momentum, dynamic.momentum) < 1",
      ),
    ).toThrow(ParseError);
  });
});

describe("parse — MATCHES pattern grammar (§4.2)", () => {
  it("parses a modifier-prefixed pattern with a value", () => {
    const ast = parse('static.tags MATCHES "viz,material:stone=rough"');
    expect(ast.terms[0]?.pattern).toEqual({
      type: "match_pattern",
      modifier: { kind: "ident", value: "viz" },
      segments: [
        { kind: "segment", value: "material" },
        { kind: "segment", value: "stone" },
      ],
      value: { kind: "value", value: "rough" },
      raw: "viz,material:stone=rough",
    });
  });

  it("parses a wildcard modifier and a wildcard value", () => {
    const ast = parse('static.tags MATCHES "*,material:stone=*"');
    expect(ast.terms[0]?.pattern?.modifier).toEqual({ kind: "wildcard" });
    expect(ast.terms[0]?.pattern?.value).toEqual({ kind: "wildcard" });
  });

  it("rejects a MATCHES right-hand side that is not a string literal", () => {
    expect(() => parse("static.tags MATCHES static.archetype")).toThrow(
      ParseError,
    );
  });

  it("rejects a malformed MATCHES pattern segment", () => {
    expect(() => parse('static.tags MATCHES "creature::hostile"')).toThrow(
      ParseError,
    );
  });
});

describe("parse — malformed input raises well-formedness errors", () => {
  it("rejects a dangling logical operator", () => {
    expect(() => parse("dynamic.turn_count > 5 AND")).toThrow(ParseError);
  });

  it("rejects a dangling comparison operator", () => {
    expect(() => parse("static.tags CONTAINS")).toThrow(ParseError);
  });

  it("rejects unbalanced parentheses", () => {
    expect(() => parse('contains(static.tags, "x"')).toThrow(ParseError);
    expect(() => parse('contains(static.tags, "x"))')).toThrow(ParseError);
  });

  it("rejects an unknown property namespace", () => {
    expect(() => parse("foo.bar > 5")).toThrow(/namespace/i);
  });

  it("rejects a bare namespace with no path", () => {
    expect(() => parse("static > 5")).toThrow(ParseError);
  });

  it("rejects a comparison with a missing operator", () => {
    expect(() => parse("static.tags static.archetype")).toThrow(ParseError);
  });

  it("rejects an empty string", () => {
    expect(() => parse("")).toThrow(ParseError);
  });

  it("rejects an unterminated string literal", () => {
    expect(() => parse('static.archetype == "container')).toThrow(ParseError);
  });
});

describe("parse — parsing is a pure function of the input string", () => {
  it("a parseable-but-contradictory ruleset is legal (INV-4, not policed)", () => {
    // `x > 5 AND x < 5` is contradictory yet WELL-FORMED — parsing must accept it.
    expect(() =>
      parse("dynamic.turn_count > 5 AND dynamic.turn_count < 5"),
    ).not.toThrow();
  });

  it("returns an identical AST for the same input across calls", () => {
    const input =
      'static.tags CONTAINS "mood:tense" AND dynamic.turn_count > 5';
    expect(parse(input)).toEqual(parse(input));
  });
});
