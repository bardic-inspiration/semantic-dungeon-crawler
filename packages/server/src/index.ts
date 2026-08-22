// packages/server/src/index.ts
//
// SPEC §5.1 / §6.5 (Phase 4) — the HTTP contract over the rule engine. The scaffold
// (issue #85) exposes the read-side session/room surface: `GET /session/new` and
// `GET /room/current`, over in-memory sessions. `createServer` is the pure,
// transport-agnostic core; `createHttpServer` puts it on a localhost `node:http`
// socket (§0.11.0 C3). All resolution routes through `rule-engine` — the server
// holds no rule logic (INV-1) and emits only resolved JSON (INV-3).

export { createServer } from "./server";
export type {
  Server,
  ServerConfig,
  SubstrateConfig,
  HttpRequest,
} from "./server";
export { createHttpServer } from "./http";
export type { HttpServer } from "./http";
export { SessionStore } from "./sessions";
export type { SessionStoreOptions } from "./sessions";
export type { ServerResponse } from "./http-contract";
