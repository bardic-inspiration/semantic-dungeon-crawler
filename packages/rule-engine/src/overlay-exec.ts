// packages/rule-engine/src/overlay-exec.ts
//
// SPEC §3.7.4 — EXECUTION of the six overlay primitives. The commit phase
// (`runCommitPhase`, solver.ts) collects the `{kind:"primitive"}` effects that
// fired; this module turns that closed vocabulary into concrete, deterministic
// writes over the Address Registry (§3.7.1) and the parallel Link table (§3.7.2).
//
// Registry writes are inert (§3.7.1): a pure name→reference map, no computation,
// no derived positions, no composite resolution. Every primitive is deterministic
// and reversible (INV-2) and NEVER throws (INV-4) — a malformed invocation is
// surfaced through the §2.1 `Logger` and skipped, never rejected mid-resolution.
//
// Provenance + logging (§3.7.4 / §3.9, A10). Author-rule invocation and player
// invocation are the SAME primitive/effect, "distinguished only by the provenance
// of the entry it writes". The distinction is drawn from the ruleset's
// `primitive_exposure`: a fired primitive that the ruleset exposes to the player
// (`exposure ∈ {player, both}` and its optional §4.2 `when` predicate holds) is a
// PLAYER invocation — it writes a `player`-provenance entry AND appends a
// `{kind:"primitive"}` entry to the input log (§3.9). Anything else — an
// `author_only` primitive, a primitive with no exposure entry, or a `when` gate
// that fails — is a rule-driven consequence: it writes an `author_runtime` entry
// and is NOT logged (it re-derives on replay). Gating validates well-formedness
// only; it never judges whether an exposure configuration is sensible (INV-4).
//
// INV-1: pure, headless — imports `schema` types and sibling engine modules only.
// INV-3: a `snapshot`'s `resolved_payload` is resolved `Entity`s, never the raw
// embeddings the graph ranks over.

import type {
  AddressRegistryEntry,
  Entity,
  EntryReference,
  InputLogEntry,
  InterpretationLookup,
  LinkRecord,
  PrimitiveExposure,
  Provenance,
  SessionState,
} from "schema";
import type { Graph } from "./graph";
import type { Query } from "./query";
import { evaluate } from "./evaluate";
import { visitedCoordinateRefs } from "./address-token";
import { mintEntity } from "./interpretation";
import { parse, ParseError } from "./parser";
import { NoopLogger, type Logger } from "./instrumentation";

/** A malformed primitive invocation (missing/invalid args), surfaced at `warn`. */
export const OVERLAY_MALFORMED_PRIMITIVE_EVENT = "overlay.malformed_primitive";
/** A malformed §4.2 `PrimitiveExposure.when` predicate, surfaced at `warn`. */
export const OVERLAY_MALFORMED_WHEN_EVENT = "overlay.malformed_when";

/** Default neighbourhood size for a `snapshot`/`query` resolution (§4.4). */
const DEFAULT_SNAPSHOT_K = 8;

/** One fired `{kind:"primitive"}` effect (`CommitResult.primitives`, §3.7.4). */
export interface PrimitiveInvocation {
  primitive: string;
  args?: Record<string, string>;
}

/** Everything an execution needs beyond the invocations themselves. */
export interface ApplyPrimitivesContext {
  /** Run state the commit phase evaluated against — the `when` gate reads it. */
  state: SessionState;
  /** The substrate seam a `snapshot`/`query` resolves against. */
  graph: Graph;
  /** The live substrate build id a fresh `snapshot` binds to (§3.7.3, §6.3). */
  substrateVersion: string;
  /** The ruleset's exposure table (§3.7.4); an empty list means author-only. */
  exposure: readonly PrimitiveExposure[];
  /** §0.9.0 (A13) interpretation lookup, applied to a snapshot's resolved spans. */
  interpretation?: InterpretationLookup;
  /** §2.1 sink for malformed-invocation / malformed-`when` warnings. */
  logger?: Logger;
}

/** The deterministic writes one commit phase's primitives produce. */
export interface OverlayWrites {
  /** New Address Registry entries, in declaration order (§3.7.1). */
  entries: AddressRegistryEntry[];
  /** New Link records, in declaration order (§3.7.2). */
  links: LinkRecord[];
  /** Input-log entries for PLAYER-invoked primitives only (§3.9). */
  logEntries: InputLogEntry[];
}

/**
 * Execute the primitives a commit phase collected, in declaration order. Returns
 * the writes to append to the session overlay — the caller (server) owns the
 * append and the input-log interleaving. Never throws (INV-4).
 */
export function applyPrimitives(
  invocations: readonly PrimitiveInvocation[],
  ctx: ApplyPrimitivesContext,
): OverlayWrites {
  const logger = ctx.logger ?? new NoopLogger();
  const entries: AddressRegistryEntry[] = [];
  const links: LinkRecord[] = [];
  const logEntries: InputLogEntry[] = [];

  for (const invocation of invocations) {
    const { provenance, logged } = attribute(invocation, ctx, logger);

    // §3.9 — a player invocation is a logged input; a rule-driven one re-derives.
    if (logged) {
      logEntries.push({
        kind: "primitive",
        primitive: invocation.primitive as PrimitiveExposure["primitive"],
        ...(invocation.args !== undefined ? { args: invocation.args } : {}),
      });
    }

    const write = executeOne(invocation, provenance, ctx, logger);
    if (write?.entry) entries.push(write.entry);
    if (write?.link) links.push(write.link);
  }

  return { entries, links, logEntries };
}

// ── Provenance + exposure gating (§3.7.4, A10) ─────────────────────────────────

function attribute(
  invocation: PrimitiveInvocation,
  ctx: ApplyPrimitivesContext,
  logger: Logger,
): { provenance: Provenance; logged: boolean } {
  const authorRuntime = {
    provenance: "author_runtime" as const,
    logged: false,
  };

  // First matching exposure entry wins (declaration order). No entry ⇒ the
  // primitive is not player-exposed: a rule-driven, author_runtime write.
  const exposure = ctx.exposure.find(
    (e) => e.primitive === invocation.primitive,
  );
  if (exposure === undefined) return authorRuntime;
  if (exposure.exposure === "author_only") return authorRuntime;

  // `player` / `both`: the player path is open iff the optional §4.2 `when`
  // predicate holds. A malformed `when` fails CLOSED and is surfaced, never
  // thrown (INV-4) — the same "surface, never reject" stance the solver takes.
  if (exposure.when !== undefined) {
    let ast;
    try {
      ast = parse(exposure.when);
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
      logger.log("warn", OVERLAY_MALFORMED_WHEN_EVENT, {
        primitive: invocation.primitive,
        when: exposure.when,
      });
      return authorRuntime;
    }
    if (!evaluate(ast, { state: ctx.state })) return authorRuntime;
  }

  return { provenance: "player", logged: true };
}

// ── Primitive writers (§3.7.4 registry-effect table) ───────────────────────────

interface Write {
  entry?: AddressRegistryEntry;
  link?: LinkRecord;
}

function executeOne(
  invocation: PrimitiveInvocation,
  provenance: Provenance,
  ctx: ApplyPrimitivesContext,
  logger: Logger,
): Write | null {
  const args = invocation.args ?? {};
  switch (invocation.primitive) {
    case "pin":
      return pin(args, provenance, logger);
    case "bookmark":
      return bookmark(args, provenance, ctx, logger);
    case "snapshot":
      return snapshot(args, provenance, ctx, logger);
    case "link":
      return link(args, provenance, logger);
    case "compose":
      return compose(args, provenance, logger);
    case "query":
      // Read-only (§3.7.4): resolve to honour side-effect-free semantics, but
      // write nothing. The invocation is recorded in the log (attribution above).
      resolveNeighbourhood(ctx);
      return null;
    default:
      malformed(logger, invocation.primitive, "unknown primitive");
      return null;
  }
}

function pin(
  args: Record<string, string>,
  provenance: Provenance,
  logger: Logger,
): Write | null {
  const tag = args.tag;
  const vector_ref = args.vector_ref;
  if (!tag || !vector_ref) {
    malformed(logger, "pin", "requires `tag` and `vector_ref`");
    return null;
  }
  return { entry: entry(tag, { kind: "coordinate", vector_ref }, provenance) };
}

function bookmark(
  args: Record<string, string>,
  provenance: Provenance,
  ctx: ApplyPrimitivesContext,
  logger: Logger,
): Write | null {
  const tag = args.tag;
  if (!tag) {
    malformed(logger, "bookmark", "requires `tag`");
    return null;
  }
  // §3.7.4 — names the player's CURRENT resolved position (a coordinate ref).
  const vector_ref = ctx.state.position.vector_ref;
  return { entry: entry(tag, { kind: "coordinate", vector_ref }, provenance) };
}

function snapshot(
  args: Record<string, string>,
  provenance: Provenance,
  ctx: ApplyPrimitivesContext,
  logger: Logger,
): Write | null {
  const tag = args.tag;
  if (!tag) {
    malformed(logger, "snapshot", "requires `tag`");
    return null;
  }
  // §3.7.3 — freeze one resolved query as a self-contained payload bound to the
  // live substrate version. `resolved_payload` is `Entity`s (INV-3), so the
  // snapshot stays readable across rebuilds without the substrate.
  const resolved_payload = resolveNeighbourhood(ctx);
  const ref: EntryReference = {
    kind: "snapshot",
    snapshot: { substrate_version: ctx.substrateVersion, resolved_payload },
  };
  return { entry: entry(tag, ref, provenance) };
}

function link(
  args: Record<string, string>,
  provenance: Provenance,
  logger: Logger,
): Write | null {
  const from = args.from;
  const to = args.to;
  if (!from || !to) {
    malformed(logger, "link", "requires `from` and `to`");
    return null;
  }
  // §3.7.2 / D2 — a directed, typed edge in the parallel table, NOT a composite.
  // `kind` is an open, interpretation-defined string; absent means the empty kind.
  return { link: { from, to, kind: args.kind ?? "", provenance } };
}

function compose(
  args: Record<string, string>,
  provenance: Provenance,
  logger: Logger,
): Write | null {
  const tag = args.tag;
  const members = parseMembers(args.members);
  if (!tag || members.length === 0) {
    malformed(logger, "compose", "requires `tag` and non-empty `members`");
    return null;
  }
  // §3.7.1 — grouping only: a name for a SET of tags, never computation.
  return {
    entry: entry(tag, { kind: "composite", member_tags: members }, provenance),
  };
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function entry(
  tag: string,
  points_to: EntryReference,
  provenance: Provenance,
): AddressRegistryEntry {
  return { tag, points_to, provenance };
}

/** Comma-separated `members` → trimmed, non-empty member tags (order preserved). */
function parseMembers(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

/**
 * Resolve the substrate neighbourhood around the player's current position into
 * `Entity`s (§4.4). Deterministic — the graph ranks by cosine distance with ties
 * broken by declaration order — so a replay reproduces the payload byte-for-byte
 * (INV-2). Used by both `snapshot` (freezes the result) and `query` (discards it).
 */
function resolveNeighbourhood(ctx: ApplyPrimitivesContext): Entity[] {
  const query: Query = { origin: ctx.state.position, k: DEFAULT_SNAPSHOT_K };
  const visited = visitedCoordinateRefs(
    ctx.state.visited_set,
    ctx.state.address_tokens,
  );
  return ctx.graph
    .query(query)
    .map((c) =>
      mintEntity(c.span, ctx.interpretation, { visitedCoordinates: visited }),
    );
}

function malformed(logger: Logger, primitive: string, detail: string): void {
  logger.log("warn", OVERLAY_MALFORMED_PRIMITIVE_EVENT, { primitive, detail });
}
