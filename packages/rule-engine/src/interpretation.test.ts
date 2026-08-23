// SPEC §0.9.0 (A13) / §3.1 / §3.4 — the interpretation lookup.
//
// The defect this covers: `affordances`, `salience`, and `layout_hint` are
// stated in §3.1 as "produced by the interpretation lookup at resolution", and
// nothing produced them — they arrived pre-baked on the graph's spans, so an
// author's `interpretation_lookup` was read by no code at all.
//
// The load-bearing test is "consulted at resolution": the SAME span must resolve
// differently under two different lookups. That is what distinguishes a lookup
// from a build-time default.

import { describe, it, expect } from "vitest";
import type { InterpretationLookup } from "schema";
import {
  DEFAULT_INTERPRETATION,
  mintEntity,
  resolveInterpretation,
  type SubstrateSpanView,
} from "./interpretation";

function span(over: Partial<SubstrateSpanView> = {}): SubstrateSpanView {
  return {
    id: "file:a.txt:0-40",
    semantic_tags: ["environment:terrain:forest"],
    archetype: "prop",
    prose: "The forest was full of tall green trees.",
    source_span: { source: "file:a.txt", char_ranges: "0-40" },
    local_coherence: 0.62,
    ...over,
  };
}

describe("the lookup is consulted AT RESOLUTION, not baked at build time", () => {
  const subject = span({ archetype: "container" });

  it("resolves the same span differently under two different lookups", () => {
    const a: InterpretationLookup = {
      by_archetype: { container: { salience: 0.1, affordances: ["enter"] } },
    };
    const b: InterpretationLookup = {
      by_archetype: { container: { salience: 0.9, affordances: ["traverse"] } },
    };

    const under_a = resolveInterpretation(subject, a);
    const under_b = resolveInterpretation(subject, b);

    expect(under_a.salience).toBe(0.1);
    expect(under_b.salience).toBe(0.9);
    expect(under_a.affordances).toEqual(["enter"]);
    expect(under_b.affordances).toEqual(["traverse"]);
  });

  it("falls back to the engine defaults when the ruleset supplies no lookup", () => {
    const resolved = resolveInterpretation(subject, undefined);
    expect(resolved.affordances).toEqual(
      DEFAULT_INTERPRETATION.container!.affordances,
    );
    expect(resolved.salience).toBe(DEFAULT_INTERPRETATION.container!.salience);
  });
});

describe("layer precedence (§3.4)", () => {
  it("by_tag beats by_archetype — a tag pattern selects the narrower set", () => {
    const lookup: InterpretationLookup = {
      by_archetype: { prop: { salience: 0.2 } },
      by_tag: [
        {
          pattern: "environment:terrain:*",
          interpretation: { salience: 0.8 },
        },
      ],
    };
    expect(resolveInterpretation(span(), lookup).salience).toBe(0.8);
  });

  it("takes the FIRST matching by_tag entry, in array order (§3.4)", () => {
    const lookup: InterpretationLookup = {
      by_tag: [
        { pattern: "environment:**", interpretation: { salience: 0.3 } },
        {
          pattern: "environment:terrain:forest",
          interpretation: { salience: 0.7 },
        },
      ],
    };
    expect(resolveInterpretation(span(), lookup).salience).toBe(0.3);
  });

  it("merges layout_hint field by field, so a partial override keeps the rest", () => {
    const lookup: InterpretationLookup = {
      by_archetype: { container: { layout_hint: { density: 0.9 } } },
    };
    const resolved = resolveInterpretation(
      span({ archetype: "container" }),
      lookup,
    );

    expect(resolved.layout_hint.density).toBe(0.9);
    // scale/shape_bias come from the engine default for `container`.
    expect(resolved.layout_hint.scale).toBe("large");
    expect(resolved.layout_hint.shape_bias).toBe("radial");
  });

  it("lets an author override the archetype the tagger assigned", () => {
    const lookup: InterpretationLookup = {
      by_tag: [
        {
          pattern: "environment:terrain:*",
          interpretation: { archetype: "container" },
        },
      ],
    };
    expect(resolveInterpretation(span(), lookup).archetype).toBe("container");
  });

  it("keys on the BUILD-TIME archetype, so a lookup cannot rewrite its own key", () => {
    // `by_tag` sets archetype to `container`; `by_archetype.container` must NOT
    // then apply, or resolution would be order-dependent and self-referential.
    const lookup: InterpretationLookup = {
      by_archetype: { container: { salience: 0.99 } },
      by_tag: [
        {
          pattern: "environment:**",
          interpretation: { archetype: "container" },
        },
      ],
    };
    const resolved = resolveInterpretation(span(), lookup);
    expect(resolved.archetype).toBe("container");
    expect(resolved.salience).not.toBe(0.99);
  });
});

describe("INV-4 — the lookup is not policed", () => {
  it("passes through an out-of-range salience rather than clamping it", () => {
    const lookup: InterpretationLookup = {
      by_archetype: { prop: { salience: 40 } },
    };
    expect(resolveInterpretation(span(), lookup).salience).toBe(40);
  });

  it("treats a malformed by_tag pattern as a non-match, never a throw", () => {
    const lookup: InterpretationLookup = {
      by_tag: [
        { pattern: "!!! not a pattern", interpretation: { salience: 0.9 } },
      ],
    };
    expect(() => resolveInterpretation(span(), lookup)).not.toThrow();
    expect(resolveInterpretation(span(), lookup).salience).not.toBe(0.9);
  });

  it("handles an unknown archetype through the fallback (Archetype is open, §3.1)", () => {
    const resolved = resolveInterpretation(
      span({ archetype: "wormhole" }),
      undefined,
    );
    expect(resolved.archetype).toBe("wormhole");
    expect(resolved.affordances).toEqual(["inspect"]);
  });
});

describe("mintEntity produces a complete §3.1 Entity", () => {
  it("carries the substrate's own fields through unchanged", () => {
    const s = span();
    const entity = mintEntity(s, undefined, []);

    expect(entity.prose).toBe(s.prose);
    expect(entity.source_span).toEqual(s.source_span);
    expect(entity.semantic_tags).toEqual(s.semantic_tags);
    expect(entity.state.local_coherence).toBe(s.local_coherence);
    expect(entity.embedding_ref).toBe(s.id);
  });

  it("derives state.visited from the visited set rather than storing it (§3.1)", () => {
    const s = span();
    expect(mintEntity(s, undefined, []).state.visited).toBe(false);
    expect(mintEntity(s, undefined, [s.id]).state.visited).toBe(true);
  });

  it("never leaks an embedding vector to the minted Entity (INV-3)", () => {
    const entity = mintEntity(span(), undefined, []);
    expect(Object.keys(entity)).not.toContain("embedding");
    expect(JSON.stringify(entity)).not.toContain('embedding":[');
  });

  it("is a pure function of (span, lookup, visited) — INV-2", () => {
    const s = span();
    expect(mintEntity(s, undefined, [])).toEqual(mintEntity(s, undefined, []));
  });
});
