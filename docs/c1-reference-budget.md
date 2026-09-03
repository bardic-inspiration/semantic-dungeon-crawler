# C1 Reference-Budget Tuning

The `§0.11.0` **C1 alpha-scale reference budget** — `MAX_ROOM_OBJECTS`,
move-resolution latency, corpus size, and concurrency — measured against the
first real corpus run ([`first-corpus-run.md`](first-corpus-run.md)) and recorded
here. These are **Phase-6-tunable reference defaults, not runtime-enforced
ceilings** (`SPEC §0.11.0` C1, `INV-4`); this pass checks the engine against them
and records the numbers, including any deviation, rather than gating on them. See
[`design/0005-c-series-resolution.md`](design/0005-c-series-resolution.md) for
the budget's rationale.

## Substrate under test

The real corpus run's bundle: *The Yellow Wallpaper* (Project Gutenberg #1952),
built with the `minilm` provider — **269 spans**, 384-dimensional vectors,
`substrate_version sv_2069a1067626ed10984f6b9449ac6e9f`
([`first-corpus-run.md`](first-corpus-run.md)). Archetype mix of the 269 spans:
`prop` 174, `container` 50, `actor` 31, `readable` 14. Rooms resolve under the
default **zero-ruleset relativistic drift** (`SPEC §0`), the mode that stresses
raw substrate resolution with no authored layer to short-circuit it.

## Move-resolution latency — **within budget**

**Budget (`SPEC §4.4`, C1): p95 < ~200 ms** server-side per move.

Measured through the running server's `resolve.duration_ms` gauge (the `Metrics`
value the `POST /interact` path records around `resolveMove`, `server.ts`), read
after each move. 288 moves sampled across 12 start positions (containers spread
across the corpus) × 12 seeds, drift-walked to `stuck`:

| p50 | p90 | p95 | p99 | max | mean |
|----:|----:|----:|----:|----:|-----:|
| 0.81 ms | 1.24 ms | **1.41 ms** | 1.80 ms | 3.68 ms | 0.82 ms |

p95 is **~140× inside** the ~200 ms budget. The absolute figures are hardware-
dependent (measured on the Phase-6 build container); the meaningful, portable
claim is the two-orders-of-magnitude headroom, which is consistent with the cost
model — a move is a flat k-NN over 269 vectors plus layer evaluation over
`DEFAULT_QUERY_K = 32` candidates, all O(N·d) with tiny constants at this scale.
No deviation; no follow-on performance work is required.

## `MAX_ROOM_OBJECTS` — reviewed, **kept at 12**

`MAX_ROOM_OBJECTS` (`packages/rule-engine/src/solver.ts`) is the room-population
**sampling target**: a room draws `round(layout_hint.density × MAX_ROOM_OBJECTS)`
objects, capped by the candidate pool (`SPEC §4.4`). It is not a hard cap the
engine rejects past.

How the real corpus actually populates rooms (231 resolved rooms in the sweep):

- Under the default interpretation lookup
  (`packages/rule-engine/src/interpretation.ts`), only the `container` archetype
  carries a non-zero `density` (**0.5**); every other archetype is `0.0`.
- So every resolved (container) room populates to exactly
  `round(0.5 × 12) = **6** objects`; non-container terminals resolve to 0
  (a valid `stuck`, `SPEC §0.11.0` C2). Observed object counts were **only 0 or
  6** — the cap of 12 is never approached.
- Rooms were **never pool-limited**: the `k = 32` / radius-`1.0` neighborhood
  supplied at least the 6 objects the density target asked for in every resolved
  room, so population is bounded by `density`, not by candidate scarcity.

**Decision: keep `MAX_ROOM_OBJECTS = 12`.** For this corpus the binding factor is
per-archetype `density` (0.5 → 6-object rooms — legible, and comfortably below
12), not the constant. There is no legibility pressure to lower it (rooms are
already modest) and no performance pressure to change it (p95 ~1.4 ms). It remains
a tunable reference default: a ruleset wanting denser or sparser rooms tunes
`density` (and, if it must, this constant), per C1. Reasoning is also recorded in
a comment beside the constant.

## Corpus size — **intentional deviation, recorded**

**Reference (C1): ~10–50 documents / low-thousands of spans.**

The real run is **1 document / 269 spans**. The span count sits at the low end of
"low-thousands"; the **document count is below the 10–50 range**. This is the
deliberate choice of `SPEC §6.7` and issue #164 — a single short story small
enough to sanity-check a resolved room against the source by eye — not a
regression. Recorded as a known, intentional deviation from the reference scale;
the multi-document end of the range remains exercised by the `fixtures/` corpus
(~20 documents) the budget was written around.

## Concurrency — **within budget**

**Reference (C1): single-digit concurrent sessions.**

One server on the real bundle, C concurrent sessions each drift-walking, client-
observed per-move round-trip (HTTP + JSON + event-loop queuing on top of the
~1.4 ms server-side resolve):

| concurrency | p50 | p95 | max |
|---:|----:|----:|----:|
| 1 | 8.2 ms | 9.7 ms | 9.7 ms |
| 4 | 9.0 ms | 12.2 ms | 12.2 ms |
| 8 | 11.1 ms | 17.3 ms | 32.6 ms |

Through 8 concurrent sessions the round-trip p95 stays ~12× inside the 200 ms
budget; the server-side resolve itself is unchanged by concurrency. No deviation
at single-digit concurrency, the scale C3's session-eviction bound and `SPEC §7`'s
deferred sharding are measured against.

## Method

The measurement drives the real server (`--metrics`, `--start-ref` swept across
container spans) over its HTTP API and reads `resolve.duration_ms` per move; room
population is read from each `POST /interact` response's `new_room`. Latency is
hardware-dependent, so re-measuring on other hardware is expected to shift the
absolute numbers while preserving the headroom. Regenerate the substrate with the
steps in [`first-corpus-run.md`](first-corpus-run.md) (deterministic, `INV-2`).
