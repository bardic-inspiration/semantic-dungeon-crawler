# Scope Discipline

Why this has its own doc: the build is worked by many independent, memoryless
agent sessions. Nobody tracks "temporary" scope expansion across sessions, so an
out-of-scope change never gets cleaned up later — it just becomes permanent drift
from the issue trail. Keeping each PR tight to its issue is the single discipline
that holds the build together across cold starts. Treat every PR's diff as if a
reviewer will check it file-by-file against the acceptance criteria, because
eventually one will.

## The rule

- **Implement the acceptance criteria — nothing more.** Once you're in the code,
  the issue's acceptance criteria are the entire spec for the PR. A file or
  package the criteria don't mention isn't part of this PR, even if the change is
  one line and obviously correct.
- **Don't fold in adjacent work.** No drive-by refactors, no "while I'm in here"
  fixes, no changes a later issue in the same phase will obviously need — even
  when they're small. A PR touching files or packages the acceptance criteria
  don't call for is a sign of drift; narrow it back down before committing.
- **File, don't fold.** Work worth doing that isn't in scope becomes its own
  issue ([`issue-standards.md`](issue-standards.md)), referencing the originating
  issue ("Surfaced while working #N") so the chain stays traceable. The one
  exception is spec ambiguity that would risk an invariant — that stops the work
  and is resolved via [`spec-guidelines.md`](spec-guidelines.md), not deferred.
- **SPEC §6.8 is the tempting-but-forbidden list.** Post-alpha items (rule
  editor, other adapters, persistence) look adjacent but are out of scope for the
  alpha build; do not scope-creep into them.

## Examples

Concrete drift-vs-in-scope cases collect here as they surface in review — leave
each with the issue/PR number it came from so the pattern is traceable.
