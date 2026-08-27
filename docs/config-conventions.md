# Config conventions

The one environment-driven way to select each **swappable component** — the
embedding provider, the `Logger` sink, and the `Metrics` backend — instead of
hardcoding the choice per package. This is the [`SPEC.md`](../SPEC.md) §2.1
"Config & errors" convention; this doc is its reference, not a second source of
truth. Behavior lives in code (`packages/*/src/config.ts`); if the two disagree,
that is a defect.

## Environment variables

Every knob is one `SDC_`-prefixed environment variable. Unset (or empty) takes
the default; an unrecognized value is **surfaced as a usage error** naming the
accepted values, never silently coerced to the default.

| Variable | Selects | Values | Default | Read by |
|---|---|---|---|---|
| `SDC_EMBEDDING_PROVIDER` | build-time embedding provider (§6.3) | a registered provider id (`hashing` ships) | `hashing` | `corpus-builder` |
| `SDC_LOG_SINK` | `Logger` sink (§2.1) | `console` \| `noop` | `console` | `corpus-builder`, `server`, `client-cli` |
| `SDC_METRICS_BACKEND` | `Metrics` backend (§2.1) | `memory` \| `noop` | `memory` | `corpus-builder`, `server`, `client-cli` |
| `SDC_LOG_LEVEL` | `Logger` level (§5.4) | `error` \| `warn` \| `info` \| `debug` | package-specific | `corpus-builder`, `client-cli` |

### Operational bounds (§0.11.0 C3)

The server also reads three numeric **operational bounds** through the same
`SDC_`-prefixed convention. Unlike the rows above these select no swappable
_component_ — they are the §0.11.0 (C3) trust-model hardening (a bounded session
store, a request body-size cap), read once at server startup. An out-of-range
value (not a positive integer) is surfaced as a usage error, never coerced.

| Variable | Bounds | Default | Read by |
|---|---|---|---|
| `SDC_SESSION_MAX` | max live sessions before oldest-idle eviction | `256` | `server` |
| `SDC_SESSION_TTL_MS` | idle TTL (ms) after which an unused session is evicted | `1800000` (30 min) | `server` |
| `SDC_MAX_BODY_BYTES` | request body-size cap (bytes), rejected `413` before parsing | `1048576` (1 MiB) | `server` |

These are hardening of the existing surface, **not** an auth system (§0.11.0 C3):
the alpha stays single-user, local, trusted-operator. The defaults leave generous
headroom above the §4.4 reference budget's "single-digit concurrency" while keeping
the in-memory store bounded.

Notes:

- **Sink vs. level are orthogonal.** `SDC_LOG_SINK` chooses _where_ logs go
  (`console` → stderr, `noop` → discarded); `SDC_LOG_LEVEL` / `--verbosity` / the
  server's `--debug` flag choose _how verbose_. A `noop` sink discards regardless
  of level (a valid zero-overhead selection, §4.6).
- **`noop` metrics still snapshots.** Where a `Metrics` is read back (`server`'s
  `GET /metrics`, `client-cli`'s §5.4 end-of-session summary), the `noop` backend
  returns an empty `{ counters, gauges }`, so those surfaces stay well-formed
  rather than failing when metrics are switched off.
- **Defaults reproduce prior behavior.** With no `SDC_*` variable set, every
  package constructs exactly what it did before this convention existed.

## Precedence

An explicit CLI flag for the same knob wins over its environment variable, which
wins over the default. Today only the log **level** has such a flag
(`--verbosity` in `client-cli` / `corpus-builder`, `--debug` in `server`); the
sink, metrics backend, and embedding provider are env-or-default.

## Where the readers live

Each package reads the convention through its own `src/config.ts`
(`resolveLogSink`, `resolveMetricsBackend`, `makeLogger`, `makeMetrics`, plus
`resolveEmbeddingProvider` in `corpus-builder`). The readers deliberately share
the same env var names and value vocabulary rather than importing one another —
consistent with the per-package `instrumentation.ts` duplication the boundary
rules (`INV-3`) require. `corpus-builder`'s reader is the reference: it selects
all three components, so `server` and `client-cli` mirror its shape for the two
they need.

## Adding a new swappable component

1. Give it an `SDC_`-prefixed variable and add a row to the table above.
2. Resolve it in the owning package's `src/config.ts` via the same
   `selectEnum(...)` helper (fixed value vocabulary, default, `ConfigError` on an
   unknown value) — or, for an open registry like the embedding provider, a
   keyed lookup that reports what is registered.
3. Read it at the package's entry point (its CLI / server startup), never deep in
   a hot path; surface a bad value as a usage error (exit code `2`).
4. Keep the default equal to the previously hardcoded choice so existing behavior
   is unchanged.

## Out of scope

Adding new provider/sink/backend _implementations_ (e.g. a real vendor embedding
API, a file or network log sink, a Prometheus metrics backend) is not part of
this convention — it ships the **selection seam**, so a new implementation only
has to register itself and pick a value. Vendor embedding providers specifically
are the deferred swap-in (§7).
