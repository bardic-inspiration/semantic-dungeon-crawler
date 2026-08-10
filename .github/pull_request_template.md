<!--
One PR = one issue = one build-order concern. See AGENTS.md and CONTRIBUTING.md.
-->

## Summary

<!-- One or two sentences: what this PR does. -->

## Linked issue

Closes #

## Spec section

<!-- Which part of SPEC.md this implements or affects, e.g. "§6.2 Phase 1", "§3.1". -->

## Testing

<!-- What tests were added/changed, and which fixtures (minimal / typical / maxed). -->

## Checklist

- [ ] Tests written first (TDD) and passing — `npm test` green
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] Atomic commits in Conventional Commits format
- [ ] Documentation updated if behavior changed
- [ ] Schema changes include a `packages/schema/CHANGELOG.md` entry (INV-5), if applicable
- [ ] Scope compliant with the SPEC invariants (INV-1..INV-5) and this phase only
