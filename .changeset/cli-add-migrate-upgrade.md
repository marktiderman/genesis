---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-native": patch
---

`genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

- `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
- `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
- `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
- `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

`genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.
