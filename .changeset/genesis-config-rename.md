---
"@marktiderman/genesis-config": patch
"@marktiderman/genesis-features": minor
---

**`@marktiderman/genesis-features` is now `@marktiderman/genesis-config`** (renamed in place: same
source, same exports and subpaths `.`, `/blocks`, `/gate`, `/gate/react`, `/node`, `/react`; `/blocks`
and `/gate` stay free of zod). Feature ids, `features.ts`, `features.json`, `flags.json` and the
generated AGENTS.md block keep their format.

`@marktiderman/genesis-features` becomes a thin, deprecated re-export of genesis-config with the
same subpaths, kept for two minor versions (0.10 and 0.11). Move with `npx genesis codemod
genesis-features-renamed-genesis-config` (`genesis upgrade` runs it too, whenever a package.json
still lists genesis-features). See docs/MIGRATION.md.

Publishing steps for this rename are in docs/RELEASING.md ("Renaming a package").
