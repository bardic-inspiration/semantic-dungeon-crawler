import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import { clientImportBoundary } from "./eslint/client-import-boundary.js";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      // INV-3 lint fixtures deliberately violate the import boundary; they are
      // linted in isolation by import-boundary.test.ts, never in the main pass.
      "**/test/fixtures/inv3-*.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node executable wrappers (e.g. corpus-builder's bin) run on the Node
  // runtime, so give them the Node globals (`process`, etc.).
  {
    files: ["**/bin/**", "**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  // The server package is a Node HTTP runtime — give its sources the Node globals
  // (`URL`, `fetch`, the `node:http` runtime, etc.) they legitimately run against.
  {
    files: ["packages/server/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  // The terminal client (§5.4) is a Node process too — it drives §5.1 over `fetch`,
  // reads stdin via `node:readline`, and writes stdout/stderr through `process`.
  {
    files: ["packages/client-cli/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  // INV-3 (SPEC §5.4/§6.5): the terminal client sees only resolved JSON — it must
  // never import the engine packages. Phase 5 (§6.6) adds the same call for
  // `client-threejs` via the shared, parameterized factory.
  clientImportBoundary("client-cli"),
  // INV-3 (SPEC §5.2/§6.6): the Three.js reference client is held to the same
  // boundary, so INV-3 holds permanently across both reference adapters.
  clientImportBoundary("client-threejs"),
  prettier,
);
