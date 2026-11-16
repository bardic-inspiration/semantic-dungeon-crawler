#!/usr/bin/env node
// sdc: the engine's command line.
//
//   sdc build <project> [--page]   build the surface and index.html
//                                  (--page: reuse the surface, rebuild the page)
//   sdc sim <project> [--games N]  play simulated games and print the figures
import { buildProject } from "./build.mjs";
import { openProject } from "./project.mjs";
import { simulate } from "./sim.mjs";

const [command, dir, ...flags] = process.argv.slice(2);
const flag = (name) => flags.includes(name);
const option = (name, fallback) => (flags.includes(name) ? Number(flags[flags.indexOf(name) + 1]) : fallback);

if (!dir || !["build", "sim"].includes(command)) {
  console.error("usage: sdc build <project> [--page]\n       sdc sim <project> [--games N]");
  process.exit(2);
}

try {
  if (command === "build") {
    await buildProject(dir, { pageOnly: flag("--page") });
  } else {
    const { game } = await openProject(dir);
    console.table(simulate(game, { games: option("--games", 60) }));
  }
} catch (error) {
  // Core lists every reason a ruleset was refused.
  console.error(error.message);
  for (const issue of error.issues ?? []) console.error(`  ${issue.path}: ${issue.message}`);
  process.exit(1);
}
