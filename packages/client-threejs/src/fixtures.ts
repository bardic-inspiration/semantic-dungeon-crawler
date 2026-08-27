// packages/client-threejs/src/fixtures.ts
//
// SPEC §5.3 / §6.6 — the graphical adapter's conformance-render path. §5.3's
// conformance model is that any adapter renders a fixed `ResolvedRoomResponse`
// with the server bypassed; §6.6's exit criterion is that the Three.js client
// does this for every `fixtures/rooms/*.json`, repeating the sweep `client-cli`
// ran in Phase 4 (§6.5) over the same fixture set. Loading is a plain JSON parse
// of resolved output (INV-3 — no engine internals cross this boundary); the shape
// guard checks well-formedness only, never content (INV-4 — no coherence policing).

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import type { ResolvedRoomResponse } from "schema";
import { renderRoom } from "./scene";

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

/**
 * Read a fixture room file from disk and render it into a fresh `THREE.Scene`
 * with the server bypassed (§5.3 conformance / §6.6). A thin compose of
 * {@link parseRoomFixture} and {@link renderRoom} — the same offline path a hand
 * render takes, driven straight from a fixture file.
 */
export async function renderRoomFixtureFile(
  path: string,
): Promise<THREE.Scene> {
  const room = parseRoomFixture(await readFile(path, "utf8"), path);
  return renderRoom(room);
}
