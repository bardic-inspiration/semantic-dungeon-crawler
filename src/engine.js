// Throughline — game rules. Pure and deterministic: a game is fully described
// by (deck, seed, picks), so it can be replayed, shared and simulated.
// Loaded as a classic script in the browser and imported for its side effect
// in Node; either way it defines `globalThis.Throughline`.
(() => {
  const HAND_SIZE = 5;
  const GOAL = 100;
  // How much each of the last few played cards counts toward the thread.
  const THREAD_WEIGHTS = [1, 0.6, 0.36, 0.2];
  // Similarity to the thread at which a move scores zero, and points per unit
  // of similarity above or below it. Tuned with tools/sim.mjs.
  const PIVOT = 0.42;
  const GAIN = 60;
  const STREAK_STEP = 0.25;
  const STREAK_CAP = 4;
  const MAX_GAIN = 20;
  const MAX_LOSS = -20;
  // The hand is one card from each band of the room, ranked by closeness to
  // where the player stands: a near neighbour, then progressively farther.
  const BANDS = [
    [0, 5],
    [5, 20],
    [20, 80],
    [80, 400],
    [400, Infinity],
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // deck: { cards: [{ t, b }], dim, vectors: Int8Array (n * dim) }
  function prepareDeck(deck) {
    const n = deck.cards.length;
    const { dim, vectors } = deck;
    const norms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let d = 0, o = i * dim; d < dim; d++) s += vectors[o + d] * vectors[o + d];
      norms[i] = Math.sqrt(s) || 1;
    }
    return { ...deck, n, norms };
  }

  function threadVector(deck, played) {
    const { dim, vectors, norms } = deck;
    const v = new Float32Array(dim);
    for (let k = 0; k < THREAD_WEIGHTS.length && k < played.length; k++) {
      const card = played[played.length - 1 - k];
      const w = THREAD_WEIGHTS[k] / norms[card];
      for (let d = 0, o = card * dim; d < dim; d++) v[d] += w * vectors[o + d];
    }
    let s = 0;
    for (let d = 0; d < dim; d++) s += v[d] * v[d];
    s = Math.sqrt(s) || 1;
    for (let d = 0; d < dim; d++) v[d] /= s;
    return v;
  }

  function similarity(deck, card, unit) {
    const { dim, vectors, norms } = deck;
    let s = 0;
    for (let d = 0, o = card * dim; d < dim; d++) s += vectors[o + d] * unit[d];
    return s / norms[card];
  }

  function cardUnit(deck, card) {
    const { dim, vectors, norms } = deck;
    const v = new Float32Array(dim);
    for (let d = 0, o = card * dim; d < dim; d++) v[d] = vectors[o + d] / norms[card];
    return v;
  }

  function newGame(deck, seed) {
    const state = {
      deck,
      seed: seed >>> 0,
      rand: mulberry32(seed),
      played: [],
      deltas: [],
      used: new Uint8Array(deck.n),
      harmony: 0,
      streak: 0,
      hand: [],
      won: false,
    };
    deal(state);
    return state;
  }

  function deal(state) {
    const { deck, rand, used, played } = state;
    const hand = [];
    if (played.length === 0) {
      // Opening hand: five cards from five different books.
      const books = new Set();
      while (hand.length < HAND_SIZE) {
        const c = Math.floor(rand() * deck.n);
        const b = deck.cards[c].b;
        if (books.has(b) || hand.includes(c)) continue;
        books.add(b);
        hand.push(c);
      }
    } else {
      const here = cardUnit(deck, played[played.length - 1]);
      const ranked = [];
      for (let c = 0; c < deck.n; c++) {
        if (!used[c]) ranked.push([similarity(deck, c, here), c]);
      }
      ranked.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      for (const [lo, hi] of BANDS) {
        const end = Math.min(hi, ranked.length);
        const start = Math.min(lo, end - 1);
        let pick;
        do {
          pick = ranked[start + Math.floor(rand() * (end - start))][1];
        } while (hand.includes(pick));
        hand.push(pick);
      }
      // Shuffle so position says nothing about closeness.
      for (let i = hand.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [hand[i], hand[j]] = [hand[j], hand[i]];
      }
    }
    for (const c of hand) used[c] = 1;
    state.hand = hand;
  }

  // What each card in the current hand would do to the meter.
  function scoreHand(state) {
    if (state.played.length === 0) return state.hand.map(() => ({ sim: 0, delta: 0 }));
    const thread = threadVector(state.deck, state.played);
    const boost = 1 + STREAK_STEP * Math.min(state.streak, STREAK_CAP);
    return state.hand.map((c) => {
      const sim = similarity(state.deck, c, thread);
      let raw = (sim - PIVOT) * GAIN;
      if (raw > 0) raw *= boost;
      const delta = Math.round(Math.max(MAX_LOSS, Math.min(MAX_GAIN, raw)));
      return { sim, delta };
    });
  }

  // Play the card at `index` in the hand. Returns what happened, including the
  // scores of the cards left behind.
  function play(state, index) {
    if (state.won) throw new Error("game is over");
    const hand = state.hand.slice();
    const scores = scoreHand(state);
    const card = hand[index];
    if (card === undefined) throw new Error("no such card in hand");
    const { delta } = scores[index];
    const first = state.played.length === 0;
    state.played.push(card);
    state.deltas.push(delta);
    if (!first) state.streak = delta > 0 ? state.streak + 1 : 0;
    state.harmony = Math.max(0, Math.min(GOAL, state.harmony + delta));
    state.won = state.harmony >= GOAL;
    if (!state.won) deal(state);
    return { card, delta, hand, scores, first };
  }

  globalThis.Throughline = {
    HAND_SIZE,
    GOAL,
    STREAK_CAP,
    mulberry32,
    hashSeed,
    prepareDeck,
    newGame,
    scoreHand,
    play,
  };
})();
