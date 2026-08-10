import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // INV-3 import-boundary rule goes here in Phase 5 (SPEC §6.6): forbid
    // packages/client-threejs from importing packages/rule-engine or
    // packages/corpus-builder. Added as a real rule, not a convention.
  },
);
