// packages/client-cli/src/fixtures.ts
//
// SPEC §5.3 / §5.4 — the conformance-render path. Because the terminal client has
// no rendering dependency, it can load a fixed `ResolvedRoomResponse` JSON file and
// print it "with nothing else running" (§5.4) — this is the first conformance check
// in the build order (§6.5), exercised over every `fixtures/rooms/*.json` ahead of
// the graphical client. Loading is a plain `JSON.parse` of resolved output (INV-3);
// the shape guard is well-formedness only (INV-4 — no coherence policing).

import { readFile } from "node:fs/promises";
import type { ResolvedRoomResponse } from "schema";
import { renderRoom } from "./render";
import type { Verbosity } from "./verbosity";

/**
 * Structural guard for a §3.2 `ResolvedRoomResponse` fixture: a `room` object, an
 * `objects` and `exits` array, and a `resolution_status` string. Well-formedness
 * only — a "stuck" room with empty arrays is valid (§0.11.0 C2), and nothing here
 * judges the CONTENT of a room (INV-4).
 */
export function isResolvedRoomResponse(
  value: unknown,
): value is ResolvedRoomResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.room === "object" &&
    v.room !== null &&
    Array.isArray(v.objects) &&
    Array.isArray(v.exits) &&
    typeof v.resolution_status === "string"
  );
}

/** Parse fixture text as a `ResolvedRoomResponse`, throwing a clear error if malformed. */
export function parseRoomFixture(
  text: string,
  label: string,
): ResolvedRoomResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: not valid JSON — ${(e as Error).message}`);
  }
  if (!isResolvedRoomResponse(parsed)) {
    throw new Error(`${label}: not a ResolvedRoomResponse (§3.2)`);
  }
  return parsed;
}

/** Read a fixture room file from disk and render it at `level` (§5.3 conformance). */
export async function renderRoomFixtureFile(
  path: string,
  level: Verbosity,
): Promise<string[]> {
  const text = await readFile(path, "utf8");
  const room = parseRoomFixture(text, path);
  return renderRoom(room, level);
}
