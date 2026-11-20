# @marktiderman/genesis-config (formerly @marktiderman/genesis-features, up to 0.9.1)

## 0.12.0

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

- 11219ef: The Settings screen now runs inside the app. genesis-supabase's `createSettingsHandler` (`/settings/server`) serves every op of the settings protocol from the app's Supabase, as the signed-in person: it calls the database with their own token (never the service role) and answers its own origin only. A platform admin sees every key, the health the server can know, secrets, upgrades, the whole history and pending proposals; a tenant's admin sees and writes that tenant's `scope: "tenant"` keys; anyone else their own `scope: "person"` keys. A bad database value is fixed through plan and apply with a hash over what is stored.

  The new `settings-host` block (migration `0024_genesis_settings_host.sql`, after the settings block) adds `genesis_settings_viewer`, proposals (`propose_genesis_setting`, `decide_genesis_setting_proposal`: someone who can't change a locked value asks, with why, and a platform admin approves or declines), Vault set and rotate for platform admins (`set_genesis_vault_secret`: the value is a parameter all the way into Vault, never logged or stored outside it; `genesis_secret_rotations` records when, without it) and one paged history (`genesis_settings_audit`).

  genesis-config: `<GenesisSettings tenant>` shows the viewer's slice (`state.viewer`) with a Propose button for a value the app locked, and a platform admin decides proposals on Values. The protocol gains `SettingsViewer`, `SettingsProposalEntry`, the `decideProposal` op and `propose`'s `reason`; `settingWritability` takes the viewer. `catalogueManifest` now writes each key's whole declaration (default, summary, links, a secret's name and store), and `catalogueFromManifest` rebuilds the catalogue from it: run `genesis settings sync` again after upgrading.

  genesis-cli: `genesis settings init` writes the handler's route for Next.js, TanStack Start, React Router or Expo Router.

- 8f49de2: Settings protocol: the tenant and person layers in the S4 shape. `SettingsWriteLayer` adds `tenant` and `person`; `state`, `setValue` and `clearValue` take an optional `tenant` (the tenant whose layer `state` returns and a tenant write changes), and `SettingsState.layers` may carry `tenant` and `person`. `<GenesisSettings>` is unchanged: it still writes the file and database layers only.
- 4acea0b: Guided setup steps that walk an outside service and end with a live check: `supabase.link`,
  `github.issues`, `resend.domain`, `sentry`, `ai.key-budget` and `eas.push`.

  - Each step is declared inside the CLI (`defineSetupStep`: what to do in the service, its values,
    the secrets it needs by name, links), and `checkSetupFields` checks the values a person typed.
  - `<GenesisSettings>` shows a guided fix with a step as `genesis setup --step <id>`.
  - `genesis setup --step <id>` at a terminal runs one step: the instructions and links, what is
    there now (the Supabase project list, say), the step's values, then the plan to approve. Each
    secret is asked for hidden, held in memory and sent on stdin only; the commands run through the
    fix engine; then the step's test call (GitHub reads the repository with the token, Sentry reads
    the project and sends a test event to the DSN, Resend reports the domain verified, the AI
    provider lists its models, Supabase has no pending migration and every function deployed).
    Headless, `--step` prints the step's instructions.
  - The wizard's Guided steps tab runs the same runners (`step.start`, `step.submit`, then `apply`,
    and `step.verify` for "Check"), and lists `supabase.link` and `eas.push` when the app has a
    `supabase/` folder or an `eas.json`.
  - `eas env:create` has no stdin input, so EAS secrets stay a line the person runs, and `eas.push`
    is a manual step: its instructions, and a check that the EAS CLI is signed in.
  - Redaction no longer builds a regular expression from a secret: one past ~1,500 characters made
    it throw an error that spelled the value out. A value over 64 KiB is refused, and an error whose
    text can't be redacted is replaced by a generic line, never shown raw.
  - `supabase db query --linked` (the Vault names and the settings table the doctor reads, and
    `genesis settings sync`'s manifest) gets its SQL from a temp file it removes, not `/dev/stdin`.
  - `genesis mcp` redacts with the fix engine's matcher: every JSON-escaped form of a secret, and
    overlapping secrets, are caught in what it returns and logs.
  - The wizard follows the system's dark mode, and its page header and form fields are genesis-ui's.

- 22bfd48: Support on the phone, after the final review. The person's thread asks "Is it fixed?" once support marks a report addressed (`client.verify`; reports carry `verifiedAt`). The agent thread links the requester's email, has an assignee picker and the desk controls (`AgentDeskControls`: send up, hand back, move), and the agent inbox has a tenant admin's desk switch (`AgentDeskSwitch`). Settings has a "Support inbox" row into the agent desk for the app's agents. The dump viewer says when it is loading, heads each dump with its trigger and local time (`dumpHeading`), shows it in the mono font and copies it (saying so when a copy fails). The feedback form shows "About: …" (`openFeedback({ about })`, else the screen's path) with "Not this". The native screens use genesis-ui-native's layout primitives and text presets, and errors show in `NativeInlineAlert`. `healthChecks.runCheck(name)` runs one check again.

  `createSupport` follows live settings (`appSettings` as a function, and `subscribeSettings` to update an open Settings screen): its Settings rows, the idea board, shake to report and "Report this". It forgets queued dumps and feedback on sign-out. `SupportRoute` never throws without a support block: it shows `unavailable` (default an empty state), and `onFeedbackSent` replaces the feedback screen's alert (a toast). Caught errors from a desk move or switch and a failed copy go to `onError` (`SupportErrorSource`).

  A block's Settings row can take a `useShown` hook (genesis-config), and genesis-native's `useBlockSettings` leaves out a row it hides. genesis-native's error screens take `labels` ("Contact support" included, `DEFAULT_FATAL_SCREEN_LABELS`) and offer "Report this" when a block takes reports (`NativeBlock.reportProblem`: the support block opens its feedback form with the error attached). The devtools overlay is a `NativeSheet`, shows health checks in words (`checkLabels`) with a "Try again" for each where the registry has `runCheck`, and its values wrap and can be selected.

  genesis-ui-native: `NativeSettingsRow` takes `descriptionLines` (`null` wraps the description whole) and `selectable`, and `NativeListItem` `subtitleLines` and `subtitleSelectable`.

### Patch Changes

- ec8a3ba: `genesis setup`: the setup wizard on localhost, on the doctor's engine. It shows the app's findings
  with their fixes, its settings, secrets (by name) and upgrades through the shared Settings screen,
  and the guided setup steps the installed packages' settings name; `--step <id>` opens on one.
  `genesis init` with no name, at a terminal, opens it on an empty folder to make a new app (App,
  Preset, Packages, Review), the same app `genesis init <slug> --template native` makes, then installs
  its packages. Every write is a fix plan you read and apply by its hash; a stale plan, or one the
  wizard didn't make, is refused. A secret is typed into a password field and reaches your signed-in
  CLI on stdin only; no page, answer, event or log holds it. The server listens on 127.0.0.1 only and
  refuses another Host (localhost included), a write without its own Origin, a cross-site fetch and
  anything but JSON. Its session key never appears in a URL or a command line: the link carries a
  one-time launch code that the page swaps for it.

  `genesis setup --yes` runs headless: `--preset` and `--without`, every automatic fix, then the
  dormant checklist (`genesis setup --step <id>`). Without `--yes` and without a terminal it applies
  nothing: it prints the plans and the checklist and exits 1 when there is something to apply.
  `--preset` and `--without` never imply `--yes`. `genesis init <name>
--template native --preset standard|min` sets a new app's preset (checked before anything is
  written; refused without a template). With `CI` set the wizard never opens. `genesis mcp` adds the read-only `setup_steps` tool,
  and a fix with a setup step now returns `genesis setup --step <id>`.

  The Settings screen shows `genesis setup --step <id>` for a guided fix that has a step (else `genesis fix <id>`).

## 0.11.1

### Patch Changes

- 06d4caa: #848 review findings.

  - genesis-cli: `genesis fix --expect` writes nothing when one of the target's fixes can't be
    planned. The fix engine removes only a file its own `wx` open created (an `EMFILE` open never
    deletes another process's file). `genesis settings sync` passes `--yes` to `supabase db query`
    after its own confirmation, so supabase's prompt can't default to No. `genesis-behind` keeps
    advisories read while npm failed (through the hour of backoff, at their level), apart from a
    cached release distance, which stays a note. The rename codemod dedupes pnpm-workspace.yaml
    entries only within one mapping, so a named catalog keeps its own renamed entry.
  - genesis-config: `SettingsClientMessages.badAnswer` is optional (a complete messages object from
    before still typechecks). On the Settings screen a refreshed snapshot supersedes an upgrade
    check or an audit page still in flight (its busy state cleared). `resolveSettings` never throws on
    a value neither JSON nor `String` can write.
  - genesis-support: the dump checks `diagnostics.enabled` again after collecting (a feedback goes
    alone when it turned off meanwhile); a dump made earlier is capped with the limits in force when
    sent, and no dump is capped above what the table stores; a shake's dump left unclaimed follows
    support's own `diagnostics.enabled`, and leaving the feedback screen while its report is being
    sent no longer sends the dump twice; the HTTP handler shares one settings read between requests.

- 5c9653e: **Loadable from CommonJS.** `.`, `/blocks`, `/gate`, `/settings`, `/settings-protocol` and `/node`
  now ship a CommonJS build beside the ESM one (a `require` condition). genesis-cli's Expo config
  plugin reads `/settings`, and Expo loads plugins with `require` (through `tsx/cjs` in an
  `app.config.ts`), where an import-only subpath failed with "Package subpath './settings' is not
  defined by exports". The React entries stay ESM only. The CommonJS entries share chunks, so
  `instanceof` holds across them (one `FeatureOff`, one `SettingsError`), and a `node10` CommonJS
  consumer gets the CommonJS types (`types` and `typesVersions`).

  Also: a setting can be declared `planned: true` (declared ahead of the code that reads it; the
  doctor treats it as dormant). On the Settings screen, a late plan for one fix is never shown or
  applied in another fix's sheet; an older state, upgrades or audit answer never overwrites a newer
  one; a 200 the screen can't draw (a malformed plan, result, upgrades list or catalogue entry) is an
  error, not a crash; a host that returns only a snippet no longer reads "Pull request opened"; the
  Vault field clears as soon as it is sent; a finding with a guided step shows its `genesis fix <id>`
  command (`genesis setup` isn't available yet). `resolveSettings` no longer throws on a bigint value,
  and of two keys linked to one flag, an app-locked one keeps the flag's value.

## 0.11.0

### Minor Changes

- 818908b: `genesis doctor` checks setup and secrets, and `genesis fix` sets secrets safely.

  - New rules from the `settings` check: `setting-requires` (a key on while one it requires is off,
    moved out of `invalid-setting`), `setup-incomplete` (a feature that needs an outside service and
    isn't set up yet: info, naming `genesis setup --step <id>`) and `secret-missing` (a secret an on
    key or a deployed Edge Function needs isn't in its store). Secrets are checked by name only,
    through the developer's own signed-in `supabase`, `gh` and `eas`, and only when the network is
    on; a store that can't be checked is an info.
  - `genesis doctor --database` also checks the settings' database layer through the linked project
    (read anyway when the app is linked).
  - New guided fixes: `settings.reset`, `settings.requires`, `settings.setup` and `secrets.set`
    (replacing the manual `settings.review`). `secrets.set` asks for each value at the terminal
    without echoing it (one line; a multi-line paste or a control character is refused), holds it
    in memory only, sends it on stdin (never in argv) to `supabase secrets set --env-file
/dev/stdin` or `gh secret set`, and redacts it from everything printed. It prints the
    `eas env:create` command for you to run, and the dashboard step for a Vault secret (SQL
    carrying the value would be kept in `pg_stat_statements`).
  - genesis-config: a settings key may name the guided `setup` step that configures it
    (`setup: "github.issues"`).

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
- 71cb0e2: **Whole-number settings.** A number setting can be declared `integer: true` (a count, days,
  milliseconds): `settingValueProblem` and `resolveSettings` refuse a fraction for it, the doctor
  reads it from package.json `genesis.settings`, and `catalogueManifest` writes it. genesis-supabase
  migration `0021_genesis_settings_integer.sql` makes `set_genesis_setting` refuse a fraction for such
  a key too, so the database never stores a value every reader would skip.

### Patch Changes

- 4b7af48: **`@marktiderman/genesis-features` is now `@marktiderman/genesis-config`** (renamed in place: same
  source, same exports and subpaths `.`, `/blocks`, `/gate`, `/gate/react`, `/node`, `/react`; `/blocks`
  and `/gate` stay free of zod). Feature ids, `features.ts`, `features.json`, `flags.json` and the
  generated AGENTS.md block keep their format.

  `@marktiderman/genesis-features` becomes a thin, deprecated re-export of genesis-config with the
  same subpaths, kept for two minor versions (0.10 and 0.11). Move with `npx genesis codemod
genesis-features-renamed-genesis-config` (`genesis upgrade` runs it too, whenever a package.json
  still lists genesis-features). See docs/MIGRATION.md.

  Publishing steps for this rename are in docs/RELEASING.md ("Renaming a package").

- f4e39b1: Docs: two settings linked to one feature switch it off when either is false; the settings results
  have no prototype, so read them directly or with `Object.prototype.hasOwnProperty.call` (their own
  `hasOwnProperty` throws); a direct database login counts as server code for Genesis settings; and
  `GENESIS_CONFIG_KEYS` is kept by hand, so a new top-level genesis.config.json key is added there.

## 0.9.1

### Patch Changes

- 13f6d59: The peer range on `@marktiderman/genesis-ui` now takes 3.x as well as 2.x (`>=2.x <4.0.0`), so this package works with genesis-ui 3 without a new major of its own.

## 0.9.0

### Minor Changes

- 234414b: Layouts (ADR 0022): an app's navigation style, frame, density and a document page template, plus zones in Genesis navigation (ADR 0003). Every default renders as before.

  - genesis-ui: `AppShellOptions.navigation` (`"sidebar"` default, `"rail"`, `"top-tabs"`, `"bottom-bar"`, `"page-tree"`) over the same navigation tree, `AppShellOptions.frame` (`"flush"` default, `"inset"`), and `density` gains `"spacious"` (types `AppShellNavigation`, `AppShellFrame`, `AppShellDensity`). New page template `DocumentPage` (cover, icon, title, reading column) at `/layout` and `/document-page`. New parts: `shell-frame`, `shell-top-tabs`, `shell-page-tree`, `tab-bar`, `tab-bar-item`, `sub-nav`, `sub-nav-item`, `page-header`, `page-header-title` and the document page's; the `shell` part carries `data-navigation`, `data-frame` and `data-zone`. `AppThemeLayout` gains `navigation` and `frame` (and `spacious`), passed by `appShellOptionsFromTheme`; the starter themes name a navigation style and a frame. `resolveNavigationZones` and the zone types are re-exported.
  - genesis-design-system: one density vocabulary, `DENSITY_LEVELS` (`compact`, `comfortable`, `spacious`), `DensityLevel` and `resolveDensity`; sites' design systems accept `comfortable` and `spacious` as aliases of `normal` and `generous`. Component tokens `--shell-frame-gap`, `--shell-frame-radius`, `--shell-frame-border-width` and `--shell-frame-shadow` (read only by the inset frame).
  - genesis-core: `NavigationNode.zone`, `ResolvedNavigation.zone`, `NavigationZone` and `resolveNavigationZones(tree, pathname, { zones, rollUp })`.
  - genesis-features: `BlockNavItem.zone`.

  Features: shell-navigation-styles, navigation-zones

## 0.8.2

### Patch Changes

- 5813132: Raise the zod dependency to `^4.6.6`, the first version with the fix for the memory exhaustion advisory. The package validates its own manifest with zod and doesn't expose zod schemas, so an app on zod 3 keeps working with its own copy.

## 0.8.1

### Patch Changes

- eeedad0: `build` and `check` no longer skip the permanent-id check when `features.json` can't be parsed. A file left mid-merge is read on each side of its conflict markers, so an id removed on either side is still caught, and `build` then resolves the conflict by regenerating the file. Only git's seven-character markers count, so the nested conflict a `diff3` criss-cross merge writes inside the base section is skipped with the rest of the base. Any other unreadable `features.json`, an empty one included, is now an error that names the file (and the side of the conflict), where before the check passed silently. A leading byte-order mark is accepted.

## 0.8.0

### Minor Changes

- 6eb984b: `readOverlayMarker(name, raw, problems)` validates a package's `genesis.overlay` marker (an app's local copy of a Genesis package): `upstream` is `@marktiderman/genesis-*@<semver>` naming the package itself, `since` a real `YYYY-MM-DD` day, `owner` and `reason` text. `readPackageMeta` checks the marker when present, and `PackageMeta` gains `overlay`. New exports: `readOverlayMarker`, `overlayUpstream`, `OverlayMarker`.

  Features: app-overlays

- b11005b: `genesis features check` and `build` let an id that was last recorded as `idea` or `planned` be removed for good: it never shipped, so no code, flag or test refers to it, and a backlog can move to a planning repo of its own. Ids stay permanent from `building` on.
- b028861: A feature's `kind` replaces its `layer` field. `kind` takes the same values (token, element, pattern, layout, hook, provider, block, service, tool); `layer` is still read as a kind until the next major (`"primitive"` as `"element"`), `features check` warns on it, and a feature that sets both to different kinds fails. A feature's layer is now its owning package's (foundation, primitive, module, tooling), derived from its `entry` imports or its `links.code` paths: `featurePackageLayer(def, packages)`, and `findFeatures(…, { packageLayer, packages })`. New exports: `FEATURE_KINDS`, `FeatureKind`, `featureKind`, `featurePackageLayer`, `FeaturePackage`; `FEATURE_LAYERS` and `FeatureLayer` are deprecated aliases.

  `genesis features find` gains `--kind`; `--layer` now filters by the owning package's layer (foundation, module or tooling), and a kind passed to `--layer` still works with a warning until the next major (so `--layer primitive` still means the element kind until then); a kind passed to both that disagrees is refused. Records (`toRecords`, `features.json`) carry the resolved `kind` and no longer the deprecated `layer`. `genesis add` writes `kind:` into features.ts when the app's genesis-features reads it (0.8 and later; `layer:` before), and a block manifest's `feature.kind` (or its deprecated `feature.layer`) sets it.

- c0c573f: Package metadata gains `genesis.optional`: an upgrade apps opt into. The layering check fails a foundation package or primitive that uses an optional package, except as an optional peer dependency (`peerDependenciesMeta`), so optional capabilities plug in through ports the primitive owns (ADR 0013).
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

- f9a11f2: `PackageMeta` gains `owner`, a GitHub handle or team (`@octocat`, `@acme/web`) who reviews changes to the package; `readPackageMeta` checks its shape. Genesis's packages each declare one, and the repo's `.github/CODEOWNERS` is generated from them (`pnpm gen:codeowners`, checked in CI), so ownership can split per package later without a process change.

### Patch Changes

- 37972e2: Layering fixes for optional packages: an optional peer is left out of the cycle search, so an upgrade's adapter that uses the primitive no longer reports a false cycle. `LayerPackage.valueImports` (filled by the repo's layering check) lets a foundation package or primitive import an optional peer only for types or with `import()`. `packageLayerProblems` refuses `genesis.overlay` on a Genesis package itself, and the overlay marker's `upstream` refuses build metadata and a `-local` tag. `optional` on a module is documented as adding no rule.

  Features: package-layering, app-overlays

## 0.7.0

### Minor Changes

- 9a254df: Content packs are generic. A pack's data goes in `sections`, keyed by the block that owns it (`sections: { meetings: [...] }`). Genesis checks what every pack shares (id, version, publisher, requires, labels, and a unique `key` on every item) and that each section's block is in `requires`; what an item holds is checked by the validator its block registers, the new `contributes.contentSection` on `defineBlock`. `contentPackProblems(pack, options)` takes `{ installed, blocks, validators }` (validators by block id win over a block's own), and still takes the installed blocks alone (a list, a set or a predicate; anything else throws a TypeError). A validator gets the section's items and returns messages relative to the section; one that throws is reported as a problem; `defineContentPack(pack, { blocks })` checks with them too. New types: `ContentPackSections`, `ContentPackSectionValidator`, `ContentPackCheckOptions`.

  Nothing breaks: the typed sections (`sessionTypes`, `metricTemplates`, `fieldDefinitions`, `forms`, `roadmapTemplates`), their types and `CONTENT_PACK_FIELD_TARGETS` still work and are checked as before, and are deprecated. Move that data into `sections` under the block that owns it, with that block's validator.

  Features: content-packs

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.6.1

### Patch Changes

- afae598: Per-person entitlements. Migration 0016 adds `private.genesis_viewer_person_ids()`, a fail-closed wrapper over the app's `private.genesis_viewer_people(viewer)` hook. It gives the person records a login is, so every block resolves a viewer's people the same way. It is in the owner-access and feature-mirror blocks. Migration 0017 adds `feature_person_entitlements` (grants to the app's person record, written with the service-role `grant_person_entitlement` and `revoke_person_entitlement`). `feature_on`, `feature_entitled_tenants` and `feature_gate_state(tenant)` now count the signed-in person's own grants, and server code can call `feature_gate_state(tenant, person)`. `featureGateState(client, tenant, { personId })` passes the person. In genesis-features, the gate's `entitlements` doc now says it holds the person's grants too.

  Features: feature-mirror, owner-access, feature-gate

## 0.6.0

### Minor Changes

- 7cdf0fe: Content packs: `defineContentPack` (in `/blocks`, zod-free) declares versioned data that fills installed blocks (session types and agendas, metric templates, custom field definitions, forms, roadmap templates, labels) and lists every shape problem at once; `contentPackProblems(pack, installedBlocks)` also refuses a pack whose blocks aren't installed; `contentPackBlocks` names the blocks a pack fills.

## 0.5.0

### Minor Changes

- bc5a348: The gate follows `requires`: a feature is off while a registry feature it requires is off (a module's parts go off with the module), and the answer's new `via` names the one that said no, so an upsell names the module's plan. `FeatureOff` carries `via` too.

## 0.4.1

### Patch Changes

- 773e809: The gate's plain types (`FeatureStatus`, `FeatureAccess`, `FlagKind`, `FlagValue`) move to a zod-free file, so `/gate`'s type declarations no longer reach zod. `isSnapshotStale` treats a future-dated snapshot as stale, and `fromSnapshot` reads a damaged or older stored snapshot as off instead of throwing.

## 0.4.0

### Minor Changes

- d67b516: The feature gate: `featureOn(registry, context, id)` checks status, platform, the tenant's switch, release flags (on only when exactly true) and last entitlement and returns `{ on, reason, unlock }`. `gateSnapshot` answers every shipped feature as plain JSON with `at` and `version` (no flag names), `isSnapshotStale` says when to refresh, `requireFeature` throws `FeatureOff` (402 for entitlement, 403 otherwise), and `/gate/react` adds `FeatureGateProvider`, `useFeature` and `FeatureGate`. `/gate` has no zod, for browsers, phones and edge functions.

## 0.3.0

### Minor Changes

- 73fb1f5: Blocks: `defineBlock` and `resolveBlocks` in `@marktiderman/genesis-features/blocks` (free of zod; also re-exported from the root) declare a block by its FeatureId with what it requires and contributes (nav, Settings rows, routes, slot fills, migrations, skills, privacy), and resolve the enabled ones with requirement, cycle and conflict checks. The registry's `requires` checks now live in `graph.ts`, shared by both, with the same messages.

  `GenesisNativeApp` takes `blocks` (and `appFeatures`, for requirements that aren't blocks): their boot steps, roots and slot fills (under the app's own slots; an unknown slot name is an error), with `useBlocks` and `useBlockSettings` for the nav tree and Settings. A setup error in the shell now hides the splash, so the fatal screen shows. `createUpdates` now returns a block (`app-updates`) that contributes the version signature row (`versionRow` sets or turns it off); `updates={…}` works as before.

  `genesis-supabase` adds migration `0004_genesis_tenant_features.sql`: per-tenant feature switches with a reason and a change history, `set_tenant_feature` for the tenant's admins through an app-supplied `private.genesis_tenant_admin` hook (fails closed without it), `tenant_features_off` for members, `tenant_feature_settings` and `tenant_feature_history` for admins, and `private.tenant_feature_on` for SQL gates; with the client helpers `tenantFeatures`, `setTenantFeature`, `tenantFeatureSettings` and `tenantFeatureHistory`, and `accountBlock` and `tenantFeaturesBlock` declarations.

## 0.2.0

### Minor Changes

- ffa443c: The feature registry becomes a reuse catalog. A new first status, `idea`, captures work that is not agreed yet so `find` turns it up before anyone builds the same thing twice. Optional fields describe what a feature is and how to reuse it: `layer`, `platforms` (status per platform), `entry` (what to import), `keywords`, `slots`, `extends` (a variant of another feature), `requires` and `contributes`. `defineFeatures` checks that `extends` and `requires` name real features, finds cycles, and refuses a beta or live feature that requires an idea, a planned or a retired one. `findFeatures` matches keywords, imports, slots and contributions and takes `platform`, `layer` and `status` filters; `genesis features find` gains `--platform`, `--layer` and `--status`, and the generated skill teaches reuse, then extend, then invent.

  Features: feature-registry

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

- 58aadde: One Genesis config per app. `genesis features` reads its settings from the `features` block of `genesis.config.json`, beside `doctor`, so an app keeps its Genesis settings in one file. package.json's `"genesisFeatures"` still works; when both exist, `genesis.config.json` wins, and the command line wins over both.

  Features: feature-registry, cli-doctor

## 0.1.2

### Patch Changes

- 5b1f464: The flag scan in `checkFeatureOutputs` ignores comments (a flag named in a comment isn't a read) and test files, and takes `scanIgnore` for the flags runtime that defines the accessors. Found running the check against a consumer app's flags runtime.

  Features: feature-registry

- 5b1f464: The flag scan no longer mistakes a regex literal (`/[/*]/`), a closing JSX tag, or an apostrophe in JSX text for the start of a comment or string. Comments inside a template's `${…}` are blanked like any other code.
- 5b1f464: The generated skill names only what `build` writes in this repo (for example, no `flags.json` when `openfeature` is off), instead of a fixed list. The flag scan also ignores text inside strings ("…behind the release flag (off)" isn't a call), and an apostrophe after a letter (JSX "Don't") no longer starts a string.

  Features: feature-registry

## 0.1.1

### Patch Changes

- ed8083f: `checkFeatureOutputs` warns, without failing, when a feature still marked `planned` already has shipped work tagged with it: a changeset with a `Features: <id>` line, or a merged PR passed in as `evidence: { prs: { <id>: [{ number, title }] } }`. The warning names each item ("billing is still planned, but .changeset/x.md and PR #123 shipped work for it"), the result lists them as `plannedButShipped`, and `summarizeCheck` counts them.

  Features: feature-evidence

- ed8083f: New package: a typed feature registry. `defineFeatures` and `defineFlags` in one `features.ts` that running code imports, with statuses through `deprecated` and `retired`, a dateless roadmap (`horizon`), `visibility` and `access`, `acceptance` sentences, permanent ids with `aliases`, `reviewedAt` and `claimedBy`, and optional marketing fields (`tagline`, `category`, `media`, `highlight`). Flags carry `kind`, `default`, `scopes`, `expires` and `runbook`. Generators: a short AGENTS.md pointer, `features.json`, an OpenFeature `flags.json`, the agent skill and a marketing block. `/node` builds and checks them with errors and warnings in tiers, scans code for flag reads and tests for `@feat:<id>` tags. `/react` has `FeatureList` (admin and marketing variants). The first version (0.1.0) is published by hand, so this patch is its first CI publish.

  Features: feature-registry
