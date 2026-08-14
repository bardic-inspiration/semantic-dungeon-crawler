# Issue Standards

The canonical reference for opening, scoping, and closing issues. The goal is
**iterative, traceable work**: every PR maps to exactly one issue, every issue
maps to a spec section, and anything that surfaces mid-work but isn't in scope
gets a paper trail instead of getting lost or silently folded in.

## Picking up an issue

- Pick the **lowest-numbered open issue** labeled with the active phase
  (`phase:0`, then `phase:1`, …) — see [`roadmap.md`](roadmap.md) for
  current phase status.
- **When no phase is active** (the build order is gated behind the design track
  until the phase queue is repopulated, [`roadmap.md`](roadmap.md)), the queue is
  the **design track** instead: pick the lowest-numbered open `design` issue whose
  dependencies are resolved (the tier ordering and "Depends on" links in
  [`design/open-scope.md`](design/open-scope.md)), resolving **one tier at a
  time (A → B → C)**. This is the queue the "stop and escalate on spec
  ambiguity" path below feeds into, so it is no longer an unowned label.
- Read the `SPEC.md` section it references before touching code. The
  invariants `INV-1`..`INV-5` (`AGENTS.md` §2) hold regardless of phase.
- Scope work to **that issue only** — don't range ahead into later phases and
  don't pull in adjacent cleanup that isn't part of the acceptance criteria.

## Filing an issue

Use the template that fits:

- **[Feature / build task](../.github/ISSUE_TEMPLATE/feature_task.md)** — a
  build-order step or new capability sized for one PR. Requires: Goal, spec
  reference, testable acceptance criteria, fixtures/cases, and an explicit
  "Out of scope" note.
- **[Bug report](../.github/ISSUE_TEMPLATE/bug_report.md)** — behavior that
  contradicts the spec. Requires: what happened, expected behavior with a
  spec citation, a minimal reproduction (determinism bugs need the
  `(seed, ruleset, input-log)` triple — `INV-2`), environment, and which
  invariant (if any) is affected.

Other requirements, both templates:

- **Acceptance criteria must be testable statements.** They are the
  pre-written failing tests for TDD ([`testing-standards.md`](testing-standards.md))
  — if a criterion can't become a test, it isn't specific enough yet.
- **Label** with the phase it belongs to (`phase:N`) plus `task` or `bug`
  ([`naming-conventions.md`](naming-conventions.md) "Git & process"). Work
  that falls under SPEC §6.8 (post-alpha) does not get a phase label and
  does not enter the active queue.

## Scope discipline

- **One issue = one PR = one build-order concern.** If the work doesn't fit
  in a single PR, it isn't one issue — split it before starting, not
  mid-implementation.
- State explicitly what's **out of scope** in the issue body. This is the
  primary guard against scope creep into SPEC §6.8 items.
- A PR that touches more than its issue's concern is a sign the issue was
  under-scoped, not license to expand the PR — file the extra ground as its
  own issue (see below) and keep the PR narrow.

## Docs-only issues & PRs

Changes that touch only Markdown — no code, schema, fixtures, or CI/config —
follow a leaner path than the rest of this doc: lighter issue filing, no
TDD/CI gate. See [`docs-only-changes.md`](docs-only-changes.md) for the full
protocol and the [Docs / spec change template](../.github/ISSUE_TEMPLATE/docs_change.md).
Everything else in this doc assumes a code change.

## Linking issues to PRs

- Every PR closes exactly one issue: `Closes #N` in the PR description
  (`.github/pull_request_template.md`). Trivial docs-only PRs (typos, broken
  links) are exempt — see [`docs-only-changes.md`](docs-only-changes.md).
- State the spec section the issue implements or affects in the PR — the
  reviewer should be able to trace PR → issue → spec section without asking.
- Issues close **only** via a merged PR carrying `Closes #N`. Don't close an
  issue by hand outside that flow — it breaks the trace from issue to the
  commit that resolved it.
- If an issue turns out invalid, superseded, or out of scope after all,
  close it with a comment stating why rather than deleting it or letting it
  go stale silently.

## Open questions & sub-issues that surface mid-work

Cold-start sessions and reviewers alike surface things beyond the one issue
in front of them — edge cases, ambiguities, follow-on work. Handle these
without losing scope or traceability:

- **Don't solve it inline.** Finish the issue you were given first. An open
  question is not license to widen the current PR.
- **Spec ambiguity or defect** (the acceptance criteria conflict with
  `SPEC.md`, or the spec looks wrong) → do not silently invent behavior.
  Follow [`spec-guidelines.md`](spec-guidelines.md): raise it and, if
  it's a genuine defect, amend `SPEC.md` deliberately before writing code
  that guesses.
- **Everything else** (an out-of-scope edge case, a deferred feature, tech
  debt, a later-phase idea) → file it as a **new issue** using the criteria
  above, not a `TODO` comment or a note buried in a PR description that will
  rot.
  - Reference the originating issue/PR in the new issue's body (e.g.
    "Surfaced while working #N") so the chain is traceable later.
  - Label it with the phase it belongs to, or leave it unlabeled / out of
    scope if it falls under SPEC §6.8.
- **Link back once.** In the PR that surfaced the question, add a single
  line noting the new issue number (e.g. "opened #N for X, out of scope
  here"). Don't re-explain it in every later PR that touches nearby code —
  the issue link is the record.
- **Don't block on it.** An unresolved sub-issue should not stall the current
  issue's merge, unless it's the spec-ambiguity case above, where guessing
  would risk violating an invariant (`INV-1`..`INV-5`).

## Quick decision rule

When something unplanned comes up mid-issue, ask one question: **does
proceeding require guessing at spec-defined behavior or risk an invariant?**

- Yes → stop, don't guess, resolve via [`spec-guidelines.md`](spec-guidelines.md)
  before continuing.
- No → keep going on the current issue; file a new issue for the rest.
