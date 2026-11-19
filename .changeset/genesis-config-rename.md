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

genesis-config's first version (0.10.0) is published by hand before this release (a brand-new npm
name; docs/RELEASING.md, "A brand-new package"); this patch is the one CI publishes.

Release steps for the maintainer (docs/RELEASING.md):

1. Before merging the version PR, hand-publish and trust genesis-config's first version (0.10.0;
   "A brand-new package").
2. After CI publishes genesis-features 0.10.x, deprecate **every** version of the old name, 0.9.x
   included (the codemod moves an app from any of them, and a 0.9.x install should hear about the
   rename too):

   ```bash
   npm deprecate '@marktiderman/genesis-features' "Renamed to @marktiderman/genesis-config. Run npx genesis codemod genesis-features-renamed-genesis-config (or genesis upgrade). The alias is kept for 0.10 and 0.11."
   ```

   npm ignores package.json's `deprecated` field when publishing; it's there for the doctor and for
   readers, so this command is what makes installs warn.

