// SPEC §3.5 / §5.1 — the running protocol version.
//
// §5.1's base contract has every response carry `X-Spec-Version` "echoing the
// running `spec_version` (SPEC header, §3.5)", and §5.1 leans on it: it is what
// "lets a third-party adapter trust a MINOR version bump to be safe to ignore".
//
// A conformance audit found the server sourcing that header from
// `config.ruleset.spec_version` — author-supplied content — because the package
// had no constant of its own. §3.4 says a ruleset's `spec_version` "must match
// packages/schema version", but INV-4 forbids rejecting one that doesn't, so
// validation is not the fix: the engine needs its own value.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SPEC_VERSION } from "./version";

// The single `spec-version` header in SPEC.md (`` `spec-version: X.Y.Z` ``),
// resolved from this test file so the suite is independent of the process cwd
// (repo-root ← packages/schema/src). This is the authoritative document version
// the constant must echo.
function specHeaderVersion(): string {
  const specPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../SPEC.md",
  );
  const match = readFileSync(specPath, "utf8").match(
    /spec-version:\s*(\d+\.\d+\.\d+)/,
  );
  if (match === null)
    throw new Error("no spec-version header found in SPEC.md");
  return match[1]!;
}

describe("SPEC_VERSION (§3.5)", () => {
  it("is a semver string", () => {
    expect(SPEC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is in step with SPEC.md's spec-version header (INV-5)", () => {
    // Read the header from SPEC.md rather than pinning to a literal: bumping
    // SPEC.md's header without bumping this constant (or vice versa) is exactly
    // the silent mutation INV-5 exists to prevent, and a hardcoded expectation
    // here could not catch a SPEC.md-only bump — which is how 0.13.0/0.13.1
    // drifted past a constant left at 0.12.0.
    expect(SPEC_VERSION).toBe(specHeaderVersion());
  });
});
