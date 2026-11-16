// Builds a project into one self-contained index.html: the surface, the
// rules documents, core, the runtime, and the interface, with no server.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { openGame } from "./game.mjs";
import { buildSurface, loadProject, readSurface } from "./project.mjs";
import { openSurface } from "./surface.mjs";

const ENGINE = dirname(fileURLToPath(import.meta.url));
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// JSON placed inside a <script>: nothing in it may close the tag.
const inlineJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * Builds the project in `dir`. With `pageOnly`, the surface from the last
 * full build is reused, so no texts or model are needed.
 */
export async function buildProject(dir, { pageOnly = false, log = console.log } = {}) {
  const project = await loadProject(dir);
  const packed = pageOnly ? await readSurface(project) : await buildSurface(project, { log });

  // Fail here, with core's reasons, rather than in the player's browser.
  openGame({ ...project.docs, surface: openSurface(packed) });

  const ui = project.config.interface ?? {};
  const template = ui.template ?? "hand";
  const templateDir = join(ENGINE, "interface");
  if (!existsSync(join(templateDir, `${template}.html`))) {
    throw new Error(`build: no interface template "${template}" in engine/interface`);
  }
  const html = await readFile(join(templateDir, `${template}.html`), "utf8");
  const bundle = await build({
    entryPoints: [join(templateDir, `${template}.js`)],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    logLevel: "warning",
    // The page gets core without its schema checker (see vendor.mjs): every
    // document it will load was checked just above.
    plugins: [{
      name: "browser-core",
      setup(b) {
        b.onResolve({ filter: /vendor\/core\.mjs$/ }, () => ({ path: join(ENGINE, "vendor", "core.browser.mjs") }));
      },
    }],
  });
  const app = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

  const theme = Object.entries(ui.theme ?? {})
    .map(([name, value]) => `--${name}: ${value};`)
    .join(" ");
  const head = [
    `<title>${escapeHtml(ui.title ?? project.config.id)}</title>`,
    ui.fonts ? `<link rel="stylesheet" href="${escapeHtml(ui.fonts)}">` : "",
  ].join("\n");
  const data = { id: project.config.id, interface: ui, docs: project.docs, surface: packed };

  const content = html
    .replace("<!--SDC:HEAD-->", () => head)
    .replace("/*SDC:THEME*/", () => (theme ? `:root { ${theme} }` : ""))
    .replace("/*SDC:DATA*/", () => `window.SDC = ${inlineJson(data)};`)
    .replace("/*SDC:APP*/", () => app);
  const [headHtml, bodyHtml] = content.split("<!--SDC:BODY-->");
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${headHtml}<style>body { margin: 0; }</style>
</head>
<body>${bodyHtml}</body>
</html>
`;
  await writeFile(join(project.dir, "index.html"), page);
  // The same page without the document shell, for hosts that supply their own.
  const cache = join(ENGINE, "..", ".cache");
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, `${project.config.id}.html`), content);
  log(`${project.config.id}: ${packed.passages.length} passages, index.html ${(page.length / 1e6).toFixed(2)} MB`);
  return project;
}
