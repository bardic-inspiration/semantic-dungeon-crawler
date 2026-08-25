# Decision Record 0006 — Overlay Registry Layering & Primitive Attribution

`status: accepted`
`issue: #109, #110, #113`
`milestone: Conformance Audit 1`

Conformance Audit 1 found the Tier-3 overlay (§3.7) fully *typed* but unwired:
nothing executed the six primitives, nothing wrote an `AddressRegistryEntry` or
`LinkRecord`, and `GET /session/{id}/registry` could only return `[]`. Wiring it
forced two questions §3.8/§3.7.4 left genuinely ambiguous. This record fixes the
answers; `SPEC.md` §3.7/§3.8 and `packages/schema` implement them.

## D1 — Where do per-turn `author_runtime` registry writes live?

`Provenance` has three values (`build` / `author_runtime` / `player`), but §3.8
described only two homes and called the base "build- **and author_runtime**-
provenance ... shared per-world and immutable during play." That cannot be
literally true: issue #109 makes author rules invoke primitives *in the commit
phase of each interaction* (A5), so an `author_runtime` write is per-session and
mutable during play — it depends on where the player went.

**Decision — two layers, one provenance-tagged per-session overlay.**

- A shared per-world **base** holds `build`-provenance entries only. It is
  immutable during play.
- The **per-session overlay** — `SessionState.registry` / `links`, unchanged in
  shape — holds *every* write a session makes: `author_runtime` (a rule fired a
  primitive) and `player` (an exposed player invocation), distinguished by the
  `provenance` field already on each entry.
- A read is `effectiveRegistry(base, overlay)` — last-write-wins by tag, the
  overlay winning a collision (`packages/rule-engine/src/registry.ts`). The §5.1
  client view filters that to `player` (INV-3).

Rejected: a *third* explicit `SessionState.author_runtime` field. The
`provenance` field already carries the distinction the client filter needs, so a
second array is redundant state and a wider `SessionState`. The schema field
comments and §3.8's prose are corrected to say "per-session overlay, both
provenances," which is the only spec change here (types unchanged, so no
`spec-version` bump — `SessionState` is server-internal, INV-3).

## D2 — What populates the `build` base?

**Decision — nothing yet; the base is empty for alpha.** The registry is an
*emergent* container: the engine's default configuration produces one through
play (authored rules, and exposed player primitives), not by seeding contrived
values. The merge machinery is real and tested against a `build` base, so a real
source (a ruleset field, or a `graph.json` registry section) drops in later as
its own issue. Neither of the four audit issues asks for a build-time registry
format, so inventing one now would be scope drift.

## D3 — Player vs. rule attribution, and how a primitive replays

A `{kind:"primitive"}` effect only ever fires *from an author rule* (that is the
only place effects exist), so "player invocation" and "rule invocation" are not
distinguishable at the effect level. A10 resolves it: a **player** invocation is
one the ruleset *exposes* to the player.

**Decision — attribution is an exposure lookup, applied as promotion.** A fired
primitive is a `player` write **and** appends a `{kind:"primitive"}` input-log
entry (§3.9) iff `primitive_exposure` exposes it to the player (`exposure ∈
{player, both}`) and its optional §4.2 `when` predicate holds against the state
the commit evaluated. Otherwise — `author_only`, no exposure entry, or a `when`
that fails — it is an `author_runtime` write and is **not** logged. Gating
validates well-formedness only; a malformed `when` fails closed and is surfaced
through the §2.1 `Logger`, never thrown (INV-4).

**Replay (INV-2).** A player primitive rides in on the `interact`
(`{object_id, affordance}`) for its turn — there is no primitive endpoint (A10).
Re-POSTing that interact re-fires the rule and re-executes the primitive, so the
registry/link writes re-derive deterministically; the `{kind:"primitive"}` entry
is an explicit *record* for diffing, not a separately replayable action. The
§3.9 replay procedure therefore re-POSTs `interact` entries and skips the
`primitive` records (which re-accumulate identically). This is why a rule-driven
write need not be logged at all: it re-derives from the same interacts.

## D4 — Snapshot staleness (confirms §3.7.3 / DR-0001 D3)

The live `substrate_version` is read from the `graph.json` header at load and
threaded to runtime (`SubstrateConfig.substrate_version`). `stale` is derived by
comparison (`isSnapshotStale`) and surfaced through the `Logger` at registry-read
time; a stale snapshot's `resolved_payload` is returned unchanged — no
auto-invalidate, no auto-refresh, no rejection (INV-2/INV-4). Because the
substrate is server-wide startup config (A12) it cannot change within a run, so a
snapshot written this run is never stale this run; staleness only appears for a
snapshot carried across a rebuild, which is a restart. Re-resolution is an
explicit `Snapshot` primitive call, which always binds the live version and
leaves the old frozen payload untouched.
