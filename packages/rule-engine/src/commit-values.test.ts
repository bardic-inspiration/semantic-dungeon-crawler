// SPEC §3.4 (A5) / §3.3 (A6) — what the commit phase actually commits.
//
// §3.4 defines the `write` effect as setting a scratch key "to an **evaluated**
// §4.2 expression/literal". A conformance audit found the value stored raw, so
// `{ kind: "write", value: "dynamic.turn_count" }` stored that string rather
// than the turn number — and the pre-existing test asserted the raw-string
// behavior, locking it in.
//
// §3.3/A6 likewise defines `effects_summary` as "auto-derived from the
// commit-phase writes"; it existed only as a type.

import { describe, it, expect } from "vitest";
import type { Layer, SessionState } from "schema";
import type { SubstrateSpanView } from "./interpretation";
import { createSubstrateGraph, type GraphSpan } from "./graph";
import { resolveMove } from "./solver";

function makeSpan(
  id: string,
  over: Partial<SubstrateSpanView> = {},
): SubstrateSpanView {
  return {
    id: `vec:${id}`,
    semantic_tags: [],
    archetype: "prop",
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    local_coherence: 0.5,
    ...over,
  };
}

function graph() {
  const spans: GraphSpan[] = [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    {
      span: makeSpan("a", { semantic_tags: ["mood:tense"] }),
      embedding: [0.99, 0.14],
    },
    { span: makeSpan("b"), embedding: [0.9, 0.44] },
  ];
  return createSubstrateGraph(spans);
}

function state(over: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "s1",
    session_seed: 42,
    position: { vector_ref: "vec:origin" },
    turn_count: 7,
    trace_centroid: null,
    momentum: null,
    path_coherence: 0,
    visited_set: [],
    address_tokens: [],
    current_token: null,
    vars: {},
    registry: [],
    links: [],
    ended: false,
    input_log: [],
    ...over,
  };
}

function writeLayer(target: string, value: string): Layer[] {
  return [
    {
      id: "writer",
      scope: "global",
      mode: { priority: 1 },
      rules: [
        {
          predicate: "dynamic.turn_count > 0",
          effect: { kind: "write", target, value },
        },
      ],
    },
  ];
}

function commitOf(layers: Layer[], s: SessionState = state()) {
  return resolveMove(s, graph(), layers).commit;
}

describe("write effect values are evaluated §4.2 expressions (§3.4 A5)", () => {
  it("evaluates a dynamic.* property rather than storing its name", () => {
    const commit = commitOf(writeLayer("seen", "dynamic.turn_count"));
    expect(commit.vars.seen).toBe("7");
  });

  it("stores a quoted string literal as its value, without the quotes", () => {
    const commit = commitOf(writeLayer("mood", '"tense"'));
    expect(commit.vars.mood).toBe("tense");
  });

  it("stores a number literal", () => {
    const commit = commitOf(writeLayer("n", "42"));
    expect(commit.vars.n).toBe("42");
  });

  it("reads back a previously written var, so writes compose in declaration order", () => {
    const commit = commitOf(
      writeLayer("copy", "dynamic.vars.origin"),
      state({ vars: { origin: "kept" } }),
    );
    expect(commit.vars.copy).toBe("kept");
  });

  it("treats an unparseable value as a plain string and never throws (INV-4)", () => {
    expect(() =>
      commitOf(writeLayer("odd", "not a valid ((expression")),
    ).not.toThrow();
    const commit = commitOf(writeLayer("odd", "not a valid ((expression"));
    expect(commit.vars.odd).toBe("not a valid ((expression");
  });

  it("last-write-wins across layers in declaration order", () => {
    const layers: Layer[] = [
      ...writeLayer("k", '"first"'),
      {
        id: "second",
        scope: "global",
        mode: { priority: 1 },
        rules: [
          {
            predicate: "dynamic.turn_count > 0",
            effect: { kind: "write", target: "k", value: '"second"' },
          },
        ],
      },
    ];
    expect(commitOf(layers).vars.k).toBe("second");
  });

  it("accepts a target written with or without the dynamic.vars. prefix", () => {
    expect(commitOf(writeLayer("plain", '"x"')).vars.plain).toBe("x");
    expect(
      commitOf(writeLayer("dynamic.vars.prefixed", '"x"')).vars.prefixed,
    ).toBe("x");
  });
});

describe("effects_summary is derived from the commit-phase writes (§3.3 A6)", () => {
  it("summarizes a write", () => {
    const commit = commitOf(writeLayer("mood", '"tense"'));
    expect(commit.effects_summary).toBeDefined();
    expect(commit.effects_summary.join(" ")).toContain("mood");
  });

  it("is empty when nothing was committed", () => {
    expect(commitOf([]).effects_summary).toEqual([]);
  });
});
