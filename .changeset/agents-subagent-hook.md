---
"@marktiderman/genesis-cli": minor
---

`genesis agents --hooks` writes a `SubagentStart` hook into `.claude/settings.json` that gives Claude Code's Explore and Plan subagents (which start without CLAUDE.md or AGENTS.md) the Genesis rules and the installed package guides, plus `permissions.deny` rules for `.env` files. The hook passes `--dir "$CLAUDE_PROJECT_DIR"`, so a session started in a subfolder still gets the guides. The app's own settings are kept. `genesis agents --hook subagent-start` prints the hook's output and never fails.
