import { test } from "node:test";
import assert from "node:assert/strict";
import { cutPassages, stripGutenberg } from "../../engine/corpus.mjs";
import { embedder } from "../../engine/embed.mjs";
import { openSurface, packSurface } from "../../engine/surface.mjs";
import { toyText } from "../helpers.mjs";

test("passages keep to the word bounds and are cut the same way every time", () => {
  const texts = [toyText("sea"), toyText("forest")];
  const a = cutPassages(texts, { perSource: 30, seed: 5 });
  const b = cutPassages(texts, { perSource: 30, seed: 5 });
  assert.deepEqual(a, b);
  assert.equal(a.passages.filter((p) => p.s === 0).length, 30);
  for (const { t } of a.passages) {
    const words = t.split(" ").length;
    assert.ok(words >= 5 && words <= 12, t);
  }
  assert.notDeepEqual(a.passages, cutPassages(texts, { perSource: 30, seed: 6 }).passages);
});

test("a passage with a proper name is left out unless names are allowed", () => {
  const text = "Then Dorothy carried the silver lantern across the meadow. the silver lantern glowed across the quiet meadow.";
  const without = cutPassages([text]).passages.map((p) => p.t);
  assert.deepEqual(without, ["the silver lantern glowed across the quiet meadow"]);
  const withNames = cutPassages([text], { allowNames: true }).passages.map((p) => p.t);
  assert.ok(withNames.some((t) => t.includes("Dorothy")));
});

test("a Project Gutenberg text loses its header and licence", () => {
  const book = "Title: X\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\nthe story\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicence";
  assert.equal(stripGutenberg(book).trim(), "the story");
  assert.throws(() => stripGutenberg("no markers"));
});

test("the hashing embedder is deterministic and puts shared words closer", async () => {
  const provider = embedder({ provider: "hashing", dim: 48 });
  const [a, b, c] = await provider.embed(["the waves and the tide", "the tide and the waves rise", "embers in the furnace"]);
  assert.deepEqual(await provider.embed(["the waves and the tide"]), [a]);
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  assert.ok(dot(a, b) > dot(a, c));
  assert.throws(() => embedder({ provider: "nope" }), /unknown provider/);
});

test("a surface packs to plain JSON and opens again", async () => {
  const passages = [{ t: "one", s: 0 }, { t: "two", s: 0 }, { t: "three", s: 1 }];
  const vectors = [[1, 0, 0], [0.8, 0.6, 0], [0, 0, 1]];
  const packed = JSON.parse(JSON.stringify(packSurface({ sources: [{ title: "a" }, { title: "b" }], passages, vectors, embeddings: "test" })));
  const surface = openSurface(packed);
  assert.equal(surface.n, 3);
  assert.equal(surface.vectors.length, 9);
  assert.equal(surface.xy.length, 6);
  assert.ok(surface.xy.every((v) => v >= 0 && v <= 1000));
  assert.throws(() => openSurface({ ...packed, format: 99 }));
});
