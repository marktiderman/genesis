---
"@marktiderman/genesis-cli": minor
---

`genesis.config.json` takes an `environments` block (`previews`: on-demand, every-pr or off; `label`; `branchPrefix`) that the Vercel ignore-build template reads as the app's own preview defaults. A variable set in the Vercel project still wins, and the file wins over Genesis's defaults. The doctor fails an unknown key or value in the block.
