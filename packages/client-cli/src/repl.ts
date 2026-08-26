// packages/client-cli/src/repl.ts
//
// SPEC §5.4 — the REPL that drives a live server session: `GET /session/new` →
// print the room → read a line (`<object_id> <affordance>`) → `POST /interact` →
// print the new room, repeat. The SAME driver serves interactive input and a
// scripted input-log file (one action per line) for headless replay — a recorded
// session replays and diffs byte-for-byte because the server is seeded-deterministic
// (INV-2) and the rendered content lands on a `stdout` sink kept clear of the
// operational `stderr` logging.
//
// It speaks only §5.1 and renders only resolved JSON (INV-3): it never inspects the
// engine, and the one action shape it parses is exactly the `InputLogEntry`
// `interact` shape (§3.9) the determinism guarantee is defined against.

import type { InteractRequest } from "schema";
import type { ApiClient } from "./api-client";
import type { Logger, ReadableMetrics } from "./instrumentation";
import { NoopLogger } from "./instrumentation";
import {
  renderInteraction,
  renderMetricsSummary,
  renderRoom,
  renderTrace,
} from "./render";
import { showsDebug, type Verbosity } from "./verbosity";

export interface ReplOptions {
  /** The §5.1 surface to drive — a live HTTP client or a test stub. */
  client: ApiClient;
  /** Lines of input: interactive `readline` lines, or a script's lines. */
  input: AsyncIterable<string>;
  /** Sink for rendered room/interaction output — `stdout` in the real CLI. */
  out: (line: string) => void;
  /** §2.1 metrics sink read for the end-of-session summary; counts turns. */
  metrics: ReadableMetrics;
  /** Verbosity level (§5.4). */
  level: Verbosity;
  /** Operational logging (session lifecycle, bad input) — `stderr`; defaults to noop. */
  log?: Logger;
  /** Seed for `GET /session/new`, pinning the session for replay (INV-2). */
  seed?: number;
}

/** A parsed action line, or `null` for a blank/comment line to skip. */
export function parseActionLine(line: string): InteractRequestAction | null {
  const trimmed = line.trim();
  // Blank lines and `#` comments let a scripted input-log carry annotations.
  if (trimmed === "" || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/\s+/);
  const [object_id, affordance] = parts;
  if (object_id === undefined || affordance === undefined) return null;
  return { object_id, affordance };
}

type InteractRequestAction = InteractRequest["action"];

/**
 * Drive one REPL session to completion over `input` (§5.4). Prints the starting
 * room, then for each well-formed action line resolves it and prints the outcome
 * and the re-resolved room, stopping when the input ends or an author rule ends the
 * session (§0.9.0 A7). At `debug` it also prints each resolution's `DebugTrace`
 * (when server debug mode is on) and, on exit, the Metrics summary (§5.4). Always
 * tears the session down (idempotent, §5.1).
 */
export async function runRepl(opts: ReplOptions): Promise<void> {
  const { client, input, out, metrics, level } = opts;
  const log = opts.log ?? new NoopLogger();

  const { session_id, seed } = await client.newSession(opts.seed);
  log.log("info", "cli.session_started", { session_id, seed });

  const room = await client.roomCurrent(session_id);
  for (const line of renderRoom(room, level)) out(line);
  await emitTrace(client, session_id, level, out);

  try {
    for await (const raw of input) {
      const action = parseActionLine(raw);
      if (action === null) {
        if (raw.trim() !== "" && !raw.trim().startsWith("#")) {
          log.log("warn", "cli.bad_input", { line: raw });
        }
        continue;
      }
      const resp = await client.interact({ session_id, action });
      metrics.increment("cli.turns");
      for (const l of renderInteraction(resp, level)) out(l);
      for (const l of renderRoom(resp.new_room, level)) out(l);
      await emitTrace(client, session_id, level, out);
      if (resp.session_ended === true) {
        log.log("info", "cli.session_ended", { session_id });
        break;
      }
    }
  } finally {
    if (showsDebug(level)) {
      for (const l of renderMetricsSummary(metrics.snapshot())) out(l);
    }
    await client.deleteSession(session_id);
  }
}

// §5.4 debug verbosity — after each resolution, print the server's `DebugTrace`.
// A no-op below `debug`, and a no-op when the server has debug mode off (the client
// gets `null`, §4.6), so the extra `GET /debug/trace` only happens where it renders.
async function emitTrace(
  client: ApiClient,
  sessionId: string,
  level: Verbosity,
  out: (line: string) => void,
): Promise<void> {
  if (!showsDebug(level)) return;
  const trace = await client.debugTrace(sessionId);
  if (trace !== null) for (const l of renderTrace(trace)) out(l);
}

/** Async line source over an in-memory string — the scripted-replay input (§5.4). */
export async function* linesFromText(text: string): AsyncGenerator<string> {
  // Split on newlines; a trailing newline yields no spurious empty action (parse
  // skips blanks anyway). `\r\n` is normalized so a CRLF script replays identically.
  for (const line of text.split(/\r?\n/)) yield line;
}
