// Plays a ruleset on a surface. This is the whole runtime: core compiles the
// rules and runs the match, and the surface answers core's questions about
// space (host.mjs). Nothing here touches Node, so it runs in a browser as is.
//
//   const game = openGame({ kit, base, extensions, scenario, surface });
//   const session = game.start("any seed");
//   session.view();    // { hand, worth, trail, moved, meter, streak, ended }
//   session.play(2);   // play the third passage in the hand
//
// A session is a pure function of the seed and the picks made, so
// `game.start(seed, picks)` rebuilds any earlier position.
import * as core from "./vendor/core.mjs";
import { surfaceHost, surfaceMap } from "./host.mjs";

export { core };

export function openGame({ kit, base, extensions = [], scenario, surface }) {
  const registry = core.compile({ kit, base, extensions });
  const mapId = scenario.map ?? "surface";
  const loaded = core.loadScenario(registry, { ...scenario, map: mapId }, {
    maps: { [mapId]: surfaceMap(surface, scenario.ruleset, mapId) },
    host: surfaceHost(surface),
  });
  const table = (name) => core.compileExpression(registry, `tables.${name}`).evaluate(core.emptyState(), loaded);

  return {
    registry,
    scenario: loaded,
    surface,
    /** A table of the compiled ruleset, as plain data. */
    table,
    start(seed, picks = []) {
      const match = new core.Match(registry, loaded, seed);
      let decision = match.advance();
      const session = {
        match,
        seed,
        picks: [],
        /** The state as the interface needs it. Passages are indexes into the surface. */
        view() {
          const game = match.state.game;
          const cells = (list) => (list ?? []).map((cell) => cell.x);
          return {
            hand: cells(game.hand),
            worth: [...(game.worth ?? [])],
            trail: cells(game.trail),
            moved: [...(game.moved ?? [])],
            meter: game.meter ?? 0,
            streak: game.streak ?? 0,
            ended: match.state.ended,
          };
        },
        /** Plays the passage at `slot` in the hand. */
        play(slot) {
          if (!decision) throw new Error("the match has ended");
          const index = decision.options.findIndex((o) => o.intent === "play" && o.params.slot === slot);
          if (index < 0) throw new Error(`no passage at slot ${slot}`);
          match.submit(index);
          session.picks.push(slot);
          decision = match.advance();
        },
      };
      for (const slot of picks) {
        if (!decision) break;
        session.play(slot);
      }
      return session;
    },
  };
}
