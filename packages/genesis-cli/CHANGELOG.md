# @marktiderman/genesis-cli

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
