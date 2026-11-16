# CLAUDE.md

This repo is an engine for games played on embedding surfaces, with
**Throughline** as the included game. Read [`README.md`](README.md) first: it
describes every part and how a project configures them.

## Layout

- `engine/` — the generic engine. No game-specific code belongs here.
  - `corpus.mjs`, `embed.mjs`, `surface.mjs` — the pipeline that builds a surface.
  - `host.mjs` — the surface as a core map.
  - `game.mjs` — compiles a ruleset with core and plays it. Must stay free of
    Node imports: it runs in the browser.
  - `rulesets/<base>/` — base rulesets, in core's format.
  - `interface/<template>.html|.js` — interface templates.
  - `build.mjs`, `sim.mjs`, `cli.mjs`, `project.mjs` — the build and tools.
  - `vendor/` — the bundled core, written by `npm install`. Not committed.
- `projects/throughline/` — the game: config, extension, scenario, and the
  built `surface.json` and `index.html` (both committed).
- `test/` — `npm test`. Engine tests use a generated toy project; Throughline's
  use its committed surface.

Rules are data in [core](https://github.com/bardic-inspiration/core)'s format.
When a rule cannot be written in it, say so rather than adding code to a
ruleset's host or interface. Core's format is in
`node_modules/rpg-core/docs/format.md`.

## After a change

- Rules or interface: `npm run build -- projects/throughline --page`, then
  `npm test`. The tests check the committed page matches the project.
- Throughline's tables: also `npm run sim -- projects/throughline`. Careful
  play (`best`) should win in about eleven moves; `random` should not win.
- Corpus or embeddings config: a full `npm run build -- projects/throughline`.

## Asking questions

- When you need to ask the user a question, ask **one question at a time**,
  through regular chat, with a few suggested options they can pick from or
  riff on.
- **Never** use the app's multiple-choice/question-picker widgets — always
  ask in plain chat text instead.

## CI watch protocol

- **Never watch.** Do not call `subscribe_pr_activity` on any PR you open.
  Open the PR and end the turn.
