// Throughline: follow a thread of meaning through nine old books.
// This file is the whole configuration of the engine for this game.
export default {
  id: "throughline",

  corpus: {
    sources: [
      { gutenberg: 55, title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", group: "fantasy" },
      { gutenberg: 325, title: "Phantastes", author: "George MacDonald", group: "fantasy" },
      { gutenberg: 61077, title: "The King of Elfland's Daughter", author: "Lord Dunsany", group: "fantasy" },
      { gutenberg: 120, title: "Treasure Island", author: "Robert Louis Stevenson", group: "adventure" },
      { gutenberg: 2166, title: "King Solomon's Mines", author: "H. Rider Haggard", group: "adventure" },
      { gutenberg: 164, title: "Twenty Thousand Leagues under the Sea", author: "Jules Verne", group: "adventure" },
      { gutenberg: 345, title: "Dracula", author: "Bram Stoker", group: "horror" },
      { gutenberg: 84, title: "Frankenstein", author: "Mary Shelley", group: "horror" },
      { gutenberg: 10007, title: "Carmilla", author: "J. Sheridan Le Fanu", group: "horror" },
    ],
    passages: { minWords: 5, maxWords: 12, perSource: 340, seed: 1897 },
  },

  embeddings: { provider: "minilm" },

  rules: {
    base: "hand",
    extensions: ["ruleset.yaml"],
    scenario: "scenario.yaml",
  },

  interface: {
    template: "hand",
    title: "Throughline",
    fonts: "https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;500;700&family=IM+Fell+English:ital@0;1&display=swap",
    theme: {
      ink: "#15121d",
      "ink-raised": "#1f1b2b",
      "ink-sunk": "#100e17",
      line: "#373149",
      bone: "#ebe4d3",
      dim: "#a199b0",
      accent: "#dcaa4c",
      up: "#b7d68c",
      down: "#e68372",
      display: '"IM Fell English", "Iowan Old Style", Georgia, serif',
      ui: '"Alegreya Sans", "Segoe UI", system-ui, sans-serif',
    },
    groups: {
      fantasy: { label: "Fantasy", color: "#86c08c" },
      adventure: { label: "Adventure", color: "#62b6cd" },
      horror: { label: "Horror", color: "#d9686a" },
    },
    copy: {
      tagline: "Find a thread of meaning running through nine old books, and hold it.",
      meter: "Harmony",
      unit: "harmony",
      trail: "Your thread",
      empty: "Nothing yet. Your first card decides what the thread is about.",
      promptStart: "Choose any card to begin. It sets what your thread is about.",
      promptPlay: "Play the card that best continues your thread.",
      afterFirst: "That is your thread. Now follow it.",
      verdicts: { great: "Resonant.", good: "In tune.", flat: "Flat.", bad: "Discord." },
      winTitle: "Harmony in {moves} moves",
      par: "Careful play takes about eleven.",
      played: "Here is what you wrote on the way:",
      best: "Your best on this thread is {best}.",
      newBest: "A new best on this thread, down from {best}.",
      daily: "Today's thread",
      fresh: "New thread",
      retry: "Retry this thread",
      seedNamed: "Thread",
      rulesTitle: "How scoring works",
      rules: [
        "Each card is a fragment from one of nine classic fantasy, adventure and horror novels. Every turn you are dealt five, drawn from near and far of where you stand. Play the one that best continues the meaning of your last few cards. The latest card counts most.",
        "A card that fits the thread raises harmony; one that breaks it lowers harmony. Consecutive good cards build a streak that multiplies gains up to double, and a bad card ends it. After each move you see what every card in the hand would have scored. Reach 100 in as few moves as you can.",
        "Keys 1 to 5 play a card.",
      ],
    },
  },
};
