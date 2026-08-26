// SPEC §5.4 / §5.3 — the terminal client end-to-end against a LIVE server. It
// drives `GET /session/new` → room → `POST /interact` → new room over real HTTP,
// replays a scripted input-log byte-for-byte (INV-2), renders `fixtures/rooms`
// through the CLI entry point (§5.3), and surfaces a `DebugTrace` at `--verbosity
// debug` when the server has debug mode on.
//
// `server` is a TEST-ONLY dependency here (client-cli/devDependencies): the client
// itself speaks only §5.1 over HTTP (INV-3) — the import merely stands up the real
// product server so the adapter is exercised over the wire, not against a stub.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Ruleset } from "schema";
import { createHttpServer, type HttpServer, type ServerConfig } from "server";

// Substrate types derived from the server's OWN config type, so this test — like
// the client it exercises — names no `rule-engine`/`corpus-builder` symbol (INV-3).
type GraphSpan = ServerConfig["substrate"]["spans"][number];
type SubstrateSpanView = GraphSpan["span"];
import { httpApiClient } from "./api-client";
import { main } from "./cli";
import { InMemoryMetrics } from "./instrumentation";
import { linesFromText, runRepl } from "./repl";

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
  return [
    { span: makeSpan("origin", { archetype: "container" }), embedding: [1, 0] },
    { span: makeSpan("a", { archetype: "portal" }), embedding: [0.99, 0.14] },
    { span: makeSpan("b", { archetype: "portal" }), embedding: [0.95, 0.31] },
  ];
}

function startServer(
  over: Partial<Parameters<typeof createHttpServer>[0]> = {},
) {
  return createHttpServer({
    ruleset: RULESET,
    substrate: { spans: substrate(), start_ref: "vec:origin" },
    newSeed: () => 7,
    ...over,
  });
}

let running: HttpServer | undefined;
afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

async function baseUrlOf(server: HttpServer): Promise<string> {
  const { host, port } = await server.listen(0);
  return `http://${host}:${port}`;
}

describe("§5.4 live REPL end-to-end", () => {
  it("drives session → room → interact → new room over HTTP", async () => {
    running = startServer();
    const base = await baseUrlOf(running);
    const client = httpApiClient(base, { metrics: new InMemoryMetrics() });

    // Discover a legal action from the starting room, then script it.
    const start = await client.roomCurrent(
      (await client.newSession(42)).session_id,
    );
    expect(start.exits.length).toBeGreaterThan(0);
    const exit = start.exits[0]!;

    const out: string[] = [];
    await runRepl({
      client,
      input: linesFromText(
        `${exit.via_object_id} ${exit.affordance_required}\n`,
      ),
      out: (l) => out.push(l),
      metrics: new InMemoryMetrics(),
      level: "warn",
      seed: 42,
    });

    const text = out.join("\n");
    // Printed a starting room, resolved the action, and printed a destination room.
    expect(text).toContain("[container]");
    expect(text.match(/^room /gm)!.length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/> (moved|move blocked|local interaction)/);
  });

  it("replays a scripted input-log byte-for-byte across runs (INV-2)", async () => {
    running = startServer();
    const base = await baseUrlOf(running);
    const client = httpApiClient(base);

    // Build a fixed two-line script from the seeded starting room.
    const start = await client.roomCurrent(
      (await client.newSession(42)).session_id,
    );
    const exit = start.exits[0]!;
    const script = `# recorded session\n${exit.via_object_id} ${exit.affordance_required}\n${exit.via_object_id} ${exit.affordance_required}\n`;

    const runOnce = async (): Promise<string> => {
      const out: string[] = [];
      await runRepl({
        client: httpApiClient(base),
        input: linesFromText(script),
        out: (l) => out.push(l),
        metrics: new InMemoryMetrics(),
        level: "warn",
        seed: 42,
      });
      return out.join("\n");
    };

    const first = await runOnce();
    const second = await runOnce();
    // Same seed + same input-log ⇒ byte-identical rendered output.
    expect(second).toBe(first);
    // And it is a non-trivial session, not two empty transcripts.
    expect(first).toContain("room ");
  });

  it("renders a DebugTrace only when the server has debug mode on (§4.6)", async () => {
    running = startServer({ debug: true });
    const base = await baseUrlOf(running);
    const client = httpApiClient(base);
    const start = await client.roomCurrent(
      (await client.newSession(42)).session_id,
    );
    const exit = start.exits[0]!;

    const out: string[] = [];
    await runRepl({
      client: httpApiClient(base),
      input: linesFromText(
        `${exit.via_object_id} ${exit.affordance_required}\n`,
      ),
      out: (l) => out.push(l),
      metrics: new InMemoryMetrics(),
      level: "debug",
      seed: 42,
    });
    const text = out.join("\n");
    expect(text).toContain("trace:");
    expect(text).toContain("session summary:");
  });

  it("shows no trace at debug verbosity when the server has debug mode off", async () => {
    running = startServer(); // debug off
    const base = await baseUrlOf(running);
    const client = httpApiClient(base);
    const start = await client.roomCurrent(
      (await client.newSession(42)).session_id,
    );
    const exit = start.exits[0]!;

    const out: string[] = [];
    await runRepl({
      client: httpApiClient(base),
      input: linesFromText(
        `${exit.via_object_id} ${exit.affordance_required}\n`,
      ),
      out: (l) => out.push(l),
      metrics: new InMemoryMetrics(),
      level: "debug",
      seed: 42,
    });
    // The client got a 404 from /debug/trace and rendered nothing for it.
    expect(out.join("\n")).not.toContain("trace:");
  });
});

describe("§5.4 CLI entry point (main)", () => {
  const captured = () => {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      io: {
        stdout: (l: string) => out.push(l),
        stderr: (l: string) => err.push(l),
      },
    };
  };

  it("--render prints a fixture room (§5.3), no server", async () => {
    const fixture = fileURLToPath(
      new URL("../../../fixtures/rooms/drift-crossroads.json", import.meta.url),
    );
    const cap = captured();
    const code = await main(["--render", fixture], cap.io, {});
    expect(code).toBe(0);
    expect(cap.out.join("\n")).toContain(
      "room resolved:drift-crossroads:0 [container]",
    );
  });

  it("--server + --script replays a file and exits 0, deterministically", async () => {
    running = startServer();
    const base = await baseUrlOf(running);
    const client = httpApiClient(base);
    const start = await client.roomCurrent(
      (await client.newSession(42)).session_id,
    );
    const exit = start.exits[0]!;

    const dir = mkdtempSync(join(tmpdir(), "sdc-cli-"));
    const scriptPath = join(dir, "session.log");
    writeFileSync(
      scriptPath,
      `${exit.via_object_id} ${exit.affordance_required}\n`,
    );

    const argv = [
      "--server",
      base,
      "--script",
      scriptPath,
      "--seed",
      "42",
      "--verbosity",
      "warn",
    ];
    const a = captured();
    expect(await main(argv, a.io, {})).toBe(0);
    const b = captured();
    expect(await main(argv, b.io, {})).toBe(0);
    // Byte-for-byte identical stdout across replays of the same script + seed.
    expect(b.out.join("\n")).toBe(a.out.join("\n"));
    expect(a.out.join("\n")).toContain("room ");
  });

  it("rejects an unknown --verbosity with exit code 2", async () => {
    const cap = captured();
    const code = await main(
      ["--render", "x", "--verbosity", "loud"],
      cap.io,
      {},
    );
    expect(code).toBe(2);
    expect(cap.err.join("\n")).toMatch(/unknown verbosity/);
  });

  it("SDC_LOG_LEVEL is honored when no --verbosity flag is given", async () => {
    const fixture = fileURLToPath(
      new URL(
        "../../../fixtures/rooms/empty-antechamber.json",
        import.meta.url,
      ),
    );
    const cap = captured();
    const code = await main(["--render", fixture], cap.io, {
      SDC_LOG_LEVEL: "error",
    });
    expect(code).toBe(0);
    // At error level only the transition header prints — no objects/exits body.
    expect(cap.out.join("\n")).not.toContain("status:");
  });
});
