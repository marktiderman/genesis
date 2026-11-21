# @marktiderman/genesis-supabase

## 0.18.0

### Minor Changes

- 67d5859: Settings: migration `0025_genesis_settings_pattern.sql` makes the database refuse a string setting that doesn't match its key's `pattern` as a whole value (`^(?:pattern)$`, as genesis-config checks it) (genesis-config's new `pattern`, written into the synced catalogue), in `set_genesis_setting`, the tenant and person writes and the server's resolver alike. A `pattern` that isn't a string, or that Postgres can't compile, is reported as a malformed catalogue entry. It is part of the settings block (`genesis migrate` copies it).

### Patch Changes

- Updated dependencies [c9541ac]
  - @marktiderman/genesis-config@0.13.0

## 0.17.0

### Minor Changes

- 02a51b9: **One settings resolver on the server.** genesis-supabase 0023 adds `private.genesis_setting(key,
tenant)` (and `private.genesis_setting_entry`, which also says the layer and the lock): a key's
  value as `resolveSettings` gives it (default and preset from the synced catalogue, the file, the
  database, a tenant-scoped key's tenant value, with locks). One function checks values
  (`genesis_setting_value_problem`), for writes and the resolver alike; a catalogue entry whose `min`
  or `max` isn't a number is reported as malformed there, never a cast error in a server gate. `catalogueManifest` now writes
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
  anonymous logins. People search is deliberately open to every agent of the desk, not only those who
  manage its agents (linking an email ticket needs it): any agent can read the names and emails of the
  tenant's people who match, 25 per query. Which records a login is in a tenant is one rule
  (`private.genesis_support_people_in`), which 0004's `genesis_support_agent`, the admin agent check
  and the search share: under zero config a login added at the app's own desk is an agent there (it
  shows in the list and sees the desk's tickets), and an admin row there manages its agents.
  `support_agents_list` lists every agent row, one whose person has no login with a null `user_id`,
  so it can be seen and removed. 0029's `support_my_ticket_desks` / `client.myTicketDesks` gives each of the
  person's own tickets its desk, the desk's name and whether it is the app's own.

  **Breaking: `SupportClientOptions.settings` is removed.** The server decides whether threads run on
  chat: with `support.chatThreads` off, `support_chat_conversation` (0034) answers none, so every
  client stays on support_replies whatever `chat` it was given. Migrate: drop `settings` from
  `createSupportClient(supabase, { … })` (TypeScript flags it), apply support 0034 and set
  `support.chatThreads` where you set it before (genesis.config.json or the settings screen); write
  the manifest on deploy so the server reads it.

  **Breaking (types): `client.staffList` returns `SupportStaffMember[]`**, whose `id` (the login) is
  null for an agent row whose person has no login. Code that reads `id` as a string checks for null
  first; such a row can't be assigned a ticket, but it can be removed by its `personId`.

  **Requester labels from one hook** (0034): the report asks only
  `genesis_support_requester_labels`; the one-ticket `genesis_support_requester_label` is no longer
  called (the report warns while it is the only one), and `byRequesterCapped` is gone. See
  docs/MIGRATION.md.

  **Removed in the next minor:** the deprecated `private.genesis_support_verify_prompt_enabled()` hook.
  Set `support.verifyPrompt` instead; a value set or locked in any layer already wins over the hook.

- c2161cf: Zero config has a platform admin list.

  - genesis-supabase: new migration `0022_genesis_platform_admins.sql` in the settings block (copy it with `genesis migrate`). `public.genesis_platform_admins` starts empty and only the service role reads or writes it. While the app has no `private.genesis_platform_admin` hook, Genesis's own wrappers (`private.genesis_person_is_platform_admin`, 0020's `private.genesis_is_platform_admin`, `set_genesis_setting`) read the list; no function under the app's hook name is Genesis's, so the app adds its own hook whenever and however it likes and the list is then unused. Nobody is an admin until added; never every signed-in person.
  - genesis-support: new migration `0032_genesis_support_staff_admin_list.sql`: with no staff hook, support staff are the platform admins through that wrapper, so the people in the list are staff too.
  - genesis-cli: new doctor rule `platform-admin-missing` (warn, read with the database layer through the linked project): the app has the list, no hook of its own, and the list is empty. Its guided fix, `settings.first-admin`, prints the SQL that adds the first admin by a confirmed email (`email_confirmed_at is not null`) and adds nobody when no confirmed person, or more than one, has it.
  - The RN starter ships the settings block (genesis-supabase 0020, 0021 and 0022) and support's 0032, so `genesis init --template native` records it. Its README and the README `genesis init` writes say to run `genesis settings sync` on every deploy, after the migrations, and to add the first admin.

- 11219ef: The Settings screen now runs inside the app. genesis-supabase's `createSettingsHandler` (`/settings/server`) serves every op of the settings protocol from the app's Supabase, as the signed-in person: it calls the database with their own token (never the service role) and answers its own origin only. A platform admin sees every key, the health the server can know, secrets, upgrades, the whole history and pending proposals; a tenant's admin sees and writes that tenant's `scope: "tenant"` keys; anyone else their own `scope: "person"` keys. A bad database value is fixed through plan and apply with a hash over what is stored.

  The new `settings-host` block (migration `0024_genesis_settings_host.sql`, after the settings block) adds `genesis_settings_viewer`, proposals (`propose_genesis_setting`, `decide_genesis_setting_proposal`: someone who can't change a locked value asks, with why, and a platform admin approves or declines), Vault set and rotate for platform admins (`set_genesis_vault_secret`: the value is a parameter all the way into Vault, never logged or stored outside it; `genesis_secret_rotations` records when, without it) and one paged history (`genesis_settings_audit`).

  genesis-config: `<GenesisSettings tenant>` shows the viewer's slice (`state.viewer`) with a Propose button for a value the app locked, and a platform admin decides proposals on Values. The protocol gains `SettingsViewer`, `SettingsProposalEntry`, the `decideProposal` op and `propose`'s `reason`; `settingWritability` takes the viewer. `catalogueManifest` now writes each key's whole declaration (default, summary, links, a secret's name and store), and `catalogueFromManifest` rebuilds the catalogue from it: run `genesis settings sync` again after upgrading.

  genesis-cli: `genesis settings init` writes the handler's route for Next.js, TanStack Start, React Router or Expo Router.

- 77aae6e: Settings: the tenant and person layers, and Realtime refresh (migration `0023_genesis_settings_tenant_person.sql`). `genesis_tenant_settings` stores a tenant's values for keys declared `scope: "tenant"`, set by that tenant's admins (`private.genesis_tenant_admin`) through `set_genesis_tenant_setting`; `genesis_person_settings` stores a person's own values for keys declared `scope: "person"`, through `set_genesis_person_setting`. Each write is checked against the synced catalogue, and refused for a key of another scope or one genesis.config.json or the database layer locks; every change goes to `genesis_scoped_setting_changes`. A tenant's members read its values (its admins alone the history), a person their own, platform admins everything. `genesis_settings_layers(tenant)` returns the tenant's layer and the signed-in person's; `readSettingsLayers` and `resolveAppSettings` take `tenantId` and resolve with them; `setGenesisSetting` and `clearGenesisSetting` take `layer: "tenant" | "person"`. Changes to any settings table are broadcast on private Realtime channels (the layer and key only), and the new `watchAppSettings` re-resolves on each. Until 0023 is applied, the client reads 0020's layers and resolves without tenant and person values, warning once (docs/MIGRATION.md).
- 06ccee9: The `genesis-support-notify` Edge Function template reads `support.githubRepo` and
  `support.webhookUrl` from the app's settings (`genesis_settings_layers`) when `GITHUB_REPO` or
  `SUPPORT_WEBHOOK_URL` isn't set, and posts no webhook with `support.staffAlerts` off;
  `settingsFromLayers` reads a value as the resolver would (locked file, database, file).

### Patch Changes

- c2161cf: Support nits from the #848 review:

  - `createDiagnostics` empties the offline queue when a settings answer turns `diagnostics.enabled` or `diagnostics.offlineQueue` off after the queue was made; before, queued dumps waited and could go out once it was turned back on.
  - `cleanRoute` redacts secret keys with no digits: a known prefix with a body of letters and digits (`sk_live_…`, `sk_test_…`, `whsec_…`, `ghp_…`, Supabase's `sb_secret_…` and `sb_publishable_…`, and `github_pat_…`), and 32 or more letters with no separator that read as random (capitals side by side in mixed case, few vowels, or 7 consonants in a row); and `whatsapp:` links (`:phone`). Slugs stay: `whsec_rotation_guide`, `sk_test_driven_development_basics`, `MyAppHomeTabFeedItemDetailViewScreen`, `whyhttpsmattersforyoursmallbusinesssite`. The intake function's copy matches.

- c1b2ac0: `watchAppSettings` started right after another stopped (a sign-in, a sign-out) now joins its Realtime channels once the old ones are gone, and reads again on that first join. Before, realtime-js handed it the channel still leaving under the same topic, `subscribe()` did nothing, and live settings stopped. Adds the `AppSettings` type: the settings it and `resolveAppSettings` give.
- Updated dependencies [02a51b9]
- Updated dependencies [11219ef]
- Updated dependencies [8f49de2]
- Updated dependencies [4acea0b]
- Updated dependencies [ec8a3ba]
- Updated dependencies [22bfd48]
  - @marktiderman/genesis-config@0.12.0

## 0.16.1

### Patch Changes

- 7481a71: `genesis settings sync` writes the app manifest (genesis-supabase's `genesis_app_manifest`: the Genesis packages and versions, the preset, genesis.config.json `settings` and the settings catalogue) through the linked Supabase project (`supabase db query --linked`, or `--project-ref`), after naming the project and asking (`--yes` skips the question and is required without a terminal; an invalid `preset` is refused, not stored as `max`; on Windows the SQL goes through a temp file); `--print` gives the SQL for a pipeline that runs it with psql, and `--app-id` names the app when its package.json name isn't an id. Run it on every deploy, after the migrations: until the manifest is written, `set_genesis_setting` refuses every value, and nothing wrote it. The settings block's setup step and the genesis-supabase README say so; a server can still write it at start with `writeAppManifest`.
- 7481a71: Support fixes from the release review:

  - The server handler's screenshot allowlist is a `Map`, so a part typed `constructor` (or any `Object` member) is never an allowed type.
  - When the store refuses the dump brought with a piece of feedback, the notification names no dump (it named one that doesn't exist).
  - Without `waitUntil`, the handler waits at most 5 seconds for its notifiers before answering, so a hung notifier can't make the client retry and file the report twice.
  - GitHub issues: the admin link's `(`, `)`, `<` and `>` are percent-encoded, so an `adminUrl` can't close the link early; a long title is cut to GitHub's 256 characters after neutralising (the issue was refused with 422 and lost).
  - Reply by email: an HTML-only reply laid out in `<header>` is read whole (`<head` inside `<header>` dropped everything after it).
  - `lucide-react` is declared (an optional peer, as genesis-notifications does): `/web-boards` and `/web-chat` import it.
  - The privacy note says the dump's size, hourly limit and retention are defaults the app's settings can change.
  - genesis-supabase README: a direct database login's setting writes are recorded as `database`, not `server` (the service role's are `server`).

- 7481a71: `cleanRoute` redacts long digit runs and grouped codes written as slugs again: `/order/card-4111111111111111` and `/invite/ABCD-EFGH-1234-5678` become `/order/:token` and `/invite/:token`, as they did before the slug rule kept them whole. A slug part of 7 digits or more, or three or more parts of one length with letters and digits, is a token; ordinary slugs, dates and versions (`top-10-tips-2024`, `release-2024-11-19`) stay readable. The support intake function's copy of the contract matches.
- 462af35: Support fixes from the #848 review:

  - `cleanRoute` judges each segment after percent-decoding and redacts more: a slug with 9 or more digits in all (`order-4111-1111-1111-1111`, `call-555-555-0101`; a date like `release-2024-11-19` has 8 and stays), card and IBAN numbers in groups joined by spaces (`%20`) or `+`, phone numbers without a `+` (`555-555-0101`, `555.555.0101`, `(555) 555-0101`, `tel:` links), SSNs (`123-45-6789` → `:id`) and base64 with `=` padding. A percent-encoded `?` or `#` (`%3F`, `%23`) ends the path like a written one. The intake function's copy matches.
  - The whole-dump cap measures the dump as the database stores it (jsonb text, a space after every `,` and `:`), so a dump trimmed to `diagnostics.maxBytes` (up to 512 KB) is never refused by migration 0019's size check.
  - A settings function that has never answered means no dumps (fail closed) in `createDiagnosticsHandler`, `createSupport` and `createDiagnostics`; after one answer, a failing read keeps the last values. Queued dumps wait while diagnostics are off instead of being dropped.
  - The handler names a dump brought with feedback on the feedback only after the store saved it, through the new optional `DiagnosticsStore.linkDiagnostics` (`supabaseDiagnosticsStore` has it). A store without it leaves the feedback unnamed; the dump still names the feedback.
  - No routes are recorded for the dump while diagnostics are off.
  - Under React's StrictMode, which mounts the feedback screen twice, a shake's dump is still sent once: `ShakeDump.release` waits a tick before sending, so a remount takes it back.
  - Migration 0028 sets `lock_timeout` to 5 seconds before adding its check.

- Updated dependencies [06d4caa]
- Updated dependencies [5c9653e]
  - @marktiderman/genesis-config@0.11.1

## 0.16.0

### Minor Changes

- 71cb0e2: **Whole-number settings.** A number setting can be declared `integer: true` (a count, days,
  milliseconds): `settingValueProblem` and `resolveSettings` refuse a fraction for it, the doctor
  reads it from package.json `genesis.settings`, and `catalogueManifest` writes it. genesis-supabase
  migration `0021_genesis_settings_integer.sql` makes `set_genesis_setting` refuse a fraction for such
  a key too, so the database never stores a value every reader would skip.
- 95bab84: The `settings` block: migration `0020_genesis_settings.sql` adds `genesis_settings` (the database
  layer of Genesis settings, with locks), `genesis_setting_changes` (every change, trigger-written,
  with its source) and `genesis_app_manifest` (one row: packages, preset, file settings and the
  settings catalogue). Platform admins change runtime settings through `set_genesis_setting` and
  `clear_genesis_setting`, gated by the app's `private.genesis_platform_admin(person)` hook (without it
  nobody can, as with tenant features), and checked against the synced catalogue. Any signed-in
  person, and server code, reads the layers (not resolved values; build-time file values included)
  with `genesis_settings_layers()`. Writes refuse a key genesis.config.json locks and `null` for a key
  with a default; the history can't be edited or deleted, only pruned after a year
  (`genesis_prune_setting_changes`, service role). Client helpers: `readSettingsLayers`,
  `resolveAppSettings`, `setGenesisSetting`, `clearGenesisSetting`, `genesisSettingHistory`, and
  `writeAppManifest` for the service role on deploy.

### Patch Changes

- 4b7af48: Depends on `@marktiderman/genesis-config` (the new name of `@marktiderman/genesis-features`)
  instead of genesis-features. No change to what the package exports. `@marktiderman/genesis/features`
  now re-exports genesis-config.
- f4e39b1: Docs: two settings linked to one feature switch it off when either is false; the settings results
  have no prototype, so read them directly or with `Object.prototype.hasOwnProperty.call` (their own
  `hasOwnProperty` throws); a direct database login counts as server code for Genesis settings; and
  `GENESIS_CONFIG_KEYS` is kept by hand, so a new top-level genesis.config.json key is added there.
- 33b8d83: **Support settings and zero config.** genesis-support declares its settings with genesis-config:
  `support.*` (the feedback form, the person's inbox, messenger, agent desk, help center, AI answers,
  idea board, chat threads, email, reply by email, desks, staff alerts, the GitHub sink, the webhook,
  the contact fallback), `diagnostics.*` (on, when a dump goes, its size, the hourly limit, retention)
  and `shake.*` (a person's own switch, and how hard), each with `max` / `standard` / `min` defaults,
  secrets by name and store, and in package.json `genesis.settings` for `genesis doctor`. New:
  `supportSettings`, `diagnosticsSettings`, `shakeSettings`, `supportSettingsCatalogue`,
  `resolveSupportSettings`, `supportSettingValues`. `createSupport`, `createDiagnostics`,
  `FeedbackPanel` and `createDiagnosticsHandler` take `appSettings` (explicit options still win;
  without either, the `max` preset). `Diagnostics.enabled` says whether dumps are on. Migration
  `0020_genesis_support_settings.sql` reads `diagnostics.perHour` and `diagnostics.retentionDays` in
  the database; `0021_genesis_support_default_hooks.sql` (a stand-in default tenant for 0004) and
  `0023_genesis_support_hook_defaults.sql` (Genesis's own wrappers answer with the reserved tenant
  `bda1457d-053b-422c-8887-e046e54b8344` and the platform admins as staff when the app has no hooks)
  let support run with no SQL of the app's own; Genesis keeps no function of the app's hook names and
  defines no viewer-people hook. The CommonJS server build bundles genesis-config's
  settings resolver.

  genesis-native's devtools overlay declares `devtools.*` (`overlay`, `shakeToOpen`, `hold`, `flags`,
  `signOut`); `createDevtools({ appSettings })` takes parts away, never turns the overlay on in a
  production build. genesis-supabase's `genesis-support-cleanup` leaves the dumps' age to the database
  (the setting) unless `GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS` is set.

- 7d5b8d7: `genesis fix` secrets, second review: the hidden prompt refuses (and throws away) the rest of a
  multi-line paste however slowly it arrives, input already waiting when it starts, and zero-width,
  bidi and separator characters; it backspaces over whole characters, accepts a CRLF Enter split
  across two reads, puts the terminal back on an external SIGINT, and stdin is drained before exit.
  Redaction catches every JSON-escaped form of a value (Go's `&`-style escapes, either case),
  and `--json` keeps a Date as its ISO string. genesis-supabase's README adds the jobs secret to Vault
  in the dashboard rather than with SQL.
- 6ae0571: `genesis-support-cleanup` also deletes context dumps past their retention (genesis-support's migration 0019, `support_purge_diagnostics`), 90 days by default or `GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS`. Without 0019 it leaves them alone. Its answer gains `diagnostics` (how many went).

  The cleanup purges dumps a batch at a time until a short batch, at most 20 batches a run. `genesis-support-notify` puts the whole issue body in one fence longer than any run of backticks the person typed, and neutralises mentions and links in the issue title. The intake function's copy of the wire contract replaces phone numbers and short codes in a route, as genesis-support's does.

- 4ecdce8: `genesis-support-notify` takes new reports from `public.tickets`, the table genesis-support's migration 0004 renamed `support_reports` to. Before, it skipped every report sent after that migration. A webhook still on `support_reports` (an app that hasn't applied 0004) keeps working; point it at `tickets` once 0004 is applied. The handler exports the accepted names as `REPORT_TABLES`.
- Updated dependencies [818908b]
- Updated dependencies [4b7af48]
- Updated dependencies [f4e39b1]
- Updated dependencies [6c40ccc]
- Updated dependencies [95bab84]
- Updated dependencies [71cb0e2]
  - @marktiderman/genesis-config@0.11.0

## 0.15.1

### Patch Changes

- 3cb1302: **In 0.15.0, `FeedbackStatus` gained `pending`** (waiting on the requester) on the support intake function's wire contract (`FeedbackStatus` and `FEEDBACK_STATUSES` in `functions/genesis-support-intake/contract.ts`), and that release didn't say it can break code that reads statuses. If you've upgraded to 0.15.0 or later, handle it wherever you read a status: a `switch` with a `never` check stops typechecking (add a case); a `switch` with a `default` quietly puts `pending` in the default bucket (add a case); a `Record<FeedbackStatus, …>` map needs a `pending` key; code that iterates `FEEDBACK_STATUSES` gets it too; and SQL of your own that checks `status` now meets `pending` rows. It is neither active nor closed.

## 0.15.0

### Minor Changes

- 5431861: The support intake function's wire contract knows the `pending` ticket status (waiting on the requester), in step with genesis-support's copy and its migration 0013.

## 0.14.2

### Patch Changes

- Updated dependencies [234414b]
  - @marktiderman/genesis-features@0.9.0

## 0.14.1

### Patch Changes

- fa9d095: `cleanRoute` drops the query and fragment with one search, so a route made of many `#` characters no longer takes quadratic time. The support intake function's copy of the contract matches.
- Updated dependencies [5813132]
  - @marktiderman/genesis-features@0.8.2

## 0.14.0

### Minor Changes

- eb441f9: Versioned writes: two people editing the same record no longer silently overwrite each other. The second save, made on the copy read before the first, comes back as a `conflict`. Features: data-offline.

  - **genesis-core, Supabase provider:** a resource's `version: { field, kind: "integer" | "timestamp" }` rule checks every update and delete against `expectedVersion` (`where id = … and version = …`).
    - When no row matches, the row is read back. At another version it's `conflict`, with `error.current` and `error.currentVersion`; at the same version it's `forbidden`; when it isn't visible it's `gone`.
    - The submitted version is never written.
    - `capabilities(resource)` reports `versionedWrites: true` and the new `version` (`VersionField`).
    - An `update` override gets `{ expectedVersion }` as a third argument when a version is checked; overrides called without one are unchanged.
    - Recycle-bin tables check the version before the delete.
  - **genesis-core, hooks:**
    - `useResource` and `useResourceForm` send the version of the row the change was made on, through `SendContext.expectedVersion`: an edit form's opened record (`ExecuteWriteArgs.base`), else the row cached when the write was made. A write made behind another on the same record is checked against the version that one committed at.
    - After a save they put the new version into every cached copy, so a second edit is checked against it.
    - A resource without the rule, a row that wasn't read first, or a provider without capabilities is sent unchecked, as before. A versioned resource whose rows don't carry the version column is reported once through `reportError`.
    - A timestamp version is compared as an instant (to the microsecond), and a conflict's `error.current` is read through the resource's `source` and `select`.
  - **genesis-ui, genesis-ui-native:** `RecordView`'s settings sections send the version of the row as it was when the person started editing.
  - **genesis-supabase:** migration `0019_genesis_version_bump.sql` (with a pgTAP test), the `versioned-writes` block and `versionedWritesBlock`. `genesis_version_bump('col')` advances the column by one on every update, whatever the update wrote, and refuses a column that isn't an integer.

### Patch Changes

- 0abdac9: Tickets, with tenants (ADR 0015). Migration `0004_genesis_support_tickets.sql` (support-feedback block). The support-chat block now ships `0005_genesis_support_chat_on_tickets.sql` (its 0001, for the renamed table and safe to re-run) and `0006_genesis_support_chat_tenants.sql`; support-email ships `0007_genesis_support_email_on_tickets.sql` and `0008_genesis_support_email_tenants.sql`. Each comes with its pgTAP test.

  - **Tickets.** `support_reports` is renamed `tickets` and `support_attachments` `ticket_attachments`. For one minor the old names stay as views over the new tables (`security_invoker`, same column grants), so installed clients, the intake function and app SQL keep working; the client still reads the old names this release.
  - **Tenants.** Every ticket and idea has a `tenant_id`: the tenant your `genesis_viewer_people` hook returns (one fixed id in a single-tenant app, one per organization in a multi-tenant one). A new ticket takes the tenant it is sent with (`tenantId`, usually the viewer's current workspace; refused if the sender isn't in it or its help desk is off), else your default tenant; nothing is guessed. Existing rows are filled from `genesis_support_tenant_for(report)` if you define it, else the default tenant.
  - **You must add** `private.genesis_support_default_tenant() returns uuid` (your own tenant) before applying 0004; the migration stops and says so otherwise. Existing rows keep their `updated_at`.
  - **Your SQL**: triggers, policies or `alter table` on `support_reports` must name `tickets` (the old name is a view); move realtime subscriptions to `tickets`.
  - **Agents.** `ticket_agents` (tenant, person, `agent` or `admin`), managed with `support_set_agent`; `support_is_agent(tenant)`. A tenant's agents and admins handle its tickets; your staff hook now means "agent of your default tenant", so platform staff no longer read other tenants' tickets. With genesis-chat 0004, support chats stay in their ticket's tenant whichever migration runs first, and your staff read them without being listed as people of your tenant.
  - **Reading and handling stay separate**: the requester reads a ticket and never handles it; the report-handler hook only answers for your own tenant's tickets.
  - **Opt-in per tenant**: a tenant takes tickets and email only once `support-helpdesk` is enabled for it in `tenant_features`; your own tenant always does. Email for a tenant that is off goes to your own support. Ideas go to your own board unless a tenant is named. `support_default_tenant()` returns your tenant.
  - **Email**: route an inbound email to a tenant with `genesis_support_email_tenant(recipients)`; a ticket's emails are read by its handlers.
  - **TypeScript**: `Ticket`, `TicketAgentRole`, `TICKET_SUBJECT` (compare against it, never the literal); `SupportClientOptions.tenantId`; optional `myTickets`, `isAgent`, `setAgent`.
  - **Doctor**: new warnings for app code that queries `tickets` (or the old names) directly instead of through the support client, and for app SQL that still names `support_reports` or `support_attachments` (dropped in a later minor, once every supported phone build is on the new names).

  genesis-supabase: `0006_genesis_support.test.sql` passes on the renamed tables and defines a default tenant inside its transaction when support 0004 is applied.

## 0.13.0

### Minor Changes

- 3678bbb: `AuthForm` and `createAuthFormClient`: provider redirects, sign-up fields, a texted code, and the email beside a new password. Everything that changes what people see is opt-in.

  - **Provider redirect** (genesis-supabase): `createAuthFormClient` takes `providerRedirectTo` (a string, or a function of the provider's id) and `providerQueryParams` (a record, or a function of the provider's id), passed to `signInWithOAuth` as `redirectTo` and `queryParams`. An app no longer overrides `signInWithProvider` to set them. `emailRedirectTo` sets where the emailed links (a magic link, the sign-up confirmation, and by default the reset link) come back to, apart from `redirectTo`.
  - **Sign-up fields** (opt-in): `signUpFields={["full_name"]}`, fields of your own (`{ name, label, … }`), or a slot (`({ values, setValue, disabled }) => …`). Their values go to `client.signUp` as `data`, which genesis-supabase passes as `options.data` (the user's metadata). Without it `signUp` gets no `data`, as before.
  - **A texted code** (opt-in): the `"phone-code"` method in `methods` asks for a phone number, texts a code (`client.sendPhoneCode`, on Supabase `signInWithOtp({ phone })`) and checks it in the same code step (`client.verifyPhoneCode`, `verifyOtp({ phone, token, type: "sms" })`). Both calls are optional on `AuthFormClient`; a client without them leaves the method out. New copy: `auth.phone`, `phoneHint`, `phoneCodeSent`, `sendPhoneCode`, `usePhoneCode`, `useDifferentPhone`, `fullName`, `errors.phoneRequired`, `errors.phoneInvalid`, `errors.fieldRequired`, `errors.over_sms_send_rate_limit`, `errors.sms_send_failed`, `errors.phone_exists`.
  - **The email beside a new password**: in `mode="new-password"`, a known email (`initialEmail`, else the new optional `client.currentEmail()`, which genesis-supabase reads from the session) is in the form as a hidden `autocomplete="username"` field, so password managers save the new password with its account. Nothing changes on screen; `showAccountEmail` (opt-in) shows it read-only.

### Patch Changes

- 8ced6d0: `AuthForm`: four fixes.

  - **Before hydration**, a server-rendered form's submit is disabled (drawn as enabled, so nothing changes on screen) and the form is `method="post"`. An early click or Enter no longer sends the browser's GET, which dropped what was typed and the `next` value and could put the email in the URL. A client-only render is ready at once.
  - **`notice`**: a notice above the form's first step, drawn with `Alert`. Pass `{ kind: "reset-link-expired" | "provider-cancelled" | "account-deleted" }` for the catalogue's copy (`auth.notices`), a `message` of your own, or a plain string. An expired link is announced as an error, the others politely; `tone` overrides it. New types `AuthFormNotice` and `AuthFormNoticeKind`.
  - **`offerCodeOnConfirm`** (opt-in, default off): with `"email-code"` in `methods`, the "check your email" screens after a magic link and after sign-up offer "Enter the code instead" (`auth.enterCodeInstead`), which opens the code step for the same email. For someone in an embedded browser, where the link opens in another browser.
  - **Code copy**: `auth.codeSent` and `auth.codeSentIfAccount` no longer read "a 8-digit code": they now say "We sent a code to {email}. It has {length} digits." `codeLength` is documented as having to match the project's `otp_length`, and in development a refused code logs a hint to compare the two. genesis-supabase's docs say the same.

## 0.12.0

### Minor Changes

- 208893f: Support reports become findings someone can fix and the person can verify, and the web feedback panel and report thread gain opt-in improvements. Existing apps keep working and look the same: the new database parts need migration 0003, and every new visible behaviour is behind an option, except the few listed at the end with why.

  - New migration `migrations/0003_genesis_support_findings.sql` in the `support-feedback` block (after 0006, with its pgTAP test): a `severity` column; report handlers, named by an optional app hook `private.genesis_support_report_handler(report, person)`, who read a report and its screenshots, reply as support and set its status besides staff (`support_handles`); and a verify loop: `support_verify_report` lets the person confirm a fix or reopen the report (`verified_at`, `reopened_at`; addressed and wont_fix stamp `resolved_at`). The prompt that asks the person to check a fix in the thread is off unless the app's hook `private.genesis_support_verify_prompt_enabled()` returns true; it is marked as the system's (`support_replies.prompt`), posts at most once an hour per report, and when a reply rule or limit refuses it the status change still goes through. Its reply trigger keeps the support-email block's rules when that block is installed first.
  - Severity: `FeedbackRecord.severity`, always kept in the report's `context.severity`. With migration 0003 applied, `severityColumn: true` on `createSupportClient` / `createSupabaseSink`, and `GENESIS_SUPPORT_SEVERITY_COLUMN=true` on the intake function, also write the `severity` column.
  - Client: optional `verify` and `handles` on `SupportClient` (a client of the app's own keeps compiling; check for them before calling), and `pinned`, `aboutLabel` and `page` on `SupportReport`. New helpers `isSitePath`, `cleanLabel`, `pageOf` and `reportHeading`.
  - Web panel, opt-in: `severity` (a severity choice for bugs), `thanksReplacesForm` (the thanks takes the form's place, with Send another and an optional `onOpenHelp` button), `about` (a suggestion the person can drop), `draft` with `useFeedbackDraft` (a draft the host holds, so stepping aside to capture or pin loses nothing), `captureOnOpen` and `captureRequest`. `FeedbackLauncher` holds the draft and gives each return from stepping aside a fresh Sheet, so its overlay no longer stays drawn over it.
  - `useFeedbackShortcut` (`/web`): opens feedback with ⌘⇧. or Ctrl+Shift+., ignoring key repeat and rich-text editors.
  - Web report thread (`/web-chat`), opt-in: `reportHeading` (the report's own words in a real `h2`, its message only when it adds something, and the page it was sent from, a link only when it's a path on this site), `focusHeading` (focuses that heading; turns `reportHeading` on) and `plainChatTitle` (the conversation titled "Report" instead of the report's title).
  - Types accept `undefined` on optional fields for apps compiled with `exactOptionalPropertyTypes`; the wire contract's two copies stay identical.
  - genesis-supabase: the intake function also writes the `severity` column when `GENESIS_SUPPORT_SEVERITY_COLUMN=true`; it always keeps severity in `context`.

  On by default, and why:

  - Layout only: the panel's tabs share the bar and truncate, and its choice rows wrap and start under their labels, so a long label or a narrow sheet no longer overflows. Nothing is added or removed.
  - A placed pin shows as a row ("Pinned to a spot on this page.") with Remove. It shows only the pin the panel already holds, which the Pinned button already announced, and Remove undoes a pin that could not be undone before.
  - When the browser refuses a screenshot the panel says so instead of showing nothing; it appears only after that failure, and the report can still be sent.
  - The "Write a few words first." error goes as soon as the person types.

  Features: support-feedback, support-chat

- 224375f: Web sign-in: `AuthForm` in genesis-ui and its Supabase client in genesis-supabase.

  - **genesis-ui**: `AuthForm` (root and `/patterns`), the form inside `AuthPage`. Modes `sign-in` (password, magic link or emailed code), `sign-up`, `forgot-password` and `new-password`, controlled or not. The code step is `InputOTP` (`one-time-code`), verifies on the last digit and resends after a cooldown. Provider buttons from a list or from `client.providers()`. Every call goes through the `AuthFormClient` it is given; failures show the catalogue's copy for the error code (the new `auth` part of the UI messages), else the generic line, never the server's text (that goes to `reportError`, as does a throw), announced and tied to the field the code is about. Without sign-up, an email with no account is answered as sent, in neutral copy. "Check your email" takes focus; the code field stays focusable while it verifies. Every field is labelled with the autocomplete password managers need.
  - **genesis-supabase**: `createAuthFormClient(supabase, { url, publishableKey, redirectTo, resetRedirectTo })`, that client on the app's Supabase client (`signInWithPassword`, `signInWithOtp`, `verifyOtp`, `signUp`, `resetPasswordForEmail`, `updateUser`, `signInWithOAuth`), never throwing, also with `throwOnError: true`; a missing session is `session_not_found`, and without sign-up an unknown email is answered as sent. `fetchAuthSettings` reads `/auth/v1/settings` for the OAuth providers turned on (only those in `SUPABASE_OAUTH_PROVIDERS`) and whether sign-up is closed, with a 5-second timeout and an optional `signal`, and refuses a secret key.

### Patch Changes

- d2b8125: Blocks pass the app's own checks as soon as `genesis add` copies them in.

  - genesis-supabase: the `genesis-apple-revoke` function writes the PEM armour as `-{5}BEGIN PRIVATE KEY-{5}`, so gitleaks' private-key rule no longer flags it in every app that installs the account block. It reads keys exactly as before. The pgTAP tests the `events` and `support-feedback` blocks copy are tagged with those blocks' ids (`@feat:events`, `@feat:support-feedback`), the features the app registers.
  - genesis-sites: the pgTAP tests `genesis add sites` copies are tagged `@feat:sites`, the feature the block registers, not `sites-store` and `sites-blog`, which an app doesn't have. `pnpm features check` passes after the add.
  - genesis-cli: a test reads every block in the workspace as `genesis add` ships it and fails on a `@feat:` tag the app wouldn't register (the block's own id, or a block it requires), or on a file gitleaks' private-key rule matches.

## 0.11.0

### Minor Changes

- 6d5312b: Product events, owned by the app (ADR 0010): migration 0018 adds `public.genesis_events` with `genesis_track_events` (a signed-in person, only in tenants they have a record in), `genesis_track_server_events` (service role), `genesis_feature_usage` and `genesis_prune_events`, with a pgTAP test, as the `events` block (`genesis add events`). `@marktiderman/genesis-supabase/events` adds `createEventTracker` (batched, retried with backoff, `reset()` on sign-out, never throws) and `createEventsSink`, which plugs the tracker into genesis-native's observability sinks.

### Patch Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.
- Updated dependencies [6eb984b]
- Updated dependencies [b11005b]
- Updated dependencies [b028861]
- Updated dependencies [c0c573f]
- Updated dependencies [37972e2]
- Updated dependencies [1ed0cba]
- Updated dependencies [f9a11f2]
  - @marktiderman/genesis-features@0.8.0

## 0.10.1

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0

## 0.10.0

### Minor Changes

- c81f220: Remove the owner-access block and its migration, `0009_genesis_owner_access.sql`. Its only user, genesis-work, moved into the app that uses it (its `packages/work`), which keeps its own applied copy. Breaking for anyone importing `ownerAccessBlock`; nothing in Genesis does. `0016_genesis_viewer_people.sql` stays: per-person entitlements (`feature-mirror`) use it.

  Features: owner-access

## 0.9.0

### Minor Changes

- afae598: Per-person entitlements. Migration 0016 adds `private.genesis_viewer_person_ids()`, a fail-closed wrapper over the app's `private.genesis_viewer_people(viewer)` hook. It gives the person records a login is, so every block resolves a viewer's people the same way. It is in the owner-access and feature-mirror blocks. Migration 0017 adds `feature_person_entitlements` (grants to the app's person record, written with the service-role `grant_person_entitlement` and `revoke_person_entitlement`). `feature_on`, `feature_entitled_tenants` and `feature_gate_state(tenant)` now count the signed-in person's own grants, and server code can call `feature_gate_state(tenant, person)`. `featureGateState(client, tenant, { personId })` passes the person. In genesis-features, the gate's `entitlements` doc now says it holds the person's grants too.

  Features: feature-mirror, owner-access, feature-gate

### Patch Changes

- Updated dependencies [afae598]
  - @marktiderman/genesis-features@0.6.1

## 0.8.0

### Minor Changes

- 80a027a: New `/runner` entry: `createRunner`, the outbox engine that used to live in genesis-notifications. It claims a batch of jobs, sends them in groups, records each outcome (`sent`, `filtered`, `skipped`, `retry` with jittered backoff or a Retry-After deferral up to `maxDeferrals`, `failed`, with `disable` on a 410) and never throws for one job. It has no dependencies and no Node built-ins, so other packages can bundle it. It also exports `jobOutcome`, `failureOf`, `defaultBackoff` and the defaults (`DEFAULT_MAX_ATTEMPTS` 8, `DEFAULT_MAX_DEFERRALS` 24, `DEFAULT_BATCH_SIZE` 25), all unchanged. It gains one option, `concurrency`: how many groups are sent at once. Without it, every group is sent at once, as before.

  `runJobs` in `/jobs` now runs on this engine. It behaves exactly as before: the same claim and settle calls, at most `concurrency` handlers at once (default 4), the queue still decides attempts and retry times, and a settle that fails is counted as `unsettled` without stopping the run. Signed job calls and `genesis-job:` schedule names are unchanged, and there is no new migration.

- d8b719e: Continue on the web, already signed in (the web-handoff block). Features: web-handoff

  - `/web-handoff/server`: `createWebHandoff({ admin, webOrigin?, ttlSeconds?, continueSeconds?, rateLimit?, log? })` returns three POST routes. `mint` verifies the bearer with `auth.getUser` and records a single-use, 60-second handoff for that account only, from that app session. `redeem` takes the page's `claim` (once, unexpired; returns whose link it is and a 30-second continue nonce, and mints nothing), `continue` (the nonce, once, in time, not after Cancel: only then `auth.admin.generateLink` for the person's own email), `discard` (Cancel) and `bind` (the new web session's id, from its verified access token). `signOut` ends exactly the web sessions handed off from the calling app session. The steps are also exported (`mintWebHandoff`, `claimWebHandoff`, `continueWebHandoff`, `discardWebHandoff`, `bindWebHandoffSession`, `signOutWebHandoffs`). Each step is logged (person, path, time), never a token or nonce.
  - `/web-handoff`: `takeWebHandoffFragment` reads `#t=…&next=…` and drops it from history at once; `completeWebHandoff` checks who is signed in with `auth.getUser`, claims the link, and asks "Continue as {email}?" unless the browser is already that person. `continue()` signs a different person out locally, then exchanges the token with `verifyOtp({ token_hash, type: "email" })`; `cancel()` burns the nonce and signs anyone else out locally.
  - `appRelativePath`: the one destination check (no `//host`, `/\host`, schemes, whitespace or control characters, or their percent-encoded forms), run before minting and after sign-in.
  - `migrations/0015_genesis_web_handoff.sql` (and its pgTAP test): `private.genesis_web_handoffs` with digests only; issue (rate-limited per person under a lock), claim, continue, discard, bind and revoke functions, service_role only.

## 0.7.0

### Minor Changes

- 18a5a4f: Migration `0014_genesis_feature_registry_hardening` (feature-mirror block) changes behaviour 0.6.0 shipped in 0008: server code is told apart from a person by the request's role (`current_setting('role')`), not by `request.jwt.claims`, so a session that switches to `authenticated` without claims is no longer treated as server code; `feature_shipped` answers a signed-in person only for customer-facing features; a flag that leaves the registry loses its `platform_value`; and `feature_entitlements` gets an index on `feature_id` for active rows. The docs now say to sync with the build time, not the time a deployment started.
- a211c61: New migration `0009_genesis_owner_access.sql` and the `owner-access` block. It defines the owner-access contract that Genesis blocks with owned rows call in their policies.
  - `private.genesis_owner_readable()` and `private.genesis_owner_allows(tenant, person_id, team_id, organization_id, action)` wrap the app's hooks, `genesis_readable_owners` and `genesis_owner_can`.
  - They fail closed: a missing or broken hook, no signed-in person, a null tenant or an unknown action means no.

  A pgTAP test sits beside the migration.

  Features: owner-access

## 0.6.2

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.6.1

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.6.0

### Minor Changes

- 85e23e1: Migration `0008_genesis_feature_registry` (block `feature-mirror`, needs `tenant-features`): the feature registry mirrored into the database on deploy (`features`, `feature_flags`, `sync_feature_registry`, never backwards), `feature_entitlements`, per-tenant `tenant_flag_values`, SQL `feature_on(tenant, feature)` for row security (shipped and, when paid, entitled), and `feature_gate_state(tenant)` for members. Client helpers `syncFeatureRegistry` and `featureGateState`. Platform-wide flag values (`feature_flags.platform_value`) act as a kill switch over tenant values. Requests are judged by their role: an authenticated request without a person is refused, never treated as server code.

### Patch Changes

- Updated dependencies [773e809]
  - @marktiderman/genesis-features@0.4.1

## 0.5.0

### Minor Changes

- 0435b05: Background jobs: `migrations/0007_genesis_jobs.sql` and `@marktiderman/genesis-supabase/jobs`.

  - **Queue.** `genesis_jobs` takes:
    - enqueues with an idempotency key;
    - claims with `SKIP LOCKED` and leases (a lease that runs out redelivers the job; a job that keeps dying fails as `lease_expired`);
    - settles (done, retry, failed);
    - cancel and a 14-day purge.
  - **Schedules.** `genesis_schedule_job(name, cron, job)` calls the app's job route through pg_cron and pg_net, with the URL and the secret read from Vault each time. Each request is signed for its job, and never carries the secret. Schedules are cron jobs named `genesis-job:<name>`.
  - **Server.** `enqueueJob`, `runJobs` (handlers by kind, jittered backoff, `PermanentJobError`; never throws for one job or for a failed settle), `createJobsHandler` (one route; requests signed per job for five minutes, or the bearer secret; the previous secret is accepted during a rotation) and `signJobRequest`.
  - **Block.** `jobsBlock`.

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.4.0

### Minor Changes

- 8c27421: Adds `sql/testing/genesis_testing.sql`, a pgTAP kit that checks an app's own schema keeps the Genesis data rules: refused writes, server-owned columns, guards that let system work through (signed out, bypass settings, ON DELETE SET NULL), private values never leaking through reports, and row counts per user. It uses shared owner, staff, client and stranger fixture ids.

### Patch Changes

- ca03900: genesis_testing: `never_shows` also finds a marker in the escaped form JSON writes it (quotes, backslashes), and `allows_system_paths` splits each setting on its first `=`, so a value may contain `=`.

## 0.3.1

### Patch Changes

- c2dbc4f: The README marks migration 0005 (`genesis_push`) and the `genesis-push-send` function as superseded by `@marktiderman/genesis-notifications`, which adopts 0005's tables in place and replaces the sender. Both stay unchanged here for apps that run them. Moving: remove 0005's pgTAP test from the app (two of its assertions describe the old register and forget) and stop calling `genesis-push-send`.

  Features: push-sender, notifications

## 0.3.0

### Minor Changes

- 81144ed: Sign in with Apple token revocation on account deletion (App Store Review Guideline 5.1.1(v)). The package now ships `functions/genesis-apple-revoke/`, a Supabase Edge Function template (Deno) that exchanges a sign-in's authorization code at Apple's `/auth/token` with an ES256 client secret signed from `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`, checks the code belongs to the caller's Apple identity, and keeps the refresh token server-side; and `migrations/0003_genesis_apple_token_revocation.sql` (private token and queue tables, a `before delete` trigger on `auth.users` that queues a login's tokens in the delete's transaction, and four `public` functions executable by `service_role` only) with a pgTAP test. The function revokes queued tokens at `/auth/revoke`, retrying with backoff; deletion never waits for Apple. `storeAppleToken(client, { authorizationCode, clientId })` sends the code after sign-in, and `deleteMyAccount(client, { revokeAppleTokens: true })` asks for the revocation straight after the delete. Neither throws on a revocation failure.

  Features: apple-token-revocation

- 4f1869d: `genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

  - `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
  - `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
  - `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
  - `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

  `genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.

- 73fb1f5: Blocks: `defineBlock` and `resolveBlocks` in `@marktiderman/genesis-features/blocks` (free of zod; also re-exported from the root) declare a block by its FeatureId with what it requires and contributes (nav, Settings rows, routes, slot fills, migrations, skills, privacy), and resolve the enabled ones with requirement, cycle and conflict checks. The registry's `requires` checks now live in `graph.ts`, shared by both, with the same messages.

  `GenesisNativeApp` takes `blocks` (and `appFeatures`, for requirements that aren't blocks): their boot steps, roots and slot fills (under the app's own slots; an unknown slot name is an error), with `useBlocks` and `useBlockSettings` for the nav tree and Settings. A setup error in the shell now hides the splash, so the fatal screen shows. `createUpdates` now returns a block (`app-updates`) that contributes the version signature row (`versionRow` sets or turns it off); `updates={…}` works as before.

  `genesis-supabase` adds migration `0004_genesis_tenant_features.sql`: per-tenant feature switches with a reason and a change history, `set_tenant_feature` for the tenant's admins through an app-supplied `private.genesis_tenant_admin` hook (fails closed without it), `tenant_features_off` for members, `tenant_feature_settings` and `tenant_feature_history` for admins, and `private.tenant_feature_on` for SQL gates; with the client helpers `tenantFeatures`, `setTenantFeature`, `tenantFeatureSettings` and `tenantFeatureHistory`, and `accountBlock` and `tenantFeaturesBlock` declarations.

- 99af0cd: The push block, `@marktiderman/genesis-native/push`: `createPush({ notifications, platform, projectId, backend: supabasePushBackend(supabase), categories, storage, appState, openSettings, links, hold, onOpen })`, a `defineBlock` block (`id: "push"`) for `<GenesisNativeApp blocks={[push]}>`. It contributes a Settings row (`useBlockSettings`, the permission as its subtitle), a bounded boot step that reads the permission, its route and its migration. `NativeAppSlots` gains `pushPrompt`.

  - **Permission**: never asked at launch. `usePushPrompt().offer(reason)` shows a soft pre-prompt (the `pushPrompt` slot, default `PushPromptSheet`) only after a launch grace, while signed in and while the system can still ask, with a cooldown after "Not now" and a cap on how often; its "Turn on" brings up the system prompt.
  - **Registration**: once permission is granted, the signed-in person's Expo push token is registered (`getExpoPushTokenAsync({ projectId })`), again when the OS rotates it, and forgotten on sign-out, account switch and deletion, even after the session has ended; a forget that fails offline is retried at the next start. No `projectId` is reported once, loudly.
  - **Android channels**: `default` plus one per category, private on the lock screen, made before the permission prompt and the token.
  - **Foreground and taps**: a foreground handler (`useSuppressNotifications` hides a screen's own kind), tap routing through `normalizeLink` and GenesisNativeApp's held link (the launching tap too, once), and the badge (`useBadge`).
  - **NotificationSettings**: a `SettingsPage` with `permission`, `categories`, `quietHours` and `privacy` parts, each a slot and a hook (`usePushPermission`, `useNotificationCategories`, `useQuietHours`, `usePrivacyPreviews`); saved at once, put back when a save fails.

  `@marktiderman/genesis-supabase` ships `migrations/0005_genesis_push.sql` (`push_devices`, `notification_preferences`, `push_receipts`, owner-only row level security, functions granted by name, `genesis_push_targets` honouring categories, time-zone-aware quiet hours and hidden previews) with a pgTAP test, and the `genesis-push-send` Edge Function template: Expo sends in batches of 100, neutral text for hidden previews, a receipt per ticket, a receipts poll, `DeviceNotRegistered` devices forgotten, and no token or content in its logs or answers.

  `@marktiderman/genesis-ui-native`: `SettingsPageSection` takes `children`, rendered inside the section's group after its rows, so a pattern built on `SettingsPage` can put a replaced part in the same section. On iOS, `NativeTimePicker` and `NativeDatePicker` render the compact picker alone (it is its own button); the extra button beside it showed the value twice.

  Features: push, push-sender

- e930dda: Native Google sign-in. `@marktiderman/genesis-supabase/native` adds `signInWithGoogle(client, GoogleOneTapSignIn, { digest, randomNonce? })`: a fresh 32-byte nonce, its SHA-256 to Google through the Universal sign-in module's `authenticate({ nonce })`, a check that the ID token carries that hash (`google_nonce_missing` otherwise, before anything reaches Supabase), then `signInWithIdToken({ provider: "google", token, nonce })` with the raw nonce, as Supabase's Google guide describes. `@react-native-google-signin/google-signin` is an optional peer and is passed in, never imported. `@marktiderman/genesis-ui-native` adds `googleProvider({ onPress, label?, icon?, enabled? })` for `AuthScreen`'s `providers`. The Apple nonce docs no longer suggest `randomUUID`: the default is 32 random bytes.

  Features: account

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 03e1fa0: The support block, with its data in the app's own Supabase.

  New package `@marktiderman/genesis-support` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

  - Core: the feedback record (bug, idea, question or praise; message; version signature, route, platform, device; screenshots) behind `ContextCollector` and `FeedbackSink` seams; `createSupportClient` (the Supabase sink, the person's reports and replies, read receipts, signed screenshot URLs, the idea board with votes, "you asked, we shipped"); `createIntakeClient` / `createIntakeSink` for the wire contract over HTTP; a copy catalog; `defineSupportBlock` (`support-feedback`), which adds Send feedback and Help to Settings, its routes and migration 0006.
  - `/web`: `FeedbackPanel` and `FeedbackLauncher` from Genesis UI, tab screenshots with pen marks and hidden areas, pins on the page, and `mountSupportWidget`.
  - `/native`: `createSupport` for `GenesisNativeApp`'s `blocks`, `FeedbackForm`, `ScreenshotAnnotator` (pen and Hide, flattened with `captureRef`), shake to report, `SendFeedbackButton` for a devtools slot, and hooks that feed `InboxPage` and `ThreadPage`.

  `@marktiderman/genesis-supabase`: migration `0006_genesis_support.sql` with its pgTAP test (reports, screenshots in a private bucket with storage policies, staff replies with read receipts, ideas and one vote per person; staff through the app's `private.genesis_support_staff` hook; grants by name; rate limits), and three Edge Function templates: `genesis-support-intake` (the wire contract, as the caller), `genesis-support-notify` (a GitHub issue or a signed webhook per report, summary only) and `genesis-support-cleanup` (removes deleted screenshots through the Storage API).

  `@marktiderman/genesis-support` declares the block under `genesis.blocks` in its package.json, so `genesis add support-feedback` finds its migration, function templates, routes and steps.

### Patch Changes

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0

## 0.2.0

### Minor Changes

- e649267: From review of the Account block.

  `completeOAuthRedirect` passes `sb_flow_id` to `exchangeCodeForSession` and returns `redirectType` (`"recovery"` after a password reset). A redirect error's `message` is now fixed copy chosen by its code; the redirect's own `error_description` is only on the new, untrusted `GenesisAuthError.providerMessage`. `redirectParams` reads keys such as `constructor`.

  `signInWithApple` returns Apple's `authorizationCode`, which a server needs in order to revoke the Apple tokens on deletion; the README documents that step under "Not covered yet". It refuses a digest that isn't lowercase hex (`bad_digest`), and keeps `fullName` on the error result.

  `delete_my_account()` now:
  - refuses an aal1 session when the person has a verified MFA factor (`42501`);
  - runs `private.genesis_before_account_delete(uuid)` first when an app defines it, and maps a refusal from it to `GA001`;
  - comes with `private.genesis_require_recent_sign_in(interval)`, which an app can call from that hook to require a recent sign-in (`GA002`).

  The migration header is corrected: Supabase documents that a person who owns Storage objects can't be deleted (`23503`), and the comment about blanket grants is fixed.

  `AppleSignInButton` ignores a second tap while a sign-in is open, reports disabled and busy on the button itself, and its `label` and `height` docs are corrected.

  Features: account

- 47b13ff: The Account block, native first. `@marktiderman/genesis-supabase/native` adds `signInWithApple(client, AppleAuthentication, { digest })` (availability check, name and email scopes, a SHA-256 hashed nonce, `signInWithIdToken`; closing Apple's sheet is `{ canceled: true }`, and the full name Apple shares on the first sign-in comes back to save) and `completeOAuthRedirect(client, url)` (exchanges a PKCE `code`, or returns the redirect's `error` as a typed `GenesisAuthError`). `@marktiderman/genesis-supabase` adds `deleteMyAccount(client)` and ships `migrations/0001_genesis_account_deletion.sql` (`public.delete_my_account()`, security definer, `search_path = ''`, executable by `authenticated` only) with a pgTAP test. `@marktiderman/genesis-ui-native` adds `appleProvider()` and `AppleSignInButton`, which draw Apple's own button on iOS and nothing elsewhere; `AuthScreen` skips `null` providers and `SocialAuthProvider` takes a `render` for a provider's own button.

  Features: account

- 581f319: The updates block, `@marktiderman/genesis-native/updates`: `createUpdates({ platform, application, updates, policy, storage, appState, openURL })` and `<GenesisNativeApp updates={updates}>` (leave the prop out to turn it off).

  - **Force upgrade**: a minimum store version per platform, compared with `expo-application`'s installed version, shows a blocking screen with a store link and "Check again". A minimum without a store link forces nothing.
  - **Maintenance**: a live maintenance flag shows a blocking screen with "Try again".
  - **Update banner**: expo-updates is checked on launch and on coming to the front; a downloaded update for this runtime version shows a banner that reloads only on tap, and never while `useBlockReload(true)` is mounted or `canReload()` says no.
  - **What's new**: release notes once per version, remembered in storage; never on a fresh install.
  - **Version signature** (`useVersionSignature`) for an About row and support reports, and **channel switching** for test builds, off unless `channels: { enabled: true }`.
  - **Policy sources**: `staticPolicySource` and `supabasePolicySource`, cached on the phone. It fails open: no answer, a timeout (3 s behind the splash), a malformed version, a cache older than 7 days or dated in the future never blocks, and a cached maintenance flag never blocks a cold start.

  Each renderer is a slot of `GenesisNativeApp` (`forceUpgrade`, `maintenance`, `updateBanner`, `whatsNew`), a primitive (`ForceUpgradeScreen`, `MaintenanceScreen`, `UpdateBanner`, `WhatsNewSheet`) and a hook. The `updateBanner` slot now receives `{ reload, dismiss, canReload, blocked, reloading }` and renders only with the `updates` prop (it was a placeholder that rendered nothing by default). `expo-updates` and `expo-application` are passed in, never imported; `react-native-safe-area-context` is a new peer, for the banner. Blocking screens are drawn over the screens, which stay mounted.

  `@marktiderman/genesis-supabase` ships `migrations/0002_genesis_app_release_policy.sql`: `public.app_release_policy`, one row per app, row level security on, `select` for anon and authenticated only (granted and revoked by name), written only by the service role, with check constraints that keep malformed versions, links and notes out and require a store link with each minimum version, and a pgTAP test. The README's leftover merge markers are resolved.

  Features: app-updates, native-app-shell

### Patch Changes

- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 0.1.1

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- 6d72884: New package, `@marktiderman/genesis-supabase`: `createGenesisSupabase` (PKCE sign-in, a persisted session that refreshes itself, the storage you pass) and `must()`; on `/native`, `keychainStorage` (chunked Keychain storage whose writes switch over only when complete and run one at a time per key), `refreshWhileActive` and `wipeSessionOnReinstall`. It imports neither React Native nor Expo.

  Features: supabase-kit

- b02192c: From review: `keychainStorage` splits between characters (an emoji at a chunk boundary was corrupted) and counts UTF-8 bytes against `chunkSize`; a pending marker lets the next write or remove sweep chunks left by a write that was cut short. `must()` throws `SupabaseQueryError` with the database's `code`, `details` and `hint` (and the error as `cause`), and keeps `null` in its return type for `.maybeSingle()`. `wipeSessionOnReinstall` also removes the PKCE code verifier and the stored user. `createGenesisSupabase({ platform: "native" })` sets the native defaults. The supabase-js peer range is the tested `^2.118.0`.
