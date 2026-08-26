// packages/client-cli/src/render.ts
//
// SPEC §5.4 / §5.3 — the terminal rendering of a resolved room, an interaction
// result, a DebugTrace, and the end-of-session Metrics summary. These are PURE
// functions over the §5.1 wire types (`schema` only, INV-3): given a
// `ResolvedRoomResponse` and a verbosity level they produce lines, with no I/O and
// no network, so the §5.3 conformance pass can render every `fixtures/rooms/*.json`
// by calling {@link renderRoom} directly — the first conformance check in the build
// order (§6.5), ahead of the graphical client.
//
// Only resolved output is ever rendered (INV-3): the room, its sampled objects,
// derived exits, status, and — at `debug` — the server-provided `DebugTrace`. The
// client never sees embeddings, the index, or rule definitions.

import type {
  DebugTrace,
  Entity,
  InteractResponse,
  ResolvedExit,
  ResolvedRoomResponse,
} from "schema";
import type { MetricsSnapshot } from "./instrumentation";
import type { Verbosity } from "./verbosity";
import { showsDebug, showsFullEntities, showsRoomBody } from "./verbosity";

/**
 * Order a room's objects for display: salience DESC (most prominent first, §5.4
 * "salience-ordered"), with a stable `id` tie-break so the ordering is fully
 * deterministic regardless of the order the server happened to emit them in
 * (INV-2 — a replayed session renders byte-for-byte identically).
 */
export function salienceOrdered(objects: readonly Entity[]): Entity[] {
  return [...objects].sort(
    (a, b) =>
      b.salience - a.salience || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function jsonBlock(label: string, value: unknown): string[] {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return [`  ${label}:`, ...lines.map((l) => `    ${l}`)];
}

function objectLine(o: Entity): string {
  return `    ${o.id} [${o.archetype}] salience=${o.salience} affordances=[${o.affordances.join(", ")}]`;
}

function exitLine(e: ResolvedExit): string {
  return `    ${e.affordance_required} -> ${e.target_entity_id} via ${e.via_object_id} (weight=${e.weight})`;
}

/**
 * Render a resolved room at a verbosity level (§5.4). The header (`room <id>
 * [<archetype>]`) always prints — at `error` that transition line is all there is.
 * `warn` adds the status, the salience-ordered objects with their affordances, and
 * the exits; `info` adds full entity JSON; `debug` adds the `DebugTrace` when the
 * response carries one (server debug mode on).
 */
export function renderRoom(
  resolved: ResolvedRoomResponse,
  level: Verbosity,
): string[] {
  const { room, objects, exits, resolution_status } = resolved;
  const lines: string[] = [`room ${room.id} [${room.archetype}]`];

  if (showsRoomBody(level)) {
    lines.push(`  status: ${resolution_status}`);

    const ordered = salienceOrdered(objects);
    if (ordered.length === 0) {
      lines.push("  objects: (none)");
    } else {
      lines.push("  objects:");
      for (const o of ordered) lines.push(objectLine(o));
    }

    if (exits.length === 0) {
      lines.push("  exits: (none)");
    } else {
      lines.push("  exits:");
      for (const e of exits) lines.push(exitLine(e));
    }
  }

  if (showsFullEntities(level)) {
    lines.push(...jsonBlock("room (full)", room));
    for (const o of salienceOrdered(objects)) {
      lines.push(...jsonBlock(`object ${o.id} (full)`, o));
    }
  }

  if (showsDebug(level) && resolved.debug !== undefined) {
    lines.push(...renderTrace(resolved.debug));
  }

  return lines;
}

/**
 * Render the non-room part of an interaction outcome (§3.3): the author-emitted
 * text, any revealed entities, and a one-line movement verdict — whether the
 * interaction moved the player (`transition_occurred`), was a blocked move
 * (`movement_blocked`, §0.12.0), or a local interaction that changed nothing about
 * position. The caller renders `new_room` separately with {@link renderRoom}.
 */
export function renderInteraction(
  resp: InteractResponse,
  level: Verbosity,
): string[] {
  const lines: string[] = [];
  const result = resp.interaction_result;
  if (result.text !== undefined) lines.push(`> ${result.text}`);
  if (result.revealed !== undefined && result.revealed.length > 0) {
    lines.push(`> revealed: ${result.revealed.join(", ")}`);
  }
  // §5.4 error level is "transitions only": the movement verdict is the transition
  // signal, so it prints at every level. `info`+ also surfaces the auto-derived
  // effects summary (§3.3 A6) — author keys only, never internals (INV-3).
  if (resp.transition_occurred) {
    lines.push("> moved");
  } else if (resp.movement_blocked === true) {
    lines.push("> move blocked");
  } else {
    lines.push("> (local interaction — no movement)");
  }
  if (resp.session_ended === true) lines.push("> session ended");
  if (
    showsFullEntities(level) &&
    result.effects_summary !== undefined &&
    result.effects_summary.length > 0
  ) {
    for (const s of result.effects_summary) lines.push(`> effect: ${s}`);
  }
  return lines;
}

/** Render a raw {@link DebugTrace} as pretty JSON (§4.6; debug verbosity only). */
export function renderTrace(trace: DebugTrace): string[] {
  return jsonBlock("trace", trace);
}

/**
 * The §5.4 end-of-session summary read from the §2.1 `Metrics` snapshot: turns,
 * requests, and latency. Printed only at `debug`. Missing counters read as 0 so a
 * session that never moved still prints a coherent summary.
 */
export function renderMetricsSummary(snapshot: MetricsSnapshot): string[] {
  const turns = snapshot.counters["cli.turns"] ?? 0;
  const requests = snapshot.counters["cli.requests"] ?? 0;
  const lastLatency = snapshot.gauges["cli.request.duration_ms"];
  const latency =
    lastLatency === undefined ? "n/a" : `${lastLatency.toFixed(1)}ms`;
  return [
    "session summary:",
    `  turns: ${turns}`,
    `  requests: ${requests}`,
    `  last request latency: ${latency}`,
  ];
}
