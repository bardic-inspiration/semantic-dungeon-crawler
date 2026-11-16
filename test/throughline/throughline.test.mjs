// Throughline is the engine's worked example, and so its fixture: these run
// the real surface and the real rules.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openProject } from "../../engine/project.mjs";
import { playOut, strategies } from "../../engine/sim.mjs";

let game, project;
before(async () => {
  ({ game, project } = await openProject("projects/throughline"));
});

test("the surface is nine books of passages", () => {
  assert.equal(game.surface.sources.length, 9);
  assert.equal(game.surface.n, 2881);
  assert.deepEqual([...new Set(game.surface.sources.map((s) => s.group))], ["fantasy", "adventure", "horror"]);
});

test("a hand is five cards, the opening one from five different books", () => {
  const view = game.start("throughline:fixture").view();
  assert.equal(view.hand.length, 5);
  assert.equal(new Set(view.hand.map((p) => game.surface.passages[p].s)).size, 5);
  assert.equal(Number(game.table("goal")), 100);
});

test("every hand after the first offers something that fits and something that does not", () => {
  const session = game.start("throughline:fixture");
  session.play(0);
  for (let i = 0; i < 4; i++) {
    const { worth } = session.view();
    assert.ok(Math.max(...worth) > Math.min(...worth));
    assert.ok(Math.min(...worth) < 0);
    session.play(strategies.best(session.view()));
  }
});

test("careful play wins in a dozen moves or so; careless play does not", () => {
  const careful = playOut(game, "throughline:test2", strategies.best);
  assert.ok(careful.won);
  // The browser check plays these same picks and must land on the same count.
  assert.equal(careful.moves, 12);
  assert.deepEqual(careful.session.picks, [0, 1, 0, 1, 1, 0, 4, 2, 3, 1, 0, 1]);
  const careless = playOut(game, 7, strategies.random, { cap: 25 });
  assert.ok(!careless.won);
});

test("the committed page is the one this project builds", async () => {
  const html = await readFile(`${project.dir}/index.html`, "utf8");
  assert.ok(html.includes("<title>Throughline</title>"));
  const shipped = JSON.parse(/window\.SDC = (\{.*?\});<\/script>/s.exec(html)[1]);
  assert.deepEqual(shipped.docs, JSON.parse(JSON.stringify(project.docs)));
  assert.deepEqual(shipped.interface, JSON.parse(JSON.stringify(project.config.interface)));
  assert.equal(shipped.surface.vectors, (await readFile(`${project.dir}/surface.json`, "utf8").then(JSON.parse)).vectors);
});
