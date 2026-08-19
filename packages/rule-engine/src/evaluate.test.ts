// packages/rule-engine/src/evaluate.test.ts
//
// SPEC §4.2 — evaluating a parsed predicate/scope AST against
// `(candidate, state)`. Covers reserved `static.*`/`dynamic.*` bindings, the
// reserved functions, `CONTAINS` (exact) vs `MATCHES` (tag-glob) semantics, the
// comparison/logical operators, the three §4.2 example predicates, and the
// INV-4 "never throws, absent → defined" guarantees.

import { describe, it, expect } from "vitest";
import type { Entity, SessionState } from "schema";
import { parse } from "./parser";
import { evaluate, type EntityCandidate, type EvalBindings } from "./evaluate";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "ent-1",
    archetype: "container",
    semantic_tags: [],
    embedding_ref: "vec:0001",
    affordances: ["enter"],
    salience: 0.5,
    prose: "A dim vaulted chamber.",
    source_span: { source: "gutenberg:11", char_ranges: "1024-1330" },
    contains: [],
    layout_hint: { scale: "medium", density: 0.5, shape_bias: "radial" },
    state: { local_coherence: 0.8, visited: false },
    ...overrides,
  };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "sess-1",
    session_seed: 42,
    position: { vector_ref: "vec:0001" },
    turn_count: 7,
    trace_centroid: null,
    momentum: null,
    path_coherence: 0.6,
    visited_set: [],
    vars: {},
    registry: [],
    links: [],
    ended: false,
    input_log: [],
    ...overrides,
  };
}

function bindings(
  entity: Entity,
  state: SessionState,
  embedding_distance = 0.4,
): EvalBindings {
  const candidate: EntityCandidate = { entity, embedding_distance };
  return { candidate, state };
}

/** Parse `src` and evaluate it against `b`. */
function evalStr(src: string, b: EvalBindings): boolean {
  return evaluate(parse(src), b);
}

// ── static.* bindings ─────────────────────────────────────────────────────────

describe("static.* bindings (§4.2)", () => {
  it("binds static.embedding_distance to the candidate's query distance", () => {
    const b = bindings(makeEntity(), makeState(), 0.3);
    expect(evalStr("static.embedding_distance < 0.5", b)).toBe(true);
    expect(evalStr("static.embedding_distance > 0.5", b)).toBe(false);
  });

  it("binds static.archetype to the candidate entity", () => {
    const b = bindings(makeEntity({ archetype: "portal" }), makeState());
    expect(evalStr('static.archetype == "portal"', b)).toBe(true);
    expect(evalStr('static.archetype != "container"', b)).toBe(true);
  });

  it("binds static.tags to the candidate's semantic_tags array", () => {
    const b = bindings(
      makeEntity({ semantic_tags: ["mood:tense", "theme:forest"] }),
      makeState(),
    );
    expect(evalStr('static.tags CONTAINS "mood:tense"', b)).toBe(true);
    expect(evalStr('"theme:forest" IN static.tags', b)).toBe(true);
  });

  it("binds static.local_coherence to the entity's local coherence", () => {
    const b = bindings(
      makeEntity({ state: { local_coherence: 0.9, visited: false } }),
      makeState(),
    );
    expect(evalStr("static.local_coherence >= 0.9", b)).toBe(true);
    expect(evalStr("static.local_coherence < 0.9", b)).toBe(false);
  });

  it("binds static.prose and static.source (§0.9.0 A1)", () => {
    const b = bindings(
      makeEntity({
        prose: "the hollow tree",
        source_span: { source: "gutenberg:84", char_ranges: "10-40" },
      }),
      makeState(),
    );
    expect(evalStr('static.prose == "the hollow tree"', b)).toBe(true);
    expect(evalStr('static.source == "gutenberg:84"', b)).toBe(true);
  });
});

// ── vestigial / absent static.* ───────────────────────────────────────────────

describe("absent & vestigial properties yield defined results, never throw (INV-4)", () => {
  it("treats vestigial static.edge_weight / static.cluster_id as absent, not a crash", () => {
    const b = bindings(makeEntity(), makeState());
    // Absent numeric read → relational comparison is defined-false, no throw.
    expect(() => evalStr("static.edge_weight > 0", b)).not.toThrow();
    expect(evalStr("static.edge_weight > 0", b)).toBe(false);
    expect(evalStr("static.cluster_id == 3", b)).toBe(false);
  });

  it("treats an unknown static/dynamic property as absent", () => {
    const b = bindings(makeEntity(), makeState());
    expect(evalStr("static.nonexistent > 0", b)).toBe(false);
    expect(evalStr("dynamic.nonexistent == 1", b)).toBe(false);
  });

  it("evaluates static.* to absent when there is no candidate (scope evaluation)", () => {
    const b: EvalBindings = { state: makeState() };
    expect(() => evalStr('static.archetype == "container"', b)).not.toThrow();
    expect(evalStr('static.archetype == "container"', b)).toBe(false);
  });
});

// ── dynamic.* bindings ────────────────────────────────────────────────────────

describe("dynamic.* bindings (§3.8)", () => {
  it("binds dynamic.turn_count and dynamic.path_coherence", () => {
    const b = bindings(
      makeEntity(),
      makeState({ turn_count: 12, path_coherence: 0.4 }),
    );
    expect(evalStr("dynamic.turn_count > 5", b)).toBe(true);
    expect(evalStr("dynamic.path_coherence < 0.5", b)).toBe(true);
  });

  it("binds dynamic.visited_set as an array of address-tokens", () => {
    const b = bindings(
      makeEntity(),
      makeState({ visited_set: ["ovl:a", "ovl:b"] }),
    );
    expect(evalStr('"ovl:a" IN dynamic.visited_set', b)).toBe(true);
    expect(evalStr('"ovl:z" NOT IN dynamic.visited_set', b)).toBe(true);
  });

  it("binds dynamic.vars.<key> from the scratch store (§0.9.0 A8), coercing per use", () => {
    const b = bindings(
      makeEntity(),
      makeState({ vars: { hp: "10", mood: "calm" } }),
    );
    expect(evalStr("dynamic.vars.hp > 5", b)).toBe(true);
    expect(evalStr('dynamic.vars.mood == "calm"', b)).toBe(true);
    // An unset key is absent, not an error.
    expect(evalStr("dynamic.vars.missing > 0", b)).toBe(false);
  });

  it("binds dynamic.trace_centroid / dynamic.momentum vectors, absent when null", () => {
    const withVecs = bindings(
      makeEntity(),
      makeState({ trace_centroid: [1, 0, 0], momentum: [0, 1, 0] }),
    );
    expect(
      evalStr(
        "distance(dynamic.trace_centroid, dynamic.momentum) > 0.9",
        withVecs,
      ),
    ).toBe(true);
    // null vector → distance() absent → comparison defined-false.
    const noVecs = bindings(makeEntity(), makeState());
    expect(
      evalStr("distance(dynamic.trace_centroid, dynamic.momentum) < 2", noVecs),
    ).toBe(false);
  });
});

// ── reserved functions ────────────────────────────────────────────────────────

describe("reserved functions (§4.2)", () => {
  it("contains(array, value) is exact membership", () => {
    const b = bindings(
      makeEntity({ semantic_tags: ["mood:tense"] }),
      makeState(),
    );
    expect(evalStr('contains(static.tags, "mood:tense") == true', b)).toBe(
      true,
    );
    expect(evalStr('contains(static.tags, "mood:calm") == true', b)).toBe(
      false,
    );
  });

  it("distance(vec, vec) is cosine distance in [0,2]", () => {
    // Identical direction → distance 0; opposite → 2; orthogonal → 1.
    const same = bindings(
      makeEntity(),
      makeState({ trace_centroid: [1, 2, 3], momentum: [1, 2, 3] }),
    );
    expect(
      evalStr(
        "distance(dynamic.trace_centroid, dynamic.momentum) < 0.0001",
        same,
      ),
    ).toBe(true);

    const opposite = bindings(
      makeEntity(),
      makeState({ trace_centroid: [1, 0], momentum: [-1, 0] }),
    );
    expect(
      evalStr(
        "distance(dynamic.trace_centroid, dynamic.momentum) > 1.999",
        opposite,
      ),
    ).toBe(true);

    const orthogonal = bindings(
      makeEntity(),
      makeState({ trace_centroid: [1, 0], momentum: [0, 1] }),
    );
    expect(
      evalStr(
        "distance(dynamic.trace_centroid, dynamic.momentum) == 1",
        orthogonal,
      ),
    ).toBe(true);
  });

  it("recent(dynamic.visited_set, n) returns the n most-recent tokens", () => {
    const b = bindings(
      makeEntity(),
      makeState({ visited_set: ["a", "b", "c", "d"] }),
    );
    // Most-recent = tail; "d" and "c" are the last two, "b" is not.
    expect(evalStr('"d" IN recent(dynamic.visited_set, 2)', b)).toBe(true);
    expect(evalStr('"c" IN recent(dynamic.visited_set, 2)', b)).toBe(true);
    expect(evalStr('"b" IN recent(dynamic.visited_set, 2)', b)).toBe(false);
    // n >= length → whole set; n <= 0 → empty.
    expect(evalStr('"a" IN recent(dynamic.visited_set, 10)', b)).toBe(true);
    expect(evalStr('"d" IN recent(dynamic.visited_set, 0)', b)).toBe(false);
  });

  it("matches(array, pattern) globs like the MATCHES operator", () => {
    const b = bindings(
      makeEntity({ semantic_tags: ["theme:forest"] }),
      makeState(),
    );
    expect(evalStr('matches(static.tags, "theme:*") == true', b)).toBe(true);
    expect(evalStr('matches(static.tags, "mood:*") == true', b)).toBe(false);
    // A malformed pattern string is defined-false, never a throw (INV-4).
    expect(() => evalStr('matches(static.tags, "") == true', b)).not.toThrow();
    expect(evalStr('matches(static.tags, "") == true', b)).toBe(false);
  });
});

// ── CONTAINS vs MATCHES semantics ─────────────────────────────────────────────

describe("CONTAINS is exact; MATCHES is structured tag-glob (§4.2)", () => {
  it("CONTAINS compares the exact string, no wildcards", () => {
    const b = bindings(
      makeEntity({ semantic_tags: ["theme:forest", "mood:tense"] }),
      makeState(),
    );
    expect(evalStr('static.tags CONTAINS "theme:forest"', b)).toBe(true);
    // No glob interpretation on CONTAINS — the literal "theme:*" is not present.
    expect(evalStr('static.tags CONTAINS "theme:*"', b)).toBe(false);
    expect(evalStr('static.tags CONTAINS "theme"', b)).toBe(false);
  });

  it("MATCHES 'theme:*' matches exactly one trailing segment", () => {
    const single = bindings(
      makeEntity({ semantic_tags: ["theme:forest"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "theme:*"', single)).toBe(true);

    // One segment only → no trailing segment for `*` to bind → no match.
    const bare = bindings(
      makeEntity({ semantic_tags: ["theme"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "theme:*"', bare)).toBe(false);

    // Two trailing segments → `*` (exactly one) does not match.
    const deep = bindings(
      makeEntity({ semantic_tags: ["theme:dark:forest"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "theme:*"', deep)).toBe(false);
  });

  it("MATCHES 'creature:hostile:**' matches zero or more trailing segments", () => {
    const zero = bindings(
      makeEntity({ semantic_tags: ["creature:hostile"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "creature:hostile:**"', zero)).toBe(
      true,
    );

    const one = bindings(
      makeEntity({ semantic_tags: ["creature:hostile:goblin"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "creature:hostile:**"', one)).toBe(
      true,
    );

    const many = bindings(
      makeEntity({ semantic_tags: ["creature:hostile:goblin:elite"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "creature:hostile:**"', many)).toBe(
      true,
    );

    const wrongPrefix = bindings(
      makeEntity({ semantic_tags: ["creature:friendly:dog"] }),
      makeState(),
    );
    expect(
      evalStr('static.tags MATCHES "creature:hostile:**"', wrongPrefix),
    ).toBe(false);
  });

  it("MATCHES honours modifier and value presence asymmetrically", () => {
    // Pattern with no modifier requires an unmodified tag.
    const modified = bindings(
      makeEntity({ semantic_tags: ["viz,theme:forest"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "theme:*"', modified)).toBe(false);
    expect(evalStr('static.tags MATCHES "viz,theme:*"', modified)).toBe(true);
    expect(evalStr('static.tags MATCHES "*,theme:*"', modified)).toBe(true);

    // Value wildcard requires a value to be present.
    const valued = bindings(
      makeEntity({ semantic_tags: ["density=0.7"] }),
      makeState(),
    );
    expect(evalStr('static.tags MATCHES "density=*"', valued)).toBe(true);
    expect(evalStr('static.tags MATCHES "density"', valued)).toBe(false);
  });
});

// ── operators & logical composition ───────────────────────────────────────────

describe("comparison operators and AND/OR (§4.2)", () => {
  it("evaluates every relational and equality operator", () => {
    const b = bindings(
      makeEntity({ archetype: "container" }),
      makeState({ turn_count: 10 }),
    );
    expect(evalStr("dynamic.turn_count > 5", b)).toBe(true);
    expect(evalStr("dynamic.turn_count < 5", b)).toBe(false);
    expect(evalStr("dynamic.turn_count >= 10", b)).toBe(true);
    expect(evalStr("dynamic.turn_count <= 10", b)).toBe(true);
    expect(evalStr("dynamic.turn_count == 10", b)).toBe(true);
    expect(evalStr("dynamic.turn_count != 9", b)).toBe(true);
    expect(evalStr("static.archetype IN static.tags", b)).toBe(false);
  });

  it("AND requires all terms; OR requires any", () => {
    const b = bindings(
      makeEntity({ archetype: "container", semantic_tags: ["theme:forest"] }),
      makeState({ turn_count: 10 }),
    );
    expect(
      evalStr('static.archetype == "container" AND dynamic.turn_count > 5', b),
    ).toBe(true);
    expect(
      evalStr('static.archetype == "portal" AND dynamic.turn_count > 5', b),
    ).toBe(false);
    expect(
      evalStr('static.archetype == "portal" OR dynamic.turn_count > 5', b),
    ).toBe(true);
    expect(
      evalStr('static.archetype == "portal" OR dynamic.turn_count > 50', b),
    ).toBe(false);
  });
});

// ── the three §4.2 example predicates, end-to-end ─────────────────────────────

describe("§4.2 example predicates evaluate end-to-end", () => {
  const P1 = 'static.tags CONTAINS "mood:tense" AND dynamic.turn_count > 5';
  const P2 =
    'static.tags MATCHES "theme:*" AND static.archetype == "container"';
  const P3 =
    'static.tags MATCHES "creature:hostile:**" OR static.tags MATCHES "environment:terrain:cave"';

  it("example 1: CONTAINS + turn_count", () => {
    const hit = bindings(
      makeEntity({ semantic_tags: ["mood:tense"] }),
      makeState({ turn_count: 6 }),
    );
    expect(evalStr(P1, hit)).toBe(true);
    const miss = bindings(
      makeEntity({ semantic_tags: ["mood:tense"] }),
      makeState({ turn_count: 5 }),
    );
    expect(evalStr(P1, miss)).toBe(false);
  });

  it("example 2: MATCHES theme + archetype", () => {
    const hit = bindings(
      makeEntity({ archetype: "container", semantic_tags: ["theme:forest"] }),
      makeState(),
    );
    expect(evalStr(P2, hit)).toBe(true);
    const wrongArch = bindings(
      makeEntity({ archetype: "actor", semantic_tags: ["theme:forest"] }),
      makeState(),
    );
    expect(evalStr(P2, wrongArch)).toBe(false);
  });

  it("example 3: hostile creature OR cave terrain", () => {
    const hostile = bindings(
      makeEntity({ semantic_tags: ["creature:hostile:goblin"] }),
      makeState(),
    );
    expect(evalStr(P3, hostile)).toBe(true);
    const cave = bindings(
      makeEntity({ semantic_tags: ["environment:terrain:cave"] }),
      makeState(),
    );
    expect(evalStr(P3, cave)).toBe(true);
    const neither = bindings(
      makeEntity({ semantic_tags: ["theme:forest"] }),
      makeState(),
    );
    expect(evalStr(P3, neither)).toBe(false);
  });
});

// ── INV-4: contradictory-but-well-formed predicates run ───────────────────────

describe("INV-4: contradictory-but-well-formed predicates evaluate, never throw", () => {
  it("evaluates x > 5 AND x < 5 to false without throwing", () => {
    const b = bindings(makeEntity(), makeState({ turn_count: 7 }));
    expect(() =>
      evalStr("dynamic.turn_count > 5 AND dynamic.turn_count < 5", b),
    ).not.toThrow();
    expect(
      evalStr("dynamic.turn_count > 5 AND dynamic.turn_count < 5", b),
    ).toBe(false);
  });

  it("does not throw when an array operator meets a non-array operand", () => {
    const b = bindings(makeEntity(), makeState());
    expect(() => evalStr('static.archetype CONTAINS "x"', b)).not.toThrow();
    expect(evalStr('static.archetype CONTAINS "x"', b)).toBe(false);
  });
});
