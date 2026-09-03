// packages/client-cli/src/entrypoint.ts
//
// Cross-platform "was this module run directly?" check for the CLI's
// direct-execution guard (`tsx src/cli.ts …`). Kept tiny and dependency-free so
// each package carries its own copy — the same per-package duplication
// `instrumentation.ts` / `config.ts` use (INV-3 forbids `client-cli` from
// importing the engine packages).

import { pathToFileURL } from "node:url";

/**
 * True when `moduleUrl` (an `import.meta.url`) names the same file as `argv1`
 * (a `process.argv[1]`) — i.e. the module is the process entry point, not an
 * import.
 *
 * Normalizes `argv1` to a file URL via `pathToFileURL` rather than a fragile
 * `` import.meta.url === `file://${argv1}` `` string compare: on Windows
 * `import.meta.url` is `file:///C:/…/cli.ts` while `argv1` is `C:\…\cli.ts`, so
 * the strings never met (issue #181), and the naive form also failed to
 * URL-encode paths with spaces or other special characters. Returns false when
 * `argv1` is absent — never a direct run.
 */
export function isDirectRun(
  moduleUrl: string,
  argv1: string | undefined,
): boolean {
  if (argv1 === undefined || argv1.length === 0) return false;
  return moduleUrl === pathToFileURL(argv1).href;
}
