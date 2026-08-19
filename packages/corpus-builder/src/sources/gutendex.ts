// packages/corpus-builder/src/sources/gutendex.ts
//
// SPEC §6.3.1 — the first `CorpusSource` adapter. Resolves book metadata and
// plaintext URLs from Gutendex (https://gutendex.com), a free, unauthenticated,
// community-run JSON API over the Project Gutenberg catalog. Plaintext is fetched
// DIRECTLY from Project Gutenberg's file hosts — never proxied through Gutendex —
// and no text is committed to the repo (only a small manifest of IDs, resolved at
// build time). A local cache makes repeat builds network-free.
//
// RELIABILITY CAVEAT (§6.3.1): Gutendex is best-effort (~50% error rate observed).
// That is acceptable for a build-time, cacheable, retryable step and MUST NOT
// appear in the runtime loop — `packages/server` and the client packages must
// never reference Gutendex or a Gutenberg host. `corpus-builder` is the only caller.

import type { CorpusCache } from "./cache";
import { FileCorpusCache } from "./cache";
import type {
  CorpusManifestEntry,
  CorpusSource,
  ResolvedDocument,
} from "./types";

/** Minimal fetch surface, injectable so tests never touch the network (§6.3.1). */
export type FetchLike = (url: string) => Promise<FetchResponse>;
export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

interface GutendexBook {
  id: number;
  title: string;
  formats: Record<string, string>;
  subjects?: string[];
  authors?: { name: string }[];
}

const GUTENDEX_BOOKS_URL = "https://gutendex.com/books";

/**
 * Strip Project Gutenberg's standard `*** START OF ... ***` / `*** END OF ... ***`
 * boilerplate markers. Handles the historical `THE`/`THIS` variation and older
 * `*END*THE SMALL PRINT` legacy footers. If a marker is absent the text is
 * returned trimmed (INV-4: a non-standard file is not rejected).
 */
export function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  const start =
    /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$/im.exec(text);
  if (start) {
    text = text.slice(start.index + start[0].length);
  }

  const end = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$/im.exec(
    text,
  );
  if (end) {
    text = text.slice(0, end.index);
  } else {
    // Legacy footer form.
    const legacy = /^\*+\s*END\b.*SMALL PRINT.*$/im.exec(text);
    if (legacy) text = text.slice(0, legacy.index);
  }

  return text.trim();
}

/** Pick the plaintext URL for a book: exact UTF-8 key, else first `text/plain*`. */
export function selectPlaintextUrl(
  formats: Record<string, string>,
): string | null {
  const exact = formats["text/plain; charset=utf-8"];
  if (exact) return exact;
  for (const key of Object.keys(formats)) {
    if (/^text\/plain/.test(key)) return formats[key]!;
  }
  return null;
}

export class GutendexSource implements CorpusSource {
  private readonly fetchFn: FetchLike;
  private readonly cache: CorpusCache;

  constructor(deps: { fetchFn?: FetchLike; cache?: CorpusCache } = {}) {
    this.fetchFn = deps.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.cache = deps.cache ?? new FileCorpusCache();
  }

  async resolve(entries: CorpusManifestEntry[]): Promise<ResolvedDocument[]> {
    const resolved = new Map<number, ResolvedDocument>();
    const uncached: CorpusManifestEntry[] = [];

    // Cache-first: a fully-cached manifest performs ZERO network calls (§6.3.1),
    // metadata request included.
    for (const entry of entries) {
      const cached = await this.cache.get(this.cacheKey(entry.id));
      if (cached) {
        resolved.set(entry.id, JSON.parse(cached) as ResolvedDocument);
      } else {
        uncached.push(entry);
      }
    }

    if (uncached.length > 0) {
      const books = await this.fetchMetadata(uncached.map((e) => e.id));
      for (const entry of uncached) {
        const book = books.get(entry.id);
        if (!book) {
          throw new Error(`Gutendex returned no book for id ${entry.id}`);
        }
        const url = selectPlaintextUrl(book.formats);
        if (!url) {
          throw new Error(`no text/plain format for Gutenberg id ${entry.id}`);
        }
        const rawText = await this.fetchText(url);
        const doc: ResolvedDocument = {
          source_id: `gutenberg:${entry.id}`,
          title: book.title,
          raw_text: stripGutenbergBoilerplate(rawText),
          metadata: {
            gutenberg_id: entry.id,
            subjects: book.subjects ?? [],
            authors: (book.authors ?? []).map((a) => a.name),
            note: entry.note,
          },
        };
        await this.cache.put(this.cacheKey(entry.id), JSON.stringify(doc));
        resolved.set(entry.id, doc);
      }
    }

    // Preserve manifest order.
    return entries.map((e) => resolved.get(e.id)!);
  }

  private cacheKey(id: number): string {
    return `gutenberg:${id}`;
  }

  private async fetchMetadata(
    ids: number[],
  ): Promise<Map<number, GutendexBook>> {
    const url = `${GUTENDEX_BOOKS_URL}?ids=${ids.join(",")}`;
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Gutendex metadata request failed: ${response.status}`);
    }
    const body = (await response.json()) as { results?: GutendexBook[] };
    const map = new Map<number, GutendexBook>();
    for (const book of body.results ?? []) map.set(book.id, book);
    return map;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Gutenberg plaintext request failed: ${response.status}`);
    }
    return response.text();
  }
}
