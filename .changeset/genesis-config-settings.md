---
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-features": minor
---

**Settings.** `defineSettings(namespace, keys)` declares a package's settings: each key's type, a
default (or one per preset: `{ max, standard, min }`), `scope` (`app`, `tenant` or `person`),
`applies` (`build` or `runtime`), `requires`, bounds (`min`, `max`, `options`), the secret it needs
by name only (`needs: "secret:NAME"`, `store`), and optional `feature` / `flag` links to the gate.
`settingsCatalogue` merges every package's declarations, and `resolveSettings(catalogue, layers)`
resolves default → preset → genesis.config.json → database → tenant → person (later layers win
unless an earlier one locks the value; tenant and person change only keys declared with that
scope; only the file sets a build-time key) into `{ values, sources, problems }`. `withSettings`
folds the result into a `GateContext` (switched-off features into `off`, linked flags into `flags`),
so `featureOn` is unchanged. New zod-free subpath `/settings` (also on the root, and on the
deprecated genesis-features alias).
