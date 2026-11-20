---
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-features": minor
---

**The Settings screen and its protocol.** New zod-free subpath `/settings-protocol`: the versioned
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
