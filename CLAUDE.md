# CLAUDE.md

Claude Code specific notes. **Read [`AGENTS.md`](AGENTS.md) first** — it is the
canonical guide (purpose, hard rules, layout, build order, working loop, and the
PR and scope discipline that apply to every session, cold start or not). This
file adds only the conventions specific to Claude Code's tools and interface.

## Asking questions

- When you need to ask the user a question, ask **one question at a time**,
  through regular chat, with a few suggested options they can pick from or
  riff on.
- **Never** use the app's multiple-choice/question-picker widgets — always
  ask in plain chat text instead.

## CI watch protocol

- **Never watch.** Do not call `subscribe_pr_activity` on any PR you open,
  regardless of whether it touches code or is docs-only. Cold-start sessions
  have no memory of prior runs, so a subscription left open here has nobody
  to act on it between agent sessions — open the PR and end the turn.
