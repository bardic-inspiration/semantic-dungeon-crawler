// packages/rule-engine/src/registry.test.ts
//
// SPEC §3.8 (A8) — the Address Registry is LAYERED: a shared per-world base
// (build / author-design-time) with a per-session overlay merged over it, the
// session winning. §3.7.3 — snapshot staleness is a pure version comparison.

import { describe, expect, it } from "vitest";
import type { AddressRegistryEntry, LinkRecord, Snapshot } from "schema";
import { effectiveLinks, effectiveRegistry, isSnapshotStale } from "./registry";

const coord = (
  tag: string,
  vector_ref: string,
  provenance: AddressRegistryEntry["provenance"],
): AddressRegistryEntry => ({
  tag,
  points_to: { kind: "coordinate", vector_ref },
  provenance,
});

describe("effectiveRegistry — layered read, session over base (§3.8 A8)", () => {
  it("returns base entries when the session overlay is empty", () => {
    const base = [coord("a", "ref-a", "build")];
    expect(effectiveRegistry(base, [])).toEqual(base);
  });

  it("merges the overlay over the base, one entry per tag", () => {
    const base = [coord("a", "ref-a", "build")];
    const overlay = [coord("b", "ref-b", "player")];
    expect(effectiveRegistry(base, overlay).map((e) => e.tag)).toEqual([
      "a",
      "b",
    ]);
  });

  it("the session overlay wins on a tag collision (player over base)", () => {
    const base = [coord("a", "ref-base", "build")];
    const overlay = [coord("a", "ref-session", "player")];
    const merged = effectiveRegistry(base, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(coord("a", "ref-session", "player"));
  });

  it("within a layer, the last write to a tag wins (declaration order)", () => {
    const overlay = [
      coord("a", "ref-first", "player"),
      coord("a", "ref-last", "player"),
    ];
    expect(effectiveRegistry([], overlay)).toEqual([
      coord("a", "ref-last", "player"),
    ]);
  });
});

describe("effectiveLinks — parallel table, dedup by identity", () => {
  const link = (
    from: string,
    to: string,
    kind: string,
    provenance: LinkRecord["provenance"],
  ): LinkRecord => ({ from, to, kind, provenance });

  it("dedups identical (from,to,kind) edges, session winning", () => {
    const base = [link("a", "b", "leads_to", "build")];
    const overlay = [link("a", "b", "leads_to", "player")];
    const merged = effectiveLinks(base, overlay);
    expect(merged).toEqual([link("a", "b", "leads_to", "player")]);
  });

  it("keeps edges that differ in kind as distinct", () => {
    const overlay = [
      link("a", "b", "leads_to", "player"),
      link("a", "b", "blocks", "player"),
    ];
    expect(effectiveLinks([], overlay)).toHaveLength(2);
  });
});

describe("isSnapshotStale — pure version comparison (§3.7.3, D3)", () => {
  const snap = (version: string): Snapshot => ({
    substrate_version: version,
    resolved_payload: [],
  });

  it("is not stale when the versions match", () => {
    expect(isSnapshotStale(snap("sv-1"), "sv-1")).toBe(false);
  });

  it("is stale when the snapshot's version differs from the live one", () => {
    expect(isSnapshotStale(snap("sv-old"), "sv-1")).toBe(true);
  });
});
