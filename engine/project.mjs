// A project is a directory that configures the engine into one game:
//
//   project.mjs    the config (default export): corpus, embeddings, rules,
//                  interface. See projects/throughline/project.mjs.
//   *.yaml         the project's ruleset extension and scenario, in core's format.
//   surface.json   the built surface (written by `build`).
//   index.html     the built, self-contained game (written by `build`).
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { cutPassages, readSources } from "./corpus.mjs";
import { embedder } from "./embed.mjs";
import { openGame } from "./game.mjs";
import { openSurface, packSurface } from "./surface.mjs";

const ENGINE = dirname(fileURLToPath(import.meta.url));
const yaml = async (path) => parse(await readFile(path, "utf8"));

/** Reads a project's config and its rules documents. */
export async function loadProject(dir) {
  const root = resolve(dir);
  const configPath = join(root, "project.mjs");
  if (!existsSync(configPath)) throw new Error(`project: no project.mjs in ${root}`);
  const config = (await import(pathToFileURL(configPath).href)).default;
  const rules = config.rules ?? {};
  const basePath = join(ENGINE, "rulesets", rules.base ?? "hand", "ruleset.yaml");
  if (!existsSync(basePath)) throw new Error(`project: no base ruleset "${rules.base}" in engine/rulesets`);
  return {
    dir: root,
    config,
    docs: {
      kit: JSON.parse(await readFile(join(ENGINE, "vendor", "kit.json"), "utf8")),
      base: await yaml(basePath),
      extensions: await Promise.all((rules.extensions ?? []).map((file) => yaml(join(root, file)))),
      scenario: await yaml(join(root, rules.scenario ?? "scenario.yaml")),
    },
  };
}

/** Runs the corpus and embeddings pipeline and writes the project's surface.json. */
export async function buildSurface(project, { log = () => {} } = {}) {
  const { config, dir } = project;
  const sources = config.corpus.sources;
  const texts = await readSources(sources, { cacheDir: join(ENGINE, "..", ".cache"), baseDir: dir });
  const { passages, counts } = cutPassages(texts, config.corpus.passages);
  counts.forEach((c, i) => log(`${sources[i].title ?? `source ${i}`}: ${c.candidates} candidates, kept ${c.kept}`));
  const provider = embedder(config.embeddings);
  log(`embedding ${passages.length} passages with ${provider.id}`);
  const vectors = await provider.embed(passages.map((p) => p.t));
  const packed = packSurface({
    // The surface carries what the project says about each source, not how to fetch it.
    sources: sources.map(({ gutenberg, file, ...shown }) => shown),
    passages,
    vectors,
    embeddings: provider.id,
  });
  await writeFile(join(dir, "surface.json"), JSON.stringify(packed));
  return packed;
}

/** The project's built surface, as stored. */
export async function readSurface(project) {
  const path = join(project.dir, "surface.json");
  if (!existsSync(path)) throw new Error(`project: no surface.json in ${project.dir}; run the build first`);
  return JSON.parse(await readFile(path, "utf8"));
}

/** The project as a playable game: compiles its rules against its surface. */
export async function openProject(dir) {
  const project = await loadProject(dir);
  const surface = openSurface(await readSurface(project));
  return { project, game: openGame({ ...project.docs, surface }) };
}
