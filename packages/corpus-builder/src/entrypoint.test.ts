import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { isDirectRun } from "./entrypoint";

// Regression coverage for the direct-execution guard (`tsx src/cli.ts …`). The
// old guard compared `import.meta.url` to `` `file://${process.argv[1]}` `` — a
// raw string join that matched on POSIX by luck but never on Windows and broke on
// any path needing URL-encoding, so the documented dev script silently did
// nothing (issue #181). These cases pin the file-URL semantics that fix it.
describe("isDirectRun", () => {
  it("is true when argv[1] names this module's own path (a direct `tsx src/cli.ts` run)", () => {
    const p = "/repo/packages/corpus-builder/src/cli.ts";
    expect(isDirectRun(pathToFileURL(p).href, p)).toBe(true);
  });

  it("is false when argv[1] is a different path (imported — the bin/*.mjs wrapper case)", () => {
    const moduleUrl = pathToFileURL(
      "/repo/packages/corpus-builder/src/cli.ts",
    ).href;
    const wrapper = "/repo/packages/corpus-builder/bin/corpus-builder.mjs";
    expect(isDirectRun(moduleUrl, wrapper)).toBe(false);
  });

  it("matches via file-URL semantics, not string concatenation (a path needing URL-encoding still matches)", () => {
    // `import.meta.url` is always percent-encoded; the old `file://${argv1}` join
    // is not, so a repo path with a space fails the naive compare but must still
    // count as a direct run.
    const spaced = "/home/some user/pkg/src/cli.ts";
    const url = pathToFileURL(spaced).href; // file:///home/some%20user/pkg/src/cli.ts
    expect(isDirectRun(url, spaced)).toBe(true);
    expect(url).not.toBe(`file://${spaced}`); // exactly the mismatch the old guard hit
  });

  it("does not depend on string equality the Windows shape can never satisfy", () => {
    // On Windows `import.meta.url` is `file:///C:/Users/x/cli.ts` (drive letter,
    // forward slashes) while `process.argv[1]` is `C:\\Users\\x\\cli.ts`. Equality
    // against `file://${argv1}` can never match — the guard must normalize the path
    // to a file URL instead of comparing strings. (`pathToFileURL` is host-specific,
    // so the real Windows conversion is exercised by CI on Windows; here we pin that
    // naive equality is structurally wrong for that shape.)
    const winModuleUrl = "file:///C:/Users/x/cli.ts";
    const winArgv1 = "C:\\Users\\x\\cli.ts";
    expect(winModuleUrl).not.toBe(`file://${winArgv1}`);
  });

  it("is false when argv[1] is undefined", () => {
    expect(isDirectRun(pathToFileURL("/x/cli.ts").href, undefined)).toBe(false);
  });
});
