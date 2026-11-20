# @marktiderman/genesis-features

## 0.10.0

### Minor Changes

- 4b7af48: **`@marktiderman/genesis-features` is now `@marktiderman/genesis-config`** (renamed in place: same
  source, same exports and subpaths `.`, `/blocks`, `/gate`, `/gate/react`, `/node`, `/react`; `/blocks`
  and `/gate` stay free of zod). Feature ids, `features.ts`, `features.json`, `flags.json` and the
  generated AGENTS.md block keep their format.

  `@marktiderman/genesis-features` becomes a thin, deprecated re-export of genesis-config with the
  same subpaths, kept for two minor versions (0.10 and 0.11). Move with `npx genesis codemod
genesis-features-renamed-genesis-config` (`genesis upgrade` runs it too, whenever a package.json
  still lists genesis-features). See docs/MIGRATION.md.

  Publishing steps for this rename are in docs/RELEASING.md ("Renaming a package").

- 6c40ccc: **The Settings screen and its protocol.** New zod-free subpath `/settings-protocol`: the versioned
  `{ v, op }` requests (`state`, `setValue`, `clearValue`, `plan`, `apply`, `upgrades`, `audit`,
  `propose`, `setSecret`) and their answers; `SettingsCapabilities` (`writeFiles`, `writeDatabase`,
  `setSecrets` per store or for all, `runCli`, `agent`, optional `proposeChanges`) with
  `APP_HOST_CAPABILITIES`, `intersectCapabilities` (only `false` narrows) and `canSetSecret`; the
  error codes (`SettingsProtocolError`); the shared rules `settingWritability`,
  `preferredWriteLayer` (the file layer first), `auditValuesVisible` and `safeHref`; and
  `createSettingsClient(fetch, { baseUrl, token, timeoutMs, messages })` (bearer token, no cookies,
  JSON only, a 30-second timeout, a shape check on `state`). New subpath `/settings/react`:
  `<GenesisSettings client capabilities header />`, built from genesis-ui, with Values (value, source
  layer and lock per key; edits only where the host can write; build keys and file-locked keys
  through the repo), Health (plan, confirm, apply with the plan's hash; database-only fixes on the
  app host; guided and manual fixes), Secrets (set or missing, never a value; Vault secrets set
  write-only when the host allows), Upgrades and Audit tabs, overridable `copy` and test ids. Both
  subpaths are also on the deprecated genesis-features alias. The optional genesis-ui peer is now
  3.0.0 or later.
  Both subpaths are Beta: the screen ships before its design review.

  Features: settings-screen

- 95bab84: **Settings.** `defineSettings(namespace, keys)` declares a package's settings: each key's type, a
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

### Patch Changes

- Updated dependencies [818908b]
- Updated dependencies [4b7af48]
- Updated dependencies [f4e39b1]
- Updated dependencies [6c40ccc]
- Updated dependencies [95bab84]
- Updated dependencies [71cb0e2]
  - @marktiderman/genesis-config@0.11.0
