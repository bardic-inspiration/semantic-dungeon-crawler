// packages/client-cli/src/api-client.ts
//
// SPEC §5.1 / §5.4 — the terminal client's view of the REST API. `client-cli` is
// "just an HTTP client against" §5.1 (§5, INV-3): it holds NO engine state and
// reconstructs no graph — it calls endpoints and renders the resolved JSON they
// return. {@link ApiClient} is that surface as an interface so the REPL can be
// driven against a live server ({@link httpApiClient}) or a stub in a test, and
// {@link httpApiClient} is the real `fetch` implementation.
//
// Every request is timed and counted through the injected §2.1 `Metrics` sink
// (INV-2 side channel), which the §5.4 end-of-session summary reads back.

import type {
  DebugTrace,
  InteractRequest,
  InteractResponse,
  ResolvedRoomResponse,
} from "schema";
import type { Metrics } from "./instrumentation";

/** The §5.1 endpoints the terminal client drives, as returned wire types. */
export interface ApiClient {
  /** `GET /session/new?seed=` — a fresh session; `seed` pins it for replay (INV-2). */
  newSession(seed?: number): Promise<{ session_id: string; seed: number }>;
  /** `GET /room/current` — the resolved room the session stands in. */
  roomCurrent(sessionId: string): Promise<ResolvedRoomResponse>;
  /** `POST /interact` — resolve one action; returns the re-resolved room + result. */
  interact(req: InteractRequest): Promise<InteractResponse>;
  /**
   * `GET /debug/trace` — the last resolution's trace, or `null` when the server has
   * debug mode off (a `404`, §4.6). Rendered only at `debug` verbosity (§5.4).
   */
  debugTrace(sessionId: string): Promise<DebugTrace | null>;
  /** `DELETE /session/{id}` — tear down; idempotent (§5.1), so teardown never throws. */
  deleteSession(sessionId: string): Promise<void>;
}

/** An error carrying the §5.1 `{ error: { code, message } }` envelope + status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface HttpApiClientOptions {
  /** §2.1 metrics sink — one `cli.requests` increment and one latency gauge per call. */
  metrics?: Metrics;
  /** Injectable monotonic clock for latency; defaults to `performance.now()`. */
  clock?: () => number;
  /** Injectable fetch, for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Build an {@link ApiClient} that speaks §5.1 over HTTP to `baseUrl` (e.g.
 * `http://127.0.0.1:8080`). Records a request count and latency gauge per call so
 * the §5.4 summary can report them. Non-2xx responses raise {@link ApiError} from
 * the §5.1 error envelope; `GET /debug/trace` treats `404` as "debug off" and
 * returns `null` rather than throwing.
 */
export function httpApiClient(
  baseUrl: string,
  options: HttpApiClientOptions = {},
): ApiClient {
  const doFetch = options.fetch ?? fetch;
  const clock = options.clock ?? (() => performance.now());
  const metrics = options.metrics;
  const base = baseUrl.replace(/\/+$/, "");

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const started = clock();
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    try {
      return await doFetch(`${base}${path}`, init);
    } finally {
      metrics?.increment("cli.requests");
      metrics?.observe("cli.request.duration_ms", clock() - started);
    }
  }

  async function parseError(res: Response): Promise<ApiError> {
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
    return new ApiError(res.status, code, message);
  }

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }

  return {
    async newSession(seed) {
      const query =
        seed === undefined ? "" : `?seed=${encodeURIComponent(seed)}`;
      const res = await request("GET", `/session/new${query}`);
      return json<{ session_id: string; seed: number }>(res);
    },

    async roomCurrent(sessionId) {
      const res = await request(
        "GET",
        `/room/current?session_id=${encodeURIComponent(sessionId)}`,
      );
      return json<ResolvedRoomResponse>(res);
    },

    async interact(req) {
      const res = await request("POST", "/interact", req);
      return json<InteractResponse>(res);
    },

    async debugTrace(sessionId) {
      const res = await request(
        "GET",
        `/debug/trace?session_id=${encodeURIComponent(sessionId)}`,
      );
      // §4.6 — debug mode off is a `404`; that is "no trace to show", not a failure.
      if (res.status === 404) {
        await res.body?.cancel?.();
        return null;
      }
      return json<DebugTrace>(res);
    },

    async deleteSession(sessionId) {
      const res = await request(
        "DELETE",
        `/session/${encodeURIComponent(sessionId)}`,
      );
      // Deletion is idempotent (§5.1). Drain the (empty) body; never throw.
      await res.body?.cancel?.();
    },
  };
}
