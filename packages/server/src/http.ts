// packages/server/src/http.ts
//
// SPEC §5.1 / §0.11.0 (C3) — the `node:http` transport that puts the pure server
// core (`createServer`) on a socket. This is the only file that touches the Node
// HTTP runtime; the request-handling contract lives in `server.ts` and is tested
// without a socket. §0.11.0 (C3): the server binds to localhost by default — the
// alpha is single-user, local, trusted-operator, with no auth boundary.

import { createServer as createNodeHttpServer } from "node:http";
import type {
  IncomingMessage,
  ServerResponse as NodeServerResponse,
} from "node:http";
import { SPEC_VERSION } from "schema";
import { createServer, type Server, type ServerConfig } from "./server";
import { errorResponse } from "./http-contract";

/**
 * §0.11.0 (C3) default request body-size cap: 1 MiB. The §5.1 request bodies
 * (`InteractRequest`, a dev-mode session request) are a few hundred bytes, so this
 * is generous headroom while still bounding what a single request can buffer —
 * hardening of the existing surface for the trusted-operator alpha, not an auth
 * boundary. Tune with `maxBodyBytes` / `SDC_MAX_BODY_BYTES`.
 */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/** A listening HTTP server wrapping the pure core, plus lifecycle controls. */
export interface HttpServer {
  /** The underlying pure server core — its `handle`/`sessions` remain accessible. */
  readonly core: Server;
  /**
   * Start listening. `port` `0` binds an ephemeral port (tests). `host` defaults
   * to `127.0.0.1` (C3 — localhost only). Resolves with the bound host/port.
   */
  listen(port: number, host?: string): Promise<{ host: string; port: number }>;
  /** Stop listening and release the socket. */
  close(): Promise<void>;
}

const DEFAULT_HOST = "127.0.0.1";

/**
 * Wrap a {@link createServer} core in a `node:http` listener. Each request is
 * routed through the core's pure `handle`, and its `{ status, headers, body }` is
 * written back verbatim — the transport adds no contract of its own.
 */
export function createHttpServer(config: ServerConfig): HttpServer {
  const core = createServer(config);
  // §0.11.0 (C3) — the transport-layer body-size cap. Enforced HERE, not in the
  // pure core, because it is a streaming concern: an oversized body is rejected as
  // it arrives, before it is fully buffered or handed to `core.handle` for parsing.
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const node = createNodeHttpServer(
    (req: IncomingMessage, res: NodeServerResponse) => {
      // Buffer the request body before dispatching: `POST /interact` carries its
      // `InteractRequest` here (§5.1). GET routes send none, so `body` is `""` and
      // the pure core ignores it. The core stays transport-agnostic — it receives a
      // string, never the stream.
      const chunks: Buffer[] = [];
      let size = 0;
      let rejected = false;
      req.on("data", (chunk: Buffer) => {
        if (rejected) return;
        size += chunk.length;
        if (size > maxBodyBytes) {
          // §0.11.0 (C3) — over the cap: answer the single §5.1 error envelope
          // (413, a code + message only — no engine internals, INV-3) and stop
          // buffering. We drop further chunks rather than growing `chunks`, so
          // memory stays bounded, and destroy the request once the response has
          // flushed so a client mid-upload still receives the 413.
          rejected = true;
          const result = errorResponse(
            SPEC_VERSION,
            413,
            "payload_too_large",
            "request body exceeds the configured size cap",
          );
          res.writeHead(result.status, result.headers);
          res.end(result.body, () => req.destroy());
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (rejected) return;
        const body = Buffer.concat(chunks).toString("utf8");
        const result = core.handle({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          body,
        });
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      });
    },
  );

  return {
    core,
    listen(port: number, host: string = DEFAULT_HOST) {
      return new Promise((resolve, reject) => {
        node.once("error", reject);
        node.listen(port, host, () => {
          node.removeListener("error", reject);
          const address = node.address();
          if (address === null || typeof address === "string") {
            reject(new Error("failed to bind an inet socket"));
            return;
          }
          resolve({ host: address.address, port: address.port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        node.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
