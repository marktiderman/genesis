---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-cli": patch
---

**One settings resolver on the server.** genesis-supabase 0023 adds `private.genesis_setting(key,
tenant)`: a key's value as `resolveSettings` gives it (default and preset from the synced
catalogue, the file, the database, a tenant-scoped key's tenant value, with locks).
`catalogueManifest` now writes each key's `defaults` by preset for it (write the manifest again on
deploy). Support's gates read it with the tenant where there is one, so a tenant's
`support.helpCenter` closes its help center on the server too; support 0020's own resolver is
dropped (0033), and its `_int` and `_bool` readers are deprecated wrappers.

**Support's unreleased migrations come after 0028**, so apps that applied 0026 and 0028 apply them
in order: desks 0029, notifications 0030, reply by email 0031, staff from the admin list 0032, the
resolver 0033 (support block) and requester labels 0034 (support-chat block).

**Settings written once.** `SupportSettingValues` is derived from the specs. `support.email` is no
longer planned; `support.verifyPrompt` turns on the verify prompt (the
`genesis_support_verify_prompt_enabled()` hook still works, deprecated); `support.githubRepo` names
its `github.issues` setup step, and the `sentry` and `ai.key-budget` steps no longer offer to save a
setting nothing reads.

**One hook each.** Names come from `private.genesis_person_name` and `private.genesis_tenant_label`
first (an app's own `genesis_support_person_name` or `genesis_support_tenant_label` is a deprecated
fallback), and the report's requester labels only from `genesis_support_requester_labels` (0034:
the one-ticket `genesis_support_requester_label` is no longer called). See docs/MIGRATION.md.
