---
"@marktiderman/genesis": patch
"@marktiderman/genesis-cli": minor
---

From review: the umbrella's `versions.json` lists only the Genesis packages the umbrella depends on (and so releases with), so a patch to a package it doesn't depend on, such as the CLI or supabase, no longer looks like version skew. `genesis init --native` writes a Tailwind config with NativeWind's preset and the genesis-ui-native glob (without it, neither is written). `genesis features find` reports bad options as a clean CLI error instead of a stack trace.
