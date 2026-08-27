// SPEC §2.1 / §6.7 — the protocol-boundary error taxonomy. One shared set of
// typed errors every protocol edge raises, so the server and both clients react
// to the same shapes (INV-4: protocol/format failures only, never authored
// content).

import { describe, expect, it } from "vitest";
import {
  MalformedRequestError,
  MalformedRulesetError,
  NetworkFailureError,
  ProtocolBoundaryError,
  UnknownSessionError,
  isProtocolBoundaryError,
  isWellFormedRuleset,
  type ProtocolErrorCode,
} from "./index";

describe("protocol-boundary error taxonomy (§2.1 / §6.7)", () => {
  it("each server-emitted member carries its stable code and HTTP status", () => {
    const malformedRuleset = new MalformedRulesetError();
    expect(malformedRuleset.code).toBe("malformed_ruleset");
    expect(malformedRuleset.httpStatus).toBe(400);

    const unknownSession = new UnknownSessionError();
    expect(unknownSession.code).toBe("unknown_session");
    expect(unknownSession.httpStatus).toBe(404);

    const malformedRequest = new MalformedRequestError();
    expect(malformedRequest.code).toBe("malformed_request");
    expect(malformedRequest.httpStatus).toBe(400);
  });

  it("the client-only network failure has no HTTP status (no response arrived)", () => {
    const err = new NetworkFailureError("cannot reach server");
    expect(err.code).toBe("network_failure");
    expect(err.httpStatus).toBeUndefined();
  });

  it("preserves the originating transport error on `cause`", () => {
    const cause = new TypeError("fetch failed");
    const err = new NetworkFailureError("cannot reach server", { cause });
    expect(err.cause).toBe(cause);
  });

  it("every member is a ProtocolBoundaryError, an Error, and names itself", () => {
    const members = [
      new MalformedRulesetError(),
      new UnknownSessionError(),
      new MalformedRequestError(),
      new NetworkFailureError("x"),
    ];
    for (const m of members) {
      expect(m).toBeInstanceOf(ProtocolBoundaryError);
      expect(m).toBeInstanceOf(Error);
      expect(isProtocolBoundaryError(m)).toBe(true);
      expect(m.name).not.toBe("ProtocolBoundaryError"); // each overrides its name
    }
  });

  it("the code discriminates a caught member back to its type", () => {
    const caught: ProtocolBoundaryError = new UnknownSessionError("gone");
    const code: ProtocolErrorCode = caught.code;
    expect(code).toBe("unknown_session");
    expect(caught.message).toBe("gone");
  });

  it("isProtocolBoundaryError rejects a plain Error", () => {
    expect(isProtocolBoundaryError(new Error("nope"))).toBe(false);
    expect(isProtocolBoundaryError("network_failure")).toBe(false);
  });
});

describe("isWellFormedRuleset (§3.4 shape guard, INV-4)", () => {
  it("accepts a minimal well-formed ruleset", () => {
    expect(isWellFormedRuleset({ spec_version: "0.1.0", layers: [] })).toBe(
      true,
    );
  });

  it("accepts a well-formed-but-incoherent ruleset (INV-4 — shape, not content)", () => {
    // Contradictory/nonsense layer content is legal; only the SHAPE is checked.
    expect(
      isWellFormedRuleset({
        spec_version: "0.1.0",
        layers: [{ nonsense: true }],
      }),
    ).toBe(true);
  });

  it("rejects the wrong shape", () => {
    expect(isWellFormedRuleset({ layers: "nope" })).toBe(false);
    expect(isWellFormedRuleset({ spec_version: "0.1.0" })).toBe(false);
    expect(isWellFormedRuleset(null)).toBe(false);
    expect(isWellFormedRuleset("ruleset")).toBe(false);
  });
});
