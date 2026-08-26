// SPEC §6.5 / §4.3 (issue #90) — the static conformance check over
// `fixtures/rulesets/*.json`. These hand-authored ruleset bundles are structured
// data (§0.9.0 A11 — the historical `.dsl` extension is retired); the §4.2 DSL
// appears only inside predicate/scope/value strings. They must validate against
// the Phase 1 `Ruleset` schema (§3.4) DIRECTLY, with no server and no engine in
// the loop, so the bundles stand alone as conformance data. This suite is the
// server-independent half of #90; the live round-trip that binds each bundle via
// `POST /session/new` and validates the response is
// `packages/server/src/conformance-roundtrip.test.ts` (issue #89).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Effect, Layer, RuleBlock, Ruleset } from "./index";

// A structural well-formedness check for the `Ruleset` DATA SHAPE (§3.4). Kept
// LOCAL to the test: #90 adds conformance data + its validation, not a new export
// to the shared schema surface (docs/issue-standards.md — implement the
// acceptance criteria, not more). Structural only, per INV-4 — a
// well-formed-but-incoherent ruleset (e.g. contradictory `override` layers) is
// still valid; taste is not policed here.

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
}

// §3.4 — the Effect taxonomy (traversal-control + commit-phase effects).
function isValidEffect(value: unknown): value is Effect {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "hard_allow":
    case "hard_forbid":
    case "end":
      return true;
    case "soft_reweight":
      return typeof value.factor === "number";
    case "write":
      return isString(value.target) && isString(value.value);
    case "primitive":
      return (
        isString(value.primitive) &&
        (value.args === undefined || isStringRecord(value.args))
      );
    case "emit":
      return (
        (value.text === undefined || isString(value.text)) &&
        (value.reveal === undefined ||
          (Array.isArray(value.reveal) && value.reveal.every(isString)))
      );
    default:
      return false;
  }
}

function isValidRuleBlock(value: unknown): value is RuleBlock {
  return (
    isRecord(value) && isString(value.predicate) && isValidEffect(value.effect)
  );
}

// §3.4 Layer.mode — `"override"` | `"yield"` | `{ priority: number }`.
function isValidMode(value: unknown): boolean {
  if (value === "override" || value === "yield") return true;
  return isRecord(value) && typeof value.priority === "number";
}

function isValidLayer(value: unknown): value is Layer {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.scope) && // "global" or a §4.2 scope expression string
    isValidMode(value.mode) &&
    Array.isArray(value.rules) &&
    value.rules.every(isValidRuleBlock)
  );
}

function isValidRuleset(value: unknown): value is Ruleset {
  if (!isRecord(value)) return false;
  if (!isString(value.spec_version)) return false;
  if (!Array.isArray(value.layers)) return false;
  if (!value.layers.every(isValidLayer)) return false;
  // The remaining §3.4 fields are all OPTIONAL author content; a bundle carrying
  // only `spec_version` + `layers` is a legal ruleset (INV-4). This suite's
  // fixtures deliberately stay in that minimal shape.
  return true;
}

// Resolve `fixtures/rulesets/` from this test file so the suite is independent of
// the process working directory (repo-root ← packages/schema/src).
const RULESETS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rulesets",
);

function rulesetFiles(): string[] {
  return readdirSync(RULESETS_DIR).sort();
}

function loadFixtures(): { name: string; data: unknown }[] {
  return rulesetFiles()
    .filter((f) => f.endsWith(".json"))
    .map((name) => ({
      name,
      data: JSON.parse(
        readFileSync(join(RULESETS_DIR, name), "utf8"),
      ) as unknown,
    }));
}

const FIXTURES = loadFixtures();

// Whether a layer's rules contain a given hard decision — the building block for
// the §4.3 messy-resolution check below.
function hasHardEffect(
  layer: Layer,
  kind: "hard_allow" | "hard_forbid",
): boolean {
  return layer.rules.some((r) => r.effect.kind === kind);
}

describe("fixtures/rulesets conformance set (§6.5, §4.3)", () => {
  it("provides the bundles the round-trip test discovers", () => {
    // A floor guards against the suite silently emptying — #89's round-trip test
    // discovers this same directory, so an empty set would silently pass there too.
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  it("carries only structured-data bundles — no retired `.dsl` (§0.9.0 A11)", () => {
    expect(rulesetFiles().some((f) => f.endsWith(".dsl"))).toBe(false);
    expect(rulesetFiles().every((f) => f.endsWith(".json"))).toBe(true);
  });

  it.each(FIXTURES.map((f) => f.name))(
    "%s validates against the Ruleset schema (§3.4), standalone",
    (name) => {
      const fixture = FIXTURES.find((f) => f.name === name)!;
      expect(isValidRuleset(fixture.data)).toBe(true);
    },
  );
});

// The §6.5 build-list minimums, asserted over the set as a whole so the suite
// fails loudly if a required bundle is dropped: null, single-global-layer, and a
// multi-layer-with-conflict bundle exercising §4.3's messy-resolution path.
describe("fixtures/rulesets required-bundle minimums (§6.5, §4.3)", () => {
  const rulesets = FIXTURES.map((f) => f.data as Ruleset);

  it("includes a null ruleset (`layers: []` → pure drift)", () => {
    expect(rulesets.some((r) => r.layers.length === 0)).toBe(true);
  });

  it("includes a single-global-layer ruleset (one `global`-scoped layer)", () => {
    expect(
      rulesets.some(
        (r) => r.layers.length === 1 && r.layers[0]?.scope === "global",
      ),
    ).toBe(true);
  });

  it("includes a multi-layer-conflict bundle: two `override` layers with contradictory hard decisions (§4.3)", () => {
    // §4.3 / SPEC line — two `override`-mode layers producing contradictory hard
    // decisions must resolve by declaration order (warning logged, never a throw).
    // The fixture that exercises that path must literally carry the shape: an
    // `override` layer that `hard_allow`s and another that `hard_forbid`s.
    expect(
      rulesets.some((r) => {
        const overrides = r.layers.filter((l) => l.mode === "override");
        return (
          overrides.length >= 2 &&
          overrides.some((l) => hasHardEffect(l, "hard_allow")) &&
          overrides.some((l) => hasHardEffect(l, "hard_forbid"))
        );
      }),
    ).toBe(true);
  });
});

// The guard is a real gate, not a rubber stamp: prove it rejects malformed data
// so a fixture that silently drifts out of the Ruleset shape is actually caught.
describe("isValidRuleset rejects malformed bundles (§3.4)", () => {
  it("rejects a non-object", () => {
    expect(isValidRuleset(null)).toBe(false);
    expect(isValidRuleset("[]")).toBe(false);
  });

  it("rejects a missing/wrong-typed spec_version", () => {
    expect(isValidRuleset({ layers: [] })).toBe(false);
    expect(isValidRuleset({ spec_version: 1, layers: [] })).toBe(false);
  });

  it("rejects a non-array `layers`", () => {
    expect(isValidRuleset({ spec_version: "0.12.0" })).toBe(false);
    expect(isValidRuleset({ spec_version: "0.12.0", layers: {} })).toBe(false);
  });

  it("rejects a layer with an unknown mode", () => {
    expect(
      isValidRuleset({
        spec_version: "0.12.0",
        layers: [{ id: "l", scope: "global", mode: "clobber", rules: [] }],
      }),
    ).toBe(false);
  });

  it("rejects a rule carrying an unknown effect kind", () => {
    expect(
      isValidRuleset({
        spec_version: "0.12.0",
        layers: [
          {
            id: "l",
            scope: "global",
            mode: "yield",
            rules: [{ predicate: "true", effect: { kind: "nuke" } }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects a `soft_reweight` effect missing its numeric factor", () => {
    expect(
      isValidRuleset({
        spec_version: "0.12.0",
        layers: [
          {
            id: "l",
            scope: "global",
            mode: "yield",
            rules: [{ predicate: "true", effect: { kind: "soft_reweight" } }],
          },
        ],
      }),
    ).toBe(false);
  });
});
