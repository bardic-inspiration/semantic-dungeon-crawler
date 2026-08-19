import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SPEC §6.3.1 / INV-3: Gutendex and Gutenberg file hosts are a BUILD-TIME-ONLY
// dependency. `packages/server` and `packages/client-threejs` MUST NOT reference
// them, directly or transitively — the runtime request/response loop never touches
// a community-run, best-effort service. This guard is the import-boundary check
// the phase requires (same discipline as the Phase 4/5 ESLint boundary rule).

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FORBIDDEN = /gutendex|gutenberg/i;
const GUARDED_PACKAGES = ["server", "client-threejs"];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs|json)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("INV-3 build-time boundary", () => {
  for (const pkg of GUARDED_PACKAGES) {
    it(`packages/${pkg} references no Gutendex/Gutenberg host`, () => {
      const files = sourceFiles(join(REPO_ROOT, "packages", pkg, "src"));
      const offenders = files.filter((f) =>
        FORBIDDEN.test(readFileSync(f, "utf8")),
      );
      expect(offenders).toEqual([]);
    });
  }
});
