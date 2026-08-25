// SPEC §6.4 Exit / §4.5 / §3.9 (INV-2) — the determinism criterion, executed as
// it is written.
//
// §6.4 Exit and §4.5 state determinism as an artifact-level property: the same
// `(graph.json, ruleset, session_seed, input_log)` in, byte-identical output
// across two INDEPENDENT runs. The engine-level suites
// (`rule-engine/src/determinism.test.ts`, `solver.test.ts`) demonstrate the
// mechanism — a seeded PRNG over a canonicalized query — but not the criterion:
// no `graph.json` is loaded, no ruleset bundle is read, and the input-log
// dimension the replay guarantee is DEFINED against (§3.9) is absent entirely.
//
// This suite closes that gap at the only layer where the whole tuple exists:
//   - `graph.json` is built by the real `corpus-builder` CLI and read off disk
//     through the real loader,
//   - the ruleset is a real `fixtures/rulesets/*.json` bundle, bound per session
//     through dev-mode `POST /session/new`,
//   - the input log is replayed by the §3.9 procedure verbatim — "create a
//     session with the same seed and re-POST the logged actions in order".
//
// "Independent" is taken literally: each run re-imports the server and the
// engine under a reset module registry, so no PRNG, cache, or module-level
// counter is shared between them.

import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { SPEC_VERSION, type InputLogEntry, type Ruleset } from "schema";

const run = promisify(execFile);
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const CORPUS = join(REPO, "packages/corpus-builder/test-assets/corpus");
const BUILDER = join(REPO, "packages/corpus-builder/bin/corpus-builder.mjs");
const RULESETS = join(REPO, "fixtures/rulesets");

/** The seed the recorded session and every replay of it are created with. */
const SEED = 20260822;
/** How many inputs the recorded session drives before it is replayed. */
const TURNS = 8;

/** The server-wide ruleset; every session here binds its own bundle over it. */
const SERVER_RULESET: Ruleset = { spec_version: SPEC_VERSION, layers: [] };

let graphPath: string;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "sdc-replay-"));
  graphPath = join(dir, "graph.json");
  await run(process.execPath, [
    BUILDER,
    "build",
    "--input",
    CORPUS,
    "--output",
    graphPath,
  ]);
}, 120_000);

async function bundle(name: string): Promise<Ruleset> {
  return JSON.parse(
    await readFile(join(RULESETS, `${name}.json`), "utf8"),
  ) as Ruleset;
}

// ── One independent run ───────────────────────────────────────────────────────

interface HttpResult {
  status: number;
  body: string;
}

/**
 * A running server plus the module namespaces it was built from. The namespaces
 * are returned so a test can assert two runs really are separate module state
 * rather than two calls into one live instance.
 */
interface Run {
  handle: (req: { method: string; url: string; body?: string }) => HttpResult;
  modules: { server: unknown; engine: unknown };
}

/**
 * Boot a server from `graph.json` under a RESET module registry.
 *
 * `vi.resetModules()` + dynamic `import()` is what makes two runs independent in
 * the sense §4.5 means: the server module, its session store, and the whole
 * `rule-engine` graph behind it are re-instantiated, so a shared PRNG or a
 * memoized result cannot carry an answer from one run into the next. Two calls
 * into a single imported `createServer` would not show that.
 */
async function boot(): Promise<Run> {
  vi.resetModules();
  const serverMod = await import("./server");
  const loaderMod = await import("./graph-loader");
  const engineMod = await import("rule-engine");

  const substrate = await loaderMod.loadSubstrate(graphPath);
  const server = serverMod.createServer({
    ruleset: SERVER_RULESET,
    substrate: {
      spans: substrate.spans,
      start_ref: substrate.spans[0]!.span.id,
    },
    devMode: true,
  });
  return {
    handle: (req) => server.handle(req),
    modules: { server: serverMod, engine: engineMod },
  };
}

function openSession(r: Run, ruleset: Ruleset): string {
  const res = r.handle({
    method: "POST",
    url: "/session/new",
    body: JSON.stringify({ seed: SEED, ruleset }),
  });
  expect(res.status).toBe(200);
  return (JSON.parse(res.body) as { session_id: string }).session_id;
}

function currentRoom(r: Run, id: string): HttpResult {
  return r.handle({ method: "GET", url: `/room/current?session_id=${id}` });
}

function currentLog(r: Run, id: string): InputLogEntry[] {
  const res = r.handle({ method: "GET", url: `/session/${id}/log` });
  expect(res.status).toBe(200);
  return JSON.parse(res.body) as InputLogEntry[];
}

interface RoomView {
  exits: { via_object_id: string; affordance_required: string }[];
  objects: { id: string; affordances: string[] }[];
}

type Action = { object_id: string; affordance: string };

/** This turn's input: an exit if the room has one, else a local affordance. */
function chooseAction(room: RoomView): Action | null {
  const exit = room.exits[0];
  if (exit !== undefined) {
    return {
      object_id: exit.via_object_id,
      affordance: exit.affordance_required,
    };
  }
  const local = room.objects.find((o) => o.affordances.length > 0);
  return local === undefined
    ? null
    : { object_id: local.id, affordance: local.affordances[0]! };
}

function interact(r: Run, id: string, action: Action): HttpResult {
  return r.handle({
    method: "POST",
    url: "/interact",
    body: JSON.stringify({ session_id: id, action }),
  });
}

/**
 * Re-POST one logged input (§3.9), or `null` when the entry is a re-derived
 * record that replay must not re-POST.
 *
 * A player-invoked primitive (#110) is logged as a `{ kind: "primitive" }` entry
 * AND rides in on the `{ kind: "interact" }` for the same turn (A10 — the only
 * client input is `{object_id, affordance}`; there is no primitive endpoint). The
 * interact re-fires the author rule that re-executes the primitive, so the
 * registry/link writes re-derive deterministically; the primitive entry is a
 * record for diffing, not a separately replayable action. Re-POSTing the interact
 * and SKIPPING the primitive entry is the §3.9 procedure for a log with both.
 */
function replayEntry(
  r: Run,
  id: string,
  entry: InputLogEntry,
): HttpResult | null {
  if (entry.kind === "interact") return interact(r, id, entry.action);
  return null;
}

interface Session {
  /** Raw response bodies, in order — the bytes the comparison is made over. */
  frames: string[];
  log: InputLogEntry[];
}

/**
 * Drive a fresh session for up to `TURNS` inputs, choosing each action from the
 * room the server just returned, and return the raw response bodies plus the
 * input log the server accumulated (§3.9).
 */
async function record(ruleset: Ruleset): Promise<Session> {
  const r = await boot();
  const id = openSession(r, ruleset);

  const opening = currentRoom(r, id);
  expect(opening.status).toBe(200);
  const frames: string[] = [opening.body];
  let room = JSON.parse(opening.body) as RoomView;

  for (let turn = 0; turn < TURNS; turn++) {
    const action = chooseAction(room);
    if (action === null) break; // §0.11.0 C2 — a stuck room is a valid state
    const res = interact(r, id, action);
    expect(res.status).toBe(200);
    frames.push(res.body);
    room = (JSON.parse(res.body) as { new_room: RoomView }).new_room;
  }

  return { frames, log: currentLog(r, id) };
}

/**
 * The §3.9 replay procedure, verbatim: a new session on the same seed and
 * ruleset, then the logged inputs re-POSTed in order.
 */
async function replay(
  ruleset: Ruleset,
  log: readonly InputLogEntry[],
): Promise<Session> {
  const r = await boot();
  const id = openSession(r, ruleset);

  const opening = currentRoom(r, id);
  expect(opening.status).toBe(200);
  const frames: string[] = [opening.body];
  for (const entry of log) {
    const res = replayEntry(r, id, entry);
    if (res === null) continue; // a re-derived `primitive` record — not re-POSTed
    expect(res.status).toBe(200);
    frames.push(res.body);
  }
  return { frames, log: currentLog(r, id) };
}

// ── §6.4 Exit — the criterion, per fixture bundle ─────────────────────────────

describe.each([
  ["null", "minimal — pure relativistic drift"],
  [
    "single-global-layer",
    "typical — one global layer, reweight + commit write",
  ],
  ["multi-layer-conflict", "maxed — §4.3 messy resolution, INV-4 under replay"],
])("replay of fixtures/rulesets/%s.json (%s)", (name) => {
  it("reproduces byte-identical output across two independent runs", async () => {
    const ruleset = await bundle(name);
    const recorded = await record(ruleset);

    // The comparison would be vacuous over an empty log — the replay would be a
    // bare session-open. §3.9's guarantee is about the INPUTS, so require some.
    expect(recorded.log.length).toBeGreaterThan(0);
    expect(recorded.frames.length).toBe(recorded.log.length + 1);

    const first = await replay(ruleset, recorded.log);
    const second = await replay(ruleset, recorded.log);

    // Byte-identical over the raw bodies, not a re-serialization of parsed
    // objects — which would hide key-order drift.
    expect(first.frames.join(" ")).toBe(second.frames.join(" "));
    // And the replay reproduces the RECORDED session, not merely itself.
    expect(first.frames.join(" ")).toBe(recorded.frames.join(" "));
  }, 60_000);

  it("re-accumulates the identical input log (§3.9)", async () => {
    const ruleset = await bundle(name);
    const recorded = await record(ruleset);
    const replayed = await replay(ruleset, recorded.log);
    expect(replayed.log).toEqual(recorded.log);
  }, 60_000);
});

// ── "two independent runs" means separate module state ────────────────────────

describe("run independence (§4.5)", () => {
  it("boots each run from a freshly imported server and engine", async () => {
    const a = await boot();
    const b = await boot();
    expect(a.modules.server).not.toBe(b.modules.server);
    expect(a.modules.engine).not.toBe(b.modules.engine);
  }, 60_000);
});
