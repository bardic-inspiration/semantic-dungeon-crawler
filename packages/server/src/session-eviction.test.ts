// SPEC §0.11.0 (C3) / §5.1 — issue #162. The alpha trust model's operational
// bounds on the in-memory session store: a bounded live-session count with
// oldest-idle eviction, and idle-TTL eviction. Both are hardening of the existing
// surface (§6.7), NOT an auth system. Exercised through the pure handler
// (`createServer().handle`) with an injected clock, so eviction is deterministic
// with no wall-clock or socket in the loop.
//
// INV-2: the injected clock is a side channel — it decides only whether a session
// still EXISTS (like a server restart, §6.5), never the resolved JSON of a session
// that does. An evicted session id resolves to the same well-formed
// `unknown_session` protocol-boundary error a never-created one does.

import { describe, it, expect } from "vitest";
import type { Ruleset } from "schema";
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

const RULESET: Ruleset = {
  spec_version: "0.1.0",
  layers: [],
  interpretation_lookup: {
    by_archetype: {
      container: {
        layout_hint: { scale: "large", density: 1, shape_bias: "" },
      },
    },
  },
};

function substrate(): GraphSpan[] {
  const room = makeSpan("origin", { archetype: "container" });
  return [
    { span: room, embedding: [1, 0] },
    { span: makeSpan("a", { archetype: "portal" }), embedding: [0.99, 0.14] },
  ];
}

function makeConfig(over: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ruleset: RULESET,
    substrate: { spans: substrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  };
}

function newSession(server: ReturnType<typeof createServer>): string {
  const res = server.handle({ method: "GET", url: "/session/new?seed=42" });
  return (JSON.parse(res.body) as { session_id: string }).session_id;
}

function roomStatus(
  server: ReturnType<typeof createServer>,
  id: string,
): { status: number; code?: string } {
  const res = server.handle({
    method: "GET",
    url: `/room/current?session_id=${id}`,
  });
  if (res.status === 200) return { status: 200 };
  const body = JSON.parse(res.body) as { error: { code: string } };
  return { status: res.status, code: body.error.code };
}

describe("session-count eviction (§0.11.0 C3)", () => {
  it("evicts the oldest-idle session when a new one would exceed maxSessions", () => {
    let now = 0;
    const server = createServer(
      makeConfig({ maxSessions: 2, clock: () => now }),
    );

    now = 1;
    const s1 = newSession(server);
    now = 2;
    const s2 = newSession(server);
    // At capacity (2). Creating a third evicts the oldest-idle (s1) first.
    now = 3;
    const s3 = newSession(server);

    // s1 is gone — a well-formed unknown_session error, not a crash.
    const r1 = roomStatus(server, s1);
    expect(r1.status).toBe(404);
    expect(r1.code).toBe("unknown_session");
    // s2 and s3 survive.
    expect(roomStatus(server, s2).status).toBe(200);
    expect(roomStatus(server, s3).status).toBe(200);
    expect(server.sessions.size).toBe(2);
  });

  it("recent activity protects a session from count eviction (oldest-IDLE, not oldest-created)", () => {
    let now = 0;
    const server = createServer(
      makeConfig({ maxSessions: 2, clock: () => now }),
    );

    now = 1;
    const s1 = newSession(server);
    now = 2;
    const s2 = newSession(server);
    // Touch s1 so it is now the most-recently-active — s2 is the oldest-idle.
    now = 3;
    expect(roomStatus(server, s1).status).toBe(200);
    now = 4;
    const s3 = newSession(server);

    // s2, untouched since creation, is evicted; s1 survives because it was used.
    expect(roomStatus(server, s2).status).toBe(404);
    expect(roomStatus(server, s1).status).toBe(200);
    expect(roomStatus(server, s3).status).toBe(200);
  });
});

describe("idle-TTL eviction (§0.11.0 C3)", () => {
  it("evicts a session idle past the TTL on next access, as an unknown_session error", () => {
    let now = 0;
    const server = createServer(
      makeConfig({ idleTtlMs: 1000, clock: () => now }),
    );

    now = 100;
    const id = newSession(server);
    expect(roomStatus(server, id).status).toBe(200);

    // Idle beyond the TTL relative to last activity — evicted lazily on access.
    now = 100 + 1000 + 1;
    const stale = roomStatus(server, id);
    expect(stale.status).toBe(404);
    expect(stale.code).toBe("unknown_session");
    expect(server.sessions.size).toBe(0);
  });

  it("access refreshes last-activity, so a continuously-used session never idles out", () => {
    let now = 0;
    const server = createServer(
      makeConfig({ idleTtlMs: 1000, clock: () => now }),
    );

    now = 100;
    const id = newSession(server);
    // Access every 900ms — never idle a full TTL between touches.
    for (let t = 1000; t <= 5000; t += 900) {
      now = t;
      expect(roomStatus(server, id).status).toBe(200);
    }
    expect(server.sessions.size).toBe(1);
  });

  it("a fresh session created after old ones expired is not itself evicted", () => {
    let now = 0;
    const server = createServer(
      makeConfig({ idleTtlMs: 1000, clock: () => now }),
    );

    now = 0;
    newSession(server);
    // Far in the future, a new session is created; the sweep reaps the stale one
    // but the just-created session stays live.
    now = 10_000;
    const fresh = newSession(server);
    expect(roomStatus(server, fresh).status).toBe(200);
    expect(server.sessions.size).toBe(1);
  });
});
