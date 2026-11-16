// Plays a project many times with a few simple strategies, to tune its
// tables: how fast does perfect play win, and does careless play lose?
import { hashText, mulberry32 } from "./random.mjs";

export const strategies = {
  // Always plays the passage worth most: the floor on move count.
  best: (view) => view.worth.indexOf(Math.max(...view.worth)),
  // Plays at random.
  random: (view, rand) => Math.floor(rand() * view.hand.length),
  // Reads imperfectly: the true worth plus noise.
  reader: (view, rand) => {
    const guess = view.worth.map((w) => w + (rand() - 0.5) * 18);
    return guess.indexOf(Math.max(...guess));
  },
  // Ignores the words and stays with the source it last played.
  sameSource: (view, rand, surface) => {
    const last = view.trail.at(-1);
    const source = last === undefined ? -1 : surface.passages[last].s;
    const same = view.hand.flatMap((p, i) => (surface.passages[p].s === source ? [i] : []));
    return same.length ? same[Math.floor(rand() * same.length)] : Math.floor(rand() * view.hand.length);
  },
};

/** One game: the number of moves, and whether it reached an end the scenario declares. */
export function playOut(game, seed, strategy, { cap = 40 } = {}) {
  const session = game.start(seed);
  const rand = mulberry32(hashText(String(seed)) + 9000);
  let view = session.view();
  while (!view.ended && view.trail.length < cap) {
    session.play(strategy(view, rand, game.surface));
    view = session.view();
  }
  return { moves: view.trail.length, won: Boolean(view.ended) && view.ended.result === "win", session };
}

/** Plays `games` games per strategy and returns a row of figures for each. */
export function simulate(game, { games = 60, cap = 40, only = Object.keys(strategies) } = {}) {
  return only.map((name) => {
    const moves = [];
    let wins = 0;
    for (let g = 0; g < games; g++) {
      const result = playOut(game, 1000 + g, strategies[name], { cap });
      if (result.won) wins++;
      moves.push(result.won ? result.moves : Infinity);
    }
    moves.sort((a, b) => a - b);
    const at = (p) => moves[Math.min(games - 1, Math.floor(games * p))];
    const show = (m) => (Number.isFinite(m) ? m : `>${cap}`);
    return { strategy: name, wins: `${wins}/${games}`, p10: show(at(0.1)), median: show(at(0.5)), p90: show(at(0.9)) };
  });
}
