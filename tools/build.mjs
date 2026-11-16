// Builds the game: downloads the books, cuts them into cards, embeds every
// card, and writes a single self-contained index.html.
//
//   node tools/build.mjs            full build (downloads books + model once)
//   node tools/build.mjs --page     re-inline src/ into index.html, reusing
//                                   the deck from the last full build
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/engine.js";

const { mulberry32 } = globalThis.Throughline;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const DECK_PATH = join(CACHE, "deck.json");

const BOOKS = [
  { id: 55, title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", genre: "fantasy" },
  { id: 325, title: "Phantastes", author: "George MacDonald", genre: "fantasy" },
  { id: 61077, title: "The King of Elfland's Daughter", author: "Lord Dunsany", genre: "fantasy" },
  { id: 120, title: "Treasure Island", author: "Robert Louis Stevenson", genre: "adventure" },
  { id: 2166, title: "King Solomon's Mines", author: "H. Rider Haggard", genre: "adventure" },
  { id: 164, title: "Twenty Thousand Leagues under the Sea", author: "Jules Verne", genre: "adventure" },
  { id: 345, title: "Dracula", author: "Bram Stoker", genre: "horror" },
  { id: 84, title: "Frankenstein", author: "Mary Shelley", genre: "horror" },
  { id: 10007, title: "Carmilla", author: "J. Sheridan Le Fanu", genre: "horror" },
];
const CARDS_PER_BOOK = 340;
const MIN_WORDS = 5;
const MAX_WORDS = 12;
const DECK_SEED = 1897;

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

async function fetchBook(id) {
  const path = join(CACHE, "books", `pg${id}.txt`);
  if (existsSync(path)) return readFile(path, "utf8");
  const res = await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`);
  if (!res.ok) throw new Error(`Gutenberg ${id}: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return text;
}

function body(text) {
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/);
  if (start < 0 || end < 0) throw new Error("Gutenberg markers not found");
  return text.slice(text.indexOf("\n", start) + 1, end);
}

// Cut a book into clause-sized fragments: "a series of words".
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

function makeCard(fragment, lowerVocab) {
  if (!/^[A-Za-z][A-Za-z ,'’-]*$/.test(fragment)) return null;
  const words = fragment.split(" ");
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return null;
  // No proper names: they make matching cards a spelling exercise.
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Z]/.test(words[i]) && !/^I(')?/.test(words[i])) return null;
  }
  const first = words[0];
  if (/^[A-Z]/.test(first) && !/^I('|$)/.test(first)) {
    const lower = first.toLowerCase().replace(/[^a-z]/g, "");
    if (!lowerVocab.has(lower)) return null;
    words[0] = first[0].toLowerCase() + first.slice(1);
  }
  if (/^[A-Z]{2,}/.test(first)) return null;
  const content = words
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 3 && !STOP.has(w));
  if (new Set(content).size < 3) return null;
  return words.join(" ");
}

async function embed(texts) {
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const out = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = await extractor(texts.slice(i, i + 64), { pooling: "mean", normalize: true });
    out.push(...batch.tolist());
    
  }

  return out;
}

// Two principal components, by power iteration, for the map.
function project2d(vectors) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) mean[d] += v[d] / n;
  const centered = vectors.map((v) => v.map((x, d) => x - mean[d]));
  const axes = [];
  for (let k = 0; k < 2; k++) {
    let axis = Float64Array.from({ length: dim }, (_, d) => Math.sin(d * 12.9898 + k * 78.233));
    for (let iter = 0; iter < 60; iter++) {
      const next = new Float64Array(dim);
      for (const row of centered) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += row[d] * axis[d];
        for (let d = 0; d < dim; d++) next[d] += dot * row[d];
      }
      for (const prev of axes) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += next[d] * prev[d];
        for (let d = 0; d < dim; d++) next[d] -= dot * prev[d];
      }
      const norm = Math.hypot(...next);
      for (let d = 0; d < dim; d++) next[d] /= norm;
      axis = next;
    }
    axes.push(axis);
  }
  const pts = centered.map((row) => axes.map((a) => row.reduce((s, x, d) => s + x * a[d], 0)));
  // Normalise each axis to 0..1000 between the 1st and 99th percentile.
  for (let k = 0; k < 2; k++) {
    const sorted = pts.map((p) => p[k]).sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.01)];
    const hi = sorted[Math.floor(n * 0.99)];
    for (const p of pts) p[k] = Math.round(Math.max(0, Math.min(1, (p[k] - lo) / (hi - lo))) * 1000);
  }
  return pts;
}

async function buildDeck() {
  const texts = [];
  for (const book of BOOKS) texts.push(body(await fetchBook(book.id)));

  const lowerVocab = new Set();
  for (const text of texts) for (const w of text.match(/\b[a-z]+\b/g) ?? []) lowerVocab.add(w);

  const rand = mulberry32(DECK_SEED);
  const cards = [];
  const seen = new Set();
  BOOKS.forEach((book, b) => {
    const pool = [];
    for (const f of fragments(texts[b])) {
      const t = makeCard(f, lowerVocab);
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        pool.push(t);
      }
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const take = pool.slice(0, CARDS_PER_BOOK);
    console.log(`${book.title}: ${pool.length} candidates, kept ${take.length}`);
    for (const t of take) cards.push({ t, b });
  });

  const vectors = await embed(cards.map((c) => c.t));
  const dim = vectors[0].length;
  let peak = 0;
  for (const v of vectors) for (const x of v) peak = Math.max(peak, Math.abs(x));
  const bytes = new Int8Array(cards.length * dim);
  vectors.forEach((v, i) => v.forEach((x, d) => (bytes[i * dim + d] = Math.round((x / peak) * 127))));

  return {
    books: BOOKS.map(({ title, author, genre }) => ({ title, author, genre })),
    cards,
    xy: project2d(vectors).flat(),
    dim,
    vectors: Buffer.from(bytes.buffer).toString("base64"),
  };
}

const pageOnly = process.argv.includes("--page");
let deck;
if (pageOnly) {
  deck = JSON.parse(await readFile(DECK_PATH, "utf8"));
} else {
  deck = await buildDeck();
  await mkdir(CACHE, { recursive: true });
  await writeFile(DECK_PATH, JSON.stringify(deck));
}

const [page, engine] = await Promise.all([
  readFile(join(ROOT, "src", "game.html"), "utf8"),
  readFile(join(ROOT, "src", "engine.js"), "utf8"),
]);
const content = page
  .replace("/*__ENGINE__*/", () => engine)
  .replace("/*__DECK__*/", () => `const DECK = ${JSON.stringify(deck)};`);
const [head, bodyHtml] = content.split("<!--BODY-->");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}<style>body { margin: 0; }</style>
</head>
<body>${bodyHtml}</body>
</html>
`;
await writeFile(join(ROOT, "index.html"), html);
// The same page without the document shell, for hosts that supply their own.
await writeFile(join(CACHE, "throughline.html"), content);
console.log(`index.html: ${deck.cards.length} cards, ${(html.length / 1e6).toFixed(2)} MB`);
