// SPEC §5.1 / §5.4 / §2.1 / §6.7 — the terminal client's HTTP surface and its
// place in the protocol-boundary error taxonomy. A transport failure (server
// unreachable) surfaces as the shared `NetworkFailureError` rather than a raw
// `fetch` `TypeError` escaping uncaught; a RECEIVED non-2xx envelope is the other
// path (`ApiError`) — a request that completed. INV-3: neither leaks internals.

import { describe, expect, it, vi } from "vitest";
import { NetworkFailureError } from "schema";
import { ApiError, httpApiClient } from "./api-client";
import { InMemoryMetrics } from "./instrumentation";

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("httpApiClient error taxonomy (§2.1 / §6.7)", () => {
  it("a transport failure surfaces as a typed NetworkFailureError, not a raw fetch throw", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));
    const client = httpApiClient("http://127.0.0.1:9", { fetch: fetchStub });

    const err = await client.newSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkFailureError);
    expect((err as NetworkFailureError).code).toBe("network_failure");
    // The unreachable base URL is named, and the transport error is preserved.
    expect((err as NetworkFailureError).message).toContain(
      "http://127.0.0.1:9",
    );
    expect((err as NetworkFailureError).cause).toBeInstanceOf(TypeError);
  });

  it("still counts a failed request through the metrics side channel (§2.1)", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));
    const metrics = new InMemoryMetrics();
    const client = httpApiClient("http://127.0.0.1:9", {
      fetch: fetchStub,
      metrics,
    });
    await client.roomCurrent("s").catch(() => {});
    expect(metrics.snapshot().counters["cli.requests"]).toBe(1);
  });

  it("a received non-2xx envelope is an ApiError carrying the server's taxonomy code", async () => {
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(404, {
        error: { code: "unknown_session", message: "unknown session" },
      }),
    );
    const client = httpApiClient("http://127.0.0.1:8080", { fetch: fetchStub });
    const err = await client.roomCurrent("ghost").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).code).toBe("unknown_session");
  });
});
