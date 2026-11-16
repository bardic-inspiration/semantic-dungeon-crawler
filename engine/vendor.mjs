// Bundles the pinned `core` rules engine (TypeScript source, installed from
// git) into plain ES modules the engine can import. Runs on `npm install`.
//
//   vendor/core.mjs           core as it is. Used in Node: by the build, the
//                             simulator, and the tests.
//   vendor/core.browser.mjs   core without its schema checker, which builds
//                             validators with `new Function` and so cannot
//                             run under a strict content security policy.
//                             The build checks every document with the full
//                             core before it ships a page, so the browser
//                             only ever sees documents that already passed.
//   vendor/kit.json           core's pattern kit, as plain data.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const core = join(here, "..", "node_modules", "rpg-core");
const common = {
  entryPoints: [join(core, "src", "index.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2022",
  logLevel: "warning",
};

await build({ ...common, outfile: join(here, "vendor", "core.mjs") });
await build({
  ...common,
  outfile: join(here, "vendor", "core.browser.mjs"),
  plugins: [{
    name: "no-schema-checker",
    setup(b) {
      b.onResolve({ filter: /^ajv$/ }, () => ({ path: "ajv", namespace: "trusting" }));
      b.onLoad({ filter: /.*/, namespace: "trusting" }, () => ({
        contents: "export class Ajv { compile() { const pass = () => true; pass.errors = null; return pass; } }",
      }));
    },
  }],
});

const kit = parse(await readFile(join(core, "kit", "patterns.yaml"), "utf8"));
await writeFile(join(here, "vendor", "kit.json"), JSON.stringify(kit));
