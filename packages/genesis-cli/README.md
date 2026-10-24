# @marktiderman/genesis-cli

```bash
npx @marktiderman/genesis-cli init <consumer>
```

Scaffolds a Genesis consumer: a brand package, Tailwind and tokens.

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
| `--strict` | Fail on warnings too. |
| `--json` | Print `{ ok, genesis, errors, warnings, findings, unused }`. Build output is captured, not streamed. |
| `--build` | After the checks, run `doctor.build` commands, or the app's `typecheck` then `build` scripts. A build that itself runs the doctor doesn't recurse. |
| `-c, --config <path>` | Config file. Default: `genesis.config.json`, then the `genesis` key of package.json. |
| `-d, --dir <dir>` | The app's folder (default: cwd). |
| `--print-genesis` | Print the components, tokens, raw tags and palette read from Genesis, and exit. |

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
| `stale-exception` | warn | An `allow` entry that no longer matches anything. |

It also prints **Available but unused**: the Genesis components no file imports. Check it
before building something.

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
    "supabase": { "migrations": "supabase/migrations", "base": "origin/main", "exposedSchemas": ["public"] }
  }
}
```

Pack rule ids are built-in ids, so `rules` and `allow` work on them as on any other rule.

**`native`**, for Expo apps on `@marktiderman/genesis-ui-native`. With the pack on, the core
rules read the native package (unless `uiPackage` says otherwise) and the default scan is
`app`, `src` and `components`. The screen layouts are every component the installed native
package exports whose name ends in `Page`, `Screen` or `ScreenContainer` (`ScreenContainer`,
`SettingsPage`, `SettingsSubPage`, `NotificationsPage`, `AuthScreen`, `NativeResourcePage`, …),
so a new layout is recognized when Genesis ships it.

| Rule | Level | What it flags |
| --- | --- | --- |
| `native-raw-primitive` | error | A React Native primitive Genesis wraps imported from `react-native` (`Modal`, `ActivityIndicator`; the list in the repo's `scripts/lib/native-primitives.mjs`, shared with `check:forbidden-imports`). Multi-line and aliased imports count. The message names the replacements the installed package exports. |
| `native-literal-color` | error | Hex and `rgb()/hsl()` literals in native code (the same lexer as `raw-color`, which it replaces for script files). Use a theme role (`useThemeRoles()`), a token className or `PlatformColor(...)`. |
| `native-custom-header` | warn | A file that sets `headerShown: false` and renders its own header (a non-Genesis `<…Header>` element or `styles.header`), or a hand-built tab bar (`<Tabs tabBar={…}>`, a `<…TabBar>` of the app's own). Use `ScreenContainer`'s header props, and the router's native tab bar. |
| `native-screen-layout` | warn | A route screen under the router root (`native.routerRoot`, default `src/app`, else `app`) that renders no Genesis screen layout, directly or through one local import (`./`, `../`, `@/`, `~/`). `_layout`, `+html`, `+native-intent`, `+middleware`, `+api` files, re-export-only routes and `<Redirect>` routes are skipped. |
| `store-readiness` | error / warn | Static checks of `app.json`, `app.config.json` and (as text, best-effort) `app.config.{ts,js,mjs,cjs}`: **error** when third-party sign-in (`expo-auth-session`, `@react-native-google-signin/google-signin`, `react-native-fbsdk-next`, or Supabase `signInWithOAuth` / a non-Apple `signInWithIdToken` in the scanned code) has no `expo-apple-authentication` (guideline 4.8), and when an installed module has no iOS usage string, either `ios.infoPlist.<Key>` or the module's plugin option (`expo-camera`, `expo-image-picker`, `expo-media-library`, `expo-location`, `expo-av`, `expo-audio`, `expo-contacts`); **warn** when neither `ios.config.usesNonExemptEncryption` nor `ITSAppUsesNonExemptEncryption` is set, when `ios.privacyManifests` is missing, and when there's no Expo config at all. |

**`supabase`**, for `supabase/migrations/*.sql` (`supabase.migrations`). The SQL is read
statement by statement with comments removed and string and dollar-quoted bodies blanked, so
text inside a function body never matches.

| Rule | Level | What it flags |
| --- | --- | --- |
| `migration-grants` | error | In new or changed migrations: `grant … on all functions in schema …`, `alter default privileges … grant … on functions`, and a `private.*` function granted to `anon` or `public`. Grant by name so an earlier revoke survives; blanket revokes are fine. |
| `migration-rls` | error | A table created in an exposed schema (`supabase.exposedSchemas`, default `public`) that no migration enables row level security on (and doesn't drop). |
| `migration-definer-search-path` | error | A `security definer` function or procedure without `set search_path`, unless a later migration runs `alter function … set search_path` or replaces it. |
| `migration-edited` | error | A migration that already exists at the merge base with `supabase.base` (default `origin/main`) was modified, deleted or renamed. Applied migrations are never edited; add a new one. Skipped outside a git repo; a **warn** when the base ref isn't available (fetch it in CI). |

"New or changed" comes from git: files added, modified or untracked since the merge base with
`supabase.base`. Outside a git repo, or without the base ref, every migration counts as new.

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
| `supabase` | | `{ migrations, base, exposedSchemas }` for the supabase pack. |
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
| `rules` | | `{ "<rule>": "error" \| "warn" \| "off" }` for any rule, built-in or yours. |
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
