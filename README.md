# Throughline

A browser card game about finding a thread of meaning that runs through nine
old books, and holding on to it.

**Play:** open [`index.html`](index.html) in a browser. It is one
self-contained file with no server and no install.

## How it plays

- The deck is 2,881 short fragments cut from nine Project Gutenberg classics:
  three fantasy, three adventure, three horror.
- Each turn you hold a hand of five cards. Your first card sets the thread.
  After that, play the card that best continues the meaning of your last few
  cards.
- A card that fits raises **harmony**; a card that breaks the thread lowers
  it. Consecutive good cards build a streak that multiplies gains, up to
  double. A bad card ends the streak.
- After every move you see what each card in the hand would have scored.
- Reach 100 harmony in as few moves as you can. Careful play takes about ten.
- Every game is a seed. There is one daily thread, and any thread can be
  shared by its link.

## How it works

Every fragment is embedded once, at build time, with the `all-MiniLM-L6-v2`
sentence model. Related meanings land near each other. The game ships those
vectors, so the browser never runs a model.

- **Where you stand** is the last card you played. Its room is every unplayed
  card, ranked by closeness.
- **Your hand** is one card from each of five distance bands of that room,
  from a near neighbour to something far away, shuffled.
- **Your thread** is a weighted average of your last four cards, the latest
  counting most.
- **A move's score** is the card's similarity to the thread, measured against
  a fixed pivot: above it gains, below it loses.

The rules are in [`src/engine.js`](src/engine.js) and are deterministic: the
same seed and picks always replay the same game.

## The books

| Genre | Book | Author |
|---|---|---|
| Fantasy | The Wonderful Wizard of Oz | L. Frank Baum |
| Fantasy | Phantastes | George MacDonald |
| Fantasy | The King of Elfland's Daughter | Lord Dunsany |
| Adventure | Treasure Island | Robert Louis Stevenson |
| Adventure | King Solomon's Mines | H. Rider Haggard |
| Adventure | Twenty Thousand Leagues under the Sea | Jules Verne |
| Horror | Dracula | Bram Stoker |
| Horror | Frankenstein | Mary Shelley |
| Horror | Carmilla | J. Sheridan Le Fanu |

All texts are from [Project Gutenberg](https://www.gutenberg.org/) and in the
US public domain. Fragments containing proper names are left out, so matching
cards is about meaning rather than spotting a character's name.

## Development

```bash
npm install
```

```bash
npm run build
```

`npm run build` downloads the books and the embedding model (about 90 MB, once),
cuts and embeds the cards, and writes `index.html`. To change the book list,
edit `BOOKS` in [`tools/build.mjs`](tools/build.mjs).

After editing only `src/`, rebuild the page from the cached deck:

```bash
npm run build -- --page
```

```bash
npm test
```

```bash
npm run sim
```

`npm run sim` plays 200 games each with a perfect player, a noisy reader, a
random player and one who just stays in the same book. Use it when changing
the scoring constants at the top of `src/engine.js`.

## History

This repo began as a general engine for semantic-space games (a corpus
pipeline, rule DSL, REST server and two clients). That code was removed in
favour of this one game and remains in git history.

## License

MIT — see [`LICENSE`](LICENSE).
