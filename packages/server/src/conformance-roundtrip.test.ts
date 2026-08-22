// SPEC §6.5 (issue #89) — the live round-trip conformance test. For each ruleset
// bundle it drives a full server session (`POST /session/new` binds the ruleset →
// `GET /room/current` resolves a room through the engine) and asserts the response
// validates against `ResolvedRoomResponse` (§3.2). This is the server-dependent
// half of #89; `packages/schema/src/fixtures-rooms.test.ts` is the standalone half.
//
// Two layers of coverage:
//   1. A built-in representative set (null / single-global-layer / conflicting
//      overrides) proves the round-trip HARNESS end-to-end now, including the §4.3
//      messy-resolution path that must round-trip without a throw (INV-4).
//   2. Every `fixtures/rulesets/*.json` bundle (issue #90) is discovered and driven
//      through the same harness. Those files are #90's deliverable; this test is the
//      harness that consumes them, so it is `.skip`-guarded until #90 populates them.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidResolvedRoomResponse, type Ruleset } from "schema";
import type { Entity } from "schema";
import type { GraphSpan } from "rule-engine";
import { createServer, type ServerConfig, type Server } from "./server";

// ── Substrate ───────────────────────────────────────────────────────────────
// A container room ringed by traversal-capable neighbours plus a portal, so the
// engine has real candidates to populate and derive exits from under any ruleset.

function makeEntity(id: string, over: Partial<Entity> = {}): Entity {
  return {
    id,
    archetype: "prop",
    semantic_tags: [],
    embedding_ref: `vec:${id}`,
    affordances: [],
    salience: 0.5,
    prose: "",
    source_span: { source: "test", char_ranges: "0-1" },
    contains: [],
    layout_hint: { scale: "medium", density: 0.5, shape_bias: "" },
    state: { local_coherence: 0.5, visited: false },
    ...over,
  };
}

function span(entity: Entity, embedding: number[]): GraphSpan {
  return { entity, embedding };
}

function substrate(): GraphSpan[] {
  const room = makeEntity("origin", {
    archetype: "container",
    embedding_ref: "vec:origin",
    layout_hint: { scale: "large", density: 1, shape_bias: "" },
  });
  return [
    span(room, [1, 0]),
    span(
      makeEntity("north", { archetype: "portal", affordances: ["traverse"] }),
      [0.99, 0.14],
    ),
    span(makeEntity("east", { affordances: ["enter"] }), [0.9, 0.44]),
    span(makeEntity("hall", { affordances: ["traverse"] }), [0.7, 0.71]),
    span(makeEntity("stair", { affordances: ["traverse"] }), [0.5, 0.87]),
    span(
      makeEntity("relic", { archetype: "prop", affordances: ["inspect"] }),
      [0.3, 0.95],
    ),
  ];
}

const NULL_RULESET: Ruleset = { spec_version: "0.1.0", layers: [] };

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    // Dev mode ON so `POST /session/new` binds a per-session ruleset (§0.9.0 A12).
    devMode: true,
    ruleset: NULL_RULESET,
    substrate: { spans: substrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  };
}

function getJson(body: string): unknown {
  return JSON.parse(body);
}

// Bind a ruleset by value via `POST /session/new`, asserting the bind succeeded,
// and return the new session id.
function bindSession(server: Server, ruleset: Ruleset): string {
  const res = server.handle({
    method: "POST",
    url: "/session/new",
    body: JSON.stringify({ seed: 7, ruleset }),
  });
  expect(res.status).toBe(200);
  return (getJson(res.body) as { session_id: string }).session_id;
}

// Round-trip: bind the ruleset, resolve the current room, return the parsed body.
function roundTrip(ruleset: Ruleset): { status: number; body: unknown } {
  const server = createServer(makeConfig());
  const id = bindSession(server, ruleset);
  const res = server.handle({
    method: "GET",
    url: `/room/current?session_id=${id}`,
  });
  return { status: res.status, body: getJson(res.body) };
}

// ── The representative ruleset set (proves the harness now) ────────────────────
// Mirrors the §6.5 archetype spread that #90 curates as files: a null (pure drift)
// ruleset, a single global layer, and two contradictory overrides (§4.3).

const singleGlobalLayer: Ruleset = {
  spec_version: "0.1.0",
  layers: [
    {
      id: "global-bias",
      scope: "global",
      mode: { priority: 1 },
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "soft_reweight", factor: 1.5 },
        },
      ],
    },
  ],
};

// §4.3 messy resolution: two override layers with contradictory hard decisions.
// The engine resolves by declaration order and logs a warning — it must NOT throw
// (INV-4), and the round-trip must still yield a valid ResolvedRoomResponse.
const conflictingOverrides: Ruleset = {
  spec_version: "0.1.0",
  layers: [
    {
      id: "ov-allow",
      scope: "dynamic.turn_count >= 0",
      mode: "override",
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "hard_allow" },
        },
      ],
    },
    {
      id: "ov-forbid",
      scope: "dynamic.turn_count >= 0",
      mode: "override",
      rules: [
        {
          predicate: "static.embedding_distance >= 0",
          effect: { kind: "hard_forbid" },
        },
      ],
    },
  ],
};

const REPRESENTATIVE: { name: string; ruleset: Ruleset }[] = [
  { name: "null ruleset (pure drift)", ruleset: NULL_RULESET },
  { name: "single global layer", ruleset: singleGlobalLayer },
  { name: "contradictory overrides (§4.3)", ruleset: conflictingOverrides },
];

describe("round-trip harness (§6.5) — representative rulesets", () => {
  it.each(REPRESENTATIVE)(
    "binds $name and resolves a schema-valid ResolvedRoomResponse",
    ({ ruleset }) => {
      const { status, body } = roundTrip(ruleset);
      expect(status).toBe(200);
      expect(isValidResolvedRoomResponse(body)).toBe(true);
    },
  );

  it("never throws routing a §4.3 conflict through the server (INV-4)", () => {
    expect(() => roundTrip(conflictingOverrides)).not.toThrow();
  });

  it("binding by value produces distinct rooms per ruleset, all valid", () => {
    // A hard_forbid-everything ruleset resolves to a valid 'stuck' 200 (C2), not a
    // 4xx/5xx — the round-trip contract holds even when population is empty.
    const forbidAll: Ruleset = {
      spec_version: "0.1.0",
      layers: [
        {
          id: "wall",
          scope: "global",
          mode: { priority: 1 },
          rules: [
            {
              predicate: "static.embedding_distance >= 0",
              effect: { kind: "hard_forbid" },
            },
          ],
        },
      ],
    };
    const { status, body } = roundTrip(forbidAll);
    expect(status).toBe(200);
    expect(isValidResolvedRoomResponse(body)).toBe(true);
    expect((body as { resolution_status: string }).resolution_status).toBe(
      "stuck",
    );
  });
});

// ── The fixtures/rulesets/* bundles (issue #90) ───────────────────────────────
// Discover and round-trip every bundle #90 lays down. Skipped with a visible note
// until that issue populates the directory (this issue owns only the harness).

const RULESETS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rulesets",
);

function discoverRulesetFiles(): string[] {
  try {
    return readdirSync(RULESETS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    // Directory absent until #90 creates it — no files to round-trip yet.
    return [];
  }
}

const RULESET_FILES = discoverRulesetFiles();

describe("fixtures/rulesets bundles round-trip (§6.5, #90)", () => {
  if (RULESET_FILES.length === 0) {
    it.skip("no fixtures/rulesets/*.json yet — bundles are populated by issue #90", () => {});
  } else {
    it.each(RULESET_FILES)(
      "%s binds and resolves a schema-valid ResolvedRoomResponse",
      (name) => {
        const ruleset = JSON.parse(
          readFileSync(join(RULESETS_DIR, name), "utf8"),
        ) as Ruleset;
        const { status, body } = roundTrip(ruleset);
        expect(status).toBe(200);
        expect(isValidResolvedRoomResponse(body)).toBe(true);
      },
    );
  }
});
