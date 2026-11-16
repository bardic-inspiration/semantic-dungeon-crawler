import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { buildProject } from "../../engine/build.mjs";
import { core, openGame } from "../../engine/game.mjs";
import { playOut, strategies } from "../../engine/sim.mjs";
import { TOY_EXTENSION, toyGame } from "../helpers.mjs";

let toy;
before(async () => {
  toy = await toyGame();
});

test("the base ruleset is a template: alone, it is refused for the tables it leaves out", () => {
  const { kit, base, scenario } = toy.project.docs;
  assert.throws(() => openGame({ kit, base, scenario, surface: toy.surface }), (error) => error instanceof core.CompileError);
});

test("an extension may set tables but not change the rules the base keeps closed", () => {
  const { kit, base, scenario } = toy.project.docs;
  const closed = { ...parse(TOY_EXTENSION), flow: [{ call: "deal" }] };
  assert.throws(
    () => openGame({ kit, base, extensions: [closed], scenario, surface: toy.surface }),
    (error) => error instanceof core.CompileError && /does not mark "flow" open/.test(error.message),
  );
  assert.equal(Number(toy.game.table("goal")), 40);
  assert.equal(Number(toy.game.table("gain")), 60);
});

test("the opening hand is one passage per band, from different sources, worth nothing yet", () => {
  const view = toy.game.start("a").view();
  assert.equal(view.hand.length, 3);
  assert.equal(new Set(view.hand.map((p) => toy.surface.passages[p].s)).size, 3);
  assert.deepEqual(view.worth, [0, 0, 0]);
  assert.deepEqual(view.trail, []);
});

test("a move adds the passage to the trail and moves the meter by what it was worth", () => {
  const session = toy.game.start("b");
  session.play(0);
  const before = session.view();
  assert.equal(before.meter, 0);
  assert.ok(before.worth.some((w) => w !== 0));
  session.play(1);
  const after = session.view();
  assert.deepEqual(after.trail, [...before.trail, before.hand[1]]);
  assert.equal(after.moved.at(-1), before.worth[1]);
  assert.equal(after.meter, Math.max(0, Math.min(40, before.worth[1])));
  assert.equal(after.streak, before.worth[1] > 0 ? 1 : 0);
});

test("no passage is dealt twice, and the meter stays between 0 and the goal", () => {
  const session = toy.game.start("c");
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    const view = session.view();
    if (view.ended) break;
    assert.ok(view.meter >= 0 && view.meter <= 40);
    for (const p of view.hand) {
      assert.ok(!seen.has(p), `passage ${p} dealt twice`);
      seen.add(p);
    }
    session.play(i % 3);
  }
});

test("playing the best passage reaches the scenario's end", () => {
  const { won, session } = playOut(toy.game, 4, strategies.best, { cap: 30 });
  assert.ok(won);
  assert.equal(session.view().meter, 40);
  assert.equal(session.view().ended.moves, session.view().trail.length);
  assert.throws(() => session.play(0), /ended/);
});

test("a match is a pure function of its seed and picks, and core can replay its log", () => {
  const picks = [0, 2, 1, 1, 0, 2];
  const a = toy.game.start("d", picks);
  const b = toy.game.start("d", picks);
  assert.deepEqual(a.view(), b.view());
  assert.equal(core.hashLog(a.match.log), core.hashLog(b.match.log));
  assert.notEqual(core.hashLog(a.match.log), core.hashLog(toy.game.start("e", picks).match.log));
  const replayed = core.replay(toy.game.registry, toy.game.scenario, a.match.log);
  assert.equal(core.hashLog(replayed.log), core.hashLog(a.match.log));
});

test("a project builds to one self-contained page", async () => {
  await buildProject(toy.dir, { pageOnly: true, log: () => {} });
  const html = await readFile(`${toy.dir}/index.html`, "utf8");
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>Toy &lt;game&gt;</title>"));
  assert.ok(html.includes('"id":"toy"'));
  assert.ok(!html.includes("SDC:"), "every placeholder is filled");
  assert.ok(!html.includes("new Function"), "the page carries no schema checker");
});
