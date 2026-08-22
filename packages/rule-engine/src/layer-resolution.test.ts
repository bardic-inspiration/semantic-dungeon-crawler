import { describe, it, expect } from "vitest";
import type { Effect, Layer } from "schema";
import {
  resolutionOrder,
  resolveLayers,
  type LayerEffects,
} from "./layer-resolution";
import { CollectingLogger } from "./instrumentation";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function layer(
  id: string,
  mode: Layer["mode"],
  scope: Layer["scope"] = "global",
): Layer {
  return { id, scope, mode, rules: [] };
}

/** The ids of an ordered layer stack, top (evaluated first) to bottom. */
function ids(layers: readonly Layer[]): string[] {
  return layers.map((l) => l.id);
}

/** A `LayerEffects` entry — a layer plus the effects its fired rules produced. */
function fired(l: Layer, ...effects: Effect[]): LayerEffects {
  return { layer: l, effects };
}

// ── §4.3.1 — explicit priority ────────────────────────────────────────────────

describe("resolutionOrder — explicit priority (§4.3.1)", () => {
  it("sorts {priority:N} layers by N descending (higher evaluated first)", () => {
    const stack = [
      layer("low", { priority: 1 }),
      layer("high", { priority: 10 }),
      layer("mid", { priority: 5 }),
    ];
    expect(ids(resolutionOrder(stack))).toEqual(["high", "mid", "low"]);
  });

  it("breaks equal priorities by declaration order (engine choice, INV-2)", () => {
    const stack = [
      layer("a", { priority: 5 }),
      layer("b", { priority: 5 }),
      layer("c", { priority: 5 }),
    ];
    expect(ids(resolutionOrder(stack))).toEqual(["a", "b", "c"]);
  });
});

// ── §4.3.2 — override insertion & yield sinking ───────────────────────────────

describe("resolutionOrder — override / yield insertion (§4.3.2)", () => {
  it("inserts a locally-scoped override immediately above its enclosing global layer", () => {
    const stack = [
      layer("global-base", { priority: 0 }, "global"),
      layer("local-override", "override", "static.tags CONTAINS 'x'"),
    ];
    // The override beats its enclosing global parent → evaluated first.
    expect(ids(resolutionOrder(stack))).toEqual([
      "local-override",
      "global-base",
    ]);
  });

  it("sinks a yield layer to the bottom of the stack", () => {
    const stack = [layer("fallback", "yield"), layer("main", { priority: 3 })];
    expect(ids(resolutionOrder(stack))).toEqual(["main", "fallback"]);
  });

  it("keeps sibling overrides under one parent in declaration order", () => {
    const stack = [
      layer("base", { priority: 0 }, "global"),
      layer("ov-1", "override", "static.archetype == 'container'"),
      layer("ov-2", "override", "static.archetype == 'portal'"),
    ];
    // Both lift above `base`; earlier-declared sits higher (evaluated first).
    expect(ids(resolutionOrder(stack))).toEqual(["ov-1", "ov-2", "base"]);
  });

  it("orders a full priority + override + yield stack deterministically", () => {
    const stack = [
      layer("g", { priority: 2 }, "global"),
      layer("o", "override", "dynamic.turn_count > 3"),
      layer("hi", { priority: 9 }, "global"),
      layer("fall", "yield"),
    ];
    // priority spine: hi(9), g(2); `o`'s nearest preceding global is `g` → above g;
    // yield to the bottom.
    expect(ids(resolutionOrder(stack))).toEqual(["hi", "o", "g", "fall"]);
  });

  it("does not mutate the input array", () => {
    const stack = [layer("a", { priority: 1 }), layer("b", { priority: 2 })];
    const before = ids(stack);
    resolutionOrder(stack);
    expect(ids(stack)).toEqual(before);
  });
});

// ── §4.3.3 — first hard decision wins, override re-opens ───────────────────────

describe("resolveLayers — hard-decision walk (§4.3.3)", () => {
  const allow: Effect = { kind: "hard_allow" };
  const forbid: Effect = { kind: "hard_forbid" };

  it("takes the first hard decision and ignores lower non-override layers", () => {
    const top = layer("top", { priority: 2 });
    const low = layer("low", { priority: 1 });
    const res = resolveLayers([fired(top, forbid), fired(low, allow)]);
    expect(res.decision).toBe("hard_forbid");
    expect(res.decidedBy).toBe("top");
  });

  it("returns null (drift fallthrough) when no layer produces a hard decision", () => {
    const l = layer("soft-only", { priority: 1 });
    const res = resolveLayers([fired(l, { kind: "soft_reweight", factor: 2 })]);
    expect(res.decision).toBeNull();
    expect(res.decidedBy).toBeNull();
  });

  it("lets a lower override re-open a non-override decision", () => {
    const base = layer("base", { priority: 5 });
    const ov = layer("ov", "override");
    const res = resolveLayers([fired(base, allow), fired(ov, forbid)]);
    expect(res.decision).toBe("hard_forbid");
    expect(res.decidedBy).toBe("ov");
  });

  it("does not let a non-override layer re-open an override decision", () => {
    const ov = layer("ov", "override");
    const base = layer("base", { priority: 5 });
    const res = resolveLayers([fired(ov, allow), fired(base, forbid)]);
    expect(res.decision).toBe("hard_allow");
    expect(res.decidedBy).toBe("ov");
  });

  it("takes the first hard effect within a single layer (rule order)", () => {
    const l = layer("l", { priority: 1 });
    const res = resolveLayers([fired(l, forbid, allow)]);
    expect(res.decision).toBe("hard_forbid");
  });

  it("ignores commit-phase effects (write/emit/primitive/end) in the walk", () => {
    const l = layer("l", { priority: 1 });
    const res = resolveLayers([
      fired(
        l,
        { kind: "write", target: "dynamic.vars.x", value: "1" },
        { kind: "emit", text: "hi" },
        { kind: "end" },
      ),
    ]);
    expect(res.decision).toBeNull();
  });
});

// ── §4.3.3 / INV-4 — two conflicting overrides never throw ────────────────────

describe("resolveLayers — conflicting overrides (§4.3.3, INV-4)", () => {
  const allow: Effect = { kind: "hard_allow" };
  const forbid: Effect = { kind: "hard_forbid" };

  it("resolves by declaration order, logs a warning, and never throws", () => {
    const first = layer("ov-first", "override");
    const second = layer("ov-second", "override");
    const log = new CollectingLogger();

    let res!: ReturnType<typeof resolveLayers>;
    expect(() => {
      // `ov-first` is walked first (declaration order) → its decision stands.
      res = resolveLayers([fired(first, forbid), fired(second, allow)], log);
    }).not.toThrow();

    expect(res.decision).toBe("hard_forbid");
    expect(res.decidedBy).toBe("ov-first");
    expect(log.warnings().length).toBe(1);
  });

  it("does not warn when two overrides agree", () => {
    const a = layer("a", "override");
    const b = layer("b", "override");
    const log = new CollectingLogger();
    const res = resolveLayers([fired(a, forbid), fired(b, forbid)], log);
    expect(res.decision).toBe("hard_forbid");
    expect(log.warnings()).toEqual([]);
  });

  it("is silent (no warning) when a lower non-override is merely ignored", () => {
    const ov = layer("ov", "override");
    const base = layer("base", { priority: 1 });
    const log = new CollectingLogger();
    resolveLayers([fired(ov, forbid), fired(base, allow)], log);
    expect(log.warnings()).toEqual([]);
  });
});

// ── §4.3.4 — soft effects always stack ────────────────────────────────────────

describe("resolveLayers — soft stacking (§4.3.4)", () => {
  const forbid: Effect = { kind: "hard_forbid" };

  it("multiplies every soft_reweight factor from every layer", () => {
    const a = layer("a", { priority: 3 });
    const b = layer("b", { priority: 2 });
    const res = resolveLayers([
      fired(a, { kind: "soft_reweight", factor: 2 }),
      fired(b, { kind: "soft_reweight", factor: 1.5 }),
    ]);
    expect(res.softFactor).toBeCloseTo(3);
  });

  it("collects soft effects even from a layer whose hard decision is locked out", () => {
    // `top` hard-locks the decision; `low`'s soft factor must still stack.
    const top = layer("top", { priority: 2 });
    const low = layer("low", { priority: 1 });
    const res = resolveLayers([
      fired(top, forbid, { kind: "soft_reweight", factor: 4 }),
      fired(low, forbid, { kind: "soft_reweight", factor: 0.5 }),
    ]);
    expect(res.decision).toBe("hard_forbid");
    expect(res.softFactor).toBeCloseTo(2);
  });

  it("returns the identity factor 1 when no soft effects fired", () => {
    const l = layer("l", { priority: 1 });
    expect(resolveLayers([fired(l, forbid)]).softFactor).toBe(1);
    expect(resolveLayers([]).softFactor).toBe(1);
  });
});
