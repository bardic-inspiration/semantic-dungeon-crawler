---
name: Feature / build task
about: A build-order step or new capability, sized for one PR.
title: "[phase:N] "
labels: task
assignees: ""
---

<!--
One issue = one PR = one logical change. Scope it to a single SPEC build step.
Label with the phase it belongs to (phase:0, phase:1, ...). See docs/roadmap.md.
-->

## Goal

<!-- A single outcome that fits in one atomic PR. -->

## Spec reference

<!-- Which part of SPEC.md this implements, e.g. "§6.2 Phase 1", "§3.1 Entity". -->

## Acceptance criteria

<!--
Testable statements. These are the failing tests to write FIRST (TDD).
- [ ] ...
- [ ] ...
-->

## Fixtures / cases

<!--
Which tests and inputs validate this. Prefer minimal / typical / maxed cases.
Fixtures live in fixtures/ and must be engine-agnostic (SPEC §6.5).
-->

## Out of scope

<!-- What this task explicitly does NOT address (guard against scope creep; see SPEC §6.8). -->

## TL;DR

<!--
Required. Plain English, no software-expert jargon, bullet points — explain
this like you're telling a friend who doesn't code. Cover:
- Why: the reason this issue exists.
- Impact: what changes once it's done.
-->

-
