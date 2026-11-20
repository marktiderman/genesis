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
`support.helpCenter` closes its help center on the server too; support 0020's own resolver and
its `_int` and `_bool` readers are dropped (0033; the support-chat block's agent list moves in 0034).

**Support's unreleased migrations come after 0028**, so apps that applied 0026 and 0028 apply them
in order: desks 0029, notifications 0030, reply by email 0031, staff from the admin list 0032, the
resolver 0033 (support block) and requester labels 0034 (support-chat block).

**Settings written once, and every key read.** `SupportSettingValues` is derived from the specs.
No key is planned any more: `support.email` gates reply by email, `support.aiAnswers` gates a
tenant's AI answers in the database (0029), and `support.chatThreads` off keeps threads on
support_replies (`createSupport`, `createSupportClient({ settings })`); `support.verifyPrompt` turns on the verify prompt (the
`genesis_support_verify_prompt_enabled()` hook still works, deprecated); `support.githubRepo` names
its `github.issues` setup step; the `sentry` step no longer saves its DSN as a setting and
`ai.key-budget` drops its budget field (no package reads either).

**One hook each.** Names come from `private.genesis_person_name` and `private.genesis_tenant_label`
first (an app's own `genesis_support_person_name` or `genesis_support_tenant_label` is a deprecated
fallback), and the report's requester labels only from `genesis_support_requester_labels` (0034:
the one-ticket `genesis_support_requester_label` is no longer called, and `byRequesterCapped` is
gone). See docs/MIGRATION.md.

**Managing agents, and desk names for the screens.** 0034 makes who manages a desk's agents one rule
(`support_set_agent`, the new `support_can_manage_agents` / `client.canManageAgents`), gives
`support_agents_list` each agent's `role` and `removable`, and adds `support_people_search` /
`client.searchPeople` for them to find the people in their tenant by name or email (through the
app's member and name hooks, never another tenant's, no anonymous logins). 0029's
`support_my_ticket_desks` / `client.myTicketDesks` names the desk of each of the person's own
tickets.

**Removed in the next minor:** the deprecated `private.genesis_support_verify_prompt_enabled()` hook
(set `support.verifyPrompt`), and an app's own `private.genesis_support_person_name` and
`private.genesis_support_tenant_label` as fallbacks (define `private.genesis_person_name` and
`private.genesis_tenant_label`).
