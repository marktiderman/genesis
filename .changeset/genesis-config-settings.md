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
folds the result into a `GateContext`: switched-off features into the new `settingsOff` (answered
with the new `GateReason` `"setting"`, checked before the tenant's switch), linked flags into
`flags`, and a setting the app locked (genesis.config.json or the database: `APP_LOCK_LAYERS`) wins
over the context's own switch and flag; a tenant or person lock only stops later settings layers. `resolveSettings` never
throws (an unknown preset is a `preset` problem, resolved on `max`), its maps have no prototype, a
lock with a bad value still locks, `null` fits only a key whose default is `null`, and
`SCOPE_LAYERS` holds the scope rule. New zod-free subpath `/settings` (also on the root, and on the
deprecated genesis-features alias).
