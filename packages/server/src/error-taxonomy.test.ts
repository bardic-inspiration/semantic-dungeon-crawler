// SPEC §2.1 / §6.7 — the protocol-boundary error taxonomy at the SERVER edge.
// Each server-emitted member (`malformed_ruleset`, `unknown_session`,
// `malformed_request`) maps to a specific, documented HTTP status + the single
// §5.1 `{ error: { code, message } }` envelope, replacing the ad hoc `bad_request`
// throws these cases used before. INV-4 is held: a well-formed-but-incoherent
// ("bad") ruleset is never a `malformed_ruleset`. Every assertion runs against the
// pure handler (`createServer().handle`) — no socket in the loop.

import { describe, it, expect } from "vitest";
import type { Ruleset } from "schema";
import {
  MalformedRulesetError,
  MalformedRequestError,
  UnknownSessionError,
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

const RULESET: Ruleset = { spec_version: "0.1.0", layers: [] };

function substrate(): GraphSpan[] {
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
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

function errorOf(body: string): { code: string; message: string } {
  const parsed = JSON.parse(body) as {
    error: { code: string; message: string };
  };
  return parsed.error;
}

describe("server maps each taxonomy member to a documented status + envelope (§2.1 / §6.7)", () => {
  it("malformed inline ruleset → 400 malformed_ruleset (dev-mode POST /session/new)", () => {
    const server = createServer(makeConfig({ devMode: true }));
    const res = server.handle({
      method: "POST",
      url: "/session/new",
      body: JSON.stringify({ ruleset: { layers: "nope" } }),
    });
    expect(res.status).toBe(new MalformedRulesetError().httpStatus);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("malformed_ruleset");
    // INV-3 — envelope only, nothing beyond `error`.
    expect(Object.keys(JSON.parse(res.body))).toEqual(["error"]);
  });

  it("INV-4: a well-formed-but-incoherent ruleset is ACCEPTED, never malformed_ruleset", () => {
    const server = createServer(makeConfig({ devMode: true }));
    // Contradictory/nonsense layer content is legal — the shape is well-formed.
    const incoherent: Ruleset = {
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
    const res = server.handle({
      method: "POST",
      url: "/session/new",
      body: JSON.stringify({ ruleset: incoherent }),
    });
    expect(res.status).toBe(200);
  });

  it("malformed request body (unparseable JSON) → 400 malformed_request (POST /interact)", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "POST",
      url: "/interact",
      body: "{ not json",
    });
    expect(res.status).toBe(new MalformedRequestError().httpStatus);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("malformed_request");
  });

  it("wrong-shape interact body → 400 malformed_request", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({ session_id: "s", action: { object_id: "o" } }), // no affordance
    });
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("malformed_request");
  });

  it("unknown session on POST /interact → 404 unknown_session", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: "ghost",
        action: { object_id: "o", affordance: "enter" },
      }),
    });
    expect(res.status).toBe(new UnknownSessionError().httpStatus);
    expect(res.status).toBe(404);
    expect(errorOf(res.body).code).toBe("unknown_session");
  });

  it("unknown session on GET /room/current → 404 unknown_session", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "GET",
      url: "/room/current?session_id=ghost",
    });
    expect(res.status).toBe(404);
    expect(errorOf(res.body).code).toBe("unknown_session");
  });

  it("the envelope never leaks internals — a `message` string only (INV-3)", () => {
    const server = createServer(makeConfig());
    const res = server.handle({
      method: "GET",
      url: "/room/current?session_id=ghost",
    });
    const err = errorOf(res.body);
    expect(typeof err.message).toBe("string");
    expect(Object.keys(err).sort()).toEqual(["code", "message"]);
  });
});
