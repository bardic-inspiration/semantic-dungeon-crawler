// SPEC §6.5 (issue #89) — the live round-trip conformance test. For each ruleset
// bundle in `fixtures/rulesets/*` (issue #90) it drives a full server session
// (`POST /session/new` binds the ruleset → `GET /room/current` resolves a room
// through the engine) and asserts the response validates against
// `ResolvedRoomResponse` (§3.2). This is the server-dependent half of #89;
// `packages/schema/src/fixtures-rooms.test.ts` is the standalone half.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidEntity, type Ruleset } from "schema";
import type { GraphSpan, SubstrateSpanView } from "rule-engine";
import { createServer, type ServerConfig, type Server } from "./server";

// A ResolvedRoomResponse well-formedness check (§3.2), composed from the Phase 1
// `isValidEntity` guard. Kept LOCAL to the test: #89 adds conformance data + its
// tests, not a new export to the shared schema surface (docs/issue-standards.md —
// implement the acceptance criteria, not more). Structural only, per INV-4.
function isValidResolvedExit(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const exit = value as Record<string, unknown>;
  return (
    typeof exit.target_entity_id === "string" &&
    typeof exit.affordance_required === "string" &&
    typeof exit.via_object_id === "string" &&
    typeof exit.weight === "number"
  );
}

function isValidResolvedRoomResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (!isValidEntity(response.room)) return false;
  if (!Array.isArray(response.objects)) return false;
  if (!response.objects.every(isValidEntity)) return false;
  if (!Array.isArray(response.exits)) return false;
  if (!response.exits.every(isValidResolvedExit)) return false;
  if (typeof response.resolution_status !== "string") return false;
  if (
    response.debug !== undefined &&
    (typeof response.debug !== "object" || response.debug === null)
  ) {
    return false;
  }
  return true;
}

// ── Substrate ───────────────────────────────────────────────────────────────
// A container room ringed by traversal-capable neighbours plus a portal, so the
// engine has real candidates to populate and derive exits from under any ruleset.
// The graph stores `SubstrateSpanView`s (an `Entity` is minted per resolution);
// archetype drives the default affordances via the engine interpretation lookup.

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

function span(view: SubstrateSpanView, embedding: number[]): GraphSpan {
  return { span: view, embedding };
}

function substrate(): GraphSpan[] {
  const room = makeSpan("origin", { archetype: "container" });
  return [
    span(room, [1, 0]),
    span(makeSpan("north", { archetype: "portal" }), [0.99, 0.14]),
    span(makeSpan("east", { archetype: "container" }), [0.9, 0.44]),
    span(makeSpan("hall", { archetype: "portal" }), [0.7, 0.71]),
    span(makeSpan("stair", { archetype: "portal" }), [0.5, 0.87]),
    span(makeSpan("relic", { archetype: "prop" }), [0.3, 0.95]),
  ];
}

const SERVER_RULESET: Ruleset = { spec_version: "0.12.0", layers: [] };

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    // Dev mode ON so `POST /session/new` binds a per-session ruleset (§0.9.0 A12).
    devMode: true,
    ruleset: SERVER_RULESET,
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

// ── The fixtures/rulesets/* bundles (issue #90) ───────────────────────────────
// Discover every bundle #90 laid down and drive each through the harness above.

const RULESETS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rulesets",
);

const RULESET_FILES = readdirSync(RULESETS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("fixtures/rulesets bundles round-trip (§6.5)", () => {
  it("discovers the #90 ruleset bundles to round-trip", () => {
    expect(RULESET_FILES.length).toBeGreaterThan(0);
  });

  it.each(RULESET_FILES)(
    "%s binds via POST /session/new and resolves a schema-valid ResolvedRoomResponse",
    (name) => {
      const ruleset = JSON.parse(
        readFileSync(join(RULESETS_DIR, name), "utf8"),
      ) as Ruleset;

      // INV-4: even the §4.3 multi-layer-conflict bundle round-trips without a
      // throw — the solver resolves by declaration order, never rejecting.
      let result!: { status: number; body: unknown };
      expect(() => {
        result = roundTrip(ruleset);
      }).not.toThrow();

      // §0.11.0 (C2): always a 200, and the body is a well-formed
      // ResolvedRoomResponse — including a valid 'stuck' room if a bundle forbids
      // every candidate.
      expect(result.status).toBe(200);
      expect(isValidResolvedRoomResponse(result.body)).toBe(true);
    },
  );
});
