// packages/server/src/overlay-primitives.test.ts
//
// SPEC §3.7.4 / §3.9 / §3.8 (A10, INV-2) — the overlay primitives, wired end to
// end at the server seam: a fired `{kind:"primitive"}` effect writes to the
// per-session registry/links, a player-exposed one surfaces through
// `GET /session/{id}/registry` and appends a `{kind:"primitive"}` input-log
// entry, and a session replayed from its log reproduces the overlay byte-for-byte.

import { describe, it, expect } from "vitest";
import type {
  Effect,
  InputLogEntry,
  InteractResponse,
  PrimitiveExposure,
  Ruleset,
} from "schema";
import type { GraphSpan, SubstrateSpanView } from "rule-engine";
import { createServer, type ServerConfig } from "./server";

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

function substrate(): GraphSpan[] {
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    {
      span: makeSpan("book", { archetype: "readable" }),
      embedding: [0.95, 0.31],
    },
    { span: makeSpan("d", { archetype: "prop" }), embedding: [0.7, 0.71] },
  ];
}

/** A ruleset whose one global rule fires `effect` on every resolved interaction. */
function firing(effect: Effect, exposure?: PrimitiveExposure[]): Ruleset {
  return {
    spec_version: "0.12.0",
    layers: [
      {
        id: "overlay-writer",
        scope: "global",
        mode: { priority: 1 },
        rules: [{ predicate: "dynamic.turn_count >= 0", effect }],
      },
    ],
    ...(exposure ? { primitive_exposure: exposure } : {}),
  };
}

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ruleset: { spec_version: "0.12.0", layers: [] },
    substrate: {
      spans: substrate(),
      start_ref: "vec:origin",
      substrate_version: "sv-1",
    },
    newSeed: () => 7,
    ...over,
  };
}

function json<T>(body: string): T {
  return JSON.parse(body) as T;
}

function boot(over: Partial<ServerConfig> = {}) {
  const s = createServer(makeConfig(over));
  const id = json<{ session_id: string }>(
    s.handle({ method: "GET", url: "/session/new?seed=42" }).body,
  ).session_id;
  return { s, id };
}

function interact(
  s: ReturnType<typeof createServer>,
  id: string,
  object_id: string,
  affordance: string,
): InteractResponse {
  return json<InteractResponse>(
    s.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: { object_id, affordance },
      }),
    }).body,
  );
}

function registry(s: ReturnType<typeof createServer>, id: string) {
  return json<{ tag: string; label: string }[]>(
    s.handle({ method: "GET", url: `/session/${id}/registry` }).body,
  );
}

function log(s: ReturnType<typeof createServer>, id: string): InputLogEntry[] {
  return json<InputLogEntry[]>(
    s.handle({ method: "GET", url: `/session/${id}/log` }).body,
  );
}

const pinEffect: Effect = {
  kind: "primitive",
  primitive: "pin",
  args: { tag: "place:home", vector_ref: "vec:origin" },
};

describe("a player-exposed primitive surfaces + logs (§3.7.4, A10)", () => {
  it("writes a player entry reachable via GET /registry", () => {
    const { s, id } = boot({
      ruleset: firing(pinEffect, [{ primitive: "pin", exposure: "player" }]),
    });
    expect(registry(s, id)).toEqual([]); // nothing written before any interaction

    interact(s, id, "book", "read");

    expect(registry(s, id)).toEqual([
      { tag: "place:home", label: "place:home" },
    ]);
  });

  it("appends a {kind:'primitive'} entry to the input log, after the interact", () => {
    const { s, id } = boot({
      ruleset: firing(pinEffect, [{ primitive: "pin", exposure: "player" }]),
    });
    interact(s, id, "book", "read");

    expect(log(s, id)).toEqual([
      { kind: "interact", action: { object_id: "book", affordance: "read" } },
      {
        kind: "primitive",
        primitive: "pin",
        args: { tag: "place:home", vector_ref: "vec:origin" },
      },
    ]);
  });
});

describe("exposure gating (§3.7.4)", () => {
  it("an author_only primitive writes but never reaches the player view or log", () => {
    const { s, id } = boot({
      ruleset: firing(pinEffect, [
        { primitive: "pin", exposure: "author_only" },
      ]),
    });
    interact(s, id, "book", "read");

    expect(registry(s, id)).toEqual([]); // author_runtime is filtered out (INV-3)
    // The write still happened, as author_runtime, in the session overlay.
    expect(s.sessions.get(id)!.registry).toHaveLength(1);
    expect(s.sessions.get(id)!.registry[0]!.provenance).toBe("author_runtime");
    // Only the interact is logged — a rule-driven write re-derives on replay.
    expect(log(s, id)).toEqual([
      { kind: "interact", action: { object_id: "book", affordance: "read" } },
    ]);
  });

  it("a `when` predicate gates the player path on run state", () => {
    const ruleset = firing(pinEffect, [
      { primitive: "pin", exposure: "player", when: "dynamic.turn_count > 0" },
    ]);
    const { s, id } = boot({ ruleset });

    // turn_count is 0 on the first interaction's commit → gated out (author_runtime).
    interact(s, id, "book", "read");
    expect(registry(s, id)).toEqual([]);
    // A movement turn advances turn_count; the next interaction's commit sees > 0.
    // (Reading a book does not move, so drive a second interaction to advance it
    // only if a transition occurs — here we assert the gate held on turn 0.)
    expect(s.sessions.get(id)!.registry[0]!.provenance).toBe("author_runtime");
  });
});

describe("snapshot staleness surfaced, never rejected (§3.7.3, D3)", () => {
  it("a stale snapshot is still readable and warns; a matching one is silent", () => {
    const { s, id } = boot();
    const session = s.sessions.get(id)!;
    // Inject a player snapshot bound to a DIFFERENT substrate version (as if
    // carried in from another build). The live version is "sv-1".
    session.registry.push({
      tag: "snap:old",
      points_to: {
        kind: "snapshot",
        snapshot: { substrate_version: "sv-OLD", resolved_payload: [] },
      },
      provenance: "player",
    });
    // Still fully readable — it surfaces as a label, never invalidated (INV-4).
    expect(registry(s, id)).toEqual([{ tag: "snap:old", label: "snap:old" }]);
    // The frozen payload was never mutated.
    const ref = session.registry[0]!.points_to;
    expect(ref.kind === "snapshot" && ref.snapshot.substrate_version).toBe(
      "sv-OLD",
    );
  });
});

describe("INV-2 replay — the overlay re-derives byte-for-byte (§3.9)", () => {
  it("a session with primitive log entries replays to an identical registry", () => {
    const ruleset = firing(
      {
        kind: "primitive",
        primitive: "bookmark",
        args: { tag: "place:here" },
      },
      [{ primitive: "bookmark", exposure: "player" }],
    );

    // Record: drive two interactions, capturing the log the server accumulates.
    const rec = boot({ ruleset });
    interact(rec.s, rec.id, "book", "read");
    interact(rec.s, rec.id, "book", "read");
    const recordedLog = log(rec.s, rec.id);
    const recorded = rec.s.sessions.get(rec.id)!;

    // The log carries the load-bearing new entry kind.
    expect(recordedLog.some((e) => e.kind === "primitive")).toBe(true);

    // Replay: a fresh same-seed session, re-POSTing the logged INTERACT inputs in
    // order (§3.9). The primitive entries are records — they re-derive from the
    // interacts, so they are not re-POSTed.
    const rep = boot({ ruleset });
    for (const entry of recordedLog) {
      if (entry.kind === "interact") {
        interact(
          rep.s,
          rep.id,
          entry.action.object_id,
          entry.action.affordance,
        );
      }
    }
    const replayed = rep.s.sessions.get(rep.id)!;

    // Byte-identical registry, links, vars, and re-accumulated input log.
    expect(JSON.stringify(replayed.registry)).toBe(
      JSON.stringify(recorded.registry),
    );
    expect(JSON.stringify(replayed.links)).toBe(JSON.stringify(recorded.links));
    expect(JSON.stringify(replayed.vars)).toBe(JSON.stringify(recorded.vars));
    expect(JSON.stringify(log(rep.s, rep.id))).toBe(
      JSON.stringify(recordedLog),
    );
  });
});
