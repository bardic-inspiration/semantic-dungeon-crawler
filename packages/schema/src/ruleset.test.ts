import { describe, expect, it } from "vitest";
import type { Layer, Ruleset } from "./ruleset";

describe("§3.4 Ruleset data shape", () => {
  it("represents the null ruleset (layers: []) — the relativistic-drift default", () => {
    const empty: Ruleset = { spec_version: "0.1.0", layers: [] };
    expect(empty.layers).toHaveLength(0);
  });

  it("type-checks a single global layer carrying the full authored bundle", () => {
    const ruleset: Ruleset = {
      spec_version: "0.1.0",
      authored_against: "substrate:2026-08-18",
      layers: [
        {
          id: "base",
          scope: "global",
          mode: "yield",
          rules: [
            {
              predicate: 'static.archetype == "portal"',
              effect: { kind: "hard_allow" },
            },
            {
              predicate: "dynamic.turn_count > 5",
              effect: { kind: "soft_reweight", factor: 0.5 },
            },
            {
              predicate: 'static.tags CONTAINS "trap"',
              effect: { kind: "emit", text: "A trap!" },
            },
            {
              predicate: "true",
              effect: {
                kind: "write",
                target: "dynamic.vars.seen",
                value: "1",
              },
            },
          ],
        },
      ],
      modifier_registry: { viz: { note: "render-only tags" } },
      resolvers: { match: "presence" },
      interpretation_lookup: {
        by_archetype: { container: { salience: 0.8, affordances: ["enter"] } },
        by_tag: [
          { pattern: "creature:*", interpretation: { archetype: "actor" } },
        ],
      },
      primitive_exposure: [
        {
          primitive: "bookmark",
          exposure: "player",
          when: "dynamic.turn_count > 0",
        },
      ],
      movement_affordances: ["enter", "traverse"],
    };
    expect(ruleset.layers[0]?.rules).toHaveLength(4);
    expect(ruleset.primitive_exposure?.[0]?.primitive).toBe("bookmark");
  });

  it("type-checks two override layers with contradictory hard decisions (well-formed but incoherent — INV-4)", () => {
    const allow: Layer = {
      id: "allow-all",
      scope: "global",
      mode: "override",
      rules: [{ predicate: "true", effect: { kind: "hard_allow" } }],
    };
    const forbid: Layer = {
      id: "forbid-all",
      scope: "global",
      mode: "override",
      rules: [{ predicate: "true", effect: { kind: "hard_forbid" } }],
    };
    const contradictory: Ruleset = {
      spec_version: "0.1.0",
      layers: [allow, forbid],
    };
    // The schema accepts it; the solver's no-throw resolution is a Phase 3 test.
    expect(contradictory.layers.map((l) => l.id)).toEqual([
      "allow-all",
      "forbid-all",
    ]);
  });
});
