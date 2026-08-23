// SPEC §0.9.0 (A3) — the overlay address-token tree. Covers: opaque,
// replay-deterministic minting; the parent→children tree `Entity.contains`
// resolves from; the token→coordinate bridge that derives `visited`; and
// backtracking by truncating to an ancestor and re-resolving fresh.

import { describe, expect, it } from "vitest";
import type { SessionState } from "schema";
import {
  ADDRESS_TOKEN_PREFIX,
  ancestorTokens,
  backtrackTo,
  childTokens,
  establishRoot,
  mintAddressToken,
  recordVisit,
  visitedCoordinateRefs,
} from "./address-token";

function makeState(over: Partial<SessionState> = {}): SessionState {
  return {
    session_id: "s1",
    session_seed: 42,
    position: { vector_ref: "vec:origin" },
    turn_count: 0,
    trace_centroid: null,
    momentum: null,
    path_coherence: 0,
    visited_set: [],
    address_tokens: [],
    current_token: null,
    vars: {},
    registry: [],
    links: [],
    ended: false,
    input_log: [],
    ...over,
  };
}

describe("mintAddressToken (§0.9.0 A3)", () => {
  const input = {
    sessionSeed: 42,
    parent: null,
    turnCount: 1,
    position: { vector_ref: "vec:origin" },
  };

  it("is deterministic — same replay inputs mint the same token byte-for-byte (INV-2)", () => {
    expect(mintAddressToken(input)).toBe(mintAddressToken(input));
  });

  it("is opaque: not the substrate vector_ref, and no coordinate recoverable (INV-3)", () => {
    const token = mintAddressToken(input);
    expect(token.startsWith(ADDRESS_TOKEN_PREFIX)).toBe(true);
    expect(token).not.toBe("vec:origin");
    expect(token).not.toContain("vec:origin");
    expect(token).not.toContain("origin");
  });

  it("changes when any replay component changes", () => {
    const base = mintAddressToken(input);
    expect(mintAddressToken({ ...input, sessionSeed: 43 })).not.toBe(base);
    expect(mintAddressToken({ ...input, parent: "ovl:x" })).not.toBe(base);
    expect(mintAddressToken({ ...input, turnCount: 2 })).not.toBe(base);
    expect(
      mintAddressToken({ ...input, position: { vector_ref: "vec:other" } }),
    ).not.toBe(base);
  });

  it("does not collide when the same coordinate is revisited on a later turn (a sibling, not a repeat)", () => {
    const first = mintAddressToken({ ...input, turnCount: 1 });
    const revisit = mintAddressToken({ ...input, turnCount: 5 });
    expect(revisit).not.toBe(first);
  });
});

describe("establishRoot (§0.9.0 A3)", () => {
  it("mints a parentless root, sets it current, and does NOT mark it visited", () => {
    const state = makeState();
    const root = establishRoot(state);

    expect(state.current_token).toBe(root);
    expect(state.address_tokens).toEqual([
      { token: root, parent: null, position: { vector_ref: "vec:origin" } },
    ]);
    // The start is where the player begins, not a place they moved to.
    expect(state.visited_set).toEqual([]);
  });
});

describe("recordVisit (§0.9.0 A3)", () => {
  it("mints a child under current_token, appends to the tree, and holds the TOKEN (not a vector_ref) in visited_set", () => {
    const state = makeState();
    const root = establishRoot(state);

    // Server policy: advance the turn and set position, then record the visit.
    state.turn_count = 1;
    state.position = { vector_ref: "vec:next" };
    const child = recordVisit(state);

    expect(child.startsWith(ADDRESS_TOKEN_PREFIX)).toBe(true);
    expect(state.current_token).toBe(child);
    // visited_set holds the address-token, never the destination's coordinate.
    expect(state.visited_set).toEqual([child]);
    expect(state.visited_set).not.toContain("vec:next");
    // The tree records the parent→child edge.
    const node = state.address_tokens.find((n) => n.token === child);
    expect(node?.parent).toBe(root);
    expect(node?.position).toEqual({ vector_ref: "vec:next" });
  });

  it("builds an append-only parent→children tree over a multi-move path (contains resolves from it)", () => {
    const state = makeState();
    const root = establishRoot(state);
    const path: string[] = [];
    for (let i = 1; i <= 3; i++) {
      state.turn_count = i;
      state.position = { vector_ref: `vec:${i}` };
      path.push(recordVisit(state));
    }
    // A linear path: each token is the sole child of the previous.
    expect(childTokens(state.address_tokens, root)).toEqual([path[0]]);
    expect(childTokens(state.address_tokens, path[0]!)).toEqual([path[1]]);
    expect(childTokens(state.address_tokens, path[1]!)).toEqual([path[2]]);
    expect(childTokens(state.address_tokens, path[2]!)).toEqual([]);
    // visited_set accumulated the three destination tokens, in order.
    expect(state.visited_set).toEqual(path);
  });
});

describe("visitedCoordinateRefs (§3.1 visited derivation)", () => {
  it("maps visited tokens back to the coordinates they name", () => {
    const state = makeState();
    establishRoot(state);
    state.turn_count = 1;
    state.position = { vector_ref: "vec:a" };
    recordVisit(state);
    state.turn_count = 2;
    state.position = { vector_ref: "vec:b" };
    recordVisit(state);

    const coords = visitedCoordinateRefs(
      state.visited_set,
      state.address_tokens,
    );
    expect(coords).toEqual(new Set(["vec:a", "vec:b"]));
    // The root's coordinate is NOT visited (it was never moved to).
    expect(coords.has("vec:origin")).toBe(false);
  });
});

describe("backtrackTo (§0.9.0 A3 — truncate to an ancestor, re-resolve fresh)", () => {
  it("repoints current_token to the ancestor and moves position back to its coordinate", () => {
    const state = makeState();
    establishRoot(state);
    state.turn_count = 1;
    state.position = { vector_ref: "vec:1" };
    const t1 = recordVisit(state);
    state.turn_count = 2;
    state.position = { vector_ref: "vec:2" };
    recordVisit(state); // t2, now current

    expect(backtrackTo(state, t1)).toBe(true);
    expect(state.current_token).toBe(t1);
    // Position is back at the ancestor's coordinate — the next resolution
    // re-approximates that place fresh (seeded, §4.5).
    expect(state.position).toEqual({ vector_ref: "vec:1" });
  });

  it("a move after backtracking mints a SIBLING under the ancestor; old branches stay addressable (monotonic)", () => {
    const state = makeState();
    establishRoot(state);
    state.turn_count = 1;
    state.position = { vector_ref: "vec:1" };
    const t1 = recordVisit(state);
    state.turn_count = 2;
    state.position = { vector_ref: "vec:2" };
    const t2 = recordVisit(state);

    backtrackTo(state, t1);
    // Re-resolve fresh and move on: a new place under t1.
    state.turn_count = 3;
    state.position = { vector_ref: "vec:2b" };
    const t2b = recordVisit(state);

    // t1 now has two children — the old branch and the new sibling.
    expect(childTokens(state.address_tokens, t1)).toEqual([t2, t2b]);
    // The old branch was NOT removed (the tree is monotonic, A3).
    expect(state.address_tokens.some((n) => n.token === t2)).toBe(true);
    expect(ancestorTokens(state.address_tokens, t2b)).toContain(t1);
  });

  it("returns false for a token that is not the current token or an ancestor (INV-4, no throw)", () => {
    const state = makeState();
    establishRoot(state);
    state.turn_count = 1;
    state.position = { vector_ref: "vec:1" };
    recordVisit(state);

    expect(backtrackTo(state, "ovl:nope")).toBe(false);
    // Unchanged.
    expect(state.position).toEqual({ vector_ref: "vec:1" });
  });

  it("replays byte-identically from the same inputs — backtrack included (INV-2)", () => {
    // Two independent runs of the same scripted path (with a backtrack) produce
    // identical trees and visited_sets, token strings and all.
    const run = (): SessionState => {
      const state = makeState({ session_seed: 99 });
      establishRoot(state);
      state.turn_count = 1;
      state.position = { vector_ref: "vec:1" };
      const t1 = recordVisit(state);
      state.turn_count = 2;
      state.position = { vector_ref: "vec:2" };
      recordVisit(state);
      backtrackTo(state, t1);
      state.turn_count = 3;
      state.position = { vector_ref: "vec:2b" };
      recordVisit(state);
      return state;
    };
    expect(run().address_tokens).toEqual(run().address_tokens);
    expect(run().visited_set).toEqual(run().visited_set);
  });
});
