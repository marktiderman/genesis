---
"@marktiderman/genesis-cli": patch
---

README: `genesis upgrade --version <v>` is upgrade's own option (fixed in 1.18.0; 1.17.3 printed the CLI's version), and how to upgrade with the release's own CLI. An upgrade runs in the CLI that started it and moves the app's genesis-cli dependency, but doesn't restart in the new one, so its codemods and doctor are the installed CLI's: run `npx @marktiderman/genesis-cli@latest upgrade --version <v>` to use the new one.
