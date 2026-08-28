// packages/corpus-builder/src/index.ts
//
// SPEC §6.3 — the build-time pipeline. `graph.json` is an INTERNAL-ONLY artifact
// (INV-3), consumed exclusively by `rule-engine`; nothing here is client-facing.
// Public surface for programmatic use and the CLI.

export * from "./types";
export * from "./instrumentation";
export * from "./config";
export * from "./substrate-version";
export * from "./tokenizer";
export * from "./segmentation";
export * from "./embedding";
export * from "./minilm-embedding";
export * from "./index-flat";
export * from "./coherence";
export * from "./tagging";
export * from "./tag-registry";
export * from "./composition";
export * from "./build-trace";
export * from "./pipeline";
export * from "./inspect";
export * from "./eval";
export * from "./manifest";
export * from "./cli";
export * from "./sources/types";
export * from "./sources/cache";
export * from "./sources/gutendex";
export * from "./sources/filesystem";
