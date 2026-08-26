// Shared, parameterized INV-3 import-boundary rule for the reference clients.
//
// AGENTS.md §2 (INV-3) / SPEC §5.4 / §6.5: a reference client "sees only
// resolved JSON" — it must never reach into the engine packages
// (`rule-engine`, `corpus-builder`), directly or transitively. The boundary is
// enforced mechanically by ESLint, not left to convention.
//
// This is a factory rather than a client-specific copy so Phase 5 (§6.6) can
// guard `packages/client-threejs/src` by adding one more `clientImportBoundary`
// call, with no duplicated pattern list to drift.

/** The engine-side packages a reference client must never import. */
export const FORBIDDEN_ENGINE_PACKAGES = ["rule-engine", "corpus-builder"];

const INV3_MESSAGE =
  "INV-3: reference clients must not import rule-engine or corpus-builder — " +
  "the client sees only resolved JSON from the server (SPEC §5.4, §6.5).";

// Gitignore-style globs (as `no-restricted-imports` matches import specifiers).
// A bare package name already matches any path segment — so both the workspace
// bare import (`rule-engine`) and a relative reach-in (`../../rule-engine/src`)
// are caught — but the explicit subpath and `packages/**` forms make the intent
// legible and cover deep imports unambiguously.
function forbiddenPatterns() {
  return FORBIDDEN_ENGINE_PACKAGES.flatMap((pkg) => [
    pkg,
    `${pkg}/**`,
    `**/packages/${pkg}`,
    `**/packages/${pkg}/**`,
  ]);
}

/**
 * A flat-config block forbidding `packages/<clientPackage>/src` from importing
 * the engine packages (directly or transitively).
 *
 * @param {string} clientPackage workspace package name under `packages/`, e.g.
 *   `"client-cli"` (Phase 4) or `"client-threejs"` (Phase 5).
 */
export function clientImportBoundary(clientPackage) {
  return {
    files: [`packages/${clientPackage}/src/**/*.ts`],
    rules: {
      // The typescript-eslint variant also catches `import type` re-exports,
      // which the base rule can miss under `verbatimModuleSyntax`.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ group: forbiddenPatterns(), message: INV3_MESSAGE }] },
      ],
    },
  };
}
