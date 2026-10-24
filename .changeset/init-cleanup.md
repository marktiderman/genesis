---
"@marktiderman/genesis-cli": patch
---

`genesis init` writes files that work: the Tailwind config imports `genesisPreset` from `@marktiderman/genesis-design-system/presets/tailwind` (the old `/tailwind-preset` path was never exported), and `app/global.css` imports `themes/genesis.css` (the old `tokens.css` didn't exist). It no longer writes `.genesis/cli.yml`, which nothing read. The generated CLAUDE.md and the next steps point at `genesis features find`, `genesis doctor` and the framework docs instead of a document that isn't in the repo, and no longer assume pnpm. `genesis --version` reports the installed version instead of `0.1.0`. The package stops listing a `templates` folder it doesn't have.

Features: cli-init
