---
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-features": minor
---

**The Settings screen and its protocol.** New zod-free subpath `/settings-protocol`: the versioned
`{ v, op }` requests (`state`, `setValue`, `clearValue`, `plan`, `apply`, `upgrades`, `audit`,
`propose`) and their answers, `SettingsCapabilities` (`writeFiles`, `writeDatabase`, `setSecrets`,
`runCli`, `agent`, optional `proposeChanges`) with `APP_HOST_CAPABILITIES` and
`intersectCapabilities`, the error codes (`SettingsProtocolError`), `settingWritability` (the write
rules: build keys in the file layer only, each layer behind its capability, no write above a lock)
and `createSettingsClient(fetch, { baseUrl, token })` (bearer token, JSON only). New subpath
`/settings/react`: `<GenesisSettings client capabilities />`, built from genesis-ui, with Values
(value, source layer and lock per key; edits only where the host can write), Health (plan, confirm,
apply with the plan's hash; guided and manual fixes), Secrets (set or missing, never a value),
Upgrades and Audit tabs, overridable `copy` and test ids. Both subpaths are also on the deprecated
genesis-features alias.
