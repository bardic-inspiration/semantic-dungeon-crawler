// A small project built in a temporary directory: four themed sources of
// generated sentences, the hashing embedder, and a three-card hand. It runs
// the whole pipeline with no network and no model.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mulberry32 } from "../engine/random.mjs";
import { buildSurface, loadProject } from "../engine/project.mjs";
import { openGame } from "../engine/game.mjs";
import { openSurface } from "../engine/surface.mjs";

const THEMES = {
  sea: ["waves", "harbour", "sailors", "anchor", "tide", "storm", "ships", "salt"],
  forest: ["branches", "moss", "roots", "foxes", "leaves", "shadows", "ferns", "owls"],
  fire: ["embers", "smoke", "flames", "ashes", "sparks", "furnace", "cinders", "torches"],
  night: ["stars", "moonlight", "silence", "dreams", "lanterns", "midnight", "darkness", "sleepers"],
};
const VERBS = ["gathered", "drifted", "trembled", "waited", "scattered", "lingered", "shimmered", "vanished"];
const PLACES = ["beneath", "beside", "beyond", "among", "above", "against"];

export function toyText(theme, sentences = 80, seed = 1) {
  const rand = mulberry32(seed);
  const words = THEMES[theme];
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const out = [];
  for (let i = 0; i < sentences; i++) {
    out.push(`the ${pick(words)} ${pick(VERBS)} ${pick(PLACES)} the ${pick(words)} and the ${pick(words)}.`);
  }
  return out.join(" ");
}

export const TOY_EXTENSION = `
format: 2
extension: { id: toy, version: 0.1.0 }
extends: { id: sdc-hand, version: 0.1.0 }
tables:
  bands: [[0, 4], [4, 20], [20, 100000]]
  weights: [100, 50]
  goal: 40
  pivot: 300
`;

export const TOY_SCENARIO = `
format: 2
scenario: { id: toy }
ruleset: { id: sdc-hand, version: 0.1.0 }
seats: { player: {} }
map: surface
end:
  - when: "game.meter >= tables.goal"
    outcome: { result: "'win'", moves: "game.trail.size()" }
limits: { maxDecisions: 200 }
`;

/** Writes the toy project to a new temporary directory and returns the path. */
export async function writeToyProject({ extension = TOY_EXTENSION } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sdc-toy-"));
  await mkdir(join(dir, "texts"));
  const themes = Object.keys(THEMES);
  for (const [i, theme] of themes.entries()) await writeFile(join(dir, "texts", `${theme}.txt`), toyText(theme, 80, i + 1));
  await writeFile(join(dir, "ruleset.yaml"), extension);
  await writeFile(join(dir, "scenario.yaml"), TOY_SCENARIO);
  await writeFile(
    join(dir, "project.mjs"),
    `export default ${JSON.stringify({
      id: "toy",
      corpus: {
        sources: themes.map((theme) => ({ file: `texts/${theme}.txt`, title: theme, group: theme })),
        passages: { perSource: 40, seed: 3 },
      },
      embeddings: { provider: "hashing", dim: 48 },
      rules: { base: "hand", extensions: ["ruleset.yaml"], scenario: "scenario.yaml" },
      interface: { template: "hand", title: "Toy <game>" },
    })};\n`,
  );
  return dir;
}

/** The toy project, built and opened as a game. */
export async function toyGame(options) {
  const dir = await writeToyProject(options);
  const project = await loadProject(dir);
  const surface = openSurface(await buildSurface(project));
  return { dir, project, surface, game: openGame({ ...project.docs, surface }) };
}
