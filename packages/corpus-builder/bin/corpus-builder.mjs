#!/usr/bin/env node
// Runnable entry for `corpus-builder` (SPEC §6.3). The pipeline is authored in
// TypeScript with no emit step (tsconfig noEmit), so this wrapper registers the
// `tsx` ESM loader and hands off to the pure `runCli`. Dev-time convenience;
// the artifact `graph.json` it produces is what `rule-engine` consumes (INV-3).
import { register } from "tsx/esm/api";
register();
const { runCli } = await import("../src/cli.ts");
process.exitCode = await runCli(process.argv.slice(2));
