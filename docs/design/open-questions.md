# Open Questions — Iterative Refinement of `SPEC.md`

`status: open`
`spec-version reviewed: 0.13.2`

Questions flagged explicitly rather than silently decided, for resolution during
or after alpha. [`SPEC.md`](../../SPEC.md) §7 points here so the contract itself
holds settled decisions, not deferred ones. Resolving one means amending
`SPEC.md` per [`spec-guidelines.md`](../spec-guidelines.md); the answer then
becomes contract, is recorded in [`spec-changelog.md`](../spec-changelog.md), and
is struck from this list. (Sibling to the now-closed
[`open-scope.md`](open-scope.md) survey of originally under-defined areas.)

- **Latency/perceived responsiveness**: request/response movement (SPEC §5.1) was
  accepted knowingly given turn-based pacing; revisit if alpha playtesting shows
  it feels laggy rather than deliberate. **§0.11.0 (C1):** the move-resolution
  budget this is measured against is now on the record — p95 < ~200 ms
  server-side (SPEC §4.4, §6.7).
- **Tagging quality**: Phase 2's heuristic auto-tagging is an alpha stand-in using
  the structured tag grammar (SPEC §3.6). The tag registry (§3.6.2) and
  configurable modifier registry (§3.6.1) provide the machinery for author-refined
  tagging; what does the refinement *tooling* look like? (Likely a Phase 7+
  concern, possibly folded into the rule editor. See
  [`tag-system-design.md`](../tag-system-design.md) for the full design
  rationale.)
- **`graph.json` scale limits**: no sharding/pagination strategy is specified for
  very large corpora. Fine for alpha-scale corpora; needs design work before
  "production" means more than "alpha." **§0.11.0 (C1):** "alpha-scale" is now a
  number — ~10–50 documents / low-thousands of spans — and that is the threshold
  past which the deferred ANN index (B2) and sharding become due (SPEC §4.4,
  §6.7).
- **Substrate re-approximation tolerance** (§0.8.0, decision D5): the
  `substrate.reapproximation_tolerance` parameter — "how similar is similar
  enough" for two re-approximations of the same query to count as "the same kind
  of place" — is an empirical/tunable value, deliberately not fixed at the
  design-doc level. Tune it against a real corpus in Phase 6. See
  [`0001-three-tier-data-model.md`](0001-three-tier-data-model.md).
