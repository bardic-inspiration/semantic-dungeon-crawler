// SPEC §5.4 — the REPL driver, unit-tested against a stub §5.1 client (the live
// end-to-end and byte-for-byte-replay tests are in e2e.test.ts).

import { describe, expect, it } from "vitest";
import type {
  DebugTrace,
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import type { ApiClient } from "./api-client";
import { CollectingLogger, InMemoryMetrics } from "./instrumentation";
import { linesFromText, parseActionLine, runRepl } from "./repl";

function room(id: string): ResolvedRoomResponse {
  return {
    room: {
      id,
      archetype: "container",
      semantic_tags: [],
      embedding_ref: "vec:0",
      affordances: ["enter"],
      salience: 0.5,
      prose: "",
      source_span: { source: "s", char_ranges: "0-1" },
      contains: [],
      layout_hint: { scale: "small", density: 0, shape_bias: "none" },
      state: { local_coherence: 0, visited: false },
    },
    objects: [],
    exits: [],
    resolution_status: "resolved",
  };
}

interface Recorded {
  interacts: InteractRequest[];
  deleted: string[];
}

function stubClient(
  script: {
    rooms: ResolvedRoomResponse[];
    interact: (req: InteractRequest, n: number) => InteractResponse;
    trace?: DebugTrace | null;
  },
  rec: Recorded,
): ApiClient {
  let roomIdx = 0;
  let interactN = 0;
  return {
    async newSession() {
      return { session_id: "sess-1", seed: 42 };
    },
    async roomCurrent() {
      return script.rooms[Math.min(roomIdx++, script.rooms.length - 1)]!;
    },
    async interact(req) {
      rec.interacts.push(req);
      return script.interact(req, interactN++);
    },
    async debugTrace() {
      return script.trace ?? null;
    },
    async deleteSession(id) {
      rec.deleted.push(id);
    },
  };
}

describe("parseActionLine", () => {
  it("parses '<object_id> <affordance>'", () => {
    expect(parseActionLine("resolved:north-way:1 traverse")).toEqual({
      object_id: "resolved:north-way:1",
      affordance: "traverse",
    });
  });

  it("skips blank lines and # comments (input-log annotations)", () => {
    expect(parseActionLine("")).toBeNull();
    expect(parseActionLine("   ")).toBeNull();
    expect(parseActionLine("# a note")).toBeNull();
  });

  it("returns null for a single bare token (no affordance)", () => {
    expect(parseActionLine("lonely")).toBeNull();
  });
});

describe("runRepl", () => {
  it("drives session → room → interact → new room, then tears down", async () => {
    const rec: Recorded = { interacts: [], deleted: [] };
    const out: string[] = [];
    const client = stubClient(
      {
        rooms: [room("start")],
        interact: () => ({
          new_room: room("next"),
          transition_occurred: true,
          interaction_result: {},
        }),
      },
      rec,
    );
    await runRepl({
      client,
      input: linesFromText("obj traverse\n"),
      out: (l) => out.push(l),
      metrics: new InMemoryMetrics(),
      level: "warn",
    });
    const text = out.join("\n");
    // Printed the start room, resolved the action, printed the destination room.
    expect(text).toContain("room start [container]");
    expect(rec.interacts).toEqual([
      {
        session_id: "sess-1",
        action: { object_id: "obj", affordance: "traverse" },
      },
    ]);
    expect(text).toContain("> moved");
    expect(text).toContain("room next [container]");
    // Idempotent teardown ran.
    expect(rec.deleted).toEqual(["sess-1"]);
  });

  it("stops when an author rule ends the session (§0.9.0 A7)", async () => {
    const rec: Recorded = { interacts: [], deleted: [] };
    const client = stubClient(
      {
        rooms: [room("start")],
        interact: () => ({
          new_room: room("end"),
          transition_occurred: false,
          session_ended: true,
          interaction_result: {},
        }),
      },
      rec,
    );
    await runRepl({
      client,
      input: linesFromText("a inspect\nb inspect\n"), // second line must NOT run
      out: () => {},
      metrics: new InMemoryMetrics(),
      level: "warn",
    });
    expect(rec.interacts).toHaveLength(1);
  });

  it("logs bad input to the operational logger and continues", async () => {
    const rec: Recorded = { interacts: [], deleted: [] };
    const log = new CollectingLogger();
    const client = stubClient(
      {
        rooms: [room("start")],
        interact: () => ({
          new_room: room("next"),
          transition_occurred: false,
          interaction_result: {},
        }),
      },
      rec,
    );
    await runRepl({
      client,
      input: linesFromText("only-one-token\nobj inspect\n"),
      out: () => {},
      metrics: new InMemoryMetrics(),
      level: "warn",
      log,
    });
    expect(log.entries.some((e) => e.event === "cli.bad_input")).toBe(true);
    expect(rec.interacts).toHaveLength(1); // the valid line still ran
  });

  it("at debug renders the trace and an end-of-session metrics summary", async () => {
    const rec: Recorded = { interacts: [], deleted: [] };
    const out: string[] = [];
    const metrics = new InMemoryMetrics();
    const trace: DebugTrace = {
      candidates_initial: ["c1"],
      per_layer: [],
      final_hard_decision_source: null,
      final_soft_scores: {},
    };
    const client = stubClient(
      {
        rooms: [room("start")],
        interact: () => ({
          new_room: room("next"),
          transition_occurred: true,
          interaction_result: {},
        }),
        trace,
      },
      rec,
    );
    await runRepl({
      client,
      input: linesFromText("obj traverse\n"),
      out: (l) => out.push(l),
      metrics,
      level: "debug",
    });
    const text = out.join("\n");
    expect(text).toContain("candidates_initial"); // trace rendered
    expect(text).toContain("session summary:");
    expect(text).toContain("turns: 1");
  });
});
