# ADR 0025: Genesis Data, the Data Studio's new name

- Status: proposed
- Date: 2026-11-20
- Features: `data-studio`, `studio-init`
- Related: docs/DATA.md (the editor's design), the genesis-features → genesis-config rename (the alias pattern this follows)

## Context

"Genesis Studio" is to name the creator suite: the tools for designing, building, maintaining and
supporting an app (Map, Imago and the ones beside them). The name was taken by the table and record
editor, published as `@marktiderman/genesis-studio` and `@marktiderman/genesis-studio-server`, set
up with `genesis studio init`, and called the Data Studio in the docs. The maintainer decided the
suite keeps "Studio" and the editor becomes one of its tools.

Nothing about the editor changes: only its names.

## Decision

1. The editor is **Genesis Data**: `@marktiderman/genesis-data` (`packages/data`) and
   `@marktiderman/genesis-data-server` (`packages/data-server`), same layer (primitive) and group
   (data), same entries, stylesheets and exports. The server's command is `genesis-data-server`.
2. The CLI command is `genesis data init`. `genesis studio init` stays as a deprecated alias that
   says it was renamed and runs the same thing.
3. `@marktiderman/genesis-studio` and `@marktiderman/genesis-studio-server` keep publishing for two
   minor versions as deprecated aliases (`packages/studio`, `packages/studio-server`): a
   `deprecated` notice and one-line re-exports of every entry (`.`, `/client`, `/auth` for import
   and require, `/styles.css`, `/standalone.css`) and the `genesis-studio-server` command.
4. `genesis doctor` lists both old names in `RENAMED_PACKAGES`, so an import left behind is
   reported as `deprecated-import`, and checks the server's auth imports under either name.
5. Kept as they are: the exported names (`DataStudio`, `createStudioHandler`, …), the
   `genesis_studio` schema, the `genesis_studio_login` role, and the files `init` writes. A
   deployed app needs no migration.

## Glossary

- **Genesis Data**: the table and record editor (was "Data Studio"). Don't call it the studio.
- **Genesis Studio**: the creator suite. Defined when its first tool ships in Genesis.

## Alternatives

- **Keep "Data Studio" and name the suite something else.** The maintainer chose Studio for the suite.
- **Rename the package in place, with no alias.** Breaks every app on the old name at once.
- **Rename the exports and the schema too.** Needs a migration in every app, for no gain in behaviour.

## Consequences

- Apps move their imports and dependency to the new names whenever they like (the exports are the
  same); `genesis upgrade` can learn a codemod later, as genesis-features has.
- After the release, the maintainer runs `npm deprecate` on the two old names.
- The aliases go after two minor versions. The exported names can be renamed later through the
  same alias, if wanted.
