// packages/client-threejs/src/session-bootstrap.ts
//
// SPEC §5.1 / §5.2 / §6.6 — bring the Three.js adapter online against a live
// server. The §6.6 minimum viable scene loads a real session:
// `GET /session/new` → `GET /room/current` → render the returned room through the
// #148 systems (`renderRoom`), then `POST /interact` to drive a click transition
// (#150). The offline fixtures/rooms/*.json sweep is #151.
//
// Like `client-cli`, this adapter is "just an HTTP client against" §5.1 (§5,
// INV-3): it holds no engine state and reconstructs no graph — it calls the
// endpoints and renders the resolved JSON they return. Nothing here imports
// `rule-engine` or `corpus-builder`; the only entity data it ever touches is the
// resolved `ResolvedRoomResponse` (INV-3).

import * as THREE from "three";
import type {
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import { NetworkFailureError } from "schema";
import { renderRoom } from "./scene";
import { NOOP_INSTRUMENTATION, type Instrumentation } from "./instrumentation";

/** The handle `GET /session/new` returns (§5.1): an id plus the session's seed. */
export interface SessionHandle {
  session_id: string;
  /** The session seed — server-chosen, or the one pinned via `?seed=` (INV-2 replay). */
  seed: number;
}

/**
 * The slice of the §5.1 REST surface the adapter drives: create a session, fetch
 * the room it stands in, and resolve one interaction. `POST /interact` (#150) is
 * what turns a click into a room transition — the client echoes back an
 * `object_id` + `affordance` and re-renders the returned room (INV-3), deciding no
 * movement itself. An interface so the flow can run against a live server
 * ({@link httpRoomClient}) or a stub in a test.
 */
export interface RoomApiClient {
  /** `GET /session/new?seed=` — a fresh session; `seed` pins it for replay (INV-2). */
  newSession(seed?: number): Promise<SessionHandle>;
  /** `GET /room/current` — the resolved room the session stands in. */
  roomCurrent(sessionId: string): Promise<ResolvedRoomResponse>;
  /** `POST /interact` — resolve one action; returns the re-resolved room + result. */
  interact(request: InteractRequest): Promise<InteractResponse>;
}

/** An error carrying the §5.1 `{ error: { code, message } }` envelope + status. */
export class RoomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoomApiError";
  }
}

export interface HttpRoomClientOptions {
  /** Injectable fetch, for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Build a {@link RoomApiClient} that speaks the §5.1 GETs over HTTP to `baseUrl`
 * (e.g. `http://127.0.0.1:8080`). Non-2xx responses raise {@link RoomApiError}
 * from the §5.1 error envelope, so a missing session or a down server surfaces as
 * a typed failure rather than a mis-parsed body.
 */
export function httpRoomClient(
  baseUrl: string,
  options: HttpRoomClientOptions = {},
): RoomApiClient {
  const doFetch = options.fetch ?? fetch;
  const base = baseUrl.replace(/\/+$/, "");

  // §2.1 / §6.7 taxonomy — the transport failed before any HTTP response arrived
  // (server down, connection refused). Surface the shared `NetworkFailureError`
  // rather than letting a raw `fetch` `TypeError` escape uncaught; a received
  // non-2xx envelope is the OTHER path (`RoomApiError`), a request that completed.
  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, init);
    } catch (e) {
      throw new NetworkFailureError(
        `cannot reach server at ${base}: ${(e as Error).message}`,
        { cause: e },
      );
    }
  }

  async function parseError(res: Response): Promise<RoomApiError> {
    let code = "unknown";
    let message = `request failed with status ${res.status}`;
    try {
      const envelope = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (envelope.error?.code !== undefined) code = envelope.error.code;
      if (envelope.error?.message !== undefined)
        message = envelope.error.message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    return new RoomApiError(res.status, code, message);
  }

  async function getJson<T>(path: string): Promise<T> {
    const res = await send(path, { method: "GET" });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await send(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }

  return {
    newSession(seed) {
      const query =
        seed === undefined ? "" : `?seed=${encodeURIComponent(seed)}`;
      return getJson<SessionHandle>(`/session/new${query}`);
    },
    roomCurrent(sessionId) {
      return getJson<ResolvedRoomResponse>(
        `/room/current?session_id=${encodeURIComponent(sessionId)}`,
      );
    },
    interact(request) {
      return postJson<InteractResponse>("/interact", request);
    },
  };
}

/** Options for {@link bootstrapSession}. */
export interface BootstrapOptions {
  /** Pin the session seed for a reproducible session (INV-2); omitted ⇒ server-chosen. */
  seed?: number;
  /**
   * The §2.1 `Logger`/`Metrics` side channel to report bootstrap through. Omitted ⇒
   * the all-noop {@link NOOP_INSTRUMENTATION} (zero overhead). Diagnostic only: it
   * never influences which session/room is loaded or how it renders (INV-2), and is
   * never serialized back to the server (INV-3).
   */
  instrumentation?: Instrumentation;
}

/** The result of a session bootstrap: the session, its room, and the built scene. */
export interface SessionBootstrap {
  session: SessionHandle;
  room: ResolvedRoomResponse;
  scene: THREE.Scene;
}

/**
 * Load a live session and render its current room (§6.6 minimum viable scene):
 * `GET /session/new` → `GET /room/current` → `renderRoom`. The endpoints run in
 * that order — the room GET is keyed by the id the session GET returns — and the
 * resulting scene is exactly what `renderRoom` builds from the returned payload
 * (the room shell plus one positioned Object3D per resolved object).
 */
export async function bootstrapSession(
  client: RoomApiClient,
  options: BootstrapOptions = {},
): Promise<SessionBootstrap> {
  const { logger, metrics, debugLog } =
    options.instrumentation ?? NOOP_INSTRUMENTATION;

  logger.log("info", "session.bootstrap.start", {
    seed_pinned: options.seed !== undefined,
  });

  const session = await client.newSession(options.seed);
  const room = await client.roomCurrent(session.session_id);
  const scene = renderRoom(room);

  metrics.increment("session.bootstrap.count");
  metrics.observe("room.object_count", room.objects.length);
  metrics.observe("room.exit_count", room.exits.length);
  logger.log("info", "session.bootstrap.ready", {
    session_id: session.session_id,
  });
  // §4.6 gate-before-construct: with debug verbosity off `debugLog` is undefined,
  // so this fields object is never built. Operator-facing counts only (INV-3).
  debugLog?.log("debug", "session.room.rendered", {
    session_id: session.session_id,
    room_id: room.room.id,
    object_count: room.objects.length,
    exit_count: room.exits.length,
    resolution_status: room.resolution_status,
  });

  return { session, room, scene };
}
