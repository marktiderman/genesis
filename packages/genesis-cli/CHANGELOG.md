# @marktiderman/genesis-cli

## 1.36.1

### Patch Changes

- c75aa4b: The release lane leaves a platform out of a run while its eas.json `submit` block (resolved along `extends`) still has a template placeholder, instead of stopping the whole run: no runtime job, build, submit or update for that platform, with a warning on the run, and the other platform goes on. An app releasing iOS and Android before its Google Play key is in keeps its iOS releases and updates. `prove-ios.mjs` reads a `[api]` table with a comment after its header. The Google Play placeholder's advice (`genesis init`, `genesis doctor`) now says to release iOS only (`release.platforms: ["ios"]`) until the Play key is in.

## 1.36.0

### Minor Changes

- 200f4a5: Native workbench, proof runs, and a release lane that refuses to start half set up.

  - `genesis init --template native` into the Genesis workspace's `apps/` keeps the new app linked to the packages: its `workspace:` dependencies and the monorepo Metro config stay, it writes no pnpm-workspace.yaml of its own, and it adds a `postinstall` (`scripts/eas-build-packages.mjs`) that builds the workspace packages the app depends on when it runs on EAS, where their git-ignored `dist/` doesn't exist and the app's config loads it. Outside the monorepo nothing changes.
  - `genesis init --supabase-ports <base>` moves the new app's local Supabase stack off the default ports (API on base+1, database on base+2, and so on), so it can run beside another app's stack. It fails when the app has no `supabase/config.toml`.
  - `templates/maestro/prove-ios.mjs` (`pnpm prove:ios` in a new app) proves the app on an iOS Simulator:
    - against its own local Supabase stack, refusing to start one whose `[api]` port is 54321 or unset, and any API that isn't on 127.0.0.1, with a test login made through the stack's admin API;
    - or with `--no-stack`, for an app on sample data, with no stack, no login and no Supabase URL in the build;
    - from a cached development build: each new build starts from empty derived data and deletes `ios/` itself before `expo prebuild --clean`, and refuses when the app commits `ios/` unless `--force`;
    - running every flow in `.maestro/flows` (or `--flows <folder>`), with the evidence (screenshots, logs, summary.md) in `.e2e/artifacts/<run>/`.
  - The release lane's `source` check (`native-release.mjs submit`) stops a release before anything is built when a released platform's eas.json `submit` block still has a template placeholder, so a first release can't build, fail at submit, and then only ship updates.
  - The starter passes `swipeable`, `menu` and `router` to GenesisModules, wraps the root in `GestureHandlerRootView` and its tabs in `TabBarVisibilityProvider` (the iOS standards, ADR 0028), its sign-in subflow closes the keyboard before each tap, and its `.gitignore` leaves out the Supabase CLI's local state.

### Patch Changes

- 5763687: `genesis doctor`'s `release-lane-live` no longer reports "nothing starts a release" when the repository's own GitHub workflow (not `native-release.yml`) starts the release on a push to main. It is read as GitHub's trigger: quiet on `release.trigger: "github"`, the drift warning on `"eas"`.

## 1.35.0

### Minor Changes

- 8df2702: Agentic CI template (`genesis add template agentic-ci`): `.eas/workflows/agentic-ci.yml` and `.eas/agents/`, after Expo's Agentic CI. On the `Agent check` label or by hand, a coding agent tests a pull request on an Expo Simulators session (one session, with a maximum duration and an idle limit, recorded, always stopped), after the app's Maestro flows run there through agent-device, and comments a PASS or FAIL verdict with the recording and screenshots. The native starter ships it, so a new native app starts with it (delete `.eas/workflows/agentic-ci.yml` and `.eas/agents/` to leave it out). The agent's only shell command is `.eas/agents/device.sh`, a fixed list of agent-device commands run from a read-only copy outside the project; it reads only the project and writes only its evidence, the project's own Claude Code settings, hooks and MCP servers are not loaded (`--setting-sources user --strict-mcp-config`), device.sh takes the app and folder it drives only from the session's read-only file, and the evidence is uploaded only once redacted. Not yet run in EAS: run it by hand on a test branch first. It is opt-in: `genesis add template eas` and `genesis upgrade` never add or offer it, and `genesis add template --list` ticks it only once the app has it.

## 1.34.0

### Minor Changes

- 84127e9: **New doctor rule `expo-native-deps` (native pack), and the Expo starter on its SDK's versions.**

  - `genesis doctor` now makes the comparison `npx expo install --check` makes, offline: every installed package the installed `expo`'s `bundledNativeModules.json` names (the app's dependencies and devDependencies, plus `expo-modules-core` resolved from expo's real folder, pnpm's isolated store included) must be in the range that SDK expects, prereleases in range allowed and a React Native TV install compared by major.minor, as Expo does. `react-native` and `expo-modules-core` are errors: native code built for another React Native can crash the app at launch, in dyld, before any JavaScript runs. The others are warnings. The finding names an override or resolution that pins the installed version, in the app or at its install root (`expo install --fix` can't move one). `package.json` `expo.install.exclude` keeps a package off the check with Expo's meaning: a name always, `name@version` or `name@range` while the SDK's suggestion matches it. `genesis fix` points to `npx expo install --fix`, the reinstall and a new native build.
  - The starter `genesis init --template native` copies is on Expo SDK 58.0.26's versions: `react-native` 0.88.1 (it was 0.88.0, which `expo` ~58.0.19 resolving to 58.0.26 and its `expo-modules-core` 58.1.0 don't support), with `react-native-safe-area-context`, `expo-web-browser`, `@sentry/react-native`, `@shopify/flash-list`, `@react-native-community/datetimepicker` and the other Expo modules at the versions `expo install --fix` writes. The pnpm settings a new app gets override `react-native` to 0.88.1.
  - An app made from an earlier starter: run `genesis doctor`; on an `expo-native-deps` error, run `npx expo install --fix`, change `react-native` in `pnpm-workspace.yaml` `overrides` to the version it names, reinstall and make a new native build.
  - genesis-native and genesis-forms-native: development dependencies only (`expo` ~58.0.26, `react-native` 0.88.1), so the repository installs one expo and one expo-modules-core. Nothing they ship changes.

### Patch Changes

- 2765560: The release template's `pr-preview.yml` gives `IOS_BUILD` and `ANDROID_BUILD` an empty default
  (`${{ needs.get_release_ios_build.outputs.build_id || '' }}`). When no release build matched the
  fingerprint, `get-build` set no output and EAS refused the whole workflow before any job ran
  (`[env.IOS_BUILD]: Invalid input`); now the preview builds natively instead. `genesis upgrade`
  brings the template into an app.
- 6d6f4bb: `genesis doctor`: an `=` comparator in a range now intersects its other bounds instead of replacing them, so a contradictory range such as `>=0.88.2 =0.88.1` is empty in either order and an `expo.install.exclude` entry can't suppress a required error through it.

## 1.33.0

### Minor Changes

- 5bd12c2: New native apps release on EAS Workflows' own trigger (ADR 0026). `deploy-production.yml` runs on
  every push to main, as Expo documents it: it finds each platform's runtime version, then publishes
  an update on a matching store build or builds and submits. GitHub Actions takes no part, so a
  blocked or unpaid Actions account can't stop a release. Apps already on GitHub's trigger keep it
  until they choose to move (docs/MIGRATION.md).

  - New `release.trigger` in genesis.config.json: `"eas"` or `"github"` (the previous lane:
    `native-release.yml` on GitHub Actions, `deploy-production.yml` dispatch-only). Only one is ever
    written. Unset, an app with `native-release.yml` reads as `"github"`, and `genesis upgrade`
    writes it down; nothing about its releases changes.
  - `genesis add template release --trigger eas` moves an app in one change: `deploy-production.yml`
    takes the push and an unedited `native-release.yml` is removed. It first checks the EAS
    project's GitHub link on Expo's API, and, with a release hook, that `RELEASE_GITHUB_TOKEN` (an
    EAS secret) is in `pushHook.secrets`. Until both hold, nothing moves and it says what's left.
  - PR previews run when someone adds the `Preview` label (every pull request is the new
    `release.previews.everyPullRequest` opt-in), in an EAS environment of their own
    (`release.previews.easEnvironment`, default `preview-release`) rather than the release's: a
    preview runs the pull request's code before review. New doctor rule `preview-environment`.
    An app whose previews still read the release's environment keeps them as they are until that
    environment exists (checked on Expo's API), and the upgrade prints the setup steps.
  - deploy-production.yml fits EAS's 16 KiB limit for workflow files: the publishing moved into
    .eas/scripts/native-release.mjs (`publish`, `runtime-version`), and each platform's runtime
    version is found in its own job. New doctor rule `eas-workflow-size`.
  - A failed release says so: a `release_failed` job posts to `RELEASE_FAILURE_WEBHOOK` (an EAS
    secret) when set, and new `release.failureEmails` adds an Expo email job.
  - A run started by hand releases only committed code at main's tip. Updates carry the commit
    subject as their message.
  - `genesis init --template native` writes no `native-release.yml`.
  - New doctor rules: `release-lane-live` (an error when `deploy-production.yml` is dispatch-only and
    nothing starts it, a warning when the files don't match `release.trigger`) and
    `release-trigger-github` (a warning naming the move). `release-lane-twice` also guards EAS's
    lane.

- 15bbd1c: `genesis repo protect` puts an app's GitHub repository on Genesis's branch-protection standard: a `default` ruleset on the default branch (no deletion or force push, pull requests with resolved threads, merge or squash only, the required checks) and, for apps that release through staging batches, a `staging-branches` ruleset, plus the merge settings (delete branches on merge, auto-merge on, rebase off). The required checks are read from the app's own workflows (`app / App checks`, the review gate's `Adversarial review`), pinned to GitHub Actions; a path-filtered workflow's check is never required, since it would hold other pull requests forever. `--dry-run` prints the diff. Converging adopts an existing ruleset, keeps what Genesis doesn't name and never loosens a stricter value (approvals, code-owner review, strict checks, fewer merge methods, a bypass mode); a matrix job is never required; `genesis.config.json`'s new `repo` block (`requiredChecks`, `stagingChecks`, `staging`) names the checks exactly. `genesis repo prune-staging` deletes merged staging batches through the staging ruleset's admin bypass (the default branch gets none), with no rule turned off. The doctor's new `repo-protection` rule (warn, network only) reports drift, fixed by `repo.protect`; the setup wizard offers it as the `github.branch-protection` step.

### Patch Changes

- 37c53d8: With `release.trigger` `"github"`, `deploy-production.yml` failed in its first job because EAS
  Workflows refuses a non-string `env` value: `RELEASE_IOS` and `RELEASE_ANDROID` now take the
  `ios` and `android` inputs' own text, which the step already compares as text.
- 4e3144f: Upgrade friction from taking the last release:

  - `genesis upgrade` and `genesis add` run the app's own `features:build` script when it has one
    that isn't `genesis features build`, so features.json (and the rest) come out exactly as the
    app's own build and check write them, instead of in another order.
  - `genesis agents`, the catalog and the doctor leave out a deprecated package (a renamed one's
    alias, `"deprecated"` in its package.json) that the app's package.json no longer lists, though
    its folder is still in node_modules after the upgrade.
  - `migration-drift` no longer reports a copy that differs from its package migration only in SQL
    comments (`--`, `/* */`, outside strings and dollar-quoted bodies) and whitespace: it makes the
    same database, so there is nothing for a forward migration to carry. A real SQL change still drifts.
  - The README's upgrade section says what to do when `npx @marktiderman/genesis-cli@<v>` stops with
    `EOVERRIDE` in an app (the app's npm override against its own direct dependency): run the app's
    installed `genesis`, or write the override as `"$zod"`.

## 1.32.0

### Minor Changes

- 67d5859: Setup: the `sentry` step saves the organization and the DSN as the settings `observability.sentryOrg` and `observability.sentryDsn` (genesis-native declares them) in one write of genesis.config.json, which installed apps read from their next build or update (a change on the in-app Settings screen applies with none). A step may now save several settings in that one write. `settings_propose` checks a value against the key's whole declaration, its `pattern` and whole-number rule included.
- 514b568: **Genesis Data Studio is now Genesis Data.** The name "Genesis Studio" now belongs to the creator suite (Map, Imago and the tools beside them), and the table and record editor is Studio's Data tool.

  - `@marktiderman/genesis-studio` is now `@marktiderman/genesis-data`, and `@marktiderman/genesis-studio-server` is now `@marktiderman/genesis-data-server`, with the same exports, stylesheets and entries. The server's command is `genesis-data-server`.
  - The old packages are deprecated aliases that re-export the new ones for two minor versions, so nothing breaks: `genesis-studio-server` still runs the command. `genesis doctor` reports imports of the old names as `deprecated-import`.
  - An app whose stylesheet scans the old package (`@source ".../genesis-studio/dist"`) still gets the editor's classes: the alias ships genesis-data's built module, unimported, for Tailwind to find. `genesis data init` adds the new `@source` line once, including to an app set up under the old name.
  - `genesis data init` turns Genesis Data on in an app. `genesis studio init` still works and says it's been renamed.
  - Unchanged on purpose: the exported names (`DataStudio`, `createStudioHandler`, …), the `genesis_studio` database schema and the `genesis_studio_login` role, so a deployed app needs no migration.

- e1278f3: Previews on the phone, opened by a link, and the doctor's missed-value check.

  - **genesis-native:** preview links (`previewLinkChannel`, `previewLink`, `previewPath`, `PREVIEW_PATH`), read by `normalizeLink` where the app's own `map` has no pattern for the path (an app's `/preview/:id` route keeps its links; `links.previews: false` turns previews off). `PreviewScreen`, `PreviewNotice` (the updates block's new `previewNotice` slot) and `useChannelState`. The channel switcher gains `prepare`, `restart`, `state`, `recover`, `subscribe`, `noteDownloaded`, `noteRelease` and `holdReload`, runs its writes one at a time, remembers the build's channel, and heals when a preview's channel was deleted. `switchTo` and `prepare` are async: a bad channel name, or switching while it's off, now rejects their promise instead of throwing synchronously, so catch it (`await` in a try, or `.catch`). The `channels` docs now turn switching on in release builds (`{ enabled: true }`); it can't work in a development client.
  - **genesis-cli:** `pr-preview.yml` publishes each pull request as an update on `pr-<number>` for the release builds people already have, and comments a preview link and QR code; it builds a preview only when native code changed. New `pr-preview-teardown.yml` deletes the channel when the pull request closes. `release.previews` (`origin`, `scheme`) and the `previews` template set (`genesis add template previews`). New rule `missed-value` (info) reports blocks an app doesn't use, ones it switched off, and a missing preview lane, with `doctor.declined` for the ones it doesn't want; block manifests take `detect`.

- 907d405: Readable Sentry stack traces by default, web and native, from one switch.

  - **`observability.sentry`** (genesis.config.json, new top-level key): the Sentry organization and project. With both set, `release.sentry` defaults to true, so the release workflows upload each update's source maps; an explicit `release.sentry` still wins. `pr-preview.yml` with Sentry on checks `SENTRY_AUTH_TOKEN` and the uploader before publishing and uploads each platform's preview update.
  - **New rule `cli/sentry-source-maps`**, declared by genesis-cli through `genesis.doctor.plugin` so every app with the CLI runs it: in an app with an `@sentry/*` package, it flags Metro without `getSentryExpoConfig` (no Debug IDs), a missing `@sentry/react-native/expo` plugin, a workflow that publishes updates without uploading their source maps, and a web Vite build without Sentry's source maps plugin. An app with an empty `observability.sentry` gets one info.
  - **New fix `cli/sentry-source-maps`** (guided, `genesis.doctor.fixes`): writes `getSentryExpoConfig` into the Metro config, the Expo plugin, `observability.sentry` adopted from the app's own plugin options and `"@sentry/cli": true` in the app's pnpm-workspace.yaml, then lists the `SENTRY_AUTH_TOKEN` step and the rest.
  - `genesis init --template native` writes a Metro config that builds on `getSentryExpoConfig` when `observability.sentry` is set, and the development EAS profile sets `SENTRY_DISABLE_AUTO_UPLOAD`, so development builds need no token.

### Patch Changes

- 7b2e1ac: `genesis migrate` and the doctor's `migration-drift` no longer flag an app's own earlier draft that shares a package migration's name. When several files hold one package migration and exactly one carries its `genesis-migration` header, that file is the copy and the others are the app's own. Without exactly one header, which file is the copy can't be told, so the migration is still left alone and reported.
- Updated dependencies [c9541ac]
- Updated dependencies [514b568]
  - @marktiderman/genesis-config@0.13.0
  - @marktiderman/genesis-data-server@0.7.0

## 1.31.0

### Minor Changes

- dfd6577: `genesis build-stamp` writes `build-metadata.json` (version, git commit and branch, build time, channel) for the app to pass as `buildMetadata`. `BuildMetadata` gains `version`, `channel` and `builtAt`: the version signature (and so the devtools overlay) names when and for which channel it was built, and `nativeSections` puts `builtAt` (and the stamped version and channel when the binary gives none) in the dump's `build`.
- c2161cf: Zero config has a platform admin list.

  - genesis-supabase: new migration `0022_genesis_platform_admins.sql` in the settings block (copy it with `genesis migrate`). `public.genesis_platform_admins` starts empty and only the service role reads or writes it. While the app has no `private.genesis_platform_admin` hook, Genesis's own wrappers (`private.genesis_person_is_platform_admin`, 0020's `private.genesis_is_platform_admin`, `set_genesis_setting`) read the list; no function under the app's hook name is Genesis's, so the app adds its own hook whenever and however it likes and the list is then unused. Nobody is an admin until added; never every signed-in person.
  - genesis-support: new migration `0032_genesis_support_staff_admin_list.sql`: with no staff hook, support staff are the platform admins through that wrapper, so the people in the list are staff too.
  - genesis-cli: new doctor rule `platform-admin-missing` (warn, read with the database layer through the linked project): the app has the list, no hook of its own, and the list is empty. Its guided fix, `settings.first-admin`, prints the SQL that adds the first admin by a confirmed email (`email_confirmed_at is not null`) and adds nobody when no confirmed person, or more than one, has it.
  - The RN starter ships the settings block (genesis-supabase 0020, 0021 and 0022) and support's 0032, so `genesis init --template native` records it. Its README and the README `genesis init` writes say to run `genesis settings sync` on every deploy, after the migrations, and to add the first admin.

- 11219ef: The Settings screen now runs inside the app. genesis-supabase's `createSettingsHandler` (`/settings/server`) serves every op of the settings protocol from the app's Supabase, as the signed-in person: it calls the database with their own token (never the service role) and answers its own origin only. A platform admin sees every key, the health the server can know, secrets, upgrades, the whole history and pending proposals; a tenant's admin sees and writes that tenant's `scope: "tenant"` keys; anyone else their own `scope: "person"` keys. A bad database value is fixed through plan and apply with a hash over what is stored.

  The new `settings-host` block (migration `0024_genesis_settings_host.sql`, after the settings block) adds `genesis_settings_viewer`, proposals (`propose_genesis_setting`, `decide_genesis_setting_proposal`: someone who can't change a locked value asks, with why, and a platform admin approves or declines), Vault set and rotate for platform admins (`set_genesis_vault_secret`: the value is a parameter all the way into Vault, never logged or stored outside it; `genesis_secret_rotations` records when, without it) and one paged history (`genesis_settings_audit`).

  genesis-config: `<GenesisSettings tenant>` shows the viewer's slice (`state.viewer`) with a Propose button for a value the app locked, and a platform admin decides proposals on Values. The protocol gains `SettingsViewer`, `SettingsProposalEntry`, the `decideProposal` op and `propose`'s `reason`; `settingWritability` takes the viewer. `catalogueManifest` now writes each key's whole declaration (default, summary, links, a secret's name and store), and `catalogueFromManifest` rebuilds the catalogue from it: run `genesis settings sync` again after upgrading.

  genesis-cli: `genesis settings init` writes the handler's route for Next.js, TanStack Start, React Router or Expo Router.

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

### Patch Changes

- 7d878ee: `genesis init --template native` gives the new app the starter's build stamping: its scripts run `genesis build-stamp` before bundling, typechecking and testing, EAS builds stamp and check it (`eas-build-post-install`, with `GENESIS_CHANNEL` in each eas.json profile), every release lane stamps before `eas update`, and `build-metadata.json` is git-ignored. The starter's own stamp is no longer packed or copied.
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

- c2161cf: `genesis settings sync` skips an app without the settings block (no `genesis_settings` table: neither in genesis.lock.json nor a copy of its migration) with one line and exit 0, so a deploy step can run it in every app.
- Updated dependencies [02a51b9]
- Updated dependencies [11219ef]
- Updated dependencies [8f49de2]
- Updated dependencies [4acea0b]
- Updated dependencies [ec8a3ba]
- Updated dependencies [22bfd48]
  - @marktiderman/genesis-config@0.12.0

## 1.30.1

### Patch Changes

- 5c9653e: Release 1 review fixes.

  - The Expo config plugin loads again under `require` (genesis-config's `/settings` is CommonJS-loadable);
    a test `require()`s the built plugin under `tsx/cjs`.
  - The doctor treats a `planned` setting as dormant: no `secret-missing` and no `setup-incomplete` for
    it, so a zero-config app on `max` passes `genesis doctor --strict`.
  - `genesis fix <rule> --expect <hash>` reads every plan first and refuses, writing nothing, when the
    target has more than one fix to apply. A package fix whose id is already taken is reported and left out.
  - The genesis-features → genesis-config codemod keeps a production dependency a production one
    when genesis-config is only a dev dependency, never doubles a key genesis-config already has in
    `overrides`, `resolutions` or a pnpm-workspace.yaml catalog (flow mappings too), points an npm
    override of a direct dependency at it (`$@marktiderman/genesis-config`, no `EOVERRIDE`), and
    `genesis upgrade` runs it only for a release that has genesis-config (an older `--to` never gets
    npm's latest).
  - `genesis-behind` honours `NPM_CONFIG_REGISTRY` in any case, and still checks advisories when
    `npm view` fails.
  - Under `--base` with `doctor.ratchet: true`, a new `invalid-setting` keeps its level (the base pass
    no longer reads the head's genesis.config.json).
  - Findings and `genesis fix settings.setup` no longer point to `genesis setup --step`, which isn't
    available yet: they name the setting and secret to set.
  - The fix engine removes a partial new file or staging file a failed write leaves, and `verify`
    counts a finding it ran for that now names another fix as not fixed. `genesis mcp` keeps a
    result valid JSON after redaction and refuses an approval when a planned file changed since the plan.
  - An invalid `release.environment` (or `release.easEnvironment`) is reported ("not checked: … isn't an
    environment name") instead of being dropped, which made gh read the repository's secrets instead.

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

- 7481a71: `genesis settings sync` writes the app manifest (genesis-supabase's `genesis_app_manifest`: the Genesis packages and versions, the preset, genesis.config.json `settings` and the settings catalogue) through the linked Supabase project (`supabase db query --linked`, or `--project-ref`), after naming the project and asking (`--yes` skips the question and is required without a terminal; an invalid `preset` is refused, not stored as `max`; on Windows the SQL goes through a temp file); `--print` gives the SQL for a pipeline that runs it with psql, and `--app-id` names the app when its package.json name isn't an id. Run it on every deploy, after the migrations: until the manifest is written, `set_genesis_setting` refuses every value, and nothing wrote it. The settings block's setup step and the genesis-supabase README say so; a server can still write it at start with `writeAppManifest`.
- Updated dependencies [06d4caa]
- Updated dependencies [5c9653e]
  - @marktiderman/genesis-config@0.11.1

## 1.30.0

### Minor Changes

- 2c6c8b3: `genesis fix [rule|fixId] [--plan] [--yes] [--expect <hash>] [--json]`: every doctor finding now
  declares its fix (`fix` in `--json`, `→ genesis fix <id>` in the report; `manual:<rule>` when
  nothing runs). A plan lists the files it writes with the hash of the text each expects, the
  commands it runs (allowlisted tools as argument lists, never a shell; secrets by name, on stdin),
  and what is left to you, with a hash of the whole plan. Applying plans again and refuses a stale
  plan or a file that changed, never writes through a symbolic link or outside the app, rolls every
  file back when a later step fails, then re-runs the doctor for the fix's rules. The first fixes wrap the
  scope-names, genesis-features and eslint-config codemods, `genesis agents` (and `--hooks`),
  `genesis introspect`, `genesis migrate` (and `--forward`), `genesis upgrade --pr` (never merged) and
  removing undeclared settings. Packages add fixes for their own rules with `genesis.doctor.fixes`.

  New doctor rules: `migration-pending` and `migration-drift` (what `genesis migrate --dry-run`
  reports), and `genesis-behind`: the installed `@marktiderman/genesis` release against npm's latest
  (info a patch behind; a warning one or two minors behind that never fails `--strict`; a
  strict-failing warning further, a major or 90 days behind; in CI never failing) and a published
  advisory on an installed Genesis package (an error when high or critical, else a warning; npm's
  bulk advisory endpoint, `gh api /advisories` as a fallback or for a private registry), cached in
  `node_modules/.cache/genesis/behind.json` for a day (a failure for an hour), with a deadline
  of about 20 seconds. Only the Genesis packages' names and versions are sent.

  **`genesis doctor` now reaches the network** in the CLI. To keep it offline: `--offline`,
  `npm_config_offline=true`, or `"network": false` in the doctor settings; `"rules": {
"genesis-behind": "off" }` skips the rule. The Vite plugin never reaches it, and offline the rule
  reports what its cache last knew as one info finding. `doctor.network` is a new setting.

  `genesis-config-unknown-key` now adds "or upgrade @marktiderman/genesis-cli if this is a newer key".

  `invalid-setting`'s "no installed package declares this setting" now says "not certain" when the
  catalogue couldn't be read completely (a Genesis package not installed, a declaration that can't be
  read), and `settings.remove-unknown` then removes nothing; it never removes a locked key.

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

- 95bab84: genesis.config.json takes `preset` (`max`, `standard` or `min`) and `settings` (`"namespace.key":
value`, or `{ "value": …, "locked": true }`), checked strictly when the config is read. The doctor's
  new `invalid-setting` rule checks them against the settings the installed Genesis packages declare
  (package.json `genesis.settings`): an unknown key or a value that doesn't fit is an error, a key on
  while one it requires is off is a warning, and a package declaration that can't be used is an error. It reads every Genesis package
  installed, transitive ones too. `genesis-config-unknown-key` (warn) flags a top-level key in
  genesis.config.json that nothing reads, naming the one probably meant. An app that already used a
  top-level `preset` or `settings` key for something else isn't stopped: a value that isn't the new
  shape is ignored and reported by `invalid-setting`, with how to rename it.
- 4b7af48: The `genesis-features-renamed-genesis-config` codemod (`genesis codemod
genesis-features-renamed-genesis-config`; `genesis upgrade` runs it when genesis-features crosses
  0.10.0 and whenever a package.json still lists genesis-features) moves an app from
  `@marktiderman/genesis-features` to `@marktiderman/genesis-config`: every mention as a module name in
  its scripts, the dependency in each package.json (with the release's genesis-config range, or dropped
  when genesis-config is already listed), `overrides` / `pnpm.overrides` / `resolutions` keys,
  `tsconfig*.json` paths and `pnpm-workspace.yaml`; it prints what still mentions the old name as a
  checklist. Codemods now get the release's pinned versions (`wanted`) and can say they still apply
  (`applies`), and the install note covers a workspace package's package.json.

  The doctor's `deprecated-import` rule now flags a whole deprecated package as well as tagged
  exports: any import of a package Genesis renamed (genesis-features), or of one whose package.json
  carries npm's `deprecated` notice, is reported once per import with the advice to run the codemod.

- 823ff46: `genesis mcp`: the doctor, the settings and fix plans as MCP tools over stdio, for an agent
  session in the app. Read-only tools: `doctor_run`, `doctor_explain`, `settings_catalogue`,
  `settings_get` (values with their sources; secrets by name as set, missing or unknown, never a
  value), `upgrades_status`, `catalog_search`, `fix_plan` and `settings_propose` (each a plan and its
  hash; nothing written). The one write tool, `fix_apply {fixId, hash}`, refuses a stale hash and
  applies only after the person accepts an MCP elicitation that shows the plan; a client without
  elicitation gets `genesis fix <id> --expect <hash>` to run instead, and a fix that needs a secret
  returns `genesis fix <id>` for the person (`genesis setup --step <id>` and a `setup_steps` tool
  arrive with the setup wizard). Every result and error is bounded in size and scrubbed of
  secret-looking values, and while it serves no child process can write into the protocol. `genesis agents --mcp` writes the server's `.mcp.json`
  entry (`npx --no genesis mcp`), keeping every other server.

  New dependency: `@modelcontextprotocol/sdk` (1.32.2, pinned), the protocol's reference SDK.

- 9f2a5dd: The native release lane is a versioned Genesis part, customised in `genesis.config.json` `release` instead of edited copies (docs/NATIVE-RELEASE.md).

  - **New lane.** `templates/ci/native-release.yml` (GitHub Actions, every push to main that changes the app) publishes an over-the-air update per platform when a finished production build has the commit's runtime version and no EAS release run is open, and otherwise starts `deploy-production.yml` for that commit and platform. `deploy-production.yml` is now dispatch-only (its `ios`/`android` inputs are choices compared as text, since `eas workflow:run -F` sends strings): it builds and submits, or waits for a build in progress and publishes on it; EAS's concurrency keeps runs in commit order. Both paths publish with the same steps: the build profile's `env` for the platform (`<platform>.env` included), the runtime version checked before and after `eas update`. A platform whose channel already carries the commit (or a later one) is skipped, out loud. `EXPO_TOKEN` is never in the job's env. Each platform of each commit takes one path, and a failure on one platform doesn't hold the other back. New owned files: `.eas/scripts/native-release.mjs` (the lane's tested decisions), and `fingerprint.config.js` and `.fingerprintignore` (`templates/expo/`), which hash config plugins by their files and genesis-native's Swift by its path inside the package, so a Genesis release alone no longer forces a store build in a hoisted install.
  - **`release` block**: `platforms`, `environment` (the GitHub environment with the secrets), `paths` (folders outside the app the bundle reads, one list for native-release and pr-preview), `sentry`, `pushHook` (a script run after each release, with the release facts in `RELEASE_*`), `profile`, `channel`, `easEnvironment`, `packageManager`, and `runtimeVersion` (`"fingerprint"`, or a command that prints each platform's runtime version, matched against builds by runtime version). Validated; an app that sets nothing gets the default lane.
  - **`genesis add template <set|template…>`** (and `genesis add release`): writes `release`, `eas`, `expo`, `maestro`, `ci`, `database` or `vercel` templates into an existing app and records them in the lock. A file the app already has gets `<file>.genesis-next`, never overwritten unless `--replace`; `native-release.yml` is held back (exit 1) while another workflow still releases on push to main (an EAS workflow, or a GitHub workflow running `eas update`, `eas build` or `eas workflow:run`), unless `--replace-rival` (for a change that removes it too). Run again after changing `release` to apply it.
  - **`genesis upgrade`**: renders owned templates with `release`; with `appFolder`, refreshes and merges `native-release.yml` in the repository's `.github/workflows` (other workflows there are still only named); writes the release's commit into the owned workflows' Genesis pins (`@<commit> # @marktiderman/genesis@<version>`), recorded as the lock's `pin`, and moves a shared workflow's pin in place only when its template didn't change; doesn't switch an app on the old push-triggered lane (its `deploy-production.yml` is held, and the summary says how to adopt the new lane with `genesis add release`), so existing apps keep releasing as before; lists template sets the app doesn't have.
  - **`genesis init --template native`** writes the release lane and pins the CI callers to the release; it no longer copies the web-only Vercel templates. `templateTarget` reads a template's `# Copy to` line anywhere in its opening comment, so `templates/vercel/` lands at `vercel.json` and `scripts/vercel-ignore-build.sh`.
  - **Doctor:** `fingerprint-plugin-files` (native pack, warn) when an app on the fingerprint runtime version loads genesis-native's config plugin without a fingerprint config that hashes plugins by their files; `release-lane-twice` (error) when native-release.yml sits beside another workflow that releases. The lane supports one native app per repository.
  - genesis-cli now depends on `yaml`, to read workflow triggers as YAML.
  - The release lane's EAS workflow templates moved to `templates/release/` (`deploy-production.yml`, `pr-preview.yml`), so a previous genesis-cli refreshing an app from this release leaves those files as they are; this CLI maps the lock over.

### Patch Changes

- f4e39b1: Docs: two settings linked to one feature switch it off when either is false; the settings results
  have no prototype, so read them directly or with `Object.prototype.hasOwnProperty.call` (their own
  `hasOwnProperty` throws); a direct database login counts as server code for Genesis settings; and
  `GENESIS_CONFIG_KEYS` is kept by hand, so a new top-level genesis.config.json key is added there.
- bd2d2e2: `genesis mcp`: the approval a person sees is now exactly what applies. A plan whose message would
  hold a secret's value or a secret-shaped literal, or whose changed lines pass 12,000 characters,
  isn't offered for approval (`fix_apply` says why and gives the command); invisible and
  direction-changing characters show as their codes; an unterminated private-key header no longer
  redacts the rest of a text. Results are scrubbed before they're clipped, a file's own hashes aren't
  returned, `*PASSPHRASE*`, `*_PWD` and `*SALT*` count as secret names, stderr is scrubbed, `fork`
  and `spawn(cmd, null, …)` are guarded too, and `genesis agents --mcp` keeps `.mcp.json`'s mode.
- 7d5b8d7: `genesis fix` secrets, second review: the hidden prompt refuses (and throws away) the rest of a
  multi-line paste however slowly it arrives, input already waiting when it starts, and zero-width,
  bidi and separator characters; it backspaces over whole characters, accepts a CRLF Enter split
  across two reads, puts the terminal back on an external SIGINT, and stdin is drained before exit.
  Redaction catches every JSON-escaped form of a value (Go's `&`-style escapes, either case),
  and `--json` keeps a Date as its ISO string. genesis-supabase's README adds the jobs secret to Vault
  in the dashboard rather than with SQL.
- Updated dependencies [818908b]
- Updated dependencies [4b7af48]
- Updated dependencies [f4e39b1]
- Updated dependencies [6c40ccc]
- Updated dependencies [95bab84]
- Updated dependencies [71cb0e2]
  - @marktiderman/genesis-config@0.11.0

## 1.29.0

### Minor Changes

- 45cfac6: Declared data access (docs/DATA-ACCESS.md). The Supabase provider takes per-resource `writes` (named database functions for create, update and delete, called with `p_values` / `p_id` / `p_expected_version` unless `args` names them), `actions` (named row actions, now served by `runAction`) and `table` (a declared opt-in to raw table access, with its `why`). `access: "declared"` makes the declarations binding: an undeclared read or write, or a resource missing from `resources`, is refused with a message that names what to declare; the default (`"open"`) refuses nothing and writes exactly as before. On a declared provider a table create or update asks for the row's `id` (and its version) only in its response and reads the record back the way the resource reads (an update over a `source` without `writeColumns` still reads the table's row first, with `table.read`, to learn its columns); a `writes` function that returns an id reads back the same way in either mode. `runAction` is served only when some resource declares an action, and `capabilities().actions` says which; `ResourceView` and `NativeResourceView` hide a view's actions for a resource whose provider runs none, and until the provider's capabilities arrive, and run an action (from a list row, a bulk selection or a record page) at the version the row was read at (`expectedVersion`), so a row changed since is a conflict where the provider checks it. A `{ fn, args }` write function on a versioned resource whose `args` takes no context is reported (it can't pass the expected version on). `accessRules` (`@marktiderman/genesis-core/testing`) turns one function's access rule into runner-neutral test cases, allowed and refused, and `expectAccessRulesCover` fails for each function the provider's options declare without a spec (pass it the specs the cases are registered from) (`declaredFunctions` lists them). The doctor adds `data/declared-access` (a provider left open, a table write in app code) and `data/access-rule-tests` (a Supabase provider with no `expectAccessRulesCover` test), and the generated agent guide states the pattern.

  Features: declared-data-access

- 8c34865: `@marktiderman/genesis-cli/verify`: the runtime conformance checks behind Genesis's Conformance CI job, for an app's own Playwright tests too. `checkPage(page, { viewport })` runs axe's WCAG 2.2 A/AA rules with `target-size`, then the in-page checks: sideways scroll of the page or an app shell's scroller, and anything past the viewport outside a frame that scrolls wide content (WCAG 1.4.10); text cut off at 200% text size (1.4.4, the `text-200` viewport with `zoomText`); 44px hit areas on a coarse pointer, hit-tested (genesis-ui's `touchTarget` counts); focus hidden under a fixed or sticky bar (2.4.11); more than one floating control on a phone; and a viewport meta without `viewport-fit=cover` and `interactive-widget=resizes-content` (docs/RESPONSIVE.md). `allViewports()` and `contextOptions()` give the matrix (six widths with touch at 768px and below, 200% and 400% zoom as 640×512 and 320×256 with a mouse, text at 200%, reduced motion); `flattenReactRouterRoutes` and `onePathPerPattern` pick one page per route; `applyAllow` applies a doctor-style known-findings list. `@playwright/test` and `@axe-core/playwright` are optional peers, needed only by this entry.

  Features: cli-conformance

## 1.28.0

### Minor Changes

- 34842f5: Features: client-layer, cli-doctor
  The app client layer (ADR 0020): `genesis client init [--folder <dir>] [--type <name>]` scaffolds `src/client/` (or `genesis.config.json` `client.dir`): `client-layer.tsx`, `resource-view.tsx`, `record-view.tsx`, a type's `contract.ts`, `view.ts` and `appearance.tsx`, and `cells/`, `components/` and `view-types/`. Two doctor rules, warn level, once the layer exists: `client/layer` (a screen renders Genesis's `ResourceView` or `RecordView` directly) and `client/one-view-per-resource` (a second `defineView` over one contract, by import identity; stories and tests skipped).
- 601fac2: Features: view-filters, view-actions, saved-views, view-inbox, resource-view-board, resource-view-calendar, resource-view-sheet, client-layer, appearance-preferences, data-provider
  The lists release's review, second round:

  - **Core.** A filter a function source took (`take`) belongs to that one read: a later read passing the same array (a table read, its count) keeps it as a filter. `getOne` and `getMany` take `scope` (the list's filters, which a function source takes its scope from; never applied to the record), and `useOne` takes `scope`. `useListState` keeps a declared filter's `default` on a URL-backed list (absent from the URL means the default, `f.<field>=` means cleared), Clear goes back to the defaults, a saved view's segment, filters, search and sort go into the URL in one replacement, and a new viewer or list key starts again from the screen's type. A range filter's day and time must be real (`2026-02-30`, `T25:00` are dropped). The saved-view store keeps a write the storage refused for the page's life. `useViewBoard` refuses a move on a field it can't write (`canMove` says so) and asks the guards again before Keep mine. A calendar's `maxDuration` reads rows with a `durationField` that started before the window and run into it (warned once without it); `defineView` checks it. A nested `ViewerScope` trusts the outer one's cache only over the same `QueryClient`. `AppearancePreferencesProvider` drops a read older than a value its store's `subscribe` delivered, and never sends a write queued for one store to the next.
  - **Web.** A view action is offered by what runs it: the screen's `onAction` (whatever the provider describes), the provider, or a bulk action's own `run`. An action runs once while it's running. A saved-view store that throws is reported. Each `ResourceView` holds its own list state, so a nested one never shares its parent's. `rows` draws on the table, list, grid and gallery only (other types throw, the switcher leaves them out) and without the view's declared filters. `useResourceViewProps` puts an action's confirmation in `ResourcePage`'s new `dialogs`. With the caller's data, an export gets the page's search, sort and status filter, and "Select all matching" ends when the query changes. DataTable's tab stop and arrows skip a closed group's rows; DataGrid keys a group's second run apart. The inbox's e key asks the done action's confirm, and an off-page open record is read in the list's scope. The sheet keeps list fields read-only, ties undo to its resource, asks the guards again before undoing, keeps an undo that failed or was refused, shows a failed read with a retry, and restores a saved view's search and sort. SheetGrid doesn't commit a cell that became read-only while it was edited.
  - **Phone.** `enabled={false}` holds every type's read. The calendar uses the screen's `scopeTimeZone` and shows a failed read with a retry. The inbox loads back pages it dropped (`InboxPage`'s new `onStartReached`).
  - **Support.** `supportQueueSource({ tenant })` takes the list's `tenant_id` out of the query too.
  - **CLI.** `genesis client init --type` takes lowercase words joined by single dashes only. `shadowed-export` lets a file wrap the Genesis component it names through an aliased import it uses (the scaffolded `ResourceView` and `RecordView`). `client/one-view-per-resource` doesn't count two functions' same-named parameters as one contract.
  - **Third round.**
    - **Core.** `useOne`'s `scope` leaves out a text search's `contains` (no record read per keystroke) and keeps the rest, `in` scopes and ranges included.
    - **Core: list state and calendar.** `useListState` drops a type that's no longer offered back to the screen's, without writing the store, so the choice returns once it's offered again. The `maxDuration` lookback reads the latest starts first; on a zoned timestamp it subtracts elapsed time from the window's first instant (a 23-hour day can't drop a row). It warns about a missing `maxDuration` only with no `endField`.
    - **Core: caches and appearance.** A `ViewerScope` keeps restored reads for the persisted viewer only in the `QueryClient` they were restored into. `AppearancePreferencesProvider` drops a choice held for one store's first read when the store changes.
    - **Web.** A held list's rows arriving after the person chose board, calendar, inbox or sheet fall back to the table instead of throwing. `ResourceInbox` and `ResourceSheet` rendered directly refuse `rows` too. The table's deep-linked record and the phone's peek and edit sheet read in the list's scope, as the inbox does. `ResourcePage` takes `restoreKey`, which `useResourceViewProps` sets, so a restored saved view's search and sort reach a screen's own page. A client-paged resource's export and "Select all matching" get the search, sort and status chips the page applies in the browser. The sheet runs one write at a time (undo and saves), ignores a second Undo while one runs, and adds no undo entry for a save that lands after the sheet moved to another resource.
    - **Phone.** `enabled={false}` also holds the segments' counts.
    - **CLI.** `shadowed-export` counts only real uses of the alias: a comment, a string or JSX text doesn't excuse a parallel component. `client/one-view-per-resource` skips a name a function parameter shadows in that file.
  - **Fourth round.**
    - **Web.** A client-paged page's status chip narrows on top of a provider filter on the same field, and the person's sort wins over a provider default, in the export query and the "all matching" selection. "Select all matching" is offered only while the browser narrows nothing (no search or status chip the provider didn't see). The sheet doesn't put back an undo that failed after it moved to another resource.
    - **CLI.** `shadowed-export` no longer blanks quotes before looking for the alias (an apostrophe in JSX text isn't a string, and `${G}` in a template is a use). `client/one-view-per-resource` also treats object and class method parameters as shadowing.
  - **Fifth round.**
    - **Web.** With server or cursor paging, the export and "all matching" query carries the provider's own search (padded or not), so "Select all matching" stays offered. A browser search over other fields than the provider's counts as the page's own query (its fields are in the selection key). A client-paged page that narrows its rows in the browser leaves the server's `total` out of the query.
    - **CLI.** `shadowed-export` and `client/one-view-per-resource` read files through a small scanner that knows code from strings, templates, comments, regular expressions and JSX text, instead of text patterns. An alias only in a string, an attribute value, JSX text or a comment never excuses a parallel component, and a parameter is found by balanced parentheses (a default that calls something included).
  - **Sixth round.**
    - **Web: one normalized search.** `useResourcePage` gives `searchQuery`, the typed text trimmed (spaces only is none), and `searchFields`, the fields the browser really searches. That one value is what the browser filters by, the provider is sent (server and cursor paging), and a list's export and "all matching" query carries. The query is read from whatever fetched the rows (the infinite query under cursor paging), so cursor lists get the server's search, `total` and "all matching" like server paging. In client paging the provider's own search stays in the query and a browser search narrows on top of it (a `contains` filter when it searches one field); a browser search over several fields on top of a provider search can't be one query, so export says so instead of exporting other rows. A deep-linked record reads in the fetching params' scope and honours `resourceOptions.enabled`.
    - **Web: sheet.** A save queued behind another never writes into a resource the sheet moved to; its cells say why.
    - **Core.** `AppearancePreferencesProvider` starts a new store with no `previous`, and keeps values a subscription delivered while a write was out.
    - **CLI.** The scanner runs on an explicit stack (no depth can overflow it), reads `<T,>` and `<T extends X>` in `.tsx` as type parameters, and divides after a literal, `)` or `]`. `boundAsParameter` counts binding positions only (not a default value, a type or a renamed key), finds `function f<T>(name)` and `catch (name)`, and matches parentheses in one pass.
  - **Seventh round.**
    - **Core: data provider.** A function `source` that pages itself declares `pages` (its order and the column with the whole count, `total_count` by default): a list page whose filters it all took, with no search and no other sort, passes `page_limit` and `page_offset` to the function instead of a `range`, and reads its total, and a segment's count, from that column. Any other list reads every row as before. New type `SourcePages`.
    - **Core: appearance.** A held choice stays shown when a subscription delivers values before the first read answers; a new store's writes never wait behind the last store's write; a queued choice is written onto the latest confirmed values, so another device's newer value isn't undone.
    - **Web.** The record peek drops a held delete when it shows another record or closes, so Confirm can't delete a record that's no longer shown. The sheet refuses a yes-or-no cell whose text is neither (it used to save false), and undoes a save queued behind another to the same cell back to what that one wrote. A bulk delete stops when the page moves to another resource. While a typed search waits out the debounce under server or cursor paging, the export query carries it alone, not on top of the old one. An empty list the screen holds exports with a search typed. "Select all matching" ends when the browser's search changes, even when the query can't carry it (several fields over a provider search), and never runs while the browser narrows the rows.
    - **Phone.** `NativeRecordPeek` with `confirmDelete={false}` hands Delete to the handler and leaves closing to it, so a cancelled confirm keeps the peek open.
    - **Support.** `supportQueueSource()` declares `pages`, so a segment's page reads only that page.
    - **CLI.** The scanner reads a JSX attribute's quoted value over newlines, starts a fresh expression inside JSX's `{…}` and a template's `${…}` (so `<span>` there opens an element), and stays linear on a file of `a > (b)`. `boundAsParameter` doesn't take a call before a ternary's `:` for a method, keeps a parameter whose type has a comma inside `<…>` whole (`other: Map<string, typeof contract>` binds `other` only), and binds a method's parameter that has type parameters (`m<T>(contract)`).

### Patch Changes

- b3001d4: Features: data-provider, resource-view-sheet, support-helpdesk, client-layer
  Follow-ups to the lists release's review.

  - **Core.** `SourceArgsContext.takeIn(field)` takes an `in` (or `eq`) filter's values out of the query, for a function that filters by a list. A `pages` source's count asks the function for `page_limit: 0`, which it answers with one row carrying the count.
  - **Support.** Migration 0018's `support_agent_queue` is now `support_agent_queue(tenant, inbox_view, statuses, page_limit, page_offset)`: `statuses` applies before paging, and `page_limit` 0 returns the count alone, with no message preview built. It drops the overload an earlier draft of 0018 left, `(uuid, text, integer, integer)`. `supportQueueSource()` passes the list's status filter, so the Open segment's page and every segment's count stay paged. A text search or a sort other than newest activity still reads every ticket in the segment, by design (about 130 to 210 ms a page at 5,000 tickets).
  - **Web.** A sheet save queued behind another is checked against the row as that save left it, so a row the first save locked refuses the second.
  - **CLI.** `boundAsParameter` doesn't bind a name only read in a computed destructuring key (`{ [String(contract)]: other }`).

## 1.27.0

### Minor Changes

- 153d7d1: Moves to postgres.js 4 (`postgres` `^4.1.0`, was `^3.4.9`). `genesis introspect` and the doctor's contract checks connect with it. Running the `genesis` command needs no change.

  **For code that imports the CLI:** `introspectPostgres(sql, schemas, options)`, exported from the package root, now takes an `IntrospectSql`: any object with postgres.js's `unsafe(query, parameters)`, so a postgres.js 3.4 or 4 pool fits without a cast. `IntrospectSql` is exported. Introspection now sends its catalog queries through `unsafe` with one text parameter each, so it reads the same under either version.

  From postgres.js 4.1.0 (the floor): `PGSSLMODE` is now honoured. `require` actually uses TLS and fails against a server without it, and `verify-full` verifies, where earlier versions connected in plain text. If you run `genesis introspect` or `genesis doctor` with `PGSSLMODE` set, check that the database accepts TLS.

### Patch Changes

- Updated dependencies [153d7d1]
  - @marktiderman/genesis-studio-server@0.6.0

## 1.26.1

### Patch Changes

- e7c1f1a: The `@hookform/resolvers` peer now accepts v7 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; studio: `^5.1.0 || ^6.0.0 || ^7.0.0`), and `genesis studio init` installs `>=5.1.0 <8`, so an app already on 7 isn't asked to go back to 6. v7 changes two resolvers: the TypeBox resolver moves to `typebox` 1.x (the legacy `@sinclair/typebox` is no longer supported), and the `fluentvalidation-ts` resolver changes how it reports errors on array items. Genesis uses only the zod resolver, which ships byte-identical in 6.0.2 and 7.0.1, so Genesis's forms are unaffected, and the packages' tests now run on 7.0. `genesis init --template native` starts apps on `@hookform/resolvers` ^7.

## 1.26.0

### Minor Changes

- a5a8fdf: Custom views (ADR 0019): a screen an app draws itself over a view, while Genesis keeps the view's data and states.

  - genesis-ui (`/data`): `<CustomView view type="list|board|calendar">{(state) => …}</CustomView>` and `useCustomView` load the view's rows with its scope, preset, filters, URL state, live updates and permissions, and draw loading, empty (the view's `copy.empty` words) and error with a retry, each replaceable (`loading`, `empty`, `error`). The headless view query every view type shares is exported: `useViewListParams`, `useViewList` (paging, sort, search, selection, the open record, `urlState`, `can`), `useViewPermissions`, `useViewBoard` (columns from the board block, the move with its guards, refusal and conflict) and `useViewCalendarRange` (one window's rows, live). ResourceBoard and ResourceCalendar now load through `useViewBoard` and `useViewCalendarRange`, unchanged on screen. `useReducedMotion` (`/hooks`, `/data`).
  - genesis-core (`/resource-view`): `groupRows(view, rows, options)` groups rows by the view's `groupBy` on any platform.
  - genesis-design-system: `THEME_PARTS` gains `custom-view` (`data-view-type`, `data-state`), `custom-view-loading`, `custom-view-empty` and `custom-view-error`.
  - genesis-cli: doctor rules `app-part-name` (an app's own `data-slot` starts `app-` and doesn't clash with a Genesis part), `app-part-colors` (custom views and app parts take colours from roles only) and `custom-view-states` (a custom view doesn't draw its own loading, empty or error), all warn.

  View types and record pages (ADR 0021):

  - genesis-ui (`/data`): a view-type registry (`defineViewType`, `registerViewType`, `resolveViewType`, `listViewTypes`); `<ResourceView type>` is the preferred prop (`mode` stays as its alias) and dispatches through it, with `gallery` now its own type. `open` (`side-peek`, `center-peek`, `page`) and `recordView` on ResourceView; ResourcePage's `detail` takes the same words beside `panel`, `modal` and `route` (`detailMode`, `recordOpen`). The board and the calendar honour the open mode (`open`, `recordView`, `onNavigate`). A peek draws the view's record view when it names one: `RecordPeek`, and `RecordView presentation="peek"` (sections as tabs that switch in place; `section` and `sectionHref` are optional there). RecordView draws the document template.
  - genesis-core (`/resource-view`): `defineView`'s `open` (`RecordOpen`, `RECORD_OPEN_MODES`) and `recordView`; `defineRecordView`'s `template` (`standard`, `document`) and `document` (`cover`, `icon`, `properties`, `body`). A field's form-control hint is `control` (`ControlHint`, `fieldControl`); `widget` and `WidgetHint` stay as deprecated aliases every reader still reads.
  - genesis-ui-native: `NativeResourceView` takes `type` (`list`, `grid`, `gallery`), `mode` its alias; `NativeResourceViewType`.
  - genesis-studio, genesis-studio-server and `genesis introspect` read `control` beside `widget`.
  - genesis-design-system: parts `board`, `board-column`, `board-card`, `calendar`, `calendar-event`, `gallery`, `record-page`, `record-peek` and the document template's `record-page-cover`, `-icon`, `-title`, `-properties` and `-body`.
  - genesis-cli: the ui doctor rule `lists-use-resource-view` accepts a file that defines or registers a view type, and a KanbanBoard fed by `useViewBoard`.

### Patch Changes

- 5f9f52c: Agent guidance: extend a close Genesis piece, invent freely in the app.

  - **genesis-cli.** The guide `genesis agents` writes no longer tells an app to write a gap up for Genesis before inventing. It now says: when a Genesis piece is close and does the same job, extend it (a prop, a variant, a slot, or your own component that wraps it), never a parallel copy; when nothing does the job, invent it in the app, with nothing written up or approved first, and add it to `docs/genesis-upstream.md` when Genesis should have it. The catalog gains a row for the first case. `local-primitives` now says where the app's own components go. Run `genesis agents` after upgrading; `agent-guide-stale` warns until you do.
  - **genesis-ui.** `EXTENDING.md` gains "Your own components" (a wrapper around a Genesis component, and an invention of the app's own), and `SKILL.md` gains "When the ladder doesn't reach".

- Updated dependencies [234414b]
- Updated dependencies [a5a8fdf]
  - @marktiderman/genesis-features@0.9.0
  - @marktiderman/genesis-studio-server@0.5.4

## 1.25.0

### Minor Changes

- 9c33383: Doctor: a sanctioned path for defensible customizations, one finding per element, and a ratchet that counts.

  - **Declared extensions.** A package rule may declare extension points (`extensible`: the Genesis exports an app may build on in ways the rule doesn't recognize), and an app records a file that uses one in `doctor.extend: [{ rule, file, buildsOn, reason, upstream? }]`. Unlike `allow` (debt, which only shrinks), an extension is a reviewed decision, bounded three ways: only package rules with declared points can be extended, at those points (built-in rules such as `deprecated-import` can't); it covers only the findings its file had when declared (under `--base`, a file with more than at the merge base reports them all); and a new one is an `extension-added` info, listed with its reason in the report's summary (`extensionsAdded` in `--json`) for the pull request's review, which is where it is accepted. `allow-grew` and `rules-weakened` don't count it. `reason` needs at least six words and 40 characters, `file` is one file (no globs), `extension-invalid` (error) refuses one outside the rule's points, whose file doesn't import `buildsOn` from a Genesis package or doesn't use it (renders or calls it, or passes the slot prop on its element), whose `buildsOn` is what a package rule replaces, or that the doctor flags in that file, and `stale-extension` (warn) reports one whose file no longer has the finding. (The key is `extend` because `extensions` already lists the file extensions to scan.)
  - **One finding per element.** Findings of different rules on the same file, line and subject (an app's own rule and a package rule on the same element) are reported once, at the higher level, with every rule id in the finding's new `rules` field and in the report.
  - **Count-based ratchet.** Under `--base`, a ratcheted rule's findings keep their level only in a new file or in a file that now has more of them than at the merge base; an edit to a file with old debt no longer makes all of it due. Counts are per rule and file. A renamed or moved file keeps its count (git's rename detection); a copy's findings are new debt. The base counts come from the changed files as they were at the merge base; only the package rules run again when they are all that's counted, and never the build, the database contract or Figma. When git can't read them, a changed file keeps every level, as before. An unreadable base now also fails a config with `extend` (`ratchet-skipped`).
  - **Package rules:** a new `unless.inside` exempts elements, not files: a forbidden element nested inside one of its elements, or inside an app component the file imports that renders its `{children}` inside one. Tags in strings and template literals don't count. A rule with `extensible` or `unless.inside` needs this genesis-cli (an older one skips it with a `package-rules-invalid` warning).
  - **genesis-ui:** `ui/records-use-record-view` no longer flags `ResourceHeader` and `AppShellPageHeader`, Genesis's own parts for the page around one publishable thing; it still flags `DetailPage`, except inside `BuilderLayout` (directly or inside an app component around it), which replaces the file-wide `BuilderLayout` exemption. `ui/lists-use-resource-view` and `ui/records-use-record-view` declare their extension points.

## 1.24.0

### Minor Changes

- a16ddaa: `genesis agents` points agents at each installed package's own `SKILL.md` (it matches the installed version), in both the AGENTS.md block and the generated skill, and writes a `CLAUDE.md` holding `@AGENTS.md` when the app has none, so reviewers and cloud project threads that read only CLAUDE.md see the same guide. `agent-guide-stale` warns when CLAUDE.md is missing. `agentGuideState` gains a `claude` key (`ok`, `missing`, `blocked` or `no-import`), and `genesis agents --check` now fails when CLAUDE.md is missing or blocked; a CLAUDE.md that doesn't import AGENTS.md is an info and passes `--check`. A blocked one (another case of the name, a dangling link or a folder) is never written over, so the warning says to fix it by hand. Only stable `node_modules/<package>/SKILL.md` paths (or a local package's folder) are listed, so a dependency bump elsewhere never makes the guide stale.
- 1f1c13a: `genesis agents --hooks` writes a `SubagentStart` hook into `.claude/settings.json` that gives Claude Code's Explore and Plan subagents (which start without CLAUDE.md or AGENTS.md) the Genesis rules and the installed package guides, plus `permissions.deny` rules for `.env` files. The hook passes `--dir "$CLAUDE_PROJECT_DIR"`, so a session started in a subfolder still gets the guides. The app's own settings are kept. `genesis agents --hook subagent-start` prints the hook's output and never fails.
- 87ea7f2: `genesis.config.json` takes an `environments` block (`previews`: on-demand, every-pr or off; `label`; `branchPrefix`) that the Vercel ignore-build template reads as the app's own preview defaults. A variable set in the Vercel project still wins, and the file wins over Genesis's defaults. The doctor fails an unknown key or value in the block.
- 1f0b95f: Doctor: new supabase-pack rule `exposed-schema-created-later` (warn). It flags a schema in `supabase/config.toml` `[api] schemas` (or `doctor.supabase.exposedSchemas`) that a new Supabase database doesn't have before migrations run, naming the migration that creates it or saying none does. A Supabase branch applies `[api]` before it runs migrations, so a fresh preview branch's Data API fails its health check on such a schema. The fix is Genesis's preview standard (docs/APP-CI.md, "Previews"): turn automatic branching off, keep supabase-ci as the per-pull-request database check, and create preview branches on demand; then record it with the new supabase-pack setting `automaticBranching: false`, which quiets the migration-created case (a schema no migration creates still warns). `public`, `graphql_public` and the platform's own schemas never warn, and nothing is reported when `[api] enabled = false`.

  **Strict apps:** the rule is a warning, so an app that runs the doctor with `--strict` (app-ci's `doctor-strict: true`) and exposes a schema a migration creates goes red on this release until it sets `doctor.supabase.automaticBranching` to `false` with branching off (or stops exposing the schema). Don't use an `allow` entry: a doctor run with `--base` fails a new one as `allow-grew`.

  Also in this release, outside the CLI: `templates/vercel/ignore-build.sh` (with a `vercel.json` snippet), a Vercel Ignored Build Step that always builds production and builds a preview only for a `preview/` branch, a `[preview]` commit or a `preview`-labelled pull request, and always builds production, custom environments and any deploy without system variables (`GENESIS_PREVIEWS`, `GENESIS_PREVIEW_LABEL`, `GENESIS_PREVIEW_BRANCH_PREFIX` override the defaults).

### Patch Changes

- a7177dc: `genesis agents` follow-ups:
  - **CLAUDE.md states.** A blocked CLAUDE.md is reported the same way on macOS and Linux, and a CLAUDE.md that links to AGENTS.md is ok.
  - **Hoisted guides.** Package guides hoisted to a workspace root are found, up to the repo root, when that copy is the version the app resolved. A guide that's only inside pnpm's store is named in an `agent-guide-stale` info.
  - **Older hooks.** `--check` and the doctor flag an older `SubagentStart` hook command; `genesis agents --hooks` updates it. A plain `genesis agents` still never writes settings.
- bd43be1: Doctor docs: `doctor.supabase.automaticBranching` is the app's word, not something the doctor checks, so review a change to it like an `allow` entry. It doesn't cover on-demand Supabase branches.

## 1.23.0

### Minor Changes

- c8af649: The EAS template `deploy-production.yml` now ships on every merge to `main` instead of on a pushed `v*.*.*` tag, with no approval job: `main`'s protected merge is the approval. Per platform, a JavaScript-only merge publishes an over-the-air update to every `production` install (no staged share: EAS allows one rollout at a time, so a staged one would make the next merge's update fail); a native change builds and submits in the same run, so an update never goes to a build nobody has. Take an update back with `eas update:republish --group <id>`; `rollout.yml` stays for an update staged by hand. An app that kept the tag trigger keeps it until it takes the new template.

### Patch Changes

- 9f73b01: The EAS template `deploy-production.yml` publishes its updates without `rollout_percentage`. Unset, an update goes to every install; set to 100, EAS published it as a rollout and the update job failed with "GraphQL request failed".

## 1.22.1

### Patch Changes

- 05e1fd8: `genesis figma:routes` reads a `Proposal · <status> · <slug>` section on a route page as a proposal, so its frames are no longer reported as frames without a route.

## 1.22.0

### Minor Changes

- 5d0717d: `genesis figma:routes`: a read-only check that an app's Figma app file covers its routes. With a `figma` block in genesis.config.json (`file`, `pages.web` / `pages.native`, `proposalsPage`) and `FIGMA_ACCESS_TOKEN`, it reads the app's Expo Router and TanStack routes, the navigation targets its code names as string literals, and the file's frames and prototype links through the REST API, and reports routes with no frame, frames with no route, the Proposals page by section, navigation with no hotspot, hotspots to a frame with no route, and `// figma: <node-id>` route comments that don't match (`--json` for CI). The doctor runs it as the `figma-routes` rule: `info`, `warn` under `--strict`, never `error`.
- 6568686: `genesis upgrade` and `genesis doctor`: fewer stops on the way through a release.

  - **A new export the app builds by hand.** The upgrade compares the component package before and after the install and names each swap, ahead of the doctor's `shadowed-export`, whose message now names the package.
  - **An app in a sub-folder of its repository.** A new `genesis.config.json` setting, `"appFolder": "mobile"`: the upgrade writes the EAS workflows' `paths` from the repository root, so an edit on every line no longer conflicts with each template change, and leaves `.github/workflows` to the repository. Without it, a conflict in a workflow says to set it.
  - **The next release after a resolved conflict.** Once a `.genesis-next` is worked into the file and deleted, with no run in between, the next release merges against that version instead of writing another `.genesis-next`. A `.genesis-next` gone from a file that hasn't changed since it was written is no longer taken as resolved, for the same version or a newer one. Any change to the file counts, even an unrelated one, so the summary says what it merged on and what to compare with. A lock written before this release can't tell: with the same version still shipped it's taken as resolved, as before, and with a newer one the new version goes to `.genesis-next`.
  - **`--pr` and gitignored files.** A changed file the repository ignores stays out of the commit and is named in the summary, instead of `git add` stopping the run on a new branch.
  - **The app-folder substitution** takes a relative path (`mobile/src`, `apps/web`, as the docs say to use), not only one folder name.
  - **Generated files.** The upgrade regenerates the agent guide (when the app has it) and runs `features build` (when it has a registry), and the pull request carries them. `--no-agents` and `--no-features-build` turn them off.
  - **Dependencies not installed.** The upgrade stops before changing anything and gives the install command; the doctor tells a missing install from a package the app doesn't use; the summary says why the doctor couldn't run.
  - **`Available but unused`** is a count unless you pass `genesis doctor --verbose` (`--json` still lists it).
  - **Major moves with no codemod** link each package's changelog and list its major changes, or say it has none of its own and moved with its dependencies. A codemod declared at a minor no longer hides a major move across it.
  - **A codemod that edits package.json** says plainly that nothing was installed, with the command, and the doctor's `genesis-eslint-config` warns when `eslint-plugin-testing-library` is listed but not installed.
  - **The `persistQueries` deprecation** links the migration guide by full URL (the published packages don't carry it), and says `persistOffline` needs expo-sqlite, a native module, so the switch can take a new native build rather than an OTA update.
  - **Two new codemods** for the doctor rules with a mechanical fix: `genesis-ui-overlays-fit-the-phone` and `genesis-ui-native-haptics`. docs/MIGRATION.md covers these and the two findings with no mechanical fix (`shadowed-export`, the `persistQueries` deprecation).

### Patch Changes

- 6ab77d0: Migration 0005 tightens attachment paths: only an attachment in storage has one. Genesis's clients are unaffected. Run `genesis migrate` to pick it up; it needs nothing from your app. It keeps any paths it clears in `genesis_chat.attachment_paths_cleared`, for the service role: they contain user ids, and account deletion doesn't touch that table, so look at it once and drop it (the migration's header says how).
- cff9c4c: `NativeComposerBar`'s `empty` is now `hasContent`, with the opposite sense: pass `hasContent` when attachments are waiting and no text is needed (it was `empty={false}`). No alias: `empty` shipped one release ago and nothing uses it. `genesis upgrade` rewrites it (the `genesis-ui-native-3-8-composer-has-content` codemod); by hand, `empty={false}` becomes `hasContent` and `empty` becomes `hasContent={false}`. The bar's other props from that release now have tests.

  genesis-chat's native `ChatComposer` now sits on `NativeComposerBar`, with the same props and test ids, so it takes the bar's sizes (a 44pt input) and press feedback. Its schedule action on Send is named `schedule` instead of `longpress`, with a new `scheduleHoldHint` in the copy. An app that gave haptics to both Genesis and chat gets one tap on send. Chat now needs genesis-ui-native 3.8.0.

- c090491: `genesis figma:routes` (and the `figma-routes` doctor rule): a page named in the `figma` config that the file doesn't have now counts as missing, so `--strict` fails even with no routes; each Figma API request gives up after 30 seconds with a clear error instead of hanging `doctor`; an Expo catch-all `[...rest]` matches one or more segments; template-literal and `{ pathname }` navigation in a route file is listed as not checked (`info`) instead of passing silently; and invalid JSON in genesis.config.json is a clear error naming the file. The README says which findings `--strict` ignores by design.
- Updated dependencies [5813132]
  - @marktiderman/genesis-features@0.8.2

## 1.21.0

### Minor Changes

- 01213f6: A block's migration can name, in `needs`, a hook the app must define before it runs (`{ "function": "private.genesis_viewer_people", "how": "…" }`). `genesis add`, `migrate` and `upgrade` warn when they would copy such a migration into an app whose migrations don't define that function. Before, `supabase db push` was the first place this failed. genesis-chat's 0004 declares its tenancy hook this way.
- 57b6286: A block's migration can declare `runsBefore` (another block's migration that reads what it creates). When both are new in the same `genesis add`, `migrate` or `upgrade` run, it's copied first, with its package's earlier migrations, so it gets the earlier timestamp. A migration's `needs` is no longer satisfied by a function definition inside a SQL comment.

## 1.20.0

### Minor Changes

- e570916: Genesis's lint rules now ship from the CLI, as `@marktiderman/genesis-cli/eslint` (for `require` and `import`), so `genesis upgrade` brings new and changed rules to apps. Until now an app's `eslint.config.js` was copied once at `genesis init` and never updated.

  - `genesis("native" | "web")` returns every Genesis piece for the platform; `testing()` is React Native Testing Library 14's await rules for test files (testing-library's `await-async-events` for fireEvent and userEvent, and `no-restricted-syntax` for unawaited render calls, `act`, `rerender`, `unmount` and a chained `userEvent.setup()`). `"web"` has no rules yet. `eslint-plugin-testing-library` is a new optional peer dependency, loaded only when `testing` is built.
  - The native starter's `eslint.config.js` spreads `genesis("native")` instead of inlining the rules.
  - The `genesis-cli-eslint-config` codemod runs when an app's CLI moves to 1.20.0: it adds the import and the spread to the app's flat config, and `eslint-plugin-testing-library` to a native app's devDependencies when it's missing. A config it can't edit safely is left as it is, with the lines to add printed. This changes the app's lint in the upgrade's pull request; unawaited RNTL calls in its tests become lint errors there.
  - The doctor's new `genesis-eslint-config` rule (warn, ratcheted under `--base`) reports a native app whose config doesn't load the export, or loads it without the plugin installed.

- e3e7e9c: `genesis upgrade` and `genesis doctor` handle what a Bun lockfile keeps after an upgrade.

  - **Stale nested copies.** Bun keeps a Genesis package nested under another one (`<parent>/@marktiderman/genesis-…` in `bun.lock`) across installs, even once the root's version satisfies the parent's range, so the app runs two copies. `genesis upgrade` drops those entries from `bun.lock` before the install (judged against the versions the release moves the root to), drops any the install leaves and installs once more, and lists what went in the summary; when it didn't install, the summary says to run `bun install`. A copy nested on purpose (the parent's range excludes the root's version) stays. Bun has no dedupe, so this is its counterpart of the `pnpm dedupe` the upgrade already runs.
  - **Deleted overlays.** When the upgrade deletes an overlay (a vendored package now installed from npm), its workspace also leaves `bun.lock` and a root `package.json` `workspaces` entry naming its folder, so `bun install` no longer stops with "Workspace dependency not found". A removed overlay's pins are now applied to each `package.json` as it is after the bump, so they no longer undo the bump or another overlay's pin in the same file.
  - **`genesis doctor`**: `lock-files` warns on a stale nested Genesis copy in `bun.lock` (at or above the app, with or without `genesis.lock.json`) and names the exact fix: delete that entry, then reinstall.

  The binary `bun.lockb` and `pnpm-lock.yaml` aren't edited; with pnpm, `pnpm dedupe` and `duplicate-genesis-package` still cover duplicate copies.

### Patch Changes

- 3678bbb: README: `genesis upgrade --version <v>` is upgrade's own option (fixed in 1.18.0; 1.17.3 printed the CLI's version), and how to upgrade with the release's own CLI. An upgrade runs in the CLI that started it and moves the app's genesis-cli dependency, but doesn't restart in the new one, so its codemods and doctor are the installed CLI's: run `npx @marktiderman/genesis-cli@latest upgrade --version <v>` to use the new one.

## 1.19.0

### Minor Changes

- 1d1c2b4: A phone app beside a web app shares its database. `genesis init --template native --beside <web-app>` writes no `supabase/` files (or the database CI workflow) when the web app has a `supabase/` folder, sets `"supabase": { "app": "../app" }` in genesis.config.json, drops the doctor's supabase pack, records the blocks that are on, and prints the line to run in the web app for the blocks whose database files it lacks (requirements first, notifications before push): `genesis add <block> --database-only`. The check compares each block's migrations with the web app's copies and lock `migrations` entries, so a newer migration of a block it already has counts, and an Edge Function with no folder there counts too. With that setting, or `"supabase": false`, `genesis add`, `migrate` and `upgrade` never write or plan Supabase files (migrations, pgTAP tests, Edge Functions, config.toml sections) in the app and say where to run them; `upgrade` still lists new package migrations, to apply in the web app, and leaves lock entries under `supabase/` alone. When the web app's lock can't be read, `migrate` lists every block and warns, as init and add do. `supabase.app` is resolved through symlinks and can't be the app itself. The doctor skips the supabase pack there, `lock-files` reports such entries as info, and a new `database-elsewhere` rule warns when the named app has no `supabase/` or a second copy is left in the app.

  `genesis add --database-only`: only a block's migrations, pgTAP tests, Edge Functions and config.toml sections, and the packages they're read from. No other installs, routes, skills, AGENTS.md fragment, feature entry or block steps, and the block isn't recorded in the lock's `blocks` (its copies are tracked by header and lock entry).

  A block migration can declare the package migrations whose objects it provides or adopts (`provides` on its `genesis.blocks` entry), and the Edge Functions of the provided migration's package that it supersedes (`functions`). Once the providing migration is in the app (its copy by header, or by name for a copy made before headers; or the file the lock says it went to, while that file exists), or is copied in the same run, the other is `provided`, never `new`, and its superseded functions are neither copied nor deployed. genesis-notifications' 0001 declares it provides genesis-supabase's 0005 (it adopts the push tables) and supersedes `functions/genesis-push-send` (0001 doesn't create the sender's RPCs), so `migrate` and `add push` no longer copy 0005 into an app that has notifications, where it failed with "relation already exists", and `add push` there no longer plans genesis-push-send, its deploy or its secrets: the steps point at the notifications runner.

  `genesis upgrade` no longer adds an Edge Function the lock never had (one init or add didn't write, or a superseded one): it lists it, for `genesis add`, which writes its config.toml section. New files in a function the app has are still added.

  Reading starter.config.ts's `features` finds the block's own closing brace (past nested objects, strings and comments), and a genesis.config.json `"starter": {}` carries no blocks instead of failing. init's `doctor.supabase.since` uses the migration timestamp helper.

  `genesis upgrade` accepts the `REPLACE_WITH_APP_FOLDER` substitution `init --template native` records, so it no longer refuses every app init made.

  Behaviour changes to note: `genesis add`, `migrate` and `upgrade` now read and validate genesis.config.json, so an invalid `supabase` setting (not `false` or `{ "app": "<relative folder>" }`), or an invalid `links` or `privacy` block, stops them with an error naming the file, as the doctor does. Top-level keys they don't know are still ignored. In an app made from an older starter, a block whose starter.config.ts switch is off no longer gets its migrations and functions from `migrate` and `upgrade`.

### Patch Changes

- d2b8125: Blocks pass the app's own checks as soon as `genesis add` copies them in.

  - genesis-supabase: the `genesis-apple-revoke` function writes the PEM armour as `-{5}BEGIN PRIVATE KEY-{5}`, so gitleaks' private-key rule no longer flags it in every app that installs the account block. It reads keys exactly as before. The pgTAP tests the `events` and `support-feedback` blocks copy are tagged with those blocks' ids (`@feat:events`, `@feat:support-feedback`), the features the app registers.
  - genesis-sites: the pgTAP tests `genesis add sites` copies are tagged `@feat:sites`, the feature the block registers, not `sites-store` and `sites-blog`, which an app doesn't have. `pnpm features check` passes after the add.
  - genesis-cli: a test reads every block in the workspace as `genesis add` ships it and fails on a `@feat:` tag the app wouldn't register (the block's own id, or a block it requires), or on a file gitleaks' private-key rule matches.

- The `eas-placeholder` step for the Google Play service account key says to upload the key to EAS (`eas credentials`) and remove only `serviceAccountKeyPath`, since the production workflow submits on EAS where a local file isn't there; until the app ships to Google Play, remove the `submit_android` job and keep `submit.production.android`. The doctor's `lock-files` rule warns on a locked file that can't be read. The starter's `linkHosts` takes a genesis.config.json with no `links` block without a type error.
- caf90dd: `NativeResourceView` draws a view as cards with `mode="grid"` (`numColumns`, default 2) and an app's own row or card with `renderCard(row, index, card)`, the names the web's ResourceView uses. `card.pressableProps` gives a custom card the built-in press, long press, label and accessibility actions; `card.item`, `card.actions`, `card.open` and `card.showActions` are there to wire it by hand. Sections, cursor paging, pull to refresh, the empty and error states, the peek and swipe actions all stay. Grid lines are cut from each section's real start, so when `maxPages` drops pages from the front or loads them back, every card stays on its line and nothing remounts; `useNativeResourceView` returns `rowOffset`, the rows dropped above the loaded window. Both are opt in: the default list is unchanged.

  `ScreenContainer` takes `onRefresh` and `refreshing` for pull to refresh on a screen that isn't a list, on the theme-tinted `NativeRefreshControl`, as InboxPage and NotificationsPage have it. `onRefresh` makes the body scroll, since pulling needs a scroll view, so never pass it around a list; without it nothing changes.

  The native starter template's Jest suite runs gestures and animations as written: Gesture Handler's mocks (`jestSetup.js`) and Reanimated's test mode (`setUpTests()` and its resolver), with a test that drives a Pan gesture's shared value through `fireGestureHandler`. The template declares `react-native-gesture-handler` ~3.3.0 (Expo SDK 58's version) as a direct dependency.

- 4602893: The `genesis-upgrade` caller template the CLI ships shows the reusable workflow's new `base-branch`
  input (the branch the upgrade starts from and its pull request targets; default: the repository's
  default branch). The workflow also names its doctor artifact per `working-directory`, so a caller
  can run it for two folders in one run.

## 1.18.0

### Minor Changes

- ac62e6f: `genesis init --template native --without <switches>` turns starter.config.ts feature switches off, and leaves the blocks they carry out whole (migrations, pgTAP tests, Edge Functions, the starter's supabase files tagged only with them, their config.toml sections and API schemas). The lock records only the blocks that are on, and every file it names is written. The starter says which switch carries which block in its genesis.config.json (`starter.blocks`).

  `genesis upgrade` and `genesis migrate` leave out a locked block whose starter.config.ts switch is off: no migrations planned, its files neither refreshed nor added (`migrate --block <id>` still checks one asked for).

  New doctor rule `lock-files`: a file genesis.lock.json owns that is missing on disk is a warning (upgrade never brings it back); mark a deletion on purpose with `"deleted": true` in its lock entry. A locked file edited in the app, or a locked block switched off, is info.

  A new app's genesis.config.json sets `doctor.supabase.since` just after its newest copied migration, so a fresh app (before it has a git history) passes the doctor with warnings only for the store ids in eas.json. init's summary lists each of those with what replaces it.

- 40c8d60: Every app upgrade cleans out its overlays and rebases them. `genesis upgrade` diffs each overlay against its upstream tag and the new version, prints a checklist that sorts each hunk as already shipped (dropped), promoted (link its Genesis PR in docs/genesis-upstream.md) or kept (say why), rebases what's left onto the new version by a three-way merge, and moves the marker's `upstream`. It deletes an overlay with nothing left and pins the release, and when a rebase conflicts it stops and lists the files without changing anything. The new doctor rule `overlay-behind` warns, failing `--strict`, when an overlay's `upstream` is older than the version the app pins.

### Patch Changes

- ac62e6f: The doctor's `eas-placeholder` warnings name the eas.json key and say exactly what replaces each store id (the App Store Connect Apple ID, the Apple Team ID, the Google Play service account key's path). The starter's `links.ts` no longer crashes when genesis.config.json has no `links` block: an app with no domain has no app links.
- 5bc8b40: `genesis upgrade` (and the genesis-upgrade workflow) now keeps pnpm's `minimumReleaseAgeExclude` as exact versions, not a pattern. 1.17.3 collapsed every Genesis pin to `'@marktiderman/genesis-*'` (and the bare `'@marktiderman/genesis'`), which exempts every future Genesis release from the release-age wait, so a compromised publish would reach apps at once. The tidy now merges each Genesis package's pins into one entry listing its exact versions (`'@marktiderman/genesis-features@0.8.0 || 0.8.1'`, which pnpm 11.1.3's frozen install honours, unlike two entries for one package), drops versions the lockfile no longer holds, and replaces the two patterns 1.17.3 wrote with the lockfile's exact versions. Any other pattern the app wrote is left alone. Exact versions need pnpm 10.19 or later; the upgrade warns on an older pnpm. Also:

  - A range the app wrote for a Genesis package takes the pins into its entry with `||`, with a warning (pnpm 11 rejects ranges there).
  - With `minimumReleaseAge` set, pnpm's strict mode fails the install with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`; the upgrade now says why and what to do (add the versions as exact excludes, or wait), and never loosens the setting.
  - The pnpm-workspace.yaml search stops at the repository's top level, so a file outside the repository is never rewritten or committed by `--pr`.
  - `genesis upgrade --version <v>` reaches the upgrade instead of printing the CLI's version.
  - The workflow's pull request job checks out with `persist-credentials: false`; only its last step has the write token, for the push and `gh`.

- Updated dependencies [6af1095]
  - @marktiderman/genesis-studio-server@0.5.3

## 1.17.3

### Patch Changes

- bc1bd20: `genesis upgrade` no longer leaves a pnpm app whose CI fails on its next `pnpm install --frozen-lockfile`. When the upgrade installs Genesis releases younger than the app's `minimumReleaseAge`, pnpm's loose mode pins each one in pnpm-workspace.yaml (`'@marktiderman/genesis-ui@2.26.0'`), and pnpm 11.1.3's frozen install honours only the first pinned version of a package, so a second pin failed with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. The upgrade now replaces every Genesis entry in `minimumReleaseAgeExclude` with one `'@marktiderman/genesis-*'` pattern (the umbrella by its bare name), leaving every other entry and the file's comments as they were, and `--pr` commits pnpm-workspace.yaml with the lockfile. It then runs `pnpm dedupe` (`npm dedupe` with npm), so a Genesis package is no longer left installed at two versions (`duplicate-genesis-package`). The reusable genesis-upgrade workflow runs the same code after its installs (both jobs) and commits pnpm-workspace.yaml with the package.json files and the lockfile; move your workflow ref to this release to get it.

## 1.17.2

### Patch Changes

- 1fc7372: `genesis doctor`: `deprecated-import` and `beta-import` read tags on named re-exports
  (`/** @deprecated … */ export { Old } from "./old"`), and no longer read import examples inside
  strings as imports. `migration-grants` warns on a grant built as a string for `execute` (to anon,
  public or a computed role), since what it grants can't be checked.
- 6f48aad: The EAS workflow templates build less by default. `pr-preview.yml` runs only for pull requests into `main` that change the app's folder (`REPLACE_WITH_APP_FOLDER`, to replace) or the config a build reads (`app.json`, `app.config.*`, `eas.json`, `package.json`, `pnpm-lock.yaml`), or when a pull request is labeled `Preview`; its iOS jobs run only once the preview EAS environment sets `PREVIEW_IOS=true`, since an ad hoc iOS build installs only on registered devices. `e2e.yml` runs only by hand (`workflow_dispatch`), since Maestro needs a paid EAS plan; its header shows the pull request trigger to add. `docs/NATIVE-RELEASE.md` has a new "Build cost" section. Apps refresh their copies with `genesis upgrade`.

  `genesis init --template native` fills the app folder in (`src`), recorded as a substitution so `genesis upgrade` does the same. A new `genesis doctor` rule in the native pack, `eas-placeholder` (warn), flags any `REPLACE_WITH_…` left in `eas.json` or `.eas/workflows/*.yml`. `pr-preview.yml` also lists the yarn, npm and bun lockfiles, gates `get_ios_build` on `PREVIEW_IOS` too, and keeps one run per branch (`concurrency` with `cancel_in_progress`), so a labeled pull request that also matches the paths doesn't build twice.

- Updated dependencies [eeedad0]
  - @marktiderman/genesis-features@0.8.1

## 1.17.1

### Patch Changes

- b51031f: `genesis upstream check` and `export` also read a register at the app's root (`genesis-upstream.md`) when `docs/genesis-upstream.md` isn't there, and a `local` cell may list several paths, separated by `, ` (a comma and a space) or `<br>`. A comma with no space after it stays part of the path, so an existing `src/a,b.ts` reads as before. Each path is checked; a promoted entry names every copy still to delete.

## 1.17.0

### Minor Changes

- 6eb984b: App overlays: a consumer app's marked local copy of a Genesis package. A local package with a `@marktiderman/genesis-*` name now needs a `genesis.overlay` marker (`upstream`, `since`, `owner`, `reason`), and the doctor adds `overlay-unmarked` and `overlay-invalid` (errors), `overlay-age` (info after 14 days, which never fails a run; a warning after 30, which fails `--strict`) and `overlay-version` (a warning when the version isn't the upstream version, `<upstream>+local.N` (recommended) or `<upstream>-local.N`). A marked overlay is treated as the package it shadows: `shadowed-export`, `raw-tag`, `local-genesis-copy` and `native-raw-primitive` skip that package's names inside it, and `version-skew` and the packages pack's change gate skip it. Two fixes found with overlays: `package-migration-test` looks a block migration's test up in the package its `package` field names, and a component package whose exports point at TypeScript source with no `types` condition is read from that source. The README gains an Overlays section (wiring, Vite and Vitest settings, manual promotion).

  Features: app-overlays, local-packages, cli-doctor

- 4516ead: Doctor and introspect gaps from a consumer app:

  - `page-layout` counts `RecordView` as a page layout, as it counted `ResourceWorkspace`, so record routes need no `allow` entries.
  - `genesis introspect` links a column of a composite foreign key whose other columns reference their namesakes and whose own column references a column unique on its own (the tenant-safe `(gallery_id, org_id) references galleries (id, org_id)` makes `gallery_id` a link), from Postgres. PostgREST notes single-column keys only, so `--openapi` is unchanged.
  - `genesis introspect` reads a key from a table or view comment, `@genesis {"key": "id"}` (or a list, no repeats), for a read-only view that joins tables; one that differs from a primary key is used with a warning.
  - `genesis migrate` mirrors a named notifications registry (`--notifications <file>` or `notifications.registry` in genesis.config.json; never on `--dry-run`) into a `<timestamp>_genesis_notification_types.sql` migration that adds and updates its types when they change, never retiring one.

- 9551c52: First-run fixes from a fresh `genesis init --template native`:

  - `genesis.lock.json` remembers where each package migration was copied (`migrations`), written by `genesis add`, `genesis migrate` and `init --template native`; a run on an older lock records the copies it finds. A copy the app deleted is reported as `deleted` by `genesis migrate` and `genesis add`, the way an edited copy is, and is never copied again (before, it looked new and `genesis upgrade` listed it to copy back). It doesn't make `genesis migrate` exit 1.
  - An Edge Function's `npm:@marktiderman/genesis-*@<range>` imports are pinned to the versions the app has installed when `genesis add` copies the function, and `genesis upgrade` refreshes them the same way. The notifications function's own imports now name `^0.3.0`, not `^0.1.0`.
  - The native starter's Metro test (which reads the monorepo's `metro.config.js`) runs only inside the Genesis monorepo, so `vitest` passes right after `init --template native`.

- b028861: A feature's `kind` replaces its `layer` field. `kind` takes the same values (token, element, pattern, layout, hook, provider, block, service, tool); `layer` is still read as a kind until the next major (`"primitive"` as `"element"`), `features check` warns on it, and a feature that sets both to different kinds fails. A feature's layer is now its owning package's (foundation, primitive, module, tooling), derived from its `entry` imports or its `links.code` paths: `featurePackageLayer(def, packages)`, and `findFeatures(…, { packageLayer, packages })`. New exports: `FEATURE_KINDS`, `FeatureKind`, `featureKind`, `featurePackageLayer`, `FeaturePackage`; `FEATURE_LAYERS` and `FeatureLayer` are deprecated aliases.

  `genesis features find` gains `--kind`; `--layer` now filters by the owning package's layer (foundation, module or tooling), and a kind passed to `--layer` still works with a warning until the next major (so `--layer primitive` still means the element kind until then); a kind passed to both that disagrees is refused. Records (`toRecords`, `features.json`) carry the resolved `kind` and no longer the deprecated `layer`. `genesis add` writes `kind:` into features.ts when the app's genesis-features reads it (0.8 and later; `layer:` before), and a block manifest's `feature.kind` (or its deprecated `feature.layer`) sets it.

- 4dbc637: `genesis catalog` prints the need→use catalog (what to use for each need, its import and docs) from the installed packages' declarations; `genesis primitives` still works, with a deprecation note, and its JSON keeps the `primitives` key until the next major (`genesis catalog --json` uses `catalog`). A package's `genesis.doctor` declaration may now call its list `catalog`; `primitives` is read as its old name until the next major, and a declaration with both is refused. Genesis's own packages keep `primitives` for now, so apps on an older genesis-cli still read them.

  The agent guide `genesis agents` writes now says `genesis catalog`, so an app's `genesis agents --check` reports it stale once after upgrading: run `genesis agents` and commit the result.

- e288706: `genesis upstream check` validates an app's register of what it needed from Genesis (`docs/genesis-upstream.md`: id, kind gap/extension/invention, status, feature, package, local, need) and warns when a promoted entry's local copy is still there. `genesis upstream export <id>` prints the link to Genesis's new gap issue form, filled in from the entry without its local path; it sends nothing.
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

- 156f5dc: `genesis agents --rules` checks a repo against the agent rules of engagement a script can check from the repository alone (docs/agents/RULES.md): **first-version** (a public package never released is at 0.1.0 and its changesets are patches) and **batch-ci** (a workflow on pull requests into main also runs on pull requests into the staging batches; `--batch` sets the pattern, default `staging/**`). Exits 1 on a break. The private `packages/agents`, which held only RULES.md, is retired: the rules now live in `docs/agents/RULES.md`.
- 0d3559e: Two doctor rules read export maturity from the JSDoc tags in the installed Genesis packages' published declarations: `deprecated-import` (warn) for a named import of an export tagged `@deprecated` or `@stability Deprecated`, with the tag's advice, and `beta-import` (info) for one tagged `@stability Beta` or `Experimental`. Only top-level declarations count; a deprecated prop stays the type checker's to show.

### Patch Changes

- 5951c42: `deprecated-import` ratchets by default: under `--base`, a deprecated import in a file that didn't change is reported as `info`, so upgrading Genesis never fails an app's strict CI on files nobody touched. Changed files still get the warning.
- b61bdd9: `genesis introspect` now follows the app's `doctor.contracts` settings (`out`, `schemas`, `databaseEnv`) when no flag is given, so it rewrites the contract the doctor checks instead of writing `resources.genesis.ts` into the current folder. Flags still win; a `--config` option names another config file.
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
  - @marktiderman/genesis-studio-server@0.5.2

## 1.16.2

### Patch Changes

- 845d802: The native starter template moves to `@sentry/react-native` ~8.32.0.

## 1.16.1

### Patch Changes

- 5f60fb4: `genesis init --template native` starts apps on newer dependencies: `@hookform/resolvers` ^6, `@sentry/react-native` ~8.31, `@tanstack/react-query` and its persisters 5.104.5, `@shopify/flash-list` 2.3.3 and `@react-native-community/datetimepicker` 9.2.2. `genesis studio init` now accepts `@hookform/resolvers` 5 or 6 (`>=5.1.0 <7`), so it no longer asks an app already on 6 to go back to 5.

## 1.16.0

### Minor Changes

- 09ac7e7: The `genesis` command now runs on commander 15, which needs Node.js 22.12 or newer (the package declares `engines.node: >=22.12.0`; Node 20 reached end of life in April 2026). Every command, option and default is unchanged. One behaviour from commander 13: a command given more positional arguments than it takes now stops with "too many arguments" instead of ignoring them.

## 1.15.1

### Patch Changes

- 5a0c1d2: A record's page is now a **record view**, so "workspace" can mean where the viewer is working (ADR 0004). `defineWorkspace` is `defineRecordView`, `ResourceWorkspace` is `RecordView`, `NativeResourceWorkspace` is `NativeRecordView` (with `NativeRecordViewMenu` and `getNativeRecordViewStackOptions`), and the `Workspace…` types are `RecordView…`. The components take `view` in place of `workspace`, as `ResourceView` does. The old names still work for one minor release, marked deprecated. The doctor rule `ui/record-pages-use-resource-workspace` is now `ui/records-use-record-view`: rename it in an app's config if the app sets its level. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are unchanged.

## 1.15.0

### Minor Changes

- 9a254df: Package rules, the primitives catalog and the ratchet.

  - **Package rules.** The doctor finds every installed `@marktiderman/genesis-*` package (and every local package) and runs the rules it declares in its package.json under `genesis.doctor`: declarative `prefer` rules ("use X instead of Y": forbidden JSX elements, imports or a pattern, with `unless` exemptions, `platform`, `{routes}` globs) and an optional `plugin` module. Ids are namespaced by package (`ui/lists-use-resource-view`) and work with `rules`, `allow`, `stale-exception` and the new `packageRules`: for a `prefer` rule it takes `level`, `files`, `exclude` and a required reason; for a package plugin's rules, `level` and the reason only (a plugin decides its own files). A forbidden element is also flagged where an app wrapper around it is rendered. Declarations are read forward-compatibly: an unknown key, or a rule this CLI can't read, is skipped with a warning, so a newer package never breaks an older app's build; a rule with an unknown key of its own or in `unless` (one that could narrow it) is skipped whole rather than run wider, while an unknown key in `forbid` is only dropped. A wrapper counts only where its own component renders the element (exported where it is declared, in an `export { … }` list, or by `export default Name;`), and its use only where it is imported from that file. New rules: `package-rules-invalid` (warn), `package-rule-override` (a package rule changed in `rules` without a reason); `stale-exception` also warns about a `packageRules` id no installed package declares.
  - **`package-doctor-declaration`** (packages pack): a published Genesis package must declare its rules, or `{ "enforce": false, "reason": "…" }`.
  - **Ratchet.** `newOnly` on package rules and app patterns, or `doctor.ratchet` (`true` or rule ids): with `--base`, findings in files unchanged since the merge base drop to `info`. `allow-grew` fails an `allow` entry the base ref's config didn't have, so the list only shrinks, and `rules-weakened` fails, comparing with the base's settings only, a rule they set that the branch lowers, a rule newly set to `off`, or a new `exclude` glob in `packageRules` (a new entry at another level, such as pinning a rule a package raised, is fine). Both compare with the doctor settings wherever they lived at the base, and neither runs when the base had none. `ratchet-skipped` says when git can't compare: a warning when only the ratchet was skipped, an error when the config's `allow`, `rules` or `packageRules` went uncompared (check out with `fetch-depth: 0`). These three guard the config, so `rules` and `allow` can't name them, and the ratchet never lowers them or the other rules about the config, packages and generated files (`stale-exception`, `agent-guide-stale`, `package-doctor-declaration`, `contracts-stale` and the like). Without `--base` nothing changes.
  - **`contracts-stale`** (supabase pack, with `doctor.contracts`): the generated contract matches what `genesis introspect` would write now; compared for the schemas `doctor.contracts.schemas` names, else those in the contract's own `// Source: Postgres (…)` line; skipped (info) without the database variable or for a contract generated from OpenAPI, and never run by the Vite plugin (build or dev). Line endings don't count, here and in `genesis introspect --check`.
  - **`genesis primitives [--json]`** prints the catalog (need, what to use, import, rule, docs) from every installed package's declarations plus a short static core; **`genesis agents`** writes it as `.claude/skills/genesis/SKILL.md` and a marked block in AGENTS.md, while **`genesis agents --check`** writes nothing and only reports a missing, stale or broken guide; both exit 1 without writing when a package's declaration doesn't validate (so does `genesis primitives`, which then lists the errors). **`agent-guide-stale`** warns when they drift or the AGENTS.md markers are broken (then `genesis agents` writes nothing). The report prints `Primitives: N rules from M packages; see genesis primitives`.

  Features: doctor-package-rules

- 995644a: `genesis introspect` (Postgres) gives a view Postgres can update on its own its table's facts: each plain column's nullability, default, link, enum values and comment, the table's primary key when every key column is in the view, and the table's `noun`, `nounPlural` and `labelField`. Columns are traced by position, so a column renamed with `alter view … rename column` keeps the right facts and key. The view's own comments win; computed columns and other views stay as read. A source table in a schema that wasn't asked for is read, not emitted. Single-column `CHECK`s that list values (`status in ('a', 'b')`, alone or `or status is null`) become the field's `enumValues` (checks that share no value give none).

  Contracts now state nullability both ways: `nullable: false` for a NOT NULL column, `nullable: true` for a nullable one, and nothing when the catalog can't tell (a view's own column). A schema or table name holding a dot or a quote is quoted (`"my.s"."we.ird"`). **Regenerate your contracts** (`genesis introspect`): older contracts mark every view column `nullable: true`, which the form's empty-input handling would believe.

### Patch Changes

- 87a2c31: `genesis introspect` (Postgres) leaves a view that has rules of its own (beyond its `_RETURN` rule) as read: such a view may be updatable only through a `DO INSTEAD` rule over a query whose rows aren't its table's (an outer join), so it no longer takes that table's key or nullability. A view column of an enum type that its table's `CHECK` narrows keeps the narrowed list, as the table's own column does.
- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0
  - @marktiderman/genesis-studio-server@0.5.1

## 1.14.0

### Minor Changes

- 7bfbff2: - The first registered codemod, `genesis-core-2-scope-names` (genesis-core 2.0.0's scope-neutral names), and `genesis codemod [id] [--dir] [--dry-run]` to list codemods or run one by hand.
  - Doctor rules for the scope rename: `removed-scope-name` (error) lists every removed "practice" name left in a file that imports Genesis (`timeZone: "practice"`, `practiceTimeZone`, `resolveZone("practice")`, DisplayTimeZones' `practice`), so `doctor --strict` fails until the codemod has run; `scope-practice-id` (info, never failing) notes a `scope.practiceId` read with no `ResourceScope` augmentation.
  - Two more doctor rules: `resource-view-tree` (error) flags a `<ResourceView>` or `<ResourcePage>` with `tree` and `pagination="server"` or `"cursor"`, which throws when it renders; `studio-server-auth-import` (warn) flags deep imports of studio-server files and a CommonJS `require` of its ESM-only root, pointing at `@marktiderman/genesis-studio-server/auth`. A correct project passes `genesis doctor --strict`.

### Patch Changes

- Updated dependencies [5f44692]
- Updated dependencies [7d27855]
  - @marktiderman/genesis-studio-server@0.5.0

## 1.13.2

### Patch Changes

- 68c89fb: `genesis doctor` compares features.ts from the repository root, so a nested app whose registry is the root's src/features.ts no longer warns when a package's exports change alongside it.
- Updated dependencies [afae598]
  - @marktiderman/genesis-features@0.6.1

## 1.13.1

### Patch Changes

- Updated dependencies [0d8925a]
- Updated dependencies [319d36d]
  - @marktiderman/genesis-studio-server@0.4.0

## 1.13.0

### Minor Changes

- 2bf5afd: Resource facts from `@genesis` comments: tables take `noun` and `nounPlural`, columns `readonly` and `sensitive` (booleans). `genesis introspect` emits each resource as `as const satisfies ResourceContract<Row>` with a field-name union, so a bad setting fails to compile; row types are now type aliases. Core's `ResourceContract` gains `label`, `labelField`, `noun` and `nounPlural`, and `FieldSchema` gains `readOnly` and `sensitive`.

### Patch Changes

- dda639d: `genesis doctor`: `page-layout` accepts `ResourceView` as a page layout, and `native-screen-layout` accepts `NativeResourceView`, so list screens built from a view pass.

## 1.12.1

### Patch Changes

- d53bdab: The packages pack's follow-ups: a nested app's change gate sees a local package at the repository root; an `export type` without a semicolon no longer hides the import after it; `.js` export targets are left alone (they may be unbuilt output); a `localPackages` entry that leaves the repository is refused, not skipped; a version bump without a changeset asks for one with a `Features:` line; and `links.code` paths count from the repository root.
- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 1.12.0

### Minor Changes

- 693856d: Local packages: list an app's own workspace packages in genesis.config.json `localPackages` (`["packages/*"]`) and Genesis treats them like its own. They declare blocks and migrations that `genesis add` and `genesis migrate` copy (nothing is installed), every doctor rule scans their source, and the new `packages` doctor pack (change rules with `genesis doctor --base <ref>`) holds each one to a package's standard: `package-app-import`, `package-undeclared-dependency`, `package-migration-test`, `package-migration-number`, `package-migration-edited`, `package-unregistered`, and `package-unversioned-change`, the gate that fails a change with neither a version bump nor a changeset naming the package.

## 1.11.3

### Patch Changes

- 6543b28: Say "reuse, then extend, then invent" everywhere, and point to The Genesis Way (`docs/FRAMEWORK.md`, Part 1). The CLAUDE.md that `genesis init` writes and genesis-ui's agent skill now use the same words.
- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 1.11.2

### Patch Changes

- 6f725f8: `genesis doctor` native pack: `native-raw-primitive` points a raw `ActivityIndicator` to `NativeLoadingState` first (then `NativeSkeleton`, `NativeProgress`), and `native-screen-layout` counts a route that renders `NativeLoadingState` as a screen.
- e1de4c1: - `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
  - Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.

## 1.11.1

### Patch Changes

- 67a06cd: `genesis doctor`, from the third #314 review:

  - `duplicate-genesis-package` / `peer-range-mismatch`: devDependencies count as runtime (a bundler ships what the app imports from them) unless they are tooling: test runners, `@types/*`, linters and formatters, compilers and bundlers, Storybook, release tools, the Genesis CLI. A duplicate under a UI package listed in devDependencies warns again.
  - The route trail's tokenizer reads regex literals and JSX text (`Rock 'n roll`, backticks, `{done}/{total}`) without losing its place, and treats a file it can't read for sure as unknown instead of guessing.
  - Answers cut short by an import cycle are cached by the modules they skipped, so cyclic import graphs no longer run several times slower.

- 2eae42f: `genesis doctor`: in an app with its own install inside another app's folder (a consumer app's `apps/mobile`), `duplicate-genesis-package` and `peer-range-mismatch` count only copies the app's own dependency graph resolves to. An undeclared, uninstalled peer dependency is unmet rather than met by the parent's `node_modules`, and the Genesis CLI's tree is followed only when the app declares the CLI. A regular dependency that resolves up to the parent still counts. Workspace members (no lockfile of their own) are unchanged.
- Updated dependencies [773e809]
  - @marktiderman/genesis-features@0.4.1

## 1.11.0

### Minor Changes

- b196c02: Doctor's supabase pack flags a view in an exposed schema that runs as its owner (no `security_invoker = true` once every migration has run): such a view reads past row level security. New rule `migration-view-rls`.

## 1.10.0

### Minor Changes

- 57b3e5a: `genesis doctor` route and install rules, from the #303 and #314 reviews. Minor: some routes and copies are newly checked, so `--strict` can newly fail.

  - A route whose component is imported (`component: CoursesPage`, a re-exported default) renders; it is no longer read as redirect-only and skipped.
  - TanStack `posts.lazy.tsx` is paired with `posts.tsx` as one route (segments `posts`, not `posts/lazy`).
  - A route rendering its own content around an `<Outlet>` is a page as well as a layout: `page-layout` and `hand-rolled-sub-nav` check it. Only pure layouts are skipped.
  - Next.js: private `_folders`, `(groups)`, `@slots` and the special files (error, loading, not-found, template, default, route handlers) aren't routes.
  - `duplicate-genesis-package`: copies reached only through dev tooling (devDependencies, the Genesis CLI's own tree) are dev-only; when exactly one copy is left at runtime the finding is `info`, and every other copy is reached only through declared devDependencies (an undeclared hoisted path makes it warn), otherwise it warns. An app with no runtime dependencies (everything in devDependencies) has them taken as runtime. `peer-range-mismatch` inside a dev-only copy is `info` too.
  - The route rules follow what a route renders through imports of rendered components, lazy imports, re-exports and barrels (relative, tsconfig `paths`, package.json `imports`, `@/` `~/` `#/`), and tsconfig `baseUrl` and `extends`, up to six modules deep; an unresolvable import makes only that route unsure (never a layout), `import()` in strings and comments is ignored, and past six modules the route is reported as before.
  - A wrapper around an `<Outlet>` is a layout, not a page; an `<Outlet>` in an imported layout component makes the route a layout; a folder `route.tsx` with its own content is checked; `export default R` of a local redirect is redirect-only.
  - Next.js: only `page` and `layout` files under `app/` are routes, and a `(group)` layout wraps only its group.

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 1.9.0

### Minor Changes

- d54328d: The doctor's supabase pack adds `migration-testing-kit`: an error when a migration uses `genesis_testing`, the pgTAP kit that belongs in `supabase/tests` only.
- 89ea12c: `genesis doctor` catches structural copies of Genesis. They are warnings (failures under `--strict`), except `resource-workspace`, which is `info`.

  A new `info` level is reported (in the text report, with `--json` `infos` and each finding's `level`) but never fails a run, `--strict` included. `rules` accepts it for any rule.

  The new rules:

  - `hand-rolled-sub-nav`: a route inside the AppShell layout that switches its sections with its own page-level `TabsList` / `SubNavTabs` instead of `useAppShellSubNav` and `AppShellPageHeader`.
  - `local-genesis-copy`: an app component definition (it renders JSX, and it is exported or outside the routes folder) named like a genesis-ui or forms-studio component (`ResourceHeader`, `SettingsSection`, `StatusBadge`, …). A route's own `errorComponent` and similar are not copies.
  - `duplicate-genesis-package`: more than one loadable copy of a Genesis package, found by following resolution through npm/yarn/bun trees, pnpm's store (workspace sub-apps included) and bun's isolated store, with the paths and the ranges that caused it.
  - `peer-range-mismatch`: an installed Genesis package whose peer range on another Genesis package isn't met by the installed peer, with the package, range and installed version.
  - `resource-workspace` (info): detail pages beside one that uses `AppShellPageHeader` but don't.
  - `page-layout`: a route inside the AppShell with no Genesis page layout, itself, through one local import, or from a layout route around it.

  New settings: `routesDir` and `componentPackages`; `--print-genesis` lists the companion packages' components.

- a4dd4aa: `genesis doctor` adds the `iso-date-slice` rule, a warning. It flags a day cut from an ISO timestamp (`toISOString().slice(0, 10)`, `.substring(0, 10)`, `.split("T")[0]` and the like). That is the day in UTC, not the person's. Use `personDay` or `dayIn` from `@marktiderman/genesis-core/dates` instead. Test files are skipped. Where UTC is what you mean, allow it with a reason.

### Patch Changes

- Updated dependencies [6c180f6]
  - @marktiderman/genesis-studio-server@0.3.1

## 1.8.0

### Minor Changes

- d132fe1: The native starter runs on `@marktiderman/genesis-notifications`: the Notifications tab is the notifier's feed (`NotificationsFeed`, live over the person's realtime channel), Settings → Notifications has a switch per category and channel (`NotificationPreferences`), and the push block registers through `notificationsPushBackend` with this install's id and takes its categories and action buttons from the app's registry (`src/lib/notifications.ts`). It carries the notifications migration and its pgTAP test; 0005's pgTAP test is gone (the notifications migration supersedes the register and forget it describes), and `genesis init --template native` records the `notifications` block.

  Features: native-starter, notifications

### Patch Changes

- f852f04: The block catalog carries genesis-support's new `support-chat` block (report threads on genesis-chat, after `support-feedback` and `chat`).

  Features: support-chat

## 1.7.0

### Minor Changes

- 4f1869d: `genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

  - `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
  - `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
  - `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
  - `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

  `genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.

- e930dda: `withGenesis` writes a fuller iOS privacy manifest. Required-reason APIs now cover React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), Expo (expo-file-system's FileTimestamp 0A2A.1 and 3B52.1 and DiskSpace E174.1 and 85F4.1, expo-constants' UserDefaults CA92.1), expo-updates, expo-application, expo-notifications and @sentry/react-native, each from the package's own PrivacyInfo.xcprivacy (Sentry's from its privacy-manifest guide), beside async-storage. It sets `NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` from the Genesis blocks the app uses (`PRIVACY_BLOCKS`: `account` from genesis-supabase, `observability` from genesis-native with Sentry, `push` from genesis-native with expo-notifications, `support` from genesis-support), unioned per Apple type (block type names are matched whatever their case). An app picks the blocks, or lists everything it collects (any of Apple's 35 types), in genesis.config.json `privacy` (`blocks`, `collects`, `tracking`) or the plugin's `privacy` option; a misspelt data type, purpose or block fails the config, as does a tracking setting that contradicts the app's own `NSPrivacyTracking`. Without either, the plugin warns that only Genesis blocks are declared. The app's own manifest entries always win.

  genesis-native's observability block now also declares "other diagnostic data" (Sentry's device and OS details, breadcrumbs and sessions) and, with `events`, analytics as a purpose of the user id, matching what the privacy manifest declares.

  Features: expo-config-plugin, observability

- 67d7dbd: `withGenesis()` gives each `APP_VARIANT` its own URL scheme: `development` appends `-dev` and `preview` appends `-preview` to every `scheme` (production keeps the base), so builds installed side by side no longer register the same scheme and a `scheme://` link opens the build it names. `VariantSuffix` gains `scheme`; change it with `variants: { development: { scheme: "-debug" } }`. An app that matches incoming links against its scheme should accept each variant's, as the starter's `src/lib/links.ts` now does.

  **Migrating:** a development or preview build no longer answers to the base scheme. Add `myapp-dev://…` and `myapp-preview://…` wherever the base scheme's redirect URLs are allowed (Supabase Auth's redirect URLs, OAuth clients, a Google sign-in callback), or keep the old behaviour with `variants: { development: { scheme: "" }, preview: { scheme: "" } }`.

  Features: expo-config-plugin

### Patch Changes

- a7db4d0: **`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted.

  - By default the sheet is now React Native's own `Modal`, which needs no provider.
    - iOS: the system page sheet (`presentationStyle="pageSheet"`), which follows the finger when swiped down (`allowSwipeDismissal`).
    - Android: a bottom panel over a scrim, drawn under the system bars. A tap on the scrim or back closes it.
    - Content gets the sheet's own safe area, and the bottom inset is padded.
    - `disableBackdropDismiss` keeps it up against every way of dismissing it.
    - A sheet mounted open waits for the Reduce Motion setting before presenting.
  - The library is used only when the app opts in, in either of two ways:
    - `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`). It mounts the provider inside the data, session and blocks providers, since sheet content renders in the library's portal.
    - The new `NativeSheetProvider`.
    - A module missing an export is reported with `console.error`, and sheets fall back to the modal.
  - On that path:
    - `enableDynamicSizing` is off, so `snapPoints` and `initialSnapIndex` mean what they say.
    - A dismiss that finishes after the app reopened the sheet isn't reported as the user closing it.
  - New `NativeSheetScrollView`: the library's `BottomSheetScrollView` under the provider, React Native's `ScrollView` otherwise. The what's-new notes scroll in it.
  - What may change for existing sheets:
    - The modal adds no padding of its own. The old fallback padded its content with `p-4`.
    - On iPhone the page sheet is nearly full height.
    - Sheets don't move above the keyboard.

  **Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

  **`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `packages` adds starting points (your own wrapper package), and a listed package that isn't installed is warned about. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.

- 0b8987b: Fixes from an end-to-end run of the native starter on an iOS 26 simulator.

  - `NotificationsPage`: the empty state sat under the large-title header, behind the Dynamic Island. It is now in a scroll view with `contentInsetAdjustmentBehavior="automatic"`, as the list is, so iOS insets it below the header and above the tab bar; pull to refresh works on it too.
  - `SettingsSubPage`: with `KeyboardToolbar`, the toolbar floated about a tab bar's height above the keyboard, and with the keyboard closed it showed above the tab bar. The keyboard-scroll layout no longer pads its bottom edge (the toolbar sticks to the keyboard from that edge); the scroll view's automatic inset keeps the last field clear instead.
  - Starter: `genesis-starter://check-in?gym=hilltop`, the link the check-in screen documents, opened Home. The link map now has `/check-in` (with `features.checkIn` on).

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 661e2a2: Built with TypeScript 6 (Expo SDK 58 expects `typescript ~6.0.3`).

  - `genesis-forms-builder`: the only change in any package's published declarations. `FlowMap` is now typed `MemoExoticComponent<(props) => JSX.Element>` (TypeScript 5.9 wrote `NamedExoticComponent<props>`); it is the same component and takes the same props.
  - `genesis-cli`: `genesis init --template native` makes an app on TypeScript 6, with the starter's component tests (jest-expo and React Native Testing Library: sign-in, Settings, account deletion, the tabs and the root layout's boot) run by its `test` script beside the vitest file checks. The app's `pnpm-workspace.yaml` leaves out the monorepo's `patchedDependencies`, whose patch files an app doesn't have.

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0

## 1.6.0

### Minor Changes

- 8b467c1: `genesis doctor` gains two opt-in rule packs, turned on with `doctor.packs` in genesis.config.json; apps without `packs` see no change. `native` (Expo apps on genesis-ui-native): `native-raw-primitive` (React Native primitives Genesis wraps, from the list the repo's forbidden-imports gate uses), `native-literal-color` (hex and rgb literals in native code, in place of `raw-color`), `native-custom-header` (a hidden navigator header with a hand-drawn one, or a hand-built tab bar), `native-screen-layout` (a route screen that renders none of the screen layouts the installed package exports) and `store-readiness` (warnings: generic usage strings, Sign in with Apple beside third-party sign-in, export-compliance flag, privacy manifest). With the pack on, the core rules read `@marktiderman/genesis-ui-native` and scan `app`, `src` and `components` by default. `supabase` (`supabase/migrations`): `migration-grants` (new migrations only; skipped with a warning when git can't tell which are new, unless `supabase.since` is set), `migration-rls`, `migration-definer-search-path` and `migration-edited` (a migration that exists on `origin/main` was changed). New exports: `readPackageExports`, `nativeLayouts`, `sqlStatements`.

  Features: doctor-native

### Patch Changes

- 954fb55: Use made-up neutral names in doc comments, examples and the brand schema description instead of the names of private apps. No behaviour change; the CLI invalid-name error now gives `"arcade-mobile"` as its example slug.
- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 1.5.0

### Minor Changes

- 36e114c: `@marktiderman/genesis-core` is now a peer dependency at `^1.6.0` (studio-server had it as a
  dependency at `^1.3.0`), as it is for `genesis-studio`: an app's lockfile can no longer keep an
  older core nested under studio-server while the app runs a newer one. `genesis-cli` loads
  studio-server, so it declares the same peer. Apps already depend on genesis-core; any `^1.6.0`
  release satisfies both.

### Patch Changes

- Updated dependencies [36e114c]
  - @marktiderman/genesis-studio-server@0.3.0

## 1.4.0

### Minor Changes

- f83ba49: From review: the umbrella's `versions.json` lists only the Genesis packages the umbrella depends on (and so releases with), so a patch to a package it doesn't depend on, such as the CLI or supabase, no longer looks like version skew. `genesis init --native` writes a Tailwind config with NativeWind's preset and the genesis-ui-native glob (without it, neither is written). `genesis features find` reports bad options as a clean CLI error instead of a stack trace.
- 406ece8: `withGenesis()`, an Expo config plugin: `plugins: ["@marktiderman/genesis-cli"]` (through the package's new `app.plugin.js`) or `import { withGenesis } from "@marktiderman/genesis-cli/expo"`. It suffixes ids and name per `APP_VARIANT` (development, preview, production) so the variants install side by side; sets `ios.associatedDomains` (`applinks:`, and `webcredentials:` unless `links.webcredentials` is `false`) and an `autoVerify` Android intent filter from a new, validated `links` block in genesis.config.json; declares the FileTimestamp reason `C617.1` in the iOS privacy manifest when `@react-native-async-storage/async-storage` is installed, as that package's own manifest does; and sets `usesNonExemptEncryption: false` and the fingerprint runtime policy unless the app already does. Running it twice changes nothing. It reads only genesis.config.json, package.json and `APP_VARIANT`; set `APP_VARIANT` as an EAS environment variable so `eas update` and fingerprint checks see the same value as builds (the README explains, and lists the per-variant web association entries).

  `readGenesisConfig`, `validateLinks` and `GenesisConfigError` are exported, and `DoctorConfigError` now extends `GenesisConfigError`. `genesis doctor` reads genesis.config.json through the same loader, so it now exits 2 with a message on a malformed `links` block, and on a genesis.config.json that is valid JSON but not an object (an array, a string): that used to fall back to the default settings in silence, and now fails on purpose, because a config the doctor can't read should not pass as "no config".

  Features: expo-config-plugin

- ffa443c: The feature registry becomes a reuse catalog. A new first status, `idea`, captures work that is not agreed yet so `find` turns it up before anyone builds the same thing twice. Optional fields describe what a feature is and how to reuse it: `layer`, `platforms` (status per platform), `entry` (what to import), `keywords`, `slots`, `extends` (a variant of another feature), `requires` and `contributes`. `defineFeatures` checks that `extends` and `requires` name real features, finds cycles, and refuses a beta or live feature that requires an idea, a planned or a retired one. `findFeatures` matches keywords, imports, slots and contributions and takes `platform`, `layer` and `status` filters; `genesis features find` gains `--platform`, `--layer` and `--status`, and the generated skill teaches reuse, then extend, then invent.

  Features: feature-registry

- 58aadde: One Genesis config per app. `genesis features` reads its settings from the `features` block of `genesis.config.json`, beside `doctor`, so an app keeps its Genesis settings in one file. package.json's `"genesisFeatures"` still works; when both exist, `genesis.config.json` wins, and the command line wins over both.

  Features: feature-registry, cli-doctor

- 5078d3f: One Genesis version per app. `@marktiderman/genesis` writes `dist/versions.json` with the exact version of every public Genesis package in its release, exported as `@marktiderman/genesis/versions.json`, and re-exports the features registry as `@marktiderman/genesis/features`. `genesis doctor` gains `version-skew`: in an app with the umbrella installed, it warns for each installed Genesis package on a different version than the release lists (raise it to an error with `rules`).

  Features: umbrella, cli-doctor

### Patch Changes

- 76d7ab7: `genesis init` writes files that work: the Tailwind config imports `genesisPreset` from `@marktiderman/genesis-design-system/presets/tailwind` (the old `/tailwind-preset` path was never exported), and `app/global.css` imports `themes/genesis.css` (the old `tokens.css` didn't exist). It no longer writes `.genesis/cli.yml`, which nothing read. The generated CLAUDE.md and the next steps point at `genesis features find`, `genesis doctor` and the framework docs instead of a document that isn't in the repo, and no longer assume pnpm. `genesis --version` reports the installed version instead of `0.1.0`. The package stops listing a `templates` folder it doesn't have.

  Features: cli-init

- Updated dependencies [e91765c]
- Updated dependencies [ffa443c]
- Updated dependencies [58aadde]
  - @marktiderman/genesis-features@0.2.0

## 1.3.0

### Minor Changes

- ed8083f: `genesis features build|check|find`. `build` writes everything generated from the repo's `features.ts`: the AGENTS.md pointer, `features.json`, the OpenFeature `flags.json`, the agent skill and an optional marketing block, and adds `@AGENTS.md` to CLAUDE.md. `check` fails CI on stale output, missing code paths, the flag rules, removed ids and unknown feature tags (`--labels` checks a PR's `feature:<id>` labels), and warns on the rest; `--summary` is for a SessionStart hook. `find <term>` searches the registry. Settings live in package.json under `genesisFeatures`.

  Features: feature-registry

### Patch Changes

- ed8083f: `genesis features check --prs` also reads merged PRs labelled `feature:<id>` for the planned features (one `gh pr list --search` per ten labels, with a 15-second timeout), and warns when one already shipped. When `gh` is missing, times out or fails, one warning gives the reason from `gh`'s stderr, `--summary` repeats it, and only changesets are checked. `--summary` counts planned features with shipped work.

  Features: feature-evidence

- Updated dependencies [ed8083f]
- Updated dependencies [ed8083f]
  - @marktiderman/genesis-features@0.1.1

## 1.2.0

### Minor Changes

- 9453f10: Add `genesis doctor`: checks an app against the installed Genesis. Components, exports and
  tokens are read from the installed `genesis-ui` declarations and theme CSS (both
  `genesis.css` and the Tailwind v4 bridge `genesis-tailwind4.css` by default; `themeCss`
  takes one path or a list). It flags local primitive folders, direct Radix and starter-utils
  imports, raw tags Genesis has components for, palette, arbitrary and raw colors, undefined
  tokens and exports that shadow Genesis, and lists components the app never uses. Apps
  configure exceptions and add their own rules in `genesis.config.json` (or package.json
  `genesis.doctor`): declarative patterns, a markdown rules document, or plugin modules. Also
  ships `@marktiderman/genesis-cli/vite` (fails production builds, shows the dev overlay) and
  `@marktiderman/genesis-cli/doctor` (programmatic API and plugin types).

## 1.1.1

### Patch Changes

- bcf1248: The studio server runs on Cloudflare Workers, where Lovable deploys TanStack Start apps. A
  database connection there belongs to the request that opened it, so the server now opens one
  per transaction and closes it after (`createPostgresDatabase(url, { perRequest })`, on by
  default on Workers), and one handler serves every request. `genesis studio init` writes
  `process.env["X"]` (for `noPropertyAccessFromIndexSignature`) and says `bun add` for a text
  `bun.lock`.
- Updated dependencies [bcf1248]
  - @marktiderman/genesis-studio-server@0.2.1

## 1.1.0

### Minor Changes

- 69d7f90: **Data Studio P3 — workflow** (docs/DATA-STUDIO.md P3).

  - **studio-server:**
    - **Row actions:** `resources[name].actions` maps a named action to the app's function `fn(record_key jsonb)`. It runs as the user, at the version they saw, and its effect on the row is audited as `run:<name>`. `authorize` is asked `{ action: "run", rowAction }`, and `byResource` takes `actions: true | string[]`. The studio never undoes an action.
    - **Comments:** `authorize` allows `{ action: "comment" }` (`byResource`: `comment: true`). Comments are stored by security definer functions, only for rows the user can see, and the author is always the token's `sub`.
    - **`contracts`:** a checked-in contract from `genesis introspect` wins over discovery for labels, the label field, descriptions and type-compatible widgets. Types, keys and permissions still come from the live database.
    - `@genesis {…}` settings are left out of the comments the studio shows as descriptions.
    - **Hardening:** with `loginRole`, the read functions (`record_history`, `audit_entry`, `record_comments`) now refuse any other login, as the write functions already did. They stay the handler's, even if a Data API is pointed at `genesis_studio`.
    - **Migration:** re-run `npx genesis-studio-server sql` as a new migration. It adds `genesis_studio.comments`, `add_comment` and `record_comments`, and widens the audit log's `action` check to allow `run:<name>`.
  - **studio:**
    - **Board view** (`?view=kanban&by=…`): one column per value of an enum or yes/no field, 50 cards per column with **Load more**. Moving a card is a version-checked update, by drag or by the keyboard **Move to** menu.
    - **Calendar view** (`?view=calendar&by=…&month=YYYY-MM`): one request per month, up to 200 rows. Timestamps are placed on the viewer's day.
    - The record pop-up runs row actions, asking first when the action has a `confirm` question, and has a **Comments** tab.
    - Contract labels are used wherever a field is named.
    - **Fix:** signing in again as the same user (a new token, the same `sessionKey`) now brings the studio back. Before, it stayed on the sign-in screen until a reload.
  - **genesis-cli:** **`genesis introspect`** writes `resources.genesis.ts` from the Postgres catalog or a PostgREST/Supabase OpenAPI document. Labels and widgets come from `@genesis {…}` in table and column comments. The output is deterministic, and `--check` fails CI on drift.

- 69d7f90: **The Data Studio turns on in any app, for every table.**

  - **genesis-cli:** `genesis studio init` writes one migration to review (the studio's `NOINHERIT` login and the audit trail), the server and a page, then prints the remaining steps. The server is a Next.js route, or a Supabase Edge Function for Vite and Lovable apps.
  - **studio-server:**
    - **`supabaseStudio({ url, database })`:** the handler for a Supabase project in one call.
    - **`databaseDecides()`:** every table, every action, bounded by the user's grants and row-level security. `who` defaults to any signed-in, non-anonymous user.
    - **No version trigger needed.** A table without a trusted version column is checked against a fingerprint of the row's readable values (`VersionField.kind: "row"`), so it's editable and stale edits are still refused. A configured `versionField` that can't be trusted still makes the table read-only.
    - **Policies are read too.** A granted table that no row-level security policy lets you update, insert or delete shows that action as off, with the reason, instead of failing on every try.
    - **CORS:** the handler answers preflights for `allowedOrigins`, so it can run on another origin.
    - **`supabaseAuth` inside the local Supabase stack** (`http://kong:8000`) also accepts the browser's localhost issuer. Hosted projects keep the exact issuer check.
    - **`createSupabaseStudioProvider(supabase)`** in `/client`: it sends the session's token and reports user changes.
  - **studio:**
    - `router` is optional (the page's query string), and no `sessionKey` is needed with a provider that reports its session.
    - **`standalone.css`:** every class the studio uses, prebuilt, for apps without Tailwind v4. Its small reset applies only inside the studio and its pop-ups, and the app's own theme variables win.
  - **core:** `VersionField.kind` may be `"row"`.

### Patch Changes

- Updated dependencies [9667f9a]
- Updated dependencies [a642bc0]
- Updated dependencies [69d7f90]
- Updated dependencies [69d7f90]
  - @marktiderman/genesis-studio-server@0.2.0

## 1.0.3

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 1.0.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 1.0.1

### Patch Changes

- 0dfba25: Scaffolder: the consumer pin file moves from `.genesis/config.yml` to `.genesis/cli.yml`
  to avoid colliding with the schema-validated harness root config (`genesis.config.yml`).
  The pin file's shape is unchanged (version/consumer/rules/paths); only its path and header
  comment changed. The scaffolder is write-only — nothing in genesis-cli reads the pin at
  runtime — so repos scaffolded before this change keep their existing `.genesis/config.yml`
  untouched (it is simply no longer the name new scaffolds emit); re-running `init` in such a
  repo writes the new path and leaves the old file for the consumer to delete.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).
