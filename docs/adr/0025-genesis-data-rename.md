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
- The two new names are brand-new npm packages, so the release follows `docs/RELEASING.md`
  ("Renaming a package" and "A brand-new package"), in this order, or CI's "Verify npm Trusted
  Publishing" step stops the whole release (genesis-cli included, which depends on
  genesis-data-server):
  1. Merge the batch into `main`, but **don't merge the version PR yet**.
  2. From a clean `main` checkout, publish each new package by hand at the version it has on
     `main` (genesis-data-server 0.6.0, genesis-data 0.4.3, the old packages' last versions), and
     trust it right after: `pnpm --filter @marktiderman/<pkg> publish --access public
     --no-git-checks`, then `npx -y npm@latest trust github @marktiderman/<pkg> --file release.yml
     --repo marktiderman/genesis --env npm --allow-publish --allow-stage-publish -y`. If `trust`
     answers 404, wait a few minutes and run it again.
  3. Merge the version PR within 48 hours, before the new trust expires. The changeset gives both
     new packages a minor bump (0.7.0 and 0.5.0), so CI publishes each once and uses its trust.
  4. Once the aliases are out, deprecate **every** version of both old names:
     `npm deprecate '@marktiderman/genesis-studio' "Renamed to @marktiderman/genesis-data (same exports). The alias is kept for two minor versions."`,
     and the same for `@marktiderman/genesis-studio-server` → `@marktiderman/genesis-data-server`.
- The aliases go after two minor versions. The exported names can be renamed later through the
  same alias, if wanted. `docs/DATA-STUDIO.md` stays as a pointer to `docs/DATA.md` until then,
  because the published old versions link to it.
- The sample app serves Genesis Data at `/data`; `/studio` redirects there. The generated
  `/api/studio` route and `genesis-studio` Edge Function keep their names: they are files in
  deployed apps, and renaming them would break those apps' URLs for no gain.
