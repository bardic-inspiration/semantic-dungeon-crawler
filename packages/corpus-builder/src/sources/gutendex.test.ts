import { describe, expect, it, vi } from "vitest";
import { MemoryCorpusCache } from "./cache";
import {
  GutendexSource,
  selectPlaintextUrl,
  stripGutenbergBoilerplate,
  type FetchLike,
  type FetchResponse,
} from "./gutendex";
import { parseManifest } from "../manifest";

// Three books with historically-varying header/footer formats (§6.3.1: stripping
// verified on ≥3 books). Body text between markers is what must survive.
const BOOK_11 = [
  "The Project Gutenberg eBook of Alice's Adventures in Wonderland",
  "some front matter, license blurb, produced by ...",
  "*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
  "",
  "CHAPTER I. Down the Rabbit-Hole",
  "Alice was beginning to get very tired.",
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
  "License follows, do not include.",
].join("\n");

const BOOK_43 = [
  "front matter",
  "*** START OF THIS PROJECT GUTENBERG EBOOK THE STRANGE CASE OF DR. JEKYLL ***",
  "Mr. Utterson the lawyer was a man of a rugged countenance.",
  "*** END OF THIS PROJECT GUTENBERG EBOOK THE STRANGE CASE OF DR. JEKYLL ***",
  "footer",
].join("\n");

const BOOK_1228 = [
  "*** START OF THE PROJECT GUTENBERG EBOOK ON THE ORIGIN OF SPECIES ***",
  "When on board H.M.S. Beagle, as naturalist, I was much struck.",
  "*** END OF THE PROJECT GUTENBERG EBOOK ON THE ORIGIN OF SPECIES ***",
].join("\n");

describe("stripGutenbergBoilerplate (≥3 books, format variation)", () => {
  it("strips the THE-variant markers (Alice)", () => {
    const out = stripGutenbergBoilerplate(BOOK_11);
    expect(out).toContain("Down the Rabbit-Hole");
    expect(out).not.toContain("START OF");
    expect(out).not.toContain("END OF");
    expect(out).not.toContain("License follows");
  });

  it("strips the THIS-variant markers (Jekyll)", () => {
    const out = stripGutenbergBoilerplate(BOOK_43);
    expect(out).toContain("Mr. Utterson the lawyer");
    expect(out).not.toContain("PROJECT GUTENBERG");
    expect(out).not.toContain("footer");
  });

  it("strips the expository book markers (Origin)", () => {
    const out = stripGutenbergBoilerplate(BOOK_1228);
    expect(out).toBe(
      "When on board H.M.S. Beagle, as naturalist, I was much struck.",
    );
  });

  it("returns trimmed text when no markers are present (INV-4: not rejected)", () => {
    expect(stripGutenbergBoilerplate("  bare text without markers  ")).toBe(
      "bare text without markers",
    );
  });
});

describe("selectPlaintextUrl", () => {
  it("prefers the exact UTF-8 key", () => {
    expect(
      selectPlaintextUrl({
        "text/plain; charset=utf-8": "utf8.txt",
        "text/plain; charset=us-ascii": "ascii.txt",
      }),
    ).toBe("utf8.txt");
  });

  it("falls back to any text/plain* key", () => {
    expect(
      selectPlaintextUrl({ "text/plain; charset=us-ascii": "ascii.txt" }),
    ).toBe("ascii.txt");
  });

  it("returns null when no plaintext format exists", () => {
    expect(selectPlaintextUrl({ "text/html": "book.html" })).toBeNull();
  });
});

function mockFetch(): FetchLike {
  const bodies: Record<string, string> = {
    "https://gutendex.com/books?ids=11,43,1228": JSON.stringify({
      results: [
        {
          id: 11,
          title: "Alice's Adventures in Wonderland",
          formats: {
            "text/plain; charset=utf-8":
              "https://www.gutenberg.org/files/11/11-0.txt",
          },
          subjects: ["Fantasy fiction"],
          authors: [{ name: "Carroll, Lewis" }],
        },
        {
          id: 43,
          title: "The Strange Case of Dr. Jekyll and Mr. Hyde",
          formats: {
            "text/plain; charset=utf-8":
              "https://www.gutenberg.org/files/43/43-0.txt",
          },
        },
        {
          id: 1228,
          title: "On the Origin of Species",
          formats: {
            "text/plain; charset=utf-8":
              "https://www.gutenberg.org/files/1228/1228-0.txt",
          },
        },
      ],
    }),
    "https://www.gutenberg.org/files/11/11-0.txt": BOOK_11,
    "https://www.gutenberg.org/files/43/43-0.txt": BOOK_43,
    "https://www.gutenberg.org/files/1228/1228-0.txt": BOOK_1228,
  };
  return vi.fn(async (url: string): Promise<FetchResponse> => {
    const body = bodies[url];
    if (body === undefined)
      return {
        ok: false,
        status: 404,
        text: async () => "",
        json: async () => ({}),
      };
    return {
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  });
}

describe("GutendexSource", () => {
  const entries = [{ id: 11 }, { id: 43 }, { id: 1228 }];

  it("resolves metadata + boilerplate-stripped plaintext, in manifest order", async () => {
    const source = new GutendexSource({
      fetchFn: mockFetch(),
      cache: new MemoryCorpusCache(),
    });
    const docs = await source.resolve(entries);
    expect(docs.map((d) => d.source_id)).toEqual([
      "gutenberg:11",
      "gutenberg:43",
      "gutenberg:1228",
    ]);
    expect(docs[0]!.title).toBe("Alice's Adventures in Wonderland");
    expect(docs[0]!.raw_text).toContain("Down the Rabbit-Hole");
    expect(docs[0]!.raw_text).not.toContain("PROJECT GUTENBERG");
  });

  it("makes ZERO network calls on a second build of an unchanged manifest (cache)", async () => {
    const cache = new MemoryCorpusCache();
    const fetch1 = mockFetch();
    await new GutendexSource({ fetchFn: fetch1, cache }).resolve(entries);
    expect(
      (fetch1 as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);

    const fetch2 = mockFetch();
    const docs = await new GutendexSource({ fetchFn: fetch2, cache }).resolve(
      entries,
    );
    expect(
      (fetch2 as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
    expect(docs).toHaveLength(3);
  });
});

describe("parseManifest", () => {
  it("parses the manifest schema including restructure: null default", () => {
    const manifest = parseManifest(
      JSON.stringify({
        source: "gutendex",
        entries: [{ id: 11, note: "Alice" }, { id: 1228 }],
      }),
    );
    expect(manifest.source).toBe("gutendex");
    expect(manifest.restructure).toBeNull();
    expect(manifest.entries).toEqual([{ id: 11, note: "Alice" }, { id: 1228 }]);
  });

  it("carries a named restructure and a segmentation block through", () => {
    const manifest = parseManifest(
      JSON.stringify({
        source: "gutendex",
        restructure: "semantic-cluster",
        segmentation: {
          unit: "sentence",
          grouping: "fixed",
          size: 4,
          overlap: 1,
        },
        entries: [{ id: 11 }],
      }),
    );
    expect(manifest.restructure).toBe("semantic-cluster");
    expect(manifest.segmentation).toEqual({
      unit: "sentence",
      grouping: "fixed",
      size: 4,
      overlap: 1,
    });
  });
});
