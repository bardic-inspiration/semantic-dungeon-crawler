// SPEC §0.9.0 (A12) / §6.5 — the Phase 2 ↔ Phase 4 seam, executed.
//
// The audit's central finding was that this seam had never run. `createServer`
// took hand-built `GraphSpan`s, there was no `--graph` and no loader, so the
// pipeline's actual output had never reached the engine. Every guarantee about
// the two halves agreeing rested on fixtures shaped by the same author as the
// code under test.
//
// This suite runs the real pipeline over the in-repo corpus, loads the emitted
// `graph.json` through the real loader, and serves it. It is the first test in
// the project where the substrate the engine queries was produced by
// `corpus-builder` rather than written by hand.

import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeAll } from "vitest";
import { isValidEntity, SPEC_VERSION, type Ruleset } from "schema";
import { loadSubstrate, parseSubstrateBundle } from "./graph-loader";
import { createServer } from "./server";

// The build runs through corpus-builder's REAL CLI, as a subprocess — NOT
// imported. §6.3.1 forbids this package from reaching the community-run corpus
// API "directly or transitively", and corpus-builder does reach it, so taking a
// dependency here would breach that boundary in order to test a seam whose whole
// point is that only the ARTIFACT crosses it. Shelling out keeps the boundary
// intact and exercises the documented command at the same time.
//
// (`boundary.test.ts` enforces §6.3.1 by grepping this package's source text, so
// it also catches prose that merely names the host — hence the circumlocution.)
const run = promisify(execFile);
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const CORPUS = join(REPO, "packages/corpus-builder/test-assets/corpus");
const BUILDER = join(REPO, "packages/corpus-builder/bin/corpus-builder.mjs");

let graphPath: string;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "sdc-seam-"));
  graphPath = join(dir, "graph.json");
  await run(
    process.execPath,
    [BUILDER, "build", "--input", CORPUS, "--output", graphPath],
    // This seam test exercises loading real pipeline output, not the embedding
    // space — build with the model-free `hashing` test-mode provider so it stays
    // offline (the pre-alpha default `minilm` fetches model weights).
    { env: { ...process.env, SDC_EMBEDDING_PROVIDER: "hashing" } },
  );
}, 120_000);

describe("corpus-builder output loads into the engine (§A12)", () => {
  it("loads every span the build emitted", async () => {
    const loaded = await loadSubstrate(graphPath);
    const onDisk = JSON.parse(await readFile(graphPath, "utf8"));

    expect(loaded.spans.length).toBe(onDisk.spans.length);
    expect(loaded.substrate_version).toBe(onDisk.substrate_version);
  });

  it("picks up the sibling tag-registry.yaml (§3.6.2)", async () => {
    const loaded = await loadSubstrate(graphPath);
    expect(loaded.tag_paths.size).toBeGreaterThan(0);
  });

  it("keeps embeddings out of the loaded span views (INV-3)", async () => {
    const loaded = await loadSubstrate(graphPath);
    for (const s of loaded.spans) {
      expect(Object.keys(s.span)).not.toContain("embedding");
    }
  });
});

describe("a server serves a room resolved from real pipeline output (§6.5)", () => {
  const RULESET: Ruleset = { spec_version: SPEC_VERSION, layers: [] };

  // §3.2 well-formedness, composed from the Phase 1 guard that exists on this
  // branch. PR #97 adds `isValidResolvedRoomResponse` to `packages/schema`;
  // when it lands this should call that instead of re-deriving the check.
  function isValidRoomResponse(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    if (!isValidEntity(r.room)) return false;
    if (!Array.isArray(r.objects) || !r.objects.every(isValidEntity))
      return false;
    if (!Array.isArray(r.exits)) return false;
    if (typeof r.resolution_status !== "string") return false;
    return true;
  }

  async function serve() {
    const substrate = await loadSubstrate(graphPath);
    const server = createServer({
      ruleset: RULESET,
      substrate: {
        spans: substrate.spans,
        start_ref: substrate.spans[0]!.span.id,
      },
      newSeed: () => 7,
    });
    const id = JSON.parse(
      server.handle({ method: "GET", url: "/session/new?seed=42" }).body,
    ).session_id as string;
    return { server, id };
  }

  it("returns a schema-valid ResolvedRoomResponse", async () => {
    const { server, id } = await serve();
    const res = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    });

    expect(res.status).toBe(200);
    // The §6.5 criterion, against the guard #89 added.
    expect(isValidRoomResponse(JSON.parse(res.body))).toBe(true);
  });

  it("carries real corpus prose through to the client (§3.1 A1)", async () => {
    const { server, id } = await serve();
    const room = JSON.parse(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    );

    // A1's whole point: corpus text reaches the player. If the seam were wrong,
    // this would be an empty string and every other assertion would still pass.
    expect(room.room.prose.length).toBeGreaterThan(0);
    expect(room.room.source_span.source).toMatch(/^file:/);
  });

  it("never leaks an embedding or a raw vector to the client (INV-3)", async () => {
    const { server, id } = await serve();
    const body = server.handle({
      method: "GET",
      url: `/room/current?session_id=${id}`,
    }).body;

    expect(body).not.toContain('embedding":[');
    expect(body).not.toContain('local_coherence":null');
  });

  it("drives a full interact turn against real spans", async () => {
    const { server, id } = await serve();
    const room = JSON.parse(
      server.handle({ method: "GET", url: `/room/current?session_id=${id}` })
        .body,
    );

    // A null ruleset over a real corpus: whatever the engine derived as exits is
    // what a player can do. If there are none, `resolution_status` says so and
    // that is a valid game state (§0.11.0 C2) — not a failed test.
    if (room.exits.length === 0) {
      expect(room.resolution_status).toBe("stuck");
      return;
    }
    const exit = room.exits[0];
    const res = server.handle({
      method: "POST",
      url: "/interact",
      body: JSON.stringify({
        session_id: id,
        action: {
          object_id: exit.via_object_id,
          affordance: exit.affordance_required,
        },
      }),
    });

    expect(res.status).toBe(200);
    const interact = JSON.parse(res.body);
    expect(interact.transition_occurred).toBe(true);
    expect(isValidRoomResponse(interact.new_room)).toBe(true);
  });
});

describe("a malformed bundle fails loud (§6.3), not as a later 500", () => {
  it("rejects a bundle with no spans", () => {
    expect(() =>
      parseSubstrateBundle(
        JSON.stringify({ substrate_version: "sv_x", spans: [] }),
      ),
    ).toThrow(/empty/);
  });

  it("rejects a duplicate span id — it would make a position ambiguous", () => {
    const span = {
      id: "dup",
      archetype: "prop",
      semantic_tags: [],
      source_span: { source: "s", char_ranges: "0-1" },
      embedding: [1, 0],
    };
    expect(() =>
      parseSubstrateBundle(
        JSON.stringify({ substrate_version: "sv_x", spans: [span, span] }),
      ),
    ).toThrow(/duplicate span id/);
  });

  it("rejects a non-finite embedding value", () => {
    expect(() =>
      parseSubstrateBundle(
        JSON.stringify({
          substrate_version: "sv_x",
          spans: [
            {
              id: "a",
              archetype: "prop",
              semantic_tags: [],
              source_span: { source: "s", char_ranges: "0-1" },
              embedding: [1, null],
            },
          ],
        }),
      ),
    ).toThrow(/non-finite/);
  });
});
