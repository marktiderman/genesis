---
"@marktiderman/genesis-data": minor
"@marktiderman/genesis-data-server": minor
"@marktiderman/genesis-studio": minor
"@marktiderman/genesis-studio-server": minor
"@marktiderman/genesis-cli": minor
---

**Genesis Data Studio is now Genesis Data.** The name "Genesis Studio" now belongs to the creator suite (Map, Imago and the tools beside them), and the table and record editor is Studio's Data tool.

- `@marktiderman/genesis-studio` is now `@marktiderman/genesis-data`, and `@marktiderman/genesis-studio-server` is now `@marktiderman/genesis-data-server`, with the same exports, stylesheets and entries. The server's command is `genesis-data-server`.
- The old packages are deprecated aliases that re-export the new ones for two minor versions, so nothing breaks: `genesis-studio-server` still runs the command. `genesis doctor` reports imports of the old names as `deprecated-import`.
- An app whose stylesheet scans the old package (`@source ".../genesis-studio/dist"`) still gets the editor's classes: the alias ships genesis-data's built module, unimported, for Tailwind to find. `genesis data init` adds the new `@source` line once, including to an app set up under the old name.
- `genesis data init` turns Genesis Data on in an app. `genesis studio init` still works and says it's been renamed.
- Unchanged on purpose: the exported names (`DataStudio`, `createStudioHandler`, …), the `genesis_studio` database schema and the `genesis_studio_login` role, so a deployed app needs no migration.
