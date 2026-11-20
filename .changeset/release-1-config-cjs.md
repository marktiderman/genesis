---
"@marktiderman/genesis-config": patch
---

**Loadable from CommonJS.** `.`, `/blocks`, `/gate`, `/settings`, `/settings-protocol` and `/node`
now ship a CommonJS build beside the ESM one (a `require` condition). genesis-cli's Expo config
plugin reads `/settings`, and Expo loads plugins with `require` (through `tsx/cjs` in an
`app.config.ts`), where an import-only subpath failed with "Package subpath './settings' is not
defined by exports". The React entries stay ESM only.

Also: a setting can be declared `planned: true` (declared ahead of the code that reads it; the
doctor treats it as dormant). On the Settings screen, a late plan for one fix is never shown or
applied in another fix's sheet; an older state, upgrades or audit answer never overwrites a newer
one; a 200 the screen can't draw (a malformed plan, result, upgrades list or catalogue entry) is an
error, not a crash; a host that returns only a snippet no longer reads "Pull request opened"; the
Vault field clears as soon as it is sent; a finding with a guided step shows its `genesis fix <id>`
command (`genesis setup` isn't available yet). `resolveSettings` no longer throws on a bigint value,
and of two keys linked to one flag, an app-locked one keeps the flag's value.
