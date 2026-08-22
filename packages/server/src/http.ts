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
import { createServer, type Server, type ServerConfig } from "./server";

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

  const node = createNodeHttpServer(
    (req: IncomingMessage, res: NodeServerResponse) => {
      const result = core.handle({
        method: req.method ?? "GET",
        url: req.url ?? "/",
      });
      res.writeHead(result.status, result.headers);
      res.end(result.body);
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
