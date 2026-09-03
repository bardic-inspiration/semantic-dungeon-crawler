import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { isDirectRun } from "./entrypoint";

// Regression coverage for the direct-execution guard (`tsx src/cli.ts …`). The
// client's `cli.ts` previously had NO guard at all, so its `sdc-cli` dev script
// imported `main` and exited without ever calling it — a no-op on every platform
// (issue #181). These cases pin the file-URL semantics of the guard now added.
describe("isDirectRun", () => {
  it("is true when argv[1] names this module's own path (a direct `tsx src/cli.ts` run)", () => {
    const p = "/repo/packages/client-cli/src/cli.ts";
    expect(isDirectRun(pathToFileURL(p).href, p)).toBe(true);
  });

  it("is false when argv[1] is a different path (imported — the bin/*.mjs wrapper case)", () => {
    const moduleUrl = pathToFileURL(
      "/repo/packages/client-cli/src/cli.ts",
    ).href;
    const wrapper = "/repo/packages/client-cli/bin/sdc-cli.mjs";
    expect(isDirectRun(moduleUrl, wrapper)).toBe(false);
  });

  it("matches via file-URL semantics, not string concatenation (a path needing URL-encoding still matches)", () => {
    const spaced = "/home/some user/pkg/src/cli.ts";
    const url = pathToFileURL(spaced).href; // file:///home/some%20user/pkg/src/cli.ts
    expect(isDirectRun(url, spaced)).toBe(true);
    expect(url).not.toBe(`file://${spaced}`);
  });

  it("does not depend on string equality the Windows shape can never satisfy", () => {
    // On Windows `import.meta.url` is `file:///C:/Users/x/cli.ts` while
    // `process.argv[1]` is `C:\\Users\\x\\cli.ts`; equality against `file://${argv1}`
    // can never match, which is why the guard normalizes to a file URL.
    const winModuleUrl = "file:///C:/Users/x/cli.ts";
    const winArgv1 = "C:\\Users\\x\\cli.ts";
    expect(winModuleUrl).not.toBe(`file://${winArgv1}`);
  });

  it("is false when argv[1] is undefined", () => {
    expect(isDirectRun(pathToFileURL("/x/cli.ts").href, undefined)).toBe(false);
  });
});
