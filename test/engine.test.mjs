import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/engine.js";

const T = globalThis.Throughline;

// A tiny deck: two tight clusters of cards on orthogonal axes.
function toyDeck(perCluster = 300) {
  const dim = 4;
  const cards = [];
  const vectors = new Int8Array(perCluster * 2 * dim);
  const rand = T.mulberry32(7);
  for (let i = 0; i < perCluster * 2; i++) {
    const cluster = i < perCluster ? 0 : 1;
    cards.push({ t: `card ${i}`, b: i % 6 });
    vectors[i * dim + cluster] = 100;
    vectors[i * dim + 2] = Math.round((rand() - 0.5) * 30);
    vectors[i * dim + 3] = Math.round((rand() - 0.5) * 30);
  }
  return T.prepareDeck({ cards, dim, vectors });
}

const bestIndex = (state) => {
  const scores = T.scoreHand(state);
  return scores.indexOf(scores.reduce((a, b) => (b.delta > a.delta ? b : a)));
};

test("the same seed and picks replay the same game", () => {
  const deck = toyDeck();
  const run = () => {
    const state = T.newGame(deck, 42);
    const log = [];
    for (const pick of [0, 3, 1, 4, 2, 0]) log.push(T.play(state, pick));
    return { log, harmony: state.harmony, hand: state.hand };
  };
  assert.deepEqual(run(), run());
});

test("different seeds deal different opening hands", () => {
  const deck = toyDeck();
  assert.notDeepEqual(T.newGame(deck, 1).hand, T.newGame(deck, 2).hand);
});

test("the opening hand has five cards from five books and scores nothing", () => {
  const state = T.newGame(toyDeck(), 5);
  assert.equal(state.hand.length, 5);
  assert.equal(new Set(state.hand.map((c) => state.deck.cards[c].b)).size, 5);
  assert.deepEqual(T.scoreHand(state).map((s) => s.delta), [0, 0, 0, 0, 0]);
});

test("no card is dealt twice in a game", () => {
  const state = T.newGame(toyDeck(), 9);
  const seen = new Set();
  for (let i = 0; i < 40 && !state.won; i++) {
    for (const c of state.hand) {
      assert.ok(!seen.has(c));
      seen.add(c);
    }
    T.play(state, i % 5);
  }
});

test("staying on the thread scores up and leaving it scores down", () => {
  const state = T.newGame(toyDeck(), 11);
  T.play(state, 0);
  const scores = T.scoreHand(state).map((s) => s.delta);
  assert.ok(Math.max(...scores) > 0);
  assert.ok(Math.min(...scores) < 0);
});

test("a streak multiplies gains and a bad card ends it", () => {
  const state = T.newGame(toyDeck(), 13);
  T.play(state, 0);
  const first = T.play(state, bestIndex(state));
  const second = T.play(state, bestIndex(state));
  assert.equal(state.streak, 2);
  assert.ok(second.delta >= first.delta);
  const scores = T.scoreHand(state);
  T.play(state, scores.indexOf(scores.reduce((a, b) => (b.delta < a.delta ? b : a))));
  assert.equal(state.streak, 0);
});

test("harmony stays between 0 and 100 and the game ends at 100", () => {
  const state = T.newGame(toyDeck(), 17);
  T.play(state, 0);
  const scores = T.scoreHand(state);
  T.play(state, scores.indexOf(scores.reduce((a, b) => (b.delta < a.delta ? b : a))));
  assert.equal(state.harmony, 0);
  while (!state.won) T.play(state, bestIndex(state));
  assert.equal(state.harmony, 100);
  assert.throws(() => T.play(state, 0));
});
