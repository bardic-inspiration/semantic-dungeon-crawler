# CLAUDE.md

This repo is **Throughline**, a small browser card game. See
[`README.md`](README.md) for how it works and how to build it. The earlier
engine, spec and phase process were removed; they are in git history only.

## Layout

- `src/engine.js` — the rules. Pure and deterministic; no DOM.
- `src/game.html` — the page and its UI code.
- `tools/build.mjs` — downloads the books, cuts and embeds the cards, and
  writes the self-contained `index.html` (committed, so the game is playable
  without building).
- `tools/sim.mjs` — plays simulated games, for tuning the scoring constants.
- `test/` — `npm test`.

After changing `src/`, run `npm run build -- --page` to regenerate
`index.html`, and `npm test`. After changing scoring constants, run
`npm run sim` and check careful play still wins in about ten moves while
random play mostly does not.

## Asking questions

- When you need to ask the user a question, ask **one question at a time**,
  through regular chat, with a few suggested options they can pick from or
  riff on.
- **Never** use the app's multiple-choice/question-picker widgets — always
  ask in plain chat text instead.

## CI watch protocol

- **Never watch.** Do not call `subscribe_pr_activity` on any PR you open.
  Open the PR and end the turn.
