# Design Note 0002 — Default Test Corpus

`status: accepted`
`spec: §6.3.1`
`source: issue #9 (closed — design captured here)`

SPEC §6.3.1 fixes the *shape* of the default test corpus: a checked-in
`fixtures/corpus-manifest.default.json` holding "a small, register-varied set
(narrative, poetic, expository) so clustering/tagging heuristics are exercised
across more than one register."

It does not name the books. This note records the candidate set and the reason
each one is in it, so the selection work is not lost. The spec stays the
contract; this is the rationale behind a fixture the spec requires but does not
enumerate.

## Why register variety

A homogeneous corpus does not stress-test archetype and tag heuristics — every
span looks like every other span, and a tagger that produces one undifferentiated
cluster passes just as well as one that works. The set below deliberately spans
narrative, poetic, and expository registers, and includes two sources that shift
register *internally* so the tagger can be tested on within-document variation,
not only between-document variation.

## Candidate set

All public domain, all available from Project Gutenberg.

| Gutenberg ID | Title | Register | Why it is in the set |
|---|---|---|---|
| 11 | *Alice's Adventures in Wonderland* — Carroll | Narrative, object-dense | Rooms and objects nearly pre-exist in the text; early sanity check for `archetype: container` / `prop` assignment |
| 43 | *The Strange Case of Dr Jekyll and Mr Hyde* — Stevenson | Narrative, tonal split | Clinical→gothic register shift inside one source; tests coherence/decay tagging across that shift |
| 526 | *Heart of Darkness* — Conrad | Narrative, low object-density | Tests population behavior in sparse, atmospheric rooms |
| 12242 | Dickinson, selected poems | Poetic, compressed | Many small units; tests resolution at fine granularity |
| 1322 | *Leaves of Grass* — Whitman | Poetic, repetitive/thematic | Long-form and should cluster tightly; tests similarity thresholds |
| 1228 | *On the Origin of Species* — Darwin | Expository, argumentative | Long-form nonfiction rhythm, distinct from narrative |
| 3300 | *The Wealth of Nations* — Smith | Expository, abstract | Strong contrast against the fiction; candidate for abstract/economic tag paths |
| 1206 | *The Interpretation of Dreams* — Freud (trans. Brill) | Mixed — case study + theory | Tests whether tagging distinguishes registers *within* a single source |

## The IDs are still unverified — an open Exit-criteria gap

They are best-effort from search and **must be verified against
`GET /books?ids=...` before being locked into the fixture** — §6.3.1 already
requires this, because a wrong ID silently pulls the wrong book or none at all.
Verification was not possible when this note was written (the environment's
network policy blocks `gutendex.com`), so treat every ID above as a candidate,
not a fact.

**Re-checked 2026-08-24, still blocked.** `gutendex.com` remains unreachable
from the build environment: `GET https://gutendex.com/books?ids=...` is refused
at the egress layer (`CONNECT` returns `403` — an organization egress-policy
denial, host `gutendex.com:443` `connect_rejected`), not a transient failure.
No verification was possible, and routing around a policy denial is not an
option. Verification is deferred to pre-alpha testing, where the corpus will
first be fetched for real against a live network; a wrong ID surfaces there
harmlessly (the wrong book, or none) rather than corrupting anything earlier in
the build, since every CI test mocks Gutendex. The register roles above are the
selection contract; the IDs remain candidates until that fetch confirms them.

**They were locked into `fixtures/corpus-manifest.default.json` anyway, and
Phase 2 closed over it.** §6.3 Exit requires the manifest be "checked in with
**verified** Gutenberg IDs"; that criterion is outstanding. A conformance audit
of the Phase 0–4 build surfaced it, and it is tracked as its own issue — see the
`Conformance Audit 1` milestone. Until that issue closes, assume the register
variety this note argues for may not actually be present in a build.

## Open questions this set does not answer

The corpus is the de facto test fixture for three unresolved design entries
([`open-scope.md`](open-scope.md)), and choosing books does not resolve any of
them:

- **#28 (B1) — corpus segmentation.** How a book becomes source spans is
  undefined. Poetry and expository prose almost certainly do not want the same
  segmentation, and this set contains both.
- **#31 (B4) — auto-tagging strategy.** There is no specified tagger for these
  registers to exercise.
- **#36 (C4) — semantic quality evaluation.** This set is chosen so that a
  *human* can tell whether tagging worked. Nothing measures it.

If the answer to #28 or #31 makes a register unusable, revisit the set rather
than forcing it.

## Status

Accepted. Phase 2 is complete and `fixtures/corpus-manifest.default.json` is
checked in with this set. What remains outstanding is the ID verification §6.3.1
requires (above) — the selection is settled, its correctness is not yet
confirmed. That verification is blocked by the environment's egress policy
(re-checked 2026-08-24, above) and is deferred to pre-alpha testing's first real
corpus fetch; the §6.3 Exit "verified IDs" criterion stays openly unmet until
then, rather than being closed with a silently-unverified fixture.
