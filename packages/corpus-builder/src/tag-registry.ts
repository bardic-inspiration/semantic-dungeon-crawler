// packages/corpus-builder/src/tag-registry.ts
//
// SPEC §3.6.2 (Tag Registry) / §0.11.0 C5 — `tag-registry.yaml` is a keys-only
// nested tree of valid segment paths (the VOCABULARY CONTRACT between pipeline
// stages), produced by `corpus-builder` alongside `graph.json`. Under C5 it
// carries a VERSION HEADER — the `substrate_version` of the build that produced
// it — so the vocabulary contract is itself a versioned surface (INV-5).
//
// The body stays keys-only (leaves are bare `key:`); the version header lives on
// a top-level `substrate_version:` key, with the vocabulary tree under `tags:`.
// A minimal, format-specific YAML emitter/parser keeps the package dependency-free
// (the schema §3.6.2 charset is narrow enough that no general YAML lib is needed).

import { parseTag } from "schema";

/** A keys-only nested tree; a leaf is an empty object. */
export interface RegistryTree {
  [segment: string]: RegistryTree;
}

/** Parsed registry: its version header and the flat set of `:`-joined paths. */
export interface ParsedRegistry {
  substrate_version: string | null;
  paths: Set<string>;
}

/**
 * Build the keys-only vocabulary tree from a set of tag strings. Only the
 * SEGMENT PATH is registered (§3.6.3 rule 1); the `modifier` prefix and any
 * `=value` scalar are runtime data and never registered (§3.6.3 rule 2).
 * Malformed tags are skipped (well-formedness only — INV-4).
 */
export function buildRegistryTree(tags: Iterable<string>): RegistryTree {
  const root: RegistryTree = {};
  for (const tag of tags) {
    const parsed = parseTag(tag);
    if (!parsed) continue;
    let node = root;
    for (const segment of parsed.segments) {
      node[segment] ??= {};
      node = node[segment]!;
    }
  }
  return root;
}

function emitTree(tree: RegistryTree, indent: number, out: string[]): void {
  for (const key of Object.keys(tree).sort()) {
    out.push(`${"  ".repeat(indent)}${key}:`);
    emitTree(tree[key]!, indent + 1, out);
  }
}

/**
 * Emit `tag-registry.yaml` text: a `substrate_version:` header (C5) followed by
 * the keys-only `tags:` tree. Keys are sorted at every level so the artifact is
 * byte-deterministic (INV-2). Ends with a trailing newline.
 */
export function emitTagRegistry(
  tree: RegistryTree,
  substrateVersion: string,
): string {
  const out: string[] = [
    "# tag-registry.yaml — vocabulary contract (SPEC §3.6.2, versioned per §0.11.0 C5)",
    `substrate_version: ${substrateVersion}`,
    "tags:",
  ];
  emitTree(tree, 1, out);
  return out.join("\n") + "\n";
}

/**
 * Parse a `tag-registry.yaml` produced by `emitTagRegistry`. Reads the version
 * header and flattens the `tags:` tree into a set of `:`-joined segment paths
 * (both leaf and interior paths are registered). Tolerant of comments/blank lines.
 */
export function parseTagRegistry(text: string): ParsedRegistry {
  const lines = text.split(/\r?\n/);
  let substrateVersion: string | null = null;
  const paths = new Set<string>();
  const stack: { indent: number; key: string }[] = [];
  let inTags = false;

  for (const line of lines) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;

    const versionMatch = /^substrate_version:\s*(\S+)\s*$/.exec(line);
    if (versionMatch) {
      substrateVersion = versionMatch[1]!;
      continue;
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (!inTags) continue;

    const indent = line.length - line.trimStart().length;
    const key = line.trim().replace(/:$/, "");
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent)
      stack.pop();
    stack.push({ indent, key });
    paths.add(stack.map((s) => s.key).join(":"));
  }

  return { substrate_version: substrateVersion, paths };
}
