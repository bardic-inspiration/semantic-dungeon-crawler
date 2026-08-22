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

import { describe, it, expect } from "vitest";
import { SPEC_VERSION } from "./version";

describe("SPEC_VERSION (§3.5)", () => {
  it("is a semver string", () => {
    expect(SPEC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches the spec-version this package implements", () => {
    // Bumping SPEC.md's header without bumping this constant (or vice versa) is
    // exactly the silent mutation INV-5 exists to prevent.
    expect(SPEC_VERSION).toBe("0.12.0");
  });
});
