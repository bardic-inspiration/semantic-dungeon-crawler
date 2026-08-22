// packages/corpus-builder/src/sources/filesystem.ts
//
// A trivial local-directory reader backing the `--input <dir>` argument of the
// CLI signature SPEC §6.3 fixes: `corpus-builder build --input <dir> --output
// graph.json`. The spec names that argument but does not specify how a directory
// becomes documents, so the behavior below (one `*.txt` file per document,
// filename as `source_id`, sorted for INV-2) is an engine choice, not a spec
// quotation.
//
// It is NOT a full `CorpusSource` adapter (non-Gutenberg adapters are out of
// scope this phase, §6.3.1) — it is the developer/test path that feeds raw text
// files straight into the pipeline without any network.

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ResolvedDocument } from "./types";

/** Read every `*.txt` file in `dir` as a document, sorted by filename (INV-2). */
export async function readDirectoryCorpus(
  dir: string,
): Promise<ResolvedDocument[]> {
  const names = (await readdir(dir))
    .filter((n) => n.toLowerCase().endsWith(".txt"))
    .sort();

  const docs: ResolvedDocument[] = [];
  for (const name of names) {
    const raw = await readFile(join(dir, name), "utf8");
    docs.push({
      source_id: `file:${basename(name)}`,
      title: basename(name),
      raw_text: raw,
      metadata: { path: join(dir, name) },
    });
  }
  return docs;
}
