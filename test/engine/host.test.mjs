import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_DISTANCE, surfaceHost } from "../../engine/host.mjs";
import { openSurface, packSurface } from "../../engine/surface.mjs";

const vectors = [[1, 0], [0.9, 0.44], [0, 1], [-1, 0], [0.7, 0.7]];
const surface = openSurface(packSurface({
  sources: [{ title: "a" }],
  passages: vectors.map((_, i) => ({ t: `p${i}`, s: 0 })),
  vectors,
  embeddings: "test",
}));
const map = (blocked = []) => ({
  grid: "square", adjacency: 4, corners: "open", unit: 1, width: 5, height: 1,
  defaults: { source: 0, dealt: false },
  cells: vectors.map((_, x) => ({ x, y: 0, values: { source: x % 2, dealt: blocked.includes(x) } })),
  blocksMove: blocked.map((x) => ({ x, y: 0 })), blocksSight: [], places: {},
});
const cell = (x) => ({ x, y: 0 });

test("distance is how unalike two passages are", () => {
  const host = surfaceHost(surface)(map());
  assert.equal(host.distance(cell(0), cell(0)), 0);
  assert.equal(host.distance(cell(0), cell(2)), 1000);
  assert.equal(host.distance(cell(0), cell(3)), 2000);
  assert.ok(host.distance(cell(0), cell(1)) < host.distance(cell(0), cell(4)));
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    assert.equal(host.distance(cell(a), cell(b)), host.distance(cell(b), cell(a)));
  }
});

test("the host is total: a cell off the surface is as far as can be, and never in bounds", () => {
  const host = surfaceHost(surface)(map());
  assert.equal(host.distance(cell(0), cell(99)), MAX_DISTANCE);
  assert.equal(host.distance({ x: 0, y: 1 }, cell(0)), MAX_DISTANCE);
  assert.equal(host.inBounds(cell(-1)), false);
  assert.equal(host.inBounds(cell(5)), false);
  assert.deepEqual(host.cellsWithin(cell(99), 100), []);
});

test("lists come back in row order and leave blocked passages out", () => {
  const host = surfaceHost(surface)(map([1]));
  assert.equal(host.inBounds(cell(1)), false);
  assert.deepEqual(host.cellsWithin(cell(0), 2000).map((c) => c.x), [0, 2, 3, 4]);
  assert.deepEqual(host.cellsWithin(cell(0), 400).map((c) => c.x), [0, 4]);
  const near = host.neighbors(cell(0)).map((c) => c.x);
  assert.deepEqual(near, [2, 3, 4]);
});

test("neighbors are the nearest passages, as many as the adjacency", () => {
  const five = surfaceHost(surface)({ ...map(), adjacency: 4 });
  assert.deepEqual(five.neighbors(cell(0)).map((c) => c.x), [1, 2, 3, 4]);
  const wide = [...vectors, [0.95, 0.3], [0.5, 0.86]];
  const bigger = openSurface(packSurface({ sources: [{ title: "a" }], passages: wide.map((_, i) => ({ t: `p${i}`, s: 0 })), vectors: wide, embeddings: "t" }));
  const host = surfaceHost(bigger)({ ...map(), width: 7, cells: [] });
  assert.deepEqual(host.neighbors(cell(0)).map((c) => c.x), [1, 4, 5, 6]);
});

test("a cell holds its passage's layer values, and the map must fit the surface", () => {
  const host = surfaceHost(surface)(map());
  assert.deepEqual(host.cellAt(cell(3)), { source: 1, dealt: false });
  assert.equal(host.lineOfSight(cell(0), cell(3)), true);
  assert.throws(() => surfaceHost(surface)({ ...map(), width: 4 }), /surface has 5 passages/);
});
