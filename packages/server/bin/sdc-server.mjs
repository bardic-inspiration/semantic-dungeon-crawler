#!/usr/bin/env node
// Runnable entry for the server (SPEC §0.9.0 A12: the substrate bundle is a
// server-wide startup config, `--graph <path>`). Mirrors corpus-builder's
// wrapper: the source is TypeScript with no emit step (tsconfig noEmit), so this
// registers the `tsx` ESM loader and hands off to the pure `main`.
import { register } from "tsx/esm/api";
register();
const { main } = await import("../src/cli.ts");
const { code } = await main(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
});
process.exitCode = code;
