import { describe, expect, it } from "vitest";
import type { AddressRegistryEntry, LinkRecord, Snapshot } from "./overlay";

describe("§3.7 overlay type surface", () => {
  it("type-checks an empty overlay (no registry entries, no links)", () => {
    const registry: AddressRegistryEntry[] = [];
    const links: LinkRecord[] = [];
    expect(registry).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it("type-checks a player-authored named coordinate entry (client-visible name, INV-3)", () => {
    const entry: AddressRegistryEntry = {
      tag: "player:bookmark:home",
      points_to: { kind: "coordinate", vector_ref: "vec:00421" },
      provenance: "player",
    };
    expect(entry.provenance).toBe("player");
    expect(entry.points_to.kind).toBe("coordinate");
  });

  it("derives staleness from a snapshot header's substrate_version (§3.7.3), never auto-invalidating", () => {
    const snapshot: Snapshot = {
      substrate_version: "substrate:build-1",
      resolved_payload: [],
    };
    const liveSubstrateVersion = "substrate:build-2";
    const stale = snapshot.substrate_version !== liveSubstrateVersion;
    expect(stale).toBe(true);
    // The snapshot remains readable regardless — self-contained payload is the point.
    expect(snapshot.resolved_payload).toBeDefined();
  });

  it("type-checks a directed link record (§3.7.2)", () => {
    const link: LinkRecord = {
      from: "player:bookmark:home",
      to: "player:bookmark:vault",
      kind: "shortcut",
      provenance: "player",
    };
    expect(link.kind).toBe("shortcut");
  });
});
