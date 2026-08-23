import { describe, expect, it } from "vitest";
import { isWellFormedTag } from "schema";
import { DEFAULT_ARCHETYPE, LexiconTagger } from "./tagging";

const tagger = new LexiconTagger();

describe("LexiconTagger", () => {
  it("assigns tags and an archetype from lexicon rules", () => {
    const result = tagger.tag("They walked into the forest under a grey sky.");
    expect(result.tags).toContain("environment:nature");
    expect(result.archetype).toBe("container");
  });

  it("is deterministic and returns sorted, deduped tags", () => {
    const a = tagger.tag("The king said the market prices for gold were high.");
    const b = tagger.tag("The king said the market prices for gold were high.");
    expect(a).toEqual(b);
    expect([...a.tags]).toEqual([...a.tags].sort());
    expect(new Set(a.tags).size).toBe(a.tags.length);
  });

  it("produces only well-formed §3.6 tag paths", () => {
    const result = tagger.tag(
      "A doctor read the letter about the species of coin.",
    );
    for (const tag of result.tags) expect(isWellFormedTag(tag)).toBe(true);
  });

  it("returns an empty tag set (orphan span) but still a default archetype", () => {
    const result = tagger.tag("zzz qqq xxx");
    expect(result.tags).toEqual([]);
    expect(result.archetype).toBe("prop");
  });

  it("falls back to the named DEFAULT_ARCHETYPE for an untagged span (#107)", () => {
    // The fallback is a named, exported engine default, not a private const.
    expect(DEFAULT_ARCHETYPE).toBe("prop");
    expect(tagger.tag("zzz qqq xxx").archetype).toBe(DEFAULT_ARCHETYPE);
  });

  it("exposes a pinned identity for substrate_version", () => {
    expect(tagger.id).toBe("lexicon-v1");
  });
});
