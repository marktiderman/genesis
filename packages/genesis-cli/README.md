# @marktiderman/genesis-cli

```bash
npx @marktiderman/genesis-cli init <consumer>
```

Scaffolds a Genesis consumer: a brand package, Tailwind and tokens.

```bash
npx @marktiderman/genesis-cli init <app> --template native [--bundle-id com.acme.app] [--scheme acme] [--display-name "Acme"]
```

Makes a new Expo app from the Genesis RN starter, in `./<app>` (or `--target`), which must be new
or empty. See [A new native app](#a-new-native-app).

```bash
npx @marktiderman/genesis-cli add <block> [--dry-run] [--yes] [--no-install]
npx @marktiderman/genesis-cli migrate [--dry-run] [--forward]
npx @marktiderman/genesis-cli upgrade [--version <v>] [--dry-run] [--keep-mine] [--pr]
```

Add a block to an app, copy new package migrations in, and move every Genesis package to one
release. See [Blocks: add, migrate, upgrade](#blocks-add-migrate-upgrade).

```bash
npx @marktiderman/genesis-cli doctor [--strict] [--json] [--build] [--config <path>] [--dir <dir>]
```

Checks an app against the Genesis it has installed. See [genesis doctor](#genesis-doctor).

```bash
npx @marktiderman/genesis-cli studio init
```

Turns the Data Studio on in an existing Supabase app. It writes three things:

- **One migration to review:** the studio's `NOINHERIT` login and the audit trail. It holds no
  password.
- **The server:** a Next.js route when the app has an `app/` router; otherwise a Supabase Edge
  Function, `supabase/functions/genesis-studio`, with `verify_jwt = false` added to
  `supabase/config.toml` because the function checks tokens itself.
- **A page:** for Lovable apps, it imports `@/integrations/supabase/client`.

It then prints the steps left: install, route the page, set the login's password, set the
function's secrets, apply the migration. Options: `--host next|supabase-function`, `--route`
(default `/admin/data`), `--login-role`, `--force`.

```bash
DATABASE_URL=postgres://… npx @marktiderman/genesis-cli introspect
```

Writes `resources.genesis.ts`, a checked-in contract for the Data Studio: every table in the
schemas, with its key, fields (type, database type, nullability, defaults, enum values, links)
and a row type per table. Review it like code, and pass `contracts` to `createStudioHandler`. It
wins over discovery for labels, widgets and descriptions; types, keys and permissions still come
from the live database.

| Option | Default | |
| --- | --- | --- |
| `--database-env <name>` | `DATABASE_URL` | The variable holding the Postgres URL. It's never read from the command line, so it stays out of shell history. Any role that can read `pg_catalog` works; no table data is read. |
| `--openapi <file-or-url>` | | Read a PostgREST OpenAPI document instead, e.g. a Supabase project's `https://<ref>.supabase.co/rest/v1/`. |
| `--apikey-env <name>` | | The variable holding the API key for an `--openapi` URL, sent as `apikey` and as a Bearer token. Like the database URL, it stays off the command line. |
| `--header "<Name>: <value>"` | | Other headers for an `--openapi` URL, for values that aren't secret. Repeatable. |
| `-s, --schema <list>` | `public` | Comma-separated schemas. `--openapi` reads one. |
| `-o, --out <file>` | `resources.genesis.ts` | Where to write. |
| `--check` | | Write nothing; exit 1 when the file is out of date. Run it in CI to catch drift. |

The output is deterministic: a re-run with no schema change writes the same bytes.

```bash
npx @marktiderman/genesis-cli features build   # or: features check (for CI)
```

Writes the marked feature block in `AGENTS.md` (and a JSON copy with `--json <file>`) from the
repo's `src/features.ts`; `check` exits 1 when that output is stale or a feature's `links.code`
path doesn't exist. See [genesis-features](../features/README.md) for the registry and the options.

## A new native app

`genesis init <app> --template native` copies the starter (`apps/genesis-rn-starter`) that ships
inside the CLI, at the version the CLI was released with:

- only the files an app owns: no `node_modules`, build output, or the starter's monorepo-only test
  (`__tests__/release.test.ts`, which reads the monorepo's `templates/`);
- renamed: package name, display name, slug, URL scheme and bundle id, everywhere the starter's
  values appear (Apple client ids in `supabase/config.toml`, the Maestro flows' `appId`);
- every `workspace:` dependency set to `^<version>` from the same release (the installed
  umbrella's `versions.json` when there is one), the plain Metro config, and a
  `pnpm-workspace.yaml` with the pnpm settings Metro and pnpm 11 need (hoisted layout, allowed
  build scripts, one React);
- the templates: `templates/eas` to `eas.json` and `.eas/`, `templates/maestro` to `.maestro/`,
  `templates/ci` to `.github/workflows/` (replace `GENESIS_SHA` in them);
- `genesis.lock.json`, recording the blocks the starter carries (`account`, `app-updates`,
  `push`), every file Genesis owns in the app with its checksum, and the renames, so `upgrade`
  can refresh them and `migrate` knows the blocks.

The starter's migrations are copied byte for byte (its own tests check that); `migrate` knows them
by name and text. `init --native` (the brand-package scaffold for an Expo app) is unchanged.

## Blocks: add, migrate, upgrade

A block is a feature an app adds whole (see `defineBlock` in `@marktiderman/genesis-features`).
The commands read blocks from the Genesis packages, never from a list in the CLI, so a package
that declares a block is found:

- `package.json` → `"genesis": { "blocks": { "<id>": { … } } }`, plain JSON the CLI reads without
  running package code. The CLI carries a catalog of every Genesis package's manifests, so a block
  is found before its package is installed.
- A `./blocks` export of `defineBlock` declarations that loads in Node (no React Native), such as
  `@marktiderman/genesis-supabase/blocks`. What a declaration says (requires, platforms,
  migrations, routes, skills, privacy) wins over package.json; package.json adds what a
  declaration can't.

A manifest entry:

```json
{
  "feature": { "name": "Push", "summary": "…", "keywords": ["notifications"], "audience": ["person"] },
  "platforms": ["native"],
  "requires": ["account"],
  "packages": ["@marktiderman/genesis-native", "@marktiderman/genesis-supabase"],
  "install": ["@supabase/supabase-js@^2.118.0"],
  "migrations": [{ "package": "@marktiderman/genesis-supabase", "file": "migrations/0005_genesis_push.sql", "test": "migrations/tests/0005_genesis_push.test.sql" }],
  "functions": [{ "package": "@marktiderman/genesis-supabase", "dir": "functions/genesis-push-send", "verifyJwt": false, "secrets": ["GENESIS_PUSH_SECRET"] }],
  "routes": [{ "path": "/settings/notifications", "signedIn": true }],
  "skills": ["skills/push/SKILL.md"],
  "agents": "agents/push.md",
  "steps": ["npx expo install expo-notifications, and add it to the plugins in app.config."]
}
```

Every path is package-relative and checked before anything reads it: no absolute paths, no `..`,
no backslashes, and a file that resolves (through a symlink) outside its package is refused.
`package` must be a Genesis package. Migrations are named `NNNN_name.sql`. A package whose
runtime block is made by a function (`createPush`) keeps a test that its manifest says what the
block declares.

### genesis add

`genesis add <block>` plans, prints the plan, asks (or `--yes`), then:

1. installs the block's `packages` (at the installed umbrella's pinned version, else this CLI's
   release) and `install` entries the app doesn't have, with the app's package manager
   (`--no-install` prints the command instead);
2. copies each migration into `supabase/migrations/` as a **new** file,
   `<timestamp>_<name>.sql`, timestamped after every migration already there, with a header naming
   the package, the file and the checksum of the package's text; and its pgTAP test into
   `supabase/tests/database/`;
3. copies its Edge Functions into `supabase/functions/<name>/` (and adds `verify_jwt = false` to
   `supabase/config.toml` when the manifest says so), its skills into `.claude/skills/<name>/`,
   and its AGENTS.md fragment between `<!-- genesis-block:<id>:start/end -->` markers;
4. writes a stub screen for each route an Expo Router app doesn't have yet (inside the app's one
   group for a signed-in route); other routers get a step;
5. adds the block's entry to the feature registry (`features.ts`) when the edit is unambiguous and
   still loads, or prints the snippet; then runs `features build`;
6. records the block and the files it owns in `genesis.lock.json`, and prints what is left by hand
   (secrets, plugin config, the privacy label).

It never overwrites a file the app has: one with other text is reported and left alone. A second
run creates and changes nothing. `--dry-run` prints the plan and writes nothing. `genesis add
--list` lists the blocks the app can add. `genesis studio init` is unchanged.

### genesis migrate

Compares the migrations of the app's blocks (`genesis.lock.json`, plus `--block <id>`) in the
installed packages with the app's copies, and every copy that carries a header:

| State | Meaning | What happens |
| --- | --- | --- |
| `current` | the copy matches its package text | nothing |
| `new` | the package ships a migration the app hasn't copied | copied as a new file, after every existing one |
| `edited` | the copy no longer matches the text it was copied with | reported; never rewritten |
| `changed-upstream` | the package now ships different text than the copy was made from | reported; never rewritten |
| `differs` | a file with the migration's name, other text and no header | treated as the app's own; never rewritten |

Every file already in `supabase/migrations` counts as applied: none is ever written again, and a
new file is created only if its name is free (otherwise it fails). A package migration is copied
only when nothing in the folder holds it yet, by header, by name or by text, so one a package
renumbered or moved is never copied twice. Line endings (CRLF or LF) don't count as a change. A
symlink in the folder stops the command. A pgTAP test is copied only with its migration, so one you
deleted stays deleted. `--forward` writes one forward migration stub
(`<timestamp>_<name>_forward.sql`, with a `genesis-forward` header) for each edited or changed
copy, holding the package's current text commented out, for you to turn into the change; later
runs count that copy as handled. It exits 1 when something still needs you.

### genesis upgrade

1. Reads the release: `@marktiderman/genesis@<version>` (default `latest`) and its
   `versions.json`, as the [genesis-upgrade workflow](../../docs/APP-CI.md#genesis-upgrade) does,
   or `--manifest <file>`. The bump is the workflow's own code (`src/upgrade/bump-core.mjs`, which
   the workflow embeds): every Genesis dependency in every tracked package.json moves together,
   keeping its range prefix; `workspace:`, `file:` and other ranges are left alone, nothing is
   downgraded.
2. Runs a codemod only when a release declares a breaking change it fixes: the registry in
   `src/upgrade/codemods.ts` (empty today) names the package and the first version that breaks, and
   a codemod runs when a package moves across it. A major move (or a 0.x minor) without one is
   listed so you read its changelog.
3. Reinstalls, then refreshes every file in `genesis.lock.json` from the newly installed package:
   unchanged in the app, it takes the new version; changed by both, it is merged with `git
   merge-file` against the old version (the base); a conflict goes to `<file>.genesis-next` and
   your file is kept. `--keep-mine` never merges: the new text goes to `.genesis-next`. A file you
   deleted stays deleted. AGENTS.md fragments are replaced, skills a block gained are copied, and
   new package migrations are listed (run `genesis migrate`).
4. Runs `genesis doctor` and prints a summary; `--pr` commits to `genesis-upgrade/<version>`,
   pushes and opens a pull request with `gh`. It checks first, before writing anything, that the
   tree is clean, a branch is checked out and the branch name is free; it commits the lockfile
   (found up to the repository's root), never `.genesis-next` files. `--dry-run` changes nothing,
   and shows the refresh against the packages installed now.

`genesis.lock.json` is checked like a manifest, since anyone with commit access can edit it: each
entry may only write where its kind of source goes (a template to `eas.json`, `.eas/`, `.maestro/`
or `.github/workflows/`, a function file to `supabase/functions/<name>/`, a pgTAP test to
`supabase/tests/database/`, a skill to `.claude/skills/`), never a migration and never `.git`;
substitutions may only replace the starter's own names. A pgTAP test waits while its block has
new migrations to copy.

## Expo config plugin

`withGenesis()` keeps an Expo app's `app.config.ts` to a name, ids and plugins:

```ts
// app.config.ts
import type { ExpoConfig } from "expo/config";

export default (): ExpoConfig => ({
  name: "My App",
  slug: "my-app",
  scheme: "myapp",
  ios: { bundleIdentifier: "com.example.myapp" },
  android: { package: "com.example.myapp" },
  plugins: ["expo-router", "@marktiderman/genesis-cli"],
});
```

Install the CLI in the app (`pnpm add -D @marktiderman/genesis-cli`); Expo finds the plugin
through the package's `app.plugin.js`. To pass options, use `["@marktiderman/genesis-cli", { … }]`,
or call it yourself: `import { withGenesis } from "@marktiderman/genesis-cli/expo"`.

| Step | What it sets | Option to turn it off |
| --- | --- | --- |
| App variants | `APP_VARIANT` = `development` / `preview` / `production` (default) suffixes `ios.bundleIdentifier` and `android.package` with `.dev` / `.preview`, `name` with ` (Dev)` / ` (Preview)` and each `scheme` with `-dev` / `-preview`, so the three install side by side and a `scheme://` link opens the build it names (production keeps the base scheme). Any other value fails. A value that already ends in the suffix is left alone. Change the suffixes with `variants: { development: { id: ".debug", name: " (Debug)", scheme: "-debug" } }`. | pass `variant: "production"` |
| Links | `ios.associatedDomains` (`applinks:` and, unless `links.webcredentials` is `false`, `webcredentials:` per host) and one Android `intentFilters` entry with `autoVerify`, from the `links` block of `genesis.config.json`. | `links: false` |
| Privacy manifest | `ios.privacyManifests.NSPrivacyAccessedAPITypes` for the packages in `dependencies`: `@react-native-async-storage/async-storage` needs FileTimestamp, reason `C617.1` (what its own `PrivacyInfo.xcprivacy` declares). | `privacyManifest: false` |
| Export compliance | `ios.config.usesNonExemptEncryption = false`. | `exportCompliance: false` |
| Runtime version | `runtimeVersion: { policy: "fingerprint" }`. | `fingerprint: false` |

The app's own values always win: the plugin fills gaps and appends to lists, merges privacy
reasons into an entry the app already declares, never overwrites or removes anything, and
running it twice changes nothing.

### Setting APP_VARIANT

`APP_VARIANT` has to be the same wherever the config is evaluated for a build, not only in
`eas build`. `eas update` and EAS fingerprint checks evaluate the config too, and they don't read
the `env` of a build profile in `eas.json`. If an update is published without the variant, it is
built for the production ids and runtime, and preview and development builds never receive it.

Set it per EAS environment instead, so builds, updates and fingerprints all see it:

```bash
eas env:create --environment preview --name APP_VARIANT --value preview --visibility plaintext
eas env:create --environment development --name APP_VARIANT --value development --visibility plaintext
```

Point each build profile at its environment (`"preview": { "environment": "preview" }`), and
publish with `eas update --environment preview` (SDK 55 requires `--environment`). On SDK 54 or
earlier without EAS environments, set it on the command line every time:
`APP_VARIANT=preview eas update --branch preview`.

### Links

The `links` block in `genesis.config.json` is validated by the same loader the doctor uses, so a
bad block fails `genesis doctor` too:

```json
{
  "links": { "hosts": ["example.com", "app.example.com"], "paths": ["/invite", "/c"], "webcredentials": true }
}
```

`hosts` are bare lower-case host names (`*.example.com` allowed; no scheme, path or port);
`paths` are optional prefixes, each starting with `/`; `webcredentials` (default `true`) adds the
`webcredentials:` domains for password autofill. Set it to `false` if the site doesn't share
credentials with the app.

The web side has to list every variant you want links to open, because each variant is a
different app to Apple and Google:

- `/.well-known/apple-app-site-association`: one app id per variant, `TEAMID.com.example.myapp`,
  `TEAMID.com.example.myapp.dev` and `TEAMID.com.example.myapp.preview`, under `applinks` (in
  `details[].appIDs`) and, when `webcredentials` is on, under `webcredentials.apps`.
- `/.well-known/assetlinks.json`: one entry per package (`com.example.myapp`,
  `com.example.myapp.dev`, `com.example.myapp.preview`), each with that build's own signing
  certificate SHA-256 fingerprint (`eas credentials` shows it).

A variant the web files leave out installs fine, but its links open in the browser.

### Determinism

The plugin reads exactly two committed files in the project root, `genesis.config.json` and
`package.json`, and one environment variable, `APP_VARIANT`. It makes no network calls and reads
no clock or other environment, so for a given commit and `APP_VARIANT` it always gives the same
config. That makes the EAS fingerprint (`runtimeVersion` policy `fingerprint`) stable only when
`APP_VARIANT` is set the same way in every place the config is evaluated: builds, `eas update` and
fingerprint checks (see [Setting APP_VARIANT](#setting-app_variant)). Keep the rest of the config
in committed files too.

`@expo/config-plugins` and `@expo/config-types` are optional peer dependencies used for types
only; the plugin bundles neither and has no runtime dependency on them. Node 20.19 or 22.12+ is
needed (Expo `require()`s `app.plugin.js`, which is an ES module).

## Settings in comments

Put labels and widgets next to the schema, in table and column comments:

```sql
comment on table public.customers is
  'Customers of the business. @genesis {"label": "Customers", "labelField": "name"}';
comment on column public.customers.notes is
  'Private to staff. @genesis {"label": "Internal notes", "widget": "textarea"}';
```

The text before `@genesis` stays the description. Tables take `label`, `labelField` and
`description`; columns take `label`, `description` and `widget`. Anything else is an error that
names the table or column. These settings are generator input only: the checked-in file is what
ships.

## genesis doctor

`genesis doctor` checks that an app uses Genesis instead of working around it. Every built-in
rule is derived from what is installed, never from a list in the CLI: the components and
exports come from `@marktiderman/genesis-ui`'s type declarations (every subpath), the tokens
from the design system's theme stylesheets (`dist/themes/*.css`: `genesis.css` and the
Tailwind v4 bridge `genesis-tailwind4.css`), and the palette from the app's `tailwindcss/colors`.
Upgrading Genesis upgrades the checks.

| Option | |
| --- | --- |
| `--strict` | Fail on warnings too. `info` findings never fail. |
| `--json` | Print `{ ok, genesis, errors, warnings, infos, findings, unused }`; each finding has its `level` (`error`, `warn` or `info`). Build output is captured, not streamed. |
| `--build` | After the checks, run `doctor.build` commands, or the app's `typecheck` then `build` scripts. A build that itself runs the doctor doesn't recurse. |
| `-c, --config <path>` | Config file. Default: `genesis.config.json`, then the `genesis` key of package.json. |
| `-d, --dir <dir>` | The app's folder (default: cwd). |
| `--print-genesis` | Print the components, tokens, raw tags, palette and companion packages' components read from Genesis, and exit. |

Exit codes: `0` pass, `1` findings, `2` the doctor couldn't run (bad config, Genesis not installed or not built).

### Rules

| Rule | Level | What it flags |
| --- | --- | --- |
| `local-primitives` | error | A local primitive folder (`src/components/ui` by default; `localPrimitiveDirs`). |
| `starter-leftover` | warn | `components.json` or `src/lib/utils.ts` from a shadcn starter. |
| `forbidden-import` | error | `@radix-ui/*`, local `components/ui/*` (alias or relative), `@/lib/utils`, plus your `forbiddenImports`. |
| `raw-tag` | error | A raw JSX tag Genesis has a component for: any of `button input textarea select label table dialog progress details summary` with a same-named Genesis export, plus `hr` → `Separator`. JSX files only; `rawTags` adds or removes mappings. |
| `palette-color` | error | Tailwind palette utilities (`bg-red-500`, `hover:text-slate-700/50`, `text-white`). Use semantic tokens. |
| `arbitrary-color` | error | Arbitrary color values (`bg-[#f00]`, `text-[rgb(1,2,3)]`). |
| `raw-color` | error | Hex and `rgb()/hsl()` literals in code and CSS, via the same lexer as the repo's `check:token-usage` (comments, issue refs and `hsl(var(--x))` are fine). A brand file that defines token values needs an `allow` entry. |
| `undefined-token` | error | `var(--x)` where the theme doesn't define `--x`. Tokens declared in the app's CSS (or only `tokenFiles`) and inline style custom properties count as defined; `--tw-*` and `--radix-*` are ignored. |
| `shadowed-export` | error | An exported value named like a Genesis export (`export function Button`). Reuse or extend it. |
| `duplicate-genesis-package` | warn | More than one copy of a `@marktiderman/genesis-*` package that the app can load, with each copy's path, version and the ranges that asked for it. Found by resolving dependencies the way Node does, from each package's real folder, so npm/yarn/bun hoisted and nested trees, pnpm's `.pnpm` store (in the app, or at the workspace root above a sub-app) and bun's isolated `.bun` store all count; a store entry nothing resolves to is ignored. Two copies are two module instances: a `DataProvider` from one is invisible to hooks from the other. |
| `peer-range-mismatch` | warn | An installed Genesis package's `peerDependencies` range on another Genesis package that the copy it resolves (looked up from its own folder, as Node does) doesn't satisfy: the package, the range and the installed version. Missing peers and non-semver ranges (`workspace:*`) are skipped. Ranges are read with npm's grammar (`^ ~ x - ||`, prereleases only when the range names one). |
| `hand-rolled-sub-nav` | warn | A route under the layout that renders `AppShell` that switches its sections with its own page-level `<TabsList>` or `<SubNavTabs>`, when the installed Genesis has `useAppShellSubNav`. Tabs inside a card, dialog, sheet, popover, accordion, panel, table or another tab's content are fine, as are pages that call the hook. Use `useAppShellSubNav(items, { mode: "tabs" })`, `AppShellPageHeader` and `AppShellSubNavEnd` from `@marktiderman/genesis-ui/layout` ([sub-navigation](../ui/SKILL.md)). |
| `local-genesis-copy` | warn | An app component definition named like a component of `uiPackage` or of `componentPackages` (forms-studio's `ResourceHeader`, `SettingsSection`, `ResourceSettingsPage`, `HeadlineNumbers`, `SummaryCard`, `ShareDialog`, …): "Genesis already has X". A definition renders JSX, isn't in a file that imports the Genesis one, and is exported or lives outside the routes folder; a route's own non-exported functions and anything passed as `component` / `errorComponent` / `pendingComponent` / `notFoundComponent` (TanStack's `FormError`) are not copies. An exported genesis-ui value is `shadowed-export` instead; `const X = lazy(() => import("@marktiderman/genesis-…"))` is fine. |
| `resource-workspace` | info | In a routes folder where a detail page (`courses.$courseId.tsx`, `[id]/page.tsx`) renders `AppShellPageHeader`, directly or through one local import, the other detail pages there that don't: one workspace header and tab row for every resource. Reported, never failing (`--strict` included); `rules` can raise it to `warn`. |
| `page-layout` | warn | A route inside the AppShell (under the layout route that renders it) that renders no Genesis page layout (the `…Page` / `…PageShell` components `uiPackage` and `componentPackages` export, not `BreadcrumbPage`) itself, through one local import, or from a layout route around it (`my/route.tsx` supplying `DetailPage` covers `my/index.tsx`). A `…Page`, `…Screen` or `…Workspace` imported from any Genesis package counts. Routes outside the shell (sign-in, landing, public forms) aren't checked until Genesis ships layouts for them. Layout-only (`route.tsx`, `__root`, `<Outlet>`) and redirect-only routes are skipped; off with the `native` pack (see `native-screen-layout`). |
| `stale-exception` | warn | An `allow` entry that no longer matches anything. |

It also prints **Available but unused**: the Genesis components no file imports. Check it
before building something.

The route rules (`hand-rolled-sub-nav`, `resource-workspace`, `page-layout`) read the routes
folder (`routesDir`, default the first of `src/routes`, `src/app`, `app`, `src/pages`, `pages`):
TanStack Router files (flat `a.$id.tsx` or folders, `route.tsx` layouts, `__root.tsx`, `-private`
files skipped, a trailing `_` un-nesting a segment) and Next-style `layout.tsx` / `page.tsx`.
`hand-rolled-sub-nav` and `page-layout` are warnings (failures under `--strict`) and
`resource-workspace` is `info`. Opt out with `rules`
(`{ "page-layout": "off" }`) or a justified `allow` entry for one file:

```json
{ "rule": "hand-rolled-sub-nav", "file": "src/routes/_shell/onboarding.tsx", "reason": "A wizard's steps, not sections." }
```

Scanned by default: `src/**/*.{ts,tsx,js,jsx,mts,cts,css}`, skipping tests, `__fixtures__`,
`__mocks__`, `*.d.ts` and `*.gen.*`. Comments are ignored by every rule.

### Rule packs

Two packs are opt-in, so a web app is unaffected until it lists them. Turn them on explicitly
(they are not auto-detected, so adding `expo` or a `supabase/` folder never changes a build's
result on its own):

```json
{
  "doctor": {
    "packs": ["native", "supabase"],
    "native": { "routerRoot": "app" },
    "supabase": { "migrations": "supabase/migrations", "base": "origin/main", "exposedSchemas": ["public"], "since": "20260101000000" }
  }
}
```

Pack rule ids are built-in ids, so `rules` and `allow` work on them as on any other rule.
Folder settings (`routerRoot`, `migrations`) are app-relative: `./app/` is read as `app`, and
an absolute path or one leaving the app is a config error. `exposedSchemas` compares lowercased.

**`native`**, for Expo apps on `@marktiderman/genesis-ui-native`. With the pack on, the core
rules read the native package (unless `uiPackage` says otherwise) and the default scan is
`app`, `src` and `components`. The screen layouts are every component the installed native
package exports whose name ends in `Page`, `Screen` or `ScreenContainer` (`ScreenContainer`,
`SettingsPage`, `SettingsSubPage`, `NotificationsPage`, `AuthScreen`, `NativeResourcePage`, …),
so a new layout is recognized when Genesis ships it.

With the native pack on, every hex or `rgb()` literal in a script file is reported as
`native-literal-color` instead of `raw-color`, web files in a mixed repo included. Existing
`rules` and `allow` entries for `raw-color` that cover script files need the new id (CSS files
keep `raw-color`).

| Rule | Level | What it flags |
| --- | --- | --- |
| `native-raw-primitive` | error | A React Native primitive Genesis wraps, used from `react-native` (`Modal`, `ActivityIndicator`; the list in the repo's `scripts/lib/native-primitives.mjs`, shared with `check:forbidden-imports`): named and aliased imports (multi-line too), `import * as RN` then `RN.Modal`, `require("react-native").Modal`, destructured `require`, and `export { Modal } from "react-native"`. Type-only imports are fine. The message names the replacements the installed package exports. |
| `native-literal-color` | error | Hex and `rgb()/hsl()` literals in native code (the same lexer as `raw-color`, which it replaces for script files). Use a theme role (`useThemeRoles()`), a token className or `PlatformColor(...)`. |
| `native-custom-header` | warn | A file that sets `headerShown: false` and draws its own header (a `<…Header>` of the app's own, or `style={styles.header}`); a screen that draws one when the `_layout` beside it hides the navigator's; a hand-built tab bar (`tabBar={…}` in a file with `<Tabs>`, or a `<…TabBar>` of the app's own). Section headers (`SectionHeader`, `ListHeader`, `CardHeader`, …) and Genesis components don't count. Only the `_layout` in the screen's own folder is followed, not ancestors. |
| `native-screen-layout` | warn | A route screen under the router root (`native.routerRoot`, default `src/app`, else `app`) that renders no Genesis screen layout, directly or through one local import (`./`, `../`, `@/`, `~/`). `_layout`, `+html`, `+native-intent`, `+middleware`, `+api` files, re-export-only routes and `<Redirect>` routes are skipped. Also a warning when the router root is missing, or when `src` leaves it unscanned. |
| `store-readiness` | warn | Static checks of `app.json`, `app.config.json` and (as text, best-effort) `app.config.{ts,js,mjs,cjs}`. **Usage strings**: Expo applies an installed module's config plugin even when it isn't listed, with a generic default string (`Allow $(PRODUCT_NAME) to access your camera`), and App Review rejects generic purpose strings; so a module without its own sentence (`ios.infoPlist.<Key>` or the plugin option) is flagged, and `false` (Expo's opt-out) counts as set. Covered: `expo-camera`, `expo-image-picker` (photos; camera only "if the app takes photos"), `expo-media-library`, `expo-location`, `expo-av` / `expo-audio` (microphone "if the app records audio"), `expo-contacts`, `expo-local-authentication` (Face ID). **Sign in with Apple**: third-party sign-in (`@react-native-google-signin/google-signin`, `react-native-fbsdk-next`, or a Supabase `signInWithOAuth` / `signInWithIdToken` with a non-Apple provider) without Apple sign-in (`expo-apple-authentication`, or Supabase's `apple` provider). Guideline 4.8 accepts any equivalent privacy-focused login, so this is a warning to `allow` with the reason when another option qualifies; `expo-auth-session` alone doesn't trigger it (it serves non-login OAuth too). Also the export-compliance flag (`ios.config.usesNonExemptEncryption` or `ITSAppUsesNonExemptEncryption`), `ios.privacyManifests`, and a missing Expo config. Those two count as set when the [Expo config plugin](#expo-config-plugin) (`@marktiderman/genesis-cli` in `plugins`) will set them: export compliance unless `exportCompliance: false`, the privacy manifest unless `privacyManifest: false` and only when a dependency needs one. |

**`supabase`**, for `supabase/migrations/*.sql` (`supabase.migrations`). The SQL is read
statement by statement with comments removed and string (`'…'`, `E'…'`) and dollar-quoted
bodies blanked, so text inside a function body never matches; the one exception is below.

| Rule | Level | What it flags |
| --- | --- | --- |
| `migration-grants` | error / warn | In new migrations: `grant … on all functions in schema …` and `alter default privileges … grant … on functions` to `anon` or `public` (error) or `authenticated` (warn: it re-grants functions revoked from signed-in users); other roles (`service_role`, `postgres`) are fine. A function outside `exposedSchemas` granted to `anon` or `public` by name, and `grant usage on schema <unexposed> to anon/public` (error). Revokes, `revoke grant option for`, argument types and `granted by` are read correctly. Grant by name so an earlier revoke survives. |
| `migration-rls` | error | A table in an exposed schema whose row level security is off once every migration has run: never enabled, or disabled later. Renames (`alter table … rename to`, `set schema`) and drops are followed. RLS enabled by dynamic SQL (a `do $$ … execute format('alter table %I enable row level security', t) … $$` loop) can't be traced, so such a block counts as enabling it for every table created before it. |
| `migration-definer-search-path` | error | A `security definer` function or procedure without `set search_path`. Functions are keyed by name and argument types, so overloads are separate; `alter function … security definer` makes one definer, `alter function … set search_path` fixes it, and renames, replaces and drops are followed. |
| `migration-edited` | error | A `.sql` migration that already exists at the merge base with `supabase.base` (default `origin/main`) was modified, deleted or renamed. Applied migrations are never edited; add a new one. Skipped outside a git repo; a **warn** when the base ref isn't available. |

**Which migrations are new.** In a git repo with the base ref, a migration is new when it was
added, modified or is untracked since the merge base. `since` (a file name or timestamp prefix)
also trusts every file that sorts before it. Without git or the base ref (a shallow CI clone, a
Vercel build), `migration-grants` is skipped with a warning unless `since` is set, so applied
migrations never fail a build. In CI, check out with full history and fetch the base:

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- run: git fetch origin main
```

### Config

`genesis.config.json` (or `"genesis": { "doctor": { … } }` in package.json):

```json
{
  "doctor": {
    "src": ["src"],
    "ignore": ["src/routeTree.gen.ts", "src/integrations/"],
    "tokenFiles": ["src/styles.css"],
    "rules": { "starter-leftover": "off", "palette-color": "warn" },
    "allow": [
      { "rule": "raw-color", "file": "src/lib/error-page.ts", "reason": "Static fallback page rendered before Genesis mounts." }
    ],
    "rulesDoc": "DESIGN_RULES.md",
    "patterns": [
      { "id": "no-page-chrome", "files": ["src/routes/**"], "forbid": "<AppShell\\b", "message": "The shell owns the chrome." }
    ],
    "plugins": ["./scripts/genesis-rules.mjs"],
    "build": ["tsc --noEmit", "vite build"]
  }
}
```

| Key | Default | |
| --- | --- | --- |
| `packs` | | Opt-in rule packs: `"native"`, `"supabase"`. See [Rule packs](#rule-packs). |
| `native` | | `{ routerRoot }` for the native pack. |
| `supabase` | | `{ migrations, base, exposedSchemas, since }` for the supabase pack. |
| `src` | `["src"]` (`["app", "src", "components"]` with the native pack) | Folders (or files) to scan. |
| `extensions` | `.ts .tsx .js .jsx .mts .cts .css` | |
| `ignore` | | Globs to skip, added to the defaults. `*` stays in a folder, `**` crosses folders, a trailing `/` means the whole folder. |
| `uiPackage` | `@marktiderman/genesis-ui` (`@marktiderman/genesis-ui-native` with the native pack) | |
| `themeCss` | the design system's `dist/themes/*.css` + genesis-ui's styles | One stylesheet or a list: package paths (`@marktiderman/genesis-design-system/dist/themes/genesis.css`) or app paths. |
| `tokenFiles` | every scanned `.css` | Globs of app files whose `--x:` declarations count as defined tokens. Files outside `src` work too. |
| `ignoreTokenPrefixes` | `["--tw-", "--radix-"]` | |
| `rawTags` | | `{ "img": "Avatar" }` adds a mapping; `{ "select": false }` stops checking a tag. |
| `forbiddenImports` | | `{ "<regexp>": "message" }`, added to the defaults. |
| `localPrimitiveDirs` | `["src/components/ui"]` | |
| `routesDir` | first of `src/routes`, `src/app`, `app`, `src/pages`, `pages` | The web routes folder the route rules read. |
| `componentPackages` | `["@marktiderman/genesis-forms-studio"]` | Genesis packages besides `uiPackage` whose components `local-genesis-copy` and `page-layout` read (skipped when not installed). `--print-genesis` lists them under `companions`. |
| `rules` | | `{ "<rule>": "error" \| "warn" \| "info" \| "off" }` for any rule, built-in or yours. `info` is reported and never fails, `--strict` included. |
| `allow` | | Exceptions: `{ rule, file?, match?, reason }`. `match` is the exact tag, token, export name or import specifier. `reason` is required. |
| `patterns` | | Declarative rules, below. |
| `rulesDoc` | | A markdown file of declarative rules, below. |
| `plugins` | | Rule modules, below. |
| `build` | `typecheck`, `build` scripts | Commands for `--build`. |

Unknown keys are an error, so a typo can't quietly turn a check off.

### App rules

Keep app-specific conventions in the app. Three ways, from least to most code:

**Patterns** (`patterns` in config): `{ id, level?, files, exclude?, forbid?, require?, path?, message? }`.
`forbid` must not match a file (the finding points at the line), `require` must match it, `path`
must match its path. All are regular expressions; prefix `(?i)` for case-insensitive. `level` is
`error` (default), `warn`, or `guide` (documentation only, never checked).

**A rules document** (`rulesDoc`): the same rules in markdown, next to the prose that explains
them. A `### rule-id` heading starts a rule, the `- key: value` lines under it set it (`files`
and `exclude` are comma-separated), and a `#`/`##` heading ends it:

```md
## Layout

### pages-use-layouts
- level: error
- files: src/routes/_shell/*.tsx
- require: (DashboardPage|DetailPage|SettingsPage|FormPage)
- message: Signed-in pages render a Genesis page layout.
```

**Plugins** (`plugins`): a module that default-exports a plugin, an array of them, or a factory
that receives the options from `["./path.mjs", options]`. Paths resolve from the config file.

```js
// scripts/genesis-rules.mjs
/** @type {(options?: { max?: number }) => import("@marktiderman/genesis-cli/doctor").DoctorPlugin} */
export default function maxFileLength({ max = 400 } = {}) {
  return {
    name: "max-file-length",
    check({ files, report }) {
      for (const file of files) {
        const lines = file.text.split("\n").length;
        if (lines > max) report({ rule: "max-file-length", level: "warn", file: file.path, message: `has ${lines} lines; split it` });
      }
    },
  };
}
```

`check` gets `{ root, files, genesis, config, report }`. Each file has `path` (relative,
POSIX), `absolutePath`, `ext`, `text` and `code` (comments blanked, line numbers kept).
`genesis` has `components`, `exports`, `values`, `tokens`, `rawTags`, `palette` and the
version. `report({ rule, file, line?, level?, message, subject? })` records a finding; config
`rules` levels and `allow` entries apply to plugin rules exactly as to built-in ones. A plugin
that throws becomes a `plugin-error` finding rather than a crash. In TypeScript,
`defineDoctorPlugin` from `@marktiderman/genesis-cli/doctor` types the object.

### Vite

```ts
import { genesisDoctor } from "@marktiderman/genesis-cli/vite";

export default defineConfig({ plugins: [genesisDoctor()] });
```

`vite build` fails when the doctor finds errors (`genesisDoctor({ strict: true })` fails on
warnings too). `vite dev` logs problems and shows Vite's error overlay, re-checks on every
change under the app (plus `genesis.config.json` and the rules doc), shows the overlay to
browsers that connect later, and reloads once everything passes. Options: `root`, `configPath`,
`strict`, `debounceMs`. `vite` is an optional peer dependency.

### Programmatic use

```ts
import { runDoctor, formatReport } from "@marktiderman/genesis-cli/doctor";

const result = await runDoctor({ root: process.cwd(), strict: true });
if (!result.ok) throw new Error(formatReport(result));
```

### Moving from a local verify script

1. `npm i -D @marktiderman/genesis-cli` (or your package manager's equivalent).
2. Move the exceptions to `genesis.config.json` under `doctor`: scan roots to `src`, ignores to
   `ignore`, brand-bridge files to `tokenFiles`, theme stylesheet(s) to `themeCss` (usually not
   needed; both shipped theme files are read by default), every exception to `allow` with its
   reason, the rules document to `rulesDoc`.
3. Replace the script in package.json with `genesis doctor` (and `genesis doctor --build`), and
   the local Vite plugin import with `@marktiderman/genesis-cli/vite`.
4. Run `genesis doctor`, fix or `allow` what it reports (it checks `raw-color` in code as well
   as CSS, and `raw-tag` only in JSX files), then delete the old script.
