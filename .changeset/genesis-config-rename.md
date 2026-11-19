---
"@marktiderman/genesis-config": patch
"@marktiderman/genesis-features": minor
---

**`@marktiderman/genesis-features` is now `@marktiderman/genesis-config`** (renamed in place: same
source, same exports and subpaths `.`, `/blocks`, `/gate`, `/gate/react`, `/node`, `/react`; `/blocks`
and `/gate` stay free of zod). Feature ids, `features.ts`, `features.json`, `flags.json` and the
generated AGENTS.md block keep their format.

`@marktiderman/genesis-features` becomes a thin, deprecated re-export of genesis-config with the
same subpaths, kept for two minor versions (0.10 and 0.11). Move with `genesis upgrade`, which runs
the `genesis-features-renamed-genesis-config` codemod when genesis-features crosses 0.10.0.

genesis-config's first version (0.10.0) is published by hand before this release (a brand-new npm
name; docs/RELEASING.md, "A brand-new package"); this patch is the one CI publishes.
