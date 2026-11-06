---
"@marktiderman/genesis-cli": patch
---

`genesis agents` follow-ups:
- **CLAUDE.md states.** A blocked CLAUDE.md is reported the same way on macOS and Linux, and a CLAUDE.md that links to AGENTS.md is ok.
- **Hoisted guides.** Package guides hoisted to a workspace root are found, up to the repo root. A guide that's only inside pnpm's store is named in an `agent-guide-stale` info.
- **Hook refresh.** An app that already has the `SubagentStart` hook gets it refreshed by a plain `genesis agents`, so an upgrade carries a changed command. `--check` and the doctor flag an older hook command.
