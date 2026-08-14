# Decision Record 0005 — C-series Resolution (operational envelope & process)

`status: accepted`
`spec-amendment: 0.11.0`
`issues: #33–#38 (C1–C6)`
`supersedes: nothing; extends 0001 (three-tier data model), 0003 (A-series), 0004 (B-series)`

The spec-gap survey ([`open-scope.md`](open-scope.md)) filed six **Tier-C**
entries — the **cross-cutting** gaps left once the data model (0001), the
player-facing runtime (0003), and the build-time pipeline (0004) were decided.
Where the A- and B-series answered *what the engine does* and *how the substrate
is built*, the C-series answers the questions that sit **around** the engine: how
big and fast it is expected to be (C1), what the player and the protocol see when
resolution yields nothing (C2), who is trusted (C3), how the project judges
whether a built substrate is any good (C4), how artifacts stay compatible across a
rebuild (C5), and how the design/build queue itself runs (C6).

Read [`0001`](0001-three-tier-data-model.md), [`0003`](0003-a-series-resolution.md),
and [`0004`](0004-b-series-resolution.md) first: this record changes none of their
decisions. It adds the operational and process envelope those models are executed
inside.

---

## The unified model (why these are one decision, not six)

One principle, already load-bearing in the engine, generalizes to decide almost
everything below.

- **`INV-4` generalizes from the ruleset to the whole operational surface.** The
  engine already refuses to taste-police a ruleset — "bad" is legal, surfaced, and
  run, never rejected (0003). The C-series extends exactly that discipline outward:
  a **stuck** player is a valid game state *surfaced*, not a protocol error (C2); a
  **degenerate** corpus is *measured and reported*, not gated at runtime (C4); a
  **stale** cross-artifact reference is *warned*, not auto-invalidated or rejected
  (C5). "Surface, never reject" is the same move `INV-4` and the §3.7.3 snapshot
  staleness story (decision D3) already make; C2/C4/C5 are three more applications
  of it.

- **Numbers are tunable defaults on the record, not enforced ceilings.** C1 is a
  gap precisely because the spec deferred scale without ever naming a scale. The
  fix is to put **alpha-scale reference numbers** on the record — `MAX_ROOM_OBJECTS`
  and a corpus/latency/concurrency budget — framed as Phase-6-tunable defaults, so
  hardening has a bar to check against, without turning any of them into a runtime
  limit the engine polices (which would re-introduce the `INV-4` problem C2 solves).

- **Two omissions become decisions on the record.** C3 (trust model) and C6
  (process queue) are not "surface, don't reject" cases — they are places where the
  *absence* of a stated decision is itself the defect. Both resolve to a plainly
  recorded posture: a **local, single-user, trusted-operator** alpha (C3), and an
  **explicit design-track queue discipline** for the scheduled agents (C6).

Nothing here adds or weakens an invariant. Every decision below operates inside
`INV-1`..`INV-5` as already stated; C2/C4/C5 are, if anything, `INV-4` made
load-bearing in three new places.

---

## C1 (#33) — Alpha-scale reference budget, tunable not enforced

**Decision.** The spec carries **named alpha-scale numbers**, all documented as
Phase-6-tunable **reference defaults**, none of them a runtime-enforced ceiling:

- **`MAX_ROOM_OBJECTS = 12`.** The constant §4.4's `populate` pseudocode multiplies
  by `layout_hint.density` to size a room's `objects[]`. 12 keeps a room legible in
  a 3D scene and a query cheap to resolve; density scales it down per room. It is a
  **sampling target**, not a hard cap the engine rejects past — a ruleset that
  wants denser or sparser rooms tunes `density` and, if it must, this default.
- **Corpus target:** roughly **10–50 source documents / low-thousands of spans**
  for the alpha substrate — the scale §6.3's fixture corpus (~20 documents) and
  §6.7's "small enough to sanity-check by hand" already imply, now stated.
- **Move-resolution latency budget:** **p95 < ~200 ms** server-side per move — well
  inside the request/response pacing §5.1 accepts on turn-based grounds, and the
  number §7's latency open-question is revisited against.
- **Concurrency:** **single-digit concurrent sessions.** Alpha is not a scaling
  target; this is the number C3's session-eviction bound and §7's deferred sharding
  are measured against.

**These are the threshold §7's deferred work becomes due at, not limits.** The ANN
index B2 defers (exact flat k-NN is the default) is due when corpus size outgrows
the target above; sharding (§7) is due when concurrency does. Naming the numbers is
what makes "fine for alpha-scale" (§5.1, §7) a checkable claim instead of a
deferral with nothing behind it.

**Rationale.** C1's complaint is that the spec makes budget *claims* (turn-based
tolerates the latency; sharding is fine to defer) with no budget behind them.
Reference numbers, explicitly tunable, resolve the claim without over-committing:
Phase 6 measures against them, and `INV-4` stays clean because none of them is a
gate the engine enforces at runtime.

## C2 (#34) — The degenerate state is a first-class *resolved* output, never an error

**Decision.** A resolution that yields nothing is a **valid `200`
`ResolvedRoomResponse`**, never a protocol error, and it is made **explicit**
rather than left as an ambiguous empty array:

- **`sample()` (§4.1/§4.4) is defined to never throw on an empty candidate set** —
  it returns "no result," and the room resolves with `objects: []` and
  `exits: []`. This closes the undefined-behavior hole the issue names
  (`sample()` over empty), consistent with `resolveMove` already being forbidden to
  throw (`INV-4`, §4.1).
- **`ResolvedRoomResponse` gains `resolution_status`** — an open string union, two
  values now: **`"resolved"`** (the normal case) and **`"stuck"`** (a well-formed
  request whose active rules leave no legal exit). It is additive; a client that
  ignores it sees the same room it always did. Because it is an **open** union,
  naming further degenerate kinds later (e.g. an `"empty"` distinct from `"stuck"`)
  is a MINOR add, not another surface-shape break.
- **The engine never hard-locks the player.** Being stuck is *legal and surfaced*,
  but it is only reported `"stuck"` when the active rules genuinely leave no legal
  exit. The null-ruleset relativistic-drift fallthrough (§4.1: `candidates =
  graph.neighbors`) still applies wherever no *hard* decision forbids movement, so
  `"stuck"` is a rules-produced dead-end, not the absence of authored structure.
- **The four degenerate shapes the issue enumerates collapse to this one contract.**
  A zero-candidate query, a region with no neighbors in radius, an all-objects-
  filtered room, and an all-exits-`hard_forbid` room all resolve to the same
  well-formed empty response; `resolution_status` distinguishes the rules-produced
  dead-end (`"stuck"`) from the merely sparse (`"resolved"` with short arrays).

**Rationale.** `INV-4` makes being stuck legal, which makes *defining* the stuck
state mandatory, not optional. A dead-end is a game state, not an HTTP failure, so
it stays `200`; and an explicit status is what lets a client render a deliberate
dead-end as such instead of guessing whether an empty array is a bug. §5.1's
`4xx`/`5xx` codes remain exactly what they were — for malformed and unknown, never
for well-formed-with-no-answer.

## C3 (#35) — Local, single-user, trusted-operator alpha (on the record)

**Decision.** The alpha's threat model is stated plainly, and paired with the two
cheap hygiene bounds that Phase-6 "minimal deployment path" implies — neither of
which is an auth system:

- **Trust model.** The alpha is **single-user, local, trusted-operator.** The
  server **binds to localhost by default**; there is no authentication boundary and
  none is implied. The **author-supplied ruleset is trusted input**, consistent
  with `INV-4` — the engine *runs* "bad" rulesets, it does not sandbox against
  *malicious* ones. Authentication, accounts, multiplayer, and any remote or
  multi-tenant deployment stay **post-alpha (§6.8)**.
- **Bounded memory, as hardening not features.** §5.1 sessions are in-memory with
  no eviction, so session count grows without bound; Phase 6 adds a **bounded
  session count with oldest-idle (TTL) eviction** and a **request body-size cap**.
  Both are operator-tunable, both are "hardening of the existing surface" (§6.7),
  neither introduces auth. Eviction is bounded against C1's single-digit
  concurrency number.
- **DSL cost.** The grammar is already non-Turing-complete (§4.2), capping
  expressiveness but not per-request work (layers × candidates × `MATCHES` glob
  over tag arrays). At C1's alpha corpus/ruleset scale this per-request cost is
  **acceptable**; a hard evaluation budget is a Phase-6 tuning value if measurement
  demands one, **not** an engine gate (a gate would taste-police author content,
  `INV-4`).

**Rationale.** "Local single-user, no trust boundary" is a good answer; the defect
is that it was unstated. §6.8 defers *auth and multiplayer*, which is not the same
as stating the alpha's threat model, and §6.7's "minimal deployment path" implies
something runs somewhere. Recording the posture, plus the two bounds that keep the
in-memory server from being a footgun, closes the gap without pulling post-alpha
security work forward.

## C4 (#36) — An offline build-quality harness; a seam now, the metric vocabulary named

**Decision.** The project evaluates its own built substrate through an **offline
evaluation seam** that **never gates the engine** — an offline harness does not
touch `INV-4`, which forbids the *runtime engine* rejecting authored content, not
the *project* measuring its own build quality:

- **`corpus-builder eval`** — a build-time report over a produced `graph.json`,
  a sibling of `corpus-builder inspect` (§6.3), reusing the same `Logger`/`Metrics`
  and `--verbosity` conventions. It reports; it does not fail a build (that is the
  fail-loud gate's job, below).
- **A named vocabulary of build-quality signals**, so "is the space any good" has
  concrete measurables even though most are deferred implementations:
  - **local-coherence distribution** — the spread of the B5 `local_coherence` field
    across the substrate (a corpus that embeds to noise has a visibly different
    distribution from a real one);
  - **tag coverage / orphan rate** — the fraction of spans the B4 tagger reached,
    and the fraction of tags orphaned against `tag-registry.yaml` (§3.6.2);
  - **nearest-neighbor spread** — the distribution of cosine distance to k nearest
    neighbors, which makes a **shuffled-noise corpus visibly distinguishable** from
    a coherent one (the exact failure mode the issue names: a green build over
    shuffled noise).
- **Scope: seam + the cheapest signals now, the rest deferred.** Ship the
  `eval` command and the one or two cheapest signals (they fall out of data B2/B5
  already compute — the local-coherence field and the k-NN index); defer richer
  or model-based quality metrics — the same interface-now / impl-later pattern as
  B's taggers and index.
- **This makes §6.3's "fail loud on *degenerate* output" concrete.** *Degenerate*
  is now defined (B2's gate: non-uniform dimension, non-finite values, zero norms,
  **non-degenerate spread** — a corpus that embeds to one repeated vector). The
  fail-loud gate rejects a **build** that is degenerate by that definition; `eval`
  *reports* on a build that is well-formed but possibly *uninteresting*. Rejecting
  malformed builds and judging interesting-ness are deliberately two mechanisms.

**Rationale.** The project's whole value proposition is semantic — that positions
in embedding space make interesting places — and nothing measured that claim, with
a silent failure mode (a fully green build producing incoherent rooms). An offline
harness is the right home: it evaluates the project's output without adding any
runtime quality gate to the engine, so `INV-4` is untouched and C4's "one person's
eyes on one corpus" (§6.7) gains a repeatable, headless complement.

## C5 (#37) — Cross-artifact coupling is *surfaced*, never enforced (mirrors D3)

**Decision.** The couplings `spec_version` and `substrate_version` do not
individually cover — ruleset ↔ substrate, registry ↔ ruleset, session ↔ rebuild —
resolve by applying the **same stance §3.7.3 (decision D3) already takes for
snapshot staleness: surface it, never auto-invalidate or reject** (`INV-4`,
`INV-5`).

- **`tag-registry.yaml` is versioned.** It gains a version header (a build-id tied
  to the `substrate_version` that produced it), making the "vocabulary contract
  between pipeline stages" (§3.6.2) a *versioned* contract as `INV-5` requires of
  every surface.
- **A ruleset may declare the substrate it was authored against.** `Ruleset` gains
  an **optional** `authored_against?: string` (a `substrate_version`), advisory
  only. Absent means "unpinned"; present lets a load compare against the live
  substrate and surface drift.
- **Drift is warned, never rejected.** A ruleset predicate referencing a tag a
  rebuilt substrate no longer produces is an **orphaned reference** — a **warning at
  load** through the §2.1 `Logger`, exactly as §3.6.2 already makes unregistered
  tags "syntactically valid but orphaned; the pipeline warns, never rejects." The
  engine does not reject the ruleset (`INV-4`) and does not auto-rewrite it.
- **A session may not outlive a substrate rebuild — made explicit.** The substrate
  bundle is **server-wide startup config** (A12): a corpus rebuild is a server
  restart, and in-memory sessions (§5.1) are dropped on restart. So "may a live
  session outlive a rebuild" is answered *no*, structurally, by A12 — this record
  only states it. A **snapshot** (§3.7.3) is the one artifact that deliberately
  survives a rebuild, self-contained and staleness-surfaced, and D3 stands
  unchanged.

**Rationale.** `INV-5` requires every surface to be versioned, and D3 already built
a careful "surfaced, never auto-invalidated" staleness story for snapshots. The
same reasoning simply had not been applied to the ruleset↔substrate and
registry↔ruleset couplings — the ones an author hits on their *second* corpus
build. Reusing D3's stance keeps the whole cross-artifact story consistent and adds
no enforcement the engine would have to taste-police.

## C6 (#38) — An explicit design-track queue; the closed-but-unbuilt issues reconciled

**Decision.** Two process gaps, resolved together.

**(a) The design track gets an explicit queue discipline.** `AGENTS.md` §5 routes
agents to `phase:N` issues only, leaving design-track issues (`design`,
`spec-revision`, `needs-discussion`, no phase label) with no owner and no ordering —
the very issues the escalation path in [`issue-standards.md`](../issue-standards.md)
terminates in. The rule added:

- **When no phase is active** — the current state, and the state
  [`roadmap.md`](../roadmap.md) enforces via the design gate — **the queue *is* the
  design track.** An agent takes the **lowest-numbered open `design` issue whose
  dependencies are resolved**, where dependencies are the tier ordering and the
  explicit "Depends on" links in [`open-scope.md`](open-scope.md).
- **Resolve a tier at a time (A → B → C)**, which is the order actually followed:
  Tier A blocks building at all, Tier B decides whether the pipeline's output is
  meaningful, Tier C is the cross-cutting envelope around both.
- This is written into `AGENTS.md` (§4 build order / §5 working loop),
  `roadmap.md` (the "active work — design track" section), and
  `issue-standards.md` (picking up an issue), so the routing rule lives beside the
  phase-routing rule it parallels rather than only in this record.

**(b) The closed-but-unbuilt issues #1 and #2 are reconciled.** #1 (Phase 0
scaffold) and #2 (Phase 1 schema) are closed as `completed` with no linked PR and
no code in the tree, violating the "issues close only via a merged PR carrying
`Closes #N`" rule. **They are left closed as historical noise; fresh Phase-0 and
Phase-1 issues are opened from the `SPEC.md` §6.1/§6.2 Build lists when the design
gate lifts** — which is exactly what `roadmap.md`'s "Repopulating this file" step
already prescribes. Reopening the originals would re-import their broken trace
(closed with no PR); opening fresh issues at gate-lift time keeps the issue record
honest and needs no action now, because **no phase is active yet.** This record
notes the reconciliation; the fresh issues are filed by whoever lifts the gate, per
`roadmap.md`.

**Rationale.** The process engine is this project's actual delivery mechanism; a
scheduled agent with no design-track queue keeps building on unresolved
foundations, and a wrong issue record misstates where the project stands. An
explicit design-queue rule that *parallels* the phase-queue rule fixes the routing
with the least new machinery, and leaving #1/#2 closed while deferring fresh Phase
issues to gate-lift keeps the reconciliation aligned with the roadmap's existing
repopulation step instead of inventing a second one.

---

## Cross-cutting consequences

### The operational envelope, after C-series

| Concern | Alpha decision | Where it tunes / lifts |
|---|---|---|
| Room size | `MAX_ROOM_OBJECTS = 12` × density (sampling target) | Phase 6 tuning (C1) |
| Corpus / latency / concurrency | ~10–50 docs; p95 < ~200 ms; single-digit sessions | Phase 6; thresholds for §7 ANN/sharding (C1) |
| Empty resolution | `200` with `resolution_status: "stuck"`, `sample()` never throws | open union extends MINOR (C2) |
| Trust | local, single-user, trusted-operator; ruleset trusted | auth/multiplayer post-alpha §6.8 (C3) |
| Memory | bounded sessions + idle-TTL eviction; body-size cap | Phase 6 hardening (C3) |
| Build quality | offline `corpus-builder eval`; cheapest signals now | richer/model metrics deferred (C4) |
| Cross-artifact | version `tag-registry.yaml`; `authored_against?`; warn-never-reject | mirrors D3, stands (C5) |
| Design queue | lowest-numbered ready `design` issue, tier at a time | phase queue resumes at gate-lift (C6) |

### Schema & protocol changes (drive the version bump)
- `ResolvedRoomResponse` gains **`resolution_status`** — open string union,
  `"resolved" | "stuck"` (§3.2, C2). Additive.
- `Ruleset` gains **`authored_against?`** — optional `substrate_version` string,
  advisory (§3.4, C5). Additive.
- `sample()` is specified to **return a no-result / never throw on empty
  candidates** (§4.1/§4.4, C2) — a normative clarification, not a signature change.
- `tag-registry.yaml` gains a **version header** tied to `substrate_version`
  (§3.6.2/§6.3, C5) — an internal-format field, not client-facing schema.
- New alpha-scale constants and budget (§4.4 `MAX_ROOM_OBJECTS`, §6.7/§7 budget,
  C1); Phase-6 session-eviction / body-size bounds and the trust-model statement
  (§5.1/§6.7, C3); the `corpus-builder eval` command (§6.3, C4). Additive to the
  build/runtime surface, not the client-facing schema.

### Version impact
`spec-version` moves **0.10.0 → 0.11.0**. Unlike the A- and B-series (which
*renamed* `Entity`/`EntityState`/`SessionState` fields and changed the DSL grammar —
MAJOR-equivalent under the project's 0.x convention), the C-series is
**additive-only**: two new optional fields, a normative clarification, an internal
version header, and reference constants. No field is renamed or removed, and the
§4.2 DSL grammar is untouched — the first genuinely additive revision in the design
track. No `packages/schema/src/*` code exists yet (Phase 0 is unbuilt), so no
`packages/schema/CHANGELOG.md` entry is required by `INV-5`; Phase 1 implements to
the 0.11.0 shapes.

### What stays out of scope
Decisions D1–D5 (0001), the A-series (0003), and the B-series (0004) all stand
unchanged. Deferred by design and untouched here: authentication, accounts,
multiplayer, and remote/multi-tenant deployment (§6.8); the real ANN index and
sharding (C1 names the thresholds, §7 owns the work); the richer and model-based
`eval` quality metrics (C4); and the concrete Phase-0/Phase-1 issue filing (C6
reconciles the record and defers the fresh issues to gate-lift per
[`roadmap.md`](../roadmap.md)). `reapproximation_tolerance` (D5) remains a Phase-6
tuning value.
