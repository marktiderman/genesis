---
"@marktiderman/genesis-cli": patch
---

`genesis agents` follow-ups:
- **CLAUDE.md states.** A blocked CLAUDE.md is reported the same way on macOS and Linux, and a CLAUDE.md that links to AGENTS.md is ok.
- **Hoisted guides.** Package guides hoisted to a workspace root are found, up to the repo root, when that copy is the version the app resolved. A guide that's only inside pnpm's store is named in an `agent-guide-stale` info.
- **Older hooks.** `--check` and the doctor flag an older `SubagentStart` hook command; `genesis agents --hooks` updates it. A plain `genesis agents` still never writes settings.
