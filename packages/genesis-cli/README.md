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
| App variants | `APP_VARIANT` = `development` / `preview` / `production` (default) suffixes `ios.bundleIdentifier` and `android.package` with `.dev` / `.preview` and `name` with ` (Dev)` / ` (Preview)`, so the three install side by side. Any other value fails. A value that already ends in the suffix is left alone. Change the suffixes with `variants: { development: { id: ".debug", name: " (Debug)" } }`. | pass `variant: "production"` |
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
| `src` | `["src"]` | Folders (or files) to scan. |
| `extensions` | `.ts .tsx .js .jsx .mts .cts .css` | |
| `ignore` | | Globs to skip, added to the defaults. `*` stays in a folder, `**` crosses folders, a trailing `/` means the whole folder. |
| `uiPackage` | `@marktiderman/genesis-ui` | |
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
