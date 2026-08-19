// packages/corpus-builder/src/sources/filesystem.ts
//
// A trivial local-directory reader used by `corpus-builder build --input DIR`
// (SPEC §6.3 "runs the staged pipeline end-to-end over a trivial in-repo input").
// It is NOT a full `CorpusSource` adapter (non-Gutenberg adapters are out of
// scope this phase, §6.3.1) — it is the developer/test path that feeds raw text
// files straight into the pipeline without any network. Each `*.txt` file becomes
// one document whose `source_id` is its filename.

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
