// INV-3 lint fixture (SPEC §5.2 / §6.6): a deliberately-illegal engine import,
// used only to prove the import-boundary ESLint rule actually fires for the
// Three.js client. This file is never imported by real client-threejs source; it
// lives outside `src/` so it is excluded from `tsc` and the main `npm run lint`
// pass, and is linted only by `import-boundary.test.ts`, which asserts the rule
// flags both imports below.
import { resolveMove } from "rule-engine";
import { getDefaultTokenizer } from "corpus-builder";

export const forbidden = { resolveMove, getDefaultTokenizer };
