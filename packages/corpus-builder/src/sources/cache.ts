// packages/corpus-builder/src/sources/cache.ts
//
// SPEC §6.3.1 — a local build-time cache of fetched plaintext (gitignored, e.g.
// `.cache/corpus/`) so repeated builds against the same manifest make NO network
// calls. This is what makes Gutendex's best-effort/community-run reliability
// acceptable at build time: retrieval is cacheable and retryable, fully decoupled
// from the deterministic runtime (INV-1/INV-2).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CorpusCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** Turn a source id (`gutenberg:11`) into a safe cache filename. */
function cacheFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_") + ".txt";
}

/** Filesystem-backed cache under a directory (default `.cache/corpus/`). */
export class FileCorpusCache implements CorpusCache {
  constructor(private readonly dir: string = join(".cache", "corpus")) {}

  async get(key: string): Promise<string | null> {
    const path = join(this.dir, cacheFileName(key));
    if (!existsSync(path)) return null;
    return readFile(path, "utf8");
  }

  async put(key: string, value: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, cacheFileName(key)), value, "utf8");
  }
}

/** In-memory cache — used by tests to assert cache-hit / zero-network behavior. */
export class MemoryCorpusCache implements CorpusCache {
  private readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}
