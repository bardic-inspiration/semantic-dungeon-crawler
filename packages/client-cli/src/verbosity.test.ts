// SPEC §5.4 — `--verbosity` / `SDC_LOG_LEVEL` resolution and the detail ladder.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_VERBOSITY,
  detailFor,
  isVerbosity,
  resolveVerbosity,
  showsDebug,
  showsFullEntities,
  showsRoomBody,
} from "./verbosity";

describe("resolveVerbosity", () => {
  it("defaults to warn", () => {
    expect(resolveVerbosity()).toBe("warn");
    expect(DEFAULT_VERBOSITY).toBe("warn");
  });

  it("takes the flag over the env var over the default", () => {
    expect(resolveVerbosity("debug", "info")).toBe("debug");
    expect(resolveVerbosity(undefined, "info")).toBe("info");
    expect(resolveVerbosity(undefined, undefined)).toBe("warn");
  });

  it("rejects an unknown level rather than silently defaulting", () => {
    expect(() => resolveVerbosity("loud")).toThrow(/unknown verbosity/);
  });
});

describe("detail ladder", () => {
  it("increases error < warn < info < debug", () => {
    expect(detailFor("error")).toBeLessThan(detailFor("warn"));
    expect(detailFor("warn")).toBeLessThan(detailFor("info"));
    expect(detailFor("info")).toBeLessThan(detailFor("debug"));
  });

  it("gates sections monotonically", () => {
    expect(showsRoomBody("error")).toBe(false);
    expect(showsRoomBody("warn")).toBe(true);
    expect(showsFullEntities("warn")).toBe(false);
    expect(showsFullEntities("info")).toBe(true);
    expect(showsDebug("info")).toBe(false);
    expect(showsDebug("debug")).toBe(true);
  });

  it("isVerbosity guards the level union", () => {
    expect(isVerbosity("warn")).toBe(true);
    expect(isVerbosity("nope")).toBe(false);
  });
});
