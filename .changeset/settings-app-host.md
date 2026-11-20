---
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-cli": minor
---

The Settings screen now runs inside the app. genesis-supabase's `createSettingsHandler` (`/settings/server`) serves every op of the settings protocol from the app's Supabase, as the signed-in person: it calls the database with their own token (never the service role) and answers its own origin only. A platform admin sees every key, the health the server can know, secrets, upgrades, the whole history and pending proposals; a tenant's admin sees and writes that tenant's `scope: "tenant"` keys; anyone else their own `scope: "person"` keys. A bad database value is fixed through plan and apply with a hash over what is stored.

The new `settings-host` block (migration `0024_genesis_settings_host.sql`, after the settings block) adds `genesis_settings_viewer`, proposals (`propose_genesis_setting`, `decide_genesis_setting_proposal`: someone who can't change a locked value asks, with why, and a platform admin approves or declines), Vault set and rotate for platform admins (`set_genesis_vault_secret`: the value is a parameter all the way into Vault, never logged or stored outside it; `genesis_secret_rotations` records when, without it) and one paged history (`genesis_settings_audit`).

genesis-config: `<GenesisSettings tenant>` shows the viewer's slice (`state.viewer`) with a Propose button for a value the app locked, and a platform admin decides proposals on Values. The protocol gains `SettingsViewer`, `SettingsProposalEntry`, the `decideProposal` op and `propose`'s `reason`; `settingWritability` takes the viewer. `catalogueManifest` now writes each key's whole declaration (default, summary, links, a secret's name and store), and `catalogueFromManifest` rebuilds the catalogue from it: run `genesis settings sync` again after upgrading.

genesis-cli: `genesis settings init` writes the handler's route for Next.js, TanStack Start, React Router or Expo Router.
