// Plays many games with a few simple strategies, to tune the scoring constants
// in src/engine.js. Needs the deck from a full build (.cache/deck.json).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../src/engine.js";

const T = globalThis.Throughline;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function loadDeck() {
  const raw = JSON.parse(await readFile(join(ROOT, ".cache", "deck.json"), "utf8"));
  const buf = Buffer.from(raw.vectors, "base64");
  return T.prepareDeck({
    ...raw,
    vectors: new Int8Array(buf.buffer, buf.byteOffset, buf.length),
  });
}

const strategies = {
  // Always takes the best-scoring card: the floor on move count.
  oracle: (state) => {
    const s = T.scoreHand(state);
    return s.indexOf(s.reduce((a, b) => (b.delta > a.delta ? b : a)));
  },
  // Picks at random.
  random: (state, rand) => Math.floor(rand() * state.hand.length),
  // Reads imperfectly: the true similarity plus noise.
  reader: (state, rand) => {
    const s = T.scoreHand(state).map((x) => x.sim + (rand() - 0.5) * 0.3);
    return s.indexOf(Math.max(...s));
  },
  // Ignores the words and stays in the book it last played.
  samebook: (state, rand) => {
    const last = state.played.at(-1);
    if (last === undefined) return 0;
    const book = state.deck.cards[last].b;
    const same = state.hand.map((c, i) => (state.deck.cards[c].b === book ? i : -1)).filter((i) => i >= 0);
    return same.length ? same[Math.floor(rand() * same.length)] : Math.floor(rand() * state.hand.length);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const deck = await loadDeck();
  const GAMES = 200;
  const CAP = 60;
  for (const [name, pick] of Object.entries(strategies)) {
    const moves = [];
    let wins = 0;
    for (let g = 0; g < GAMES; g++) {
      const state = T.newGame(deck, 1000 + g);
      const rand = T.mulberry32(9000 + g);
      while (!state.won && state.played.length < CAP) T.play(state, pick(state, rand));
      if (state.won) wins++;
      moves.push(state.played.length);
    }
    moves.sort((a, b) => a - b);
    console.log(
      `${name.padEnd(9)} wins ${String(wins).padStart(3)}/${GAMES}  moves p10 ${moves[20]}  median ${moves[100]}  p90 ${moves[180]}`,
    );
  }
}
