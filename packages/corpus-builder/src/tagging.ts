// packages/corpus-builder/src/tagging.ts
//
// SPEC §6.3 (tagging step) / §0.10.0 B4 — the `Tagger` stage. The DEFAULT is a
// DETERMINISTIC, OFFLINE, MODEL-FREE LEXICON (keyword/regex → tag path + default
// `archetype`), shipped with a starter lexicon that also SEEDS `tag-registry.yaml`
// (§3.6.2). Same input ⇒ identical tags/registry. Model-based taggers are
// permitted ONLY under pin+cache+substrate_version discipline and are NOT the
// default (§0.10.0 B4). Tags are well-formed §3.6 paths; the engine never
// taste-polices which tags an author later cares about (INV-4).

import type { Archetype } from "schema";

export interface TagResult {
  tags: string[]; // structured §3.6 tag paths (sorted, deduped) — may be empty (orphan span)
  archetype: Archetype; // default archetype for the span (§3.4 A13)
}

/** A pinned tagger. `id` feeds `substrate_version`. */
export interface Tagger {
  readonly id: string;
  tag(text: string, metadata?: Record<string, unknown>): TagResult;
}

interface LexiconRule {
  pattern: RegExp;
  tags: string[];
  archetype?: Archetype;
}

/**
 * Starter lexicon — register-varied to exercise the design-note-0002 corpus
 * (narrative / poetic / expository). Rules are matched in order; every matching
 * rule contributes its tags, and the FIRST matching rule with an `archetype`
 * sets the span's default archetype. Purely lexical and deterministic.
 */
const STARTER_LEXICON: LexiconRule[] = [
  {
    pattern:
      /\b(forest|wood|woods|tree|trees|river|mountain|valley|garden|sea|shore|field|meadow|sky)\b/i,
    tags: ["environment:nature"],
    archetype: "container",
  },
  {
    pattern:
      /\b(room|hall|door|house|chamber|castle|cellar|street|city|town|village|corridor|gate)\b/i,
    tags: ["environment:built"],
    archetype: "container",
  },
  {
    pattern:
      /\b(said|asked|replied|cried|whispered|shouted|answered|exclaimed)\b/i,
    tags: ["discourse:dialogue"],
    archetype: "actor",
  },
  {
    pattern:
      /\b(king|queen|man|woman|girl|boy|child|creature|rabbit|cat|soldier|doctor|stranger)\b/i,
    tags: ["being:character"],
    archetype: "actor",
  },
  {
    pattern:
      /\b(book|letter|paper|sign|inscription|page|note|manuscript|scroll|map)\b/i,
    tags: ["object:text"],
    archetype: "readable",
  },
  {
    pattern:
      /\b(gold|coin|coins|price|prices|market|markets|trade|labour|labor|capital|wealth|value|money)\b/i,
    tags: ["concept:economics"],
    archetype: "prop",
  },
  {
    pattern:
      /\b(species|natural|selection|organism|variation|evolution|nature|experiment|observation)\b/i,
    tags: ["concept:science"],
    archetype: "prop",
  },
  {
    pattern:
      /\b(soul|heart|dream|love|death|light|darkness|eternal|silence|memory)\b/i,
    tags: ["register:poetic"],
  },
];

/**
 * The named engine-default archetype (#107). `docs/design/0004:174-175` specifies
 * only "fallback to a base archetype"; this makes that base a NAMED, exported
 * default rather than a private const, so it is documented rather than a silent
 * substitution. Every span the lexicon leaves untagged resolves to `"prop"` — the
 * most neutral archetype (an inert object, §3.1). B4 owns assigning this string;
 * A13 owns what it means at resolution (a clean producer/consumer split), and a
 * ruleset's interpretation lookup can still reinterpret a `prop` at runtime.
 */
export const DEFAULT_ARCHETYPE: Archetype = "prop";

export class LexiconTagger implements Tagger {
  readonly id = "lexicon-v1";
  private readonly rules: LexiconRule[];

  constructor(rules: LexiconRule[] = STARTER_LEXICON) {
    this.rules = rules;
  }

  tag(text: string): TagResult {
    const tags = new Set<string>();
    let archetype: Archetype | null = null;
    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        for (const t of rule.tags) tags.add(t);
        if (archetype === null && rule.archetype) archetype = rule.archetype;
      }
    }
    return {
      tags: [...tags].sort(), // sorted ⇒ deterministic ordering (INV-2)
      archetype: archetype ?? DEFAULT_ARCHETYPE,
    };
  }
}

export const defaultTagger = new LexiconTagger();
