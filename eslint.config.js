import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
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
  prettier,
);
