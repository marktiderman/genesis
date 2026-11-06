---
"@marktiderman/genesis-cli": minor
---

`genesis agents` points agents at each installed package's own `SKILL.md` (it matches the installed version), in both the AGENTS.md block and the generated skill, and writes a `CLAUDE.md` holding `@AGENTS.md` when the app has none, so reviewers and cloud project threads that read only CLAUDE.md see the same guide. `agent-guide-stale` warns when CLAUDE.md is missing. `agentGuideState` gains a `claude` key (`ok`, `missing` or `no-import`), and `genesis agents --check` now fails when CLAUDE.md is missing; a CLAUDE.md that doesn't import AGENTS.md is an info. Only stable `node_modules/<package>/SKILL.md` paths (or a local package's folder) are listed, so a dependency bump elsewhere never makes the guide stale.
