// SPEC §5.2 / §6.6, AGENTS.md §2 (INV-3): the Three.js reference client sees only
// resolved JSON — it must never import `rule-engine` or `corpus-builder`. These
// tests run the project's real ESLint config to prove the import-boundary rule
// (1) fires on a deliberately-violating file and (2) stays silent on the actual
// client-threejs source, so INV-3 is mechanically enforced across both reference
// adapters rather than a convention.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import type { Linter } from "eslint";
import { describe, expect, it } from "vitest";

const RULE_ID = "@typescript-eslint/no-restricted-imports";

// The config's `files` globs are resolved against the repo root, so ESLint must
// run with that as its cwd for the client-threejs block to match.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function eslint(): ESLint {
  return new ESLint({ cwd: repoRoot });
}

function boundaryMessages(results: ESLint.LintResult[]): Linter.LintMessage[] {
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId === RULE_ID);
}

describe("INV-3 import-boundary lint rule (client-threejs)", () => {
  it("flags a client-threejs file that imports the engine packages", async () => {
    const fixture = fileURLToPath(
      new URL("../test/fixtures/inv3-violation.ts", import.meta.url),
    );
    const code = readFileSync(fixture, "utf8");

    // Lint the fixture's code as if it lived in `client-threejs/src`, so the
    // client-threejs boundary block applies.
    const probePath = fileURLToPath(
      new URL("./__inv3_probe__.ts", import.meta.url),
    );
    const results = await eslint().lintText(code, { filePath: probePath });
    const messages = boundaryMessages(results);

    // One violation per forbidden import in the fixture (rule-engine +
    // corpus-builder).
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.every((m) => m.severity === 2)).toBe(true);
  });

  it("passes the real client-threejs source (imports only schema)", async () => {
    const results = await eslint().lintFiles([
      "packages/client-threejs/src/**/*.ts",
    ]);
    expect(boundaryMessages(results)).toEqual([]);
  });
});
