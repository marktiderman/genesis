---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-cli": patch
---

**One settings resolver on the server.** genesis-supabase 0023 adds `private.genesis_setting(key,
tenant)` (and `private.genesis_setting_entry`, which also says the layer and the lock): a key's
value as `resolveSettings` gives it (default and preset from the synced catalogue, the file, the
database, a tenant-scoped key's tenant value, with locks). One function checks values
(`genesis_setting_value_problem`), for writes and the resolver alike. `catalogueManifest` now writes
each key's `defaults` by preset (write the manifest again on deploy). Support's gates read it with
the tenant where there is one, so a tenant's `support.helpCenter` closes its help center on the
server too; support 0020's own resolver and its readers are dropped (0033).

**Support's unreleased migrations come after 0028**, so apps that applied 0026 and 0028 apply them
in order: desks 0029, notifications 0030, reply by email 0031, staff from the admin list 0032, the
resolver 0033 (support block) and agent admin 0034 (support-chat block).

**Every setting is read, on the server where it matters.** `SupportSettingValues` is derived from
the specs. No key is planned: `support.email` opens and closes the email channel
(`support_receive_email` files nothing, `support_claim_outbound_emails` sends nothing while it is
off), `support.aiAnswers` gates a tenant's AI answers (0029), `support.chatThreads` off makes
`support_chat_conversation` answer none, so every client stays on support_replies (0034), and
`support.verifyPrompt` turns on the verify prompt. `support.githubRepo` names its `github.issues`
setup step; the `sentry` step no longer saves its DSN as a setting and `ai.key-budget` drops its
budget field (no package reads either).

**Agents and people** (0034). Who manages a desk's agents is one rule, and a null tenant is the
app's own desk everywhere: `support_set_agent` and the new `support_can_manage_agents` /
`client.canManageAgents` agree. `support_agents_list` gives each agent's login, person record,
`role` and `removable`. `support_people_search` / `client.searchPeople` lets a desk's agents (who
also link email tickets) find people in its tenant by name or email, with their person record and
login: through the app's optional `private.genesis_people_search` hook, else the people support
knows at that desk, so the cost never follows the number of logins; only the tenant's people, no
anonymous logins. 0029's `support_my_ticket_desks` / `client.myTicketDesks` gives each of the
person's own tickets its desk, the desk's name and whether it is the app's own.

**Requester labels from one hook** (0034): the report asks only
`genesis_support_requester_labels`; the one-ticket `genesis_support_requester_label` is no longer
called (the report warns while it is the only one), and `byRequesterCapped` is gone. See
docs/MIGRATION.md.

**Removed in the next minor:** the deprecated `private.genesis_support_verify_prompt_enabled()` hook.
Set `support.verifyPrompt` instead; a value set or locked in any layer already wins over the hook.
