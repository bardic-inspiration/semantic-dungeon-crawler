// SPEC §5.4 / §5.3 — the terminal renderer, and the conformance sweep over every
// `fixtures/rooms/*.json` (the first conformance check in the build order, §6.5).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DebugTrace, ResolvedRoomResponse } from "schema";
import { parseRoomFixture } from "./fixtures";
import {
  renderInteraction,
  renderMetricsSummary,
  renderRoom,
  renderTrace,
  salienceOrdered,
} from "./render";
import type { Verbosity } from "./verbosity";

const ROOMS_DIR = fileURLToPath(
  new URL("../../../fixtures/rooms", import.meta.url),
);
const roomFiles = readdirSync(ROOMS_DIR).filter((f) => f.endsWith(".json"));

function loadFixture(name: string): ResolvedRoomResponse {
  return parseRoomFixture(readFileSync(`${ROOMS_DIR}/${name}`, "utf8"), name);
}

const LEVELS: Verbosity[] = ["error", "warn", "info", "debug"];

describe("§5.3 conformance — render every fixtures/rooms/*.json", () => {
  it("finds the room fixtures on disk", () => {
    expect(roomFiles.length).toBeGreaterThan(0);
  });

  for (const name of roomFiles) {
    const room = loadFixture(name);
    for (const level of LEVELS) {
      it(`renders ${name} at ${level} without error`, () => {
        const lines = renderRoom(room, level);
        expect(Array.isArray(lines)).toBe(true);
        // The header names the room id and archetype (§5.4).
        expect(lines[0]).toBe(`room ${room.room.id} [${room.room.archetype}]`);
      });
    }
  }
});

describe("renderRoom detail ladder (§5.4)", () => {
  const room = loadFixture("drift-crossroads.json");

  it("error level is the transition line only", () => {
    const lines = renderRoom(room, "error");
    expect(lines).toEqual([`room ${room.room.id} [container]`]);
  });

  it("warn adds status, salience-ordered objects with affordances, and exits", () => {
    const lines = renderRoom(room, "warn");
    const text = lines.join("\n");
    expect(text).toContain("status: resolved");
    expect(text).toContain("objects:");
    expect(text).toContain("exits:");
    // Each object shows its affordances.
    expect(text).toContain("affordances=[traverse]");
    // Objects appear salience-DESC: north (0.31) before west (0.21).
    const north = lines.findIndex((l) => l.includes("resolved:north-way:1"));
    const west = lines.findIndex((l) => l.includes("resolved:west-way:4"));
    expect(north).toBeGreaterThan(-1);
    expect(north).toBeLessThan(west);
    // Exits are rendered with their via-object + affordance.
    expect(text).toContain(
      "traverse -> query:token:north-drift via resolved:north-way:1",
    );
  });

  it("info adds full entity JSON on top of the warn body", () => {
    const lines = renderRoom(room, "info");
    const text = lines.join("\n");
    expect(text).toContain("objects:"); // still has the warn body
    expect(text).toContain("room (full):");
    expect(text).toContain(`object ${room.objects[0]!.id} (full):`);
    // The full block carries fields the warn body omits (e.g. prose, embedding_ref).
    expect(text).toContain('"embedding_ref"');
  });

  it("debug renders an inline DebugTrace when the response carries one", () => {
    const trace: DebugTrace = {
      candidates_initial: ["a", "b"],
      per_layer: [],
      final_hard_decision_source: null,
      final_soft_scores: { a: 0.5 },
    };
    const withTrace: ResolvedRoomResponse = { ...room, debug: trace };
    const text = renderRoom(withTrace, "debug").join("\n");
    expect(text).toContain("trace:");
    expect(text).toContain("candidates_initial");
    // A response WITHOUT a trace prints no trace block even at debug.
    expect(renderRoom(room, "debug").join("\n")).not.toContain("trace:");
  });
});

describe("salienceOrdered", () => {
  const room = loadFixture("drift-crossroads.json");

  it("orders by salience descending", () => {
    const ordered = salienceOrdered(room.objects);
    const saliences = ordered.map((o) => o.salience);
    const sorted = [...saliences].sort((a, b) => b - a);
    expect(saliences).toEqual(sorted);
  });

  it("is deterministic under a salience tie (id tie-break) and non-mutating", () => {
    const base = room.objects[0]!;
    const tied: ResolvedRoomResponse["objects"] = [
      { ...base, id: "z", salience: 0.5 },
      { ...base, id: "a", salience: 0.5 },
    ];
    expect(salienceOrdered(tied).map((o) => o.id)).toEqual(["a", "z"]);
    // Input array is not mutated.
    expect(tied.map((o) => o.id)).toEqual(["z", "a"]);
  });
});

describe("renderInteraction (§3.3)", () => {
  const base = {
    new_room: loadFixture("drift-crossroads.json"),
  };

  it("reports a transition and any author text", () => {
    const lines = renderInteraction(
      {
        ...base,
        transition_occurred: true,
        interaction_result: { text: "You step north." },
      },
      "warn",
    );
    expect(lines).toContain("> You step north.");
    expect(lines).toContain("> moved");
  });

  it("distinguishes a blocked move from a local interaction", () => {
    const blocked = renderInteraction(
      {
        ...base,
        transition_occurred: false,
        movement_blocked: true,
        interaction_result: {},
      },
      "warn",
    );
    expect(blocked).toContain("> move blocked");
    const local = renderInteraction(
      { ...base, transition_occurred: false, interaction_result: {} },
      "warn",
    );
    expect(local).toContain("> (local interaction — no movement)");
  });

  it("surfaces effects_summary only at info+ and session end always", () => {
    const resp = {
      ...base,
      transition_occurred: false,
      session_ended: true,
      interaction_result: { effects_summary: ["vars.x = 1"] },
    };
    expect(renderInteraction(resp, "warn")).toContain("> session ended");
    expect(renderInteraction(resp, "warn").join("\n")).not.toContain("effect:");
    expect(renderInteraction(resp, "info")).toContain("> effect: vars.x = 1");
  });
});

describe("renderTrace / renderMetricsSummary", () => {
  it("renders a trace as a labeled JSON block", () => {
    const trace: DebugTrace = {
      candidates_initial: [],
      per_layer: [],
      final_hard_decision_source: "layer-0",
      final_soft_scores: {},
    };
    expect(renderTrace(trace).join("\n")).toContain("layer-0");
  });

  it("summarizes turns, requests, and latency from a metrics snapshot", () => {
    const lines = renderMetricsSummary({
      counters: { "cli.turns": 3, "cli.requests": 7 },
      gauges: { "cli.request.duration_ms": 4.5 },
    });
    const text = lines.join("\n");
    expect(text).toContain("turns: 3");
    expect(text).toContain("requests: 7");
    expect(text).toContain("4.5ms");
  });
});
