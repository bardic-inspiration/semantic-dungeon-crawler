// Corpus: fetches a project's source texts and cuts them into passages.
//
// A source is `{ gutenberg: <id> }` (downloaded once and cached) or
// `{ file: <path> }`, plus whatever the project wants to show about it
// (`title`, `author`, `group`). A passage is a clause-sized run of words.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mulberry32 } from "./random.mjs";

export const PASSAGE_DEFAULTS = {
  minWords: 5,
  maxWords: 12,
  // Words that carry meaning, at least this many different ones per passage.
  minContentWords: 3,
  // Passages kept per source, chosen at random with `seed`.
  perSource: 340,
  seed: 1,
  // Proper names make matching passages a spelling exercise, so by default a
  // passage that contains one is left out.
  allowNames: false,
};

const STOP = new Set(
  `a about above after again against all am an and any are as at be because been before being below
  between both but by can could did do does doing down during each few for from further had has have
  having he her here hers herself him himself his how i if in into is it its itself just me more most
  my myself no nor not now of off on once only or other our ours ourselves out over own same she should
  so some such than that the their theirs them themselves then there these they this those through to
  too under until up upon very was we were what when where which while who whom why will with would you
  your yours yourself yourselves said say says one two much many may might must shall yet also ever
  never thus still even well quite rather though although indeed however therefore came come went go
  made make know knew thought think seemed seem like little great good long time way thing things
  nothing something anything everything`.split(/\s+/),
);

/** The text of each source, in order. Downloads are cached under `cacheDir`. */
export async function readSources(sources, { cacheDir, baseDir = "." }) {
  const texts = [];
  for (const source of sources) {
    if (source.gutenberg !== undefined) {
      texts.push(stripGutenberg(await fetchGutenberg(source.gutenberg, cacheDir)));
    } else if (source.file !== undefined) {
      texts.push(await readFile(resolve(baseDir, source.file), "utf8"));
    } else {
      throw new Error(`corpus: a source needs "gutenberg" or "file": ${JSON.stringify(source)}`);
    }
  }
  return texts;
}

async function fetchGutenberg(id, cacheDir) {
  const path = join(cacheDir, "books", `pg${id}.txt`);
  if (existsSync(path)) return readFile(path, "utf8");
  const res = await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`);
  if (!res.ok) throw new Error(`corpus: Project Gutenberg book ${id}: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return text;
}

/** The body of a Project Gutenberg text, without its header and licence. */
export function stripGutenberg(text) {
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/);
  if (start < 0 || end < 0) throw new Error("corpus: Project Gutenberg markers not found");
  return text.slice(text.indexOf("\n", start) + 1, end);
}

function fragments(text) {
  const flat = text
    .replace(/\r/g, "")
    .replace(/[“”"_*\[\]()]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
  return flat
    .split(/(?<=[.!?])\s+|\s*[;:]\s*|\s*—+\s*|\s*--+\s*/)
    .map((f) => f.replace(/^[\s,'-]+|[\s,.!?'-]+$/g, ""))
    .filter(Boolean);
}

function toPassage(fragment, lowerVocab, options) {
  if (!/^[A-Za-z][A-Za-z ,'-]*$/.test(fragment)) return null;
  const words = fragment.split(" ");
  if (words.length < options.minWords || words.length > options.maxWords) return null;
  const first = words[0];
  if (/^[A-Z]{2,}/.test(first)) return null;
  if (!options.allowNames) {
    for (let i = 1; i < words.length; i++) {
      if (/^[A-Z]/.test(words[i]) && !/^I('|$)/.test(words[i])) return null;
    }
    // A capitalised first word is a name unless the corpus also uses it in lower case.
    if (/^[A-Z]/.test(first) && !/^I('|$)/.test(first)) {
      if (!lowerVocab.has(first.toLowerCase().replace(/[^a-z]/g, ""))) return null;
      words[0] = first[0].toLowerCase() + first.slice(1);
    }
  }
  const content = words
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w));
  if (new Set(content).size < options.minContentWords) return null;
  return words.join(" ");
}

/**
 * Cuts each text into passages and keeps up to `perSource` of each, chosen
 * with a seeded shuffle. Returns `[{ t: text, s: source index }]`. The same
 * texts and options always give the same passages.
 */
export function cutPassages(texts, options = {}) {
  const opts = { ...PASSAGE_DEFAULTS, ...options };
  const lowerVocab = new Set();
  for (const text of texts) for (const w of text.match(/\b[a-z]+\b/g) ?? []) lowerVocab.add(w);
  const rand = mulberry32(opts.seed);
  const seen = new Set();
  const passages = [];
  const counts = [];
  texts.forEach((text, s) => {
    const pool = [];
    for (const fragment of fragments(text)) {
      const t = toPassage(fragment, lowerVocab, opts);
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        pool.push(t);
      }
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const kept = pool.slice(0, opts.perSource);
    counts.push({ candidates: pool.length, kept: kept.length });
    for (const t of kept) passages.push({ t, s });
  });
  return { passages, counts };
}
