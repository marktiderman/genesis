---
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-ui": patch
---

Agent guidance: extend a close Genesis piece, invent freely in the app.

- **genesis-cli.** The guide `genesis agents` writes no longer tells an app to write a gap up for Genesis before inventing. It now says: when a Genesis piece is close and does the same job, extend it (a prop, a variant, a slot, or your own component that wraps it), never a parallel copy; when nothing does the job, invent it in the app, with nothing written up or approved first, and add it to `docs/genesis-upstream.md` when Genesis should have it. The catalog gains a row for the first case. `local-primitives` now says where the app's own components go. Run `genesis agents` after upgrading; `agent-guide-stale` warns until you do.
- **genesis-ui.** `EXTENDING.md` gains "Your own components" (a wrapper around a Genesis component, and an invention of the app's own), and `SKILL.md` gains "When the ladder doesn't reach".
