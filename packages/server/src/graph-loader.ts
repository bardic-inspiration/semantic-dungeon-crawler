// packages/server/src/graph-loader.ts
//
// SPEC §0.9.0 (A12) — the substrate bundle is "a server-wide startup config
// (e.g. `--graph <path>`); a corpus rebuild means a server restart". This is
// that loader: `graph.json` on disk → the `GraphSpan[]` the engine queries.
//
// It is deliberately a PROJECTION, not a translation. Every field it reads maps
// 1:1 onto `SubstrateSpanView` (`GRAPH_FORMAT.md`), and it makes no
// interpretation decisions: `affordances`, `salience`, and `layout_hint` are
// produced at resolution by the §0.9.0 (A13) lookup, not here. That separation
// is the whole reason the engine's span shape changed — a loader that had to
// invent half an `Entity` would be inventing spec-defined behavior (AGENTS.md §7).
//
// INV-3: `embedding` stays server-internal — it reaches the graph and never an
// `Entity`. INV-4 does NOT apply to this file: a malformed `graph.json` is a
// BUILD ARTIFACT, not authored content, so it fails loud (the same line §6.3's
// fail-loud gate draws). INV-4 governs rulesets, which are authored.

import { readFile } from "node:fs/promises";
import type { GraphSpan } from "rule-engine";

/** The loaded bundle: spans for the engine, plus the header facts the server needs. */
export interface LoadedSubstrate {
  spans: GraphSpan[];
  /** §3.7.3 / C5 — the build id, for snapshot staleness and `authored_against`. */
  substrate_version: string;
  /** §6.3 vocabulary contract, when `tag-registry.yaml` sits beside the graph. */
  tag_paths: ReadonlySet<string>;
}

class GraphLoadError extends Error {
  constructor(path: string, detail: string) {
    super(
      `graph.json at "${path}" is not a usable substrate bundle: ${detail}`,
    );
    this.name = "GraphLoadError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireString(v: unknown, path: string, what: string): string {
  if (typeof v !== "string" || v === "") {
    throw new GraphLoadError(path, `${what} must be a non-empty string`);
  }
  return v;
}

/**
 * Parse a `graph.json` payload into engine spans.
 *
 * Separate from the file read so it is testable without a filesystem, and so the
 * error messages name the artifact rather than the I/O.
 */
export function parseSubstrateBundle(
  raw: string,
  path = "<memory>",
): LoadedSubstrate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new GraphLoadError(path, `not valid JSON (${(e as Error).message})`);
  }
  if (!isRecord(parsed))
    throw new GraphLoadError(path, "top level is not an object");

  const substrate_version = requireString(
    parsed.substrate_version,
    path,
    "substrate_version",
  );
  const rawSpans = parsed.spans;
  if (!Array.isArray(rawSpans)) {
    throw new GraphLoadError(path, "`spans` is missing or not an array");
  }
  if (rawSpans.length === 0) {
    // §6.3's fail-loud gate: a bundle with no spans cannot answer a query, so
    // starting a server against it would fail later and less legibly.
    throw new GraphLoadError(path, "`spans` is empty — nothing to query");
  }

  const spans: GraphSpan[] = rawSpans.map((entry, i) => {
    if (!isRecord(entry))
      throw new GraphLoadError(path, `spans[${i}] is not an object`);
    const id = requireString(entry.id, path, `spans[${i}].id`);

    const embedding = entry.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new GraphLoadError(
        path,
        `spans[${i}].embedding is missing or empty`,
      );
    }
    if (!embedding.every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new GraphLoadError(
        path,
        `spans[${i}].embedding has a non-finite value`,
      );
    }

    const source_span = entry.source_span;
    if (!isRecord(source_span)) {
      throw new GraphLoadError(path, `spans[${i}].source_span is missing`);
    }

    const tags = entry.semantic_tags;
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
      throw new GraphLoadError(
        path,
        `spans[${i}].semantic_tags must be string[]`,
      );
    }

    return {
      span: {
        id,
        semantic_tags: tags,
        archetype: requireString(
          entry.archetype,
          path,
          `spans[${i}].archetype`,
        ),
        prose: typeof entry.prose === "string" ? entry.prose : "",
        source_span: {
          source: requireString(
            source_span.source,
            path,
            `spans[${i}].source_span.source`,
          ),
          char_ranges: requireString(
            source_span.char_ranges,
            path,
            `spans[${i}].source_span.char_ranges`,
          ),
          ...(Array.isArray(source_span.members)
            ? { members: source_span.members as string[] }
            : {}),
        },
        local_coherence:
          typeof entry.local_coherence === "number" ? entry.local_coherence : 0,
      },
      embedding: embedding as number[],
    };
  });

  const seen = new Set<string>();
  for (const s of spans) {
    if (seen.has(s.span.id)) {
      // Span ids address vectors (`Query.origin.vector_ref`), so a duplicate
      // makes a position ambiguous — INV-2 would silently depend on map order.
      throw new GraphLoadError(path, `duplicate span id "${s.span.id}"`);
    }
    seen.add(s.span.id);
  }

  return { spans, substrate_version, tag_paths: new Set() };
}

/**
 * Read the §3.6.2 vocabulary contract that §6.3 emits "alongside `graph.json`".
 * Its absence is not an error — it is advisory (§3.6.2), and a bundle produced
 * before C5's header, or copied without it, must still serve.
 */
export function parseTagRegistryPaths(text: string): ReadonlySet<string> {
  const paths = new Set<string>();
  const stack: string[] = [];
  let inTags = false;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const key = line.trim().replace(/:$/, "");
    if (indent === 0) {
      // §3.6.2 (0.12.0): only `substrate_version:` and `tags:` live at the root.
      inTags = key === "tags";
      stack.length = 0;
      continue;
    }
    if (!inTags) continue;
    const depth = Math.floor(indent / 2) - 1;
    stack.length = Math.max(0, depth);
    stack.push(key);
    paths.add(stack.join(":"));
  }
  return paths;
}

/**
 * Load a substrate bundle from disk, plus its sibling `tag-registry.yaml` when
 * present. A missing or malformed `graph.json` throws — see the header note on
 * why INV-4 does not cover build artifacts.
 */
export async function loadSubstrate(path: string): Promise<LoadedSubstrate> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    throw new GraphLoadError(path, `cannot be read (${(e as Error).message})`);
  }
  const loaded = parseSubstrateBundle(raw, path);

  const registryPath = path.replace(/[^/\\]+$/, "tag-registry.yaml");
  try {
    const registryText = await readFile(registryPath, "utf8");
    return { ...loaded, tag_paths: parseTagRegistryPaths(registryText) };
  } catch {
    // Advisory (§3.6.2) — absent is fine.
    return loaded;
  }
}
