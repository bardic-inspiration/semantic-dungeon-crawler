// packages/rule-engine/src/overlay-exec.test.ts
//
// SPEC §3.7.4 — the six overlay primitives execute from the commit phase, writing
// registry entries / links with the correct provenance, gated by §3.7.4 exposure,
// and never throwing (INV-4). This is the unit surface for `applyPrimitives`; the
// server integration (apply + merge + replay) is exercised in the server tests.

import { describe, expect, it } from "vitest";
import type { PrimitiveExposure, SessionState } from "schema";
import { createSubstrateGraph, type GraphSpan } from "./graph";
import { CollectingLogger } from "./instrumentation";
import {
  applyPrimitives,
  OVERLAY_MALFORMED_PRIMITIVE_EVENT,
  type PrimitiveInvocation,
} from "./overlay-exec";

// A two-span substrate so `snapshot`/`query` have something to resolve.
const SPANS: GraphSpan[] = [
  {
    span: {
      id: "ref-a",
      semantic_tags: ["place:hall"],
      archetype: "room",
      prose: "a hall",
      source_span: { source: "book", char_ranges: "0-1" },
      local_coherence: 0.5,
    },
    embedding: [1, 0, 0],
  },
  {
    span: {
      id: "ref-b",
      semantic_tags: ["place:cell"],
      archetype: "room",
      prose: "a cell",
      source_span: { source: "book", char_ranges: "2-3" },
      local_coherence: 0.5,
    },
    embedding: [0, 1, 0],
  },
];

function baseState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "s1",
    session_seed: 7,
    position: { vector_ref: "ref-a" },
    turn_count: 0,
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
    ...overrides,
  };
}

function apply(
  invocations: PrimitiveInvocation[],
  opts: {
    exposure?: PrimitiveExposure[];
    state?: SessionState;
    logger?: CollectingLogger;
  } = {},
) {
  const graph = createSubstrateGraph(SPANS);
  return applyPrimitives(invocations, {
    state: opts.state ?? baseState(),
    graph,
    substrateVersion: "sv-1",
    exposure: opts.exposure ?? [],
    ...(opts.logger ? { logger: opts.logger } : {}),
  });
}

describe("applyPrimitives — the six §3.7.4 primitives (#109)", () => {
  it("pin writes a coordinate entry naming the given ref", () => {
    const { entries } = apply([
      { primitive: "pin", args: { tag: "place:home", vector_ref: "ref-b" } },
    ]);
    expect(entries).toEqual([
      {
        tag: "place:home",
        points_to: { kind: "coordinate", vector_ref: "ref-b" },
        provenance: "author_runtime",
      },
    ]);
  });

  it("bookmark writes a coordinate entry naming the current position", () => {
    const { entries } = apply(
      [{ primitive: "bookmark", args: { tag: "place:here" } }],
      { state: baseState({ position: { vector_ref: "ref-b" } }) },
    );
    expect(entries[0]).toEqual({
      tag: "place:here",
      points_to: { kind: "coordinate", vector_ref: "ref-b" },
      provenance: "author_runtime",
    });
  });

  it("snapshot writes a self-contained snapshot bound to the live version", () => {
    const { entries } = apply([
      { primitive: "snapshot", args: { tag: "snap:1" } },
    ]);
    const ref = entries[0]!.points_to;
    expect(ref.kind).toBe("snapshot");
    if (ref.kind !== "snapshot") throw new Error("unreachable");
    expect(ref.snapshot.substrate_version).toBe("sv-1");
    expect(ref.snapshot.resolved_payload.length).toBeGreaterThan(0);
    // INV-3: the payload is resolved Entities, never raw embeddings.
    expect(ref.snapshot.resolved_payload[0]).not.toHaveProperty("embedding");
  });

  it("link writes a LinkRecord into the parallel table, not a composite (D2)", () => {
    const { entries, links } = apply([
      {
        primitive: "link",
        args: { from: "place:a", to: "place:b", kind: "leads_to" },
      },
    ]);
    expect(entries).toHaveLength(0);
    expect(links).toEqual([
      {
        from: "place:a",
        to: "place:b",
        kind: "leads_to",
        provenance: "author_runtime",
      },
    ]);
  });

  it("compose writes a composite grouping member tags", () => {
    const { entries } = apply([
      {
        primitive: "compose",
        args: { tag: "set:rooms", members: "place:a,place:b" },
      },
    ]);
    expect(entries[0]!.points_to).toEqual({
      kind: "composite",
      member_tags: ["place:a", "place:b"],
    });
  });

  it("query is read-only — it writes no entry and no link", () => {
    const { entries, links } = apply([{ primitive: "query" }]);
    expect(entries).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it("executes in declaration order, appending each write", () => {
    const { entries } = apply([
      { primitive: "pin", args: { tag: "a", vector_ref: "ref-a" } },
      { primitive: "pin", args: { tag: "b", vector_ref: "ref-b" } },
    ]);
    expect(entries.map((e) => e.tag)).toEqual(["a", "b"]);
  });

  it("never throws on malformed args — it surfaces through the Logger (INV-4)", () => {
    const logger = new CollectingLogger();
    const { entries, links } = apply(
      [
        { primitive: "pin", args: { tag: "no-ref" } }, // missing vector_ref
        { primitive: "link", args: { from: "only-from" } }, // missing `to`
        { primitive: "compose", args: { members: "a,b" } }, // missing tag
      ],
      { logger },
    );
    expect(entries).toHaveLength(0);
    expect(links).toHaveLength(0);
    expect(
      logger.entries.filter(
        (e) => e.event === OVERLAY_MALFORMED_PRIMITIVE_EVENT,
      ),
    ).toHaveLength(3);
  });
});

describe("provenance promotion + logging via §3.7.4 exposure (#110)", () => {
  const playerPin: PrimitiveExposure = { primitive: "pin", exposure: "player" };

  it("a player-exposed primitive writes a player entry AND logs it", () => {
    const { entries, logEntries } = apply(
      [{ primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } }],
      { exposure: [playerPin] },
    );
    expect(entries[0]!.provenance).toBe("player");
    expect(logEntries).toEqual([
      {
        kind: "primitive",
        primitive: "pin",
        args: { tag: "p", vector_ref: "ref-a" },
      },
    ]);
  });

  it("an author_only primitive stays author_runtime and is NOT logged", () => {
    const { entries, logEntries } = apply(
      [{ primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } }],
      { exposure: [{ primitive: "pin", exposure: "author_only" }] },
    );
    expect(entries[0]!.provenance).toBe("author_runtime");
    expect(logEntries).toHaveLength(0);
  });

  it("a rule-invoked primitive with no exposure entry is author_runtime, unlogged", () => {
    const { entries, logEntries } = apply([
      { primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } },
    ]);
    expect(entries[0]!.provenance).toBe("author_runtime");
    expect(logEntries).toHaveLength(0);
  });

  it("a `when` gate closes the player path when it fails (turn_count too low)", () => {
    const exposure: PrimitiveExposure[] = [
      { primitive: "pin", exposure: "player", when: "dynamic.turn_count > 5" },
    ];
    const gatedOut = apply(
      [{ primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } }],
      { exposure, state: baseState({ turn_count: 1 }) },
    );
    expect(gatedOut.entries[0]!.provenance).toBe("author_runtime");
    expect(gatedOut.logEntries).toHaveLength(0);

    const opened = apply(
      [{ primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } }],
      { exposure, state: baseState({ turn_count: 9 }) },
    );
    expect(opened.entries[0]!.provenance).toBe("player");
    expect(opened.logEntries).toHaveLength(1);
  });

  it("a malformed `when` never throws — it fails closed and surfaces a warning", () => {
    const logger = new CollectingLogger();
    const { entries } = apply(
      [{ primitive: "pin", args: { tag: "p", vector_ref: "ref-a" } }],
      {
        exposure: [{ primitive: "pin", exposure: "player", when: "&& broken" }],
        logger,
      },
    );
    expect(entries[0]!.provenance).toBe("author_runtime");
    expect(logger.entries.some((e) => e.level === "warn")).toBe(true);
  });
});
