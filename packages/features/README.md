# @marktiderman/genesis-config

> Formerly `@marktiderman/genesis-features`, renamed in place (same source, same subpaths, same
> formats). The old name is a deprecated re-export for two minor versions
> ([packages/features-alias](../features-alias/README.md)); `genesis upgrade` moves an app's imports.

A repo's features in one typed code file that running code imports. Every other format (the
AGENTS.md pointer, `features.json`, an OpenFeature `flags.json`, the agent skill, a README
section, the admin page) is generated from it, and `genesis features check` fails CI when a
generated copy is stale or the registry and the code disagree.

Phase 1 is deliberately small: one flat file per repo. No database, no sync, no hierarchy.

## The registry

```ts
// src/features.ts
import { defineFeatures, type FeatureIdOf } from "@marktiderman/genesis-config";

export const features = defineFeatures({
  tasks: {
    name: "Tasks",
    summary: "Coach and client both add and check off next steps.", // internal, one sentence
    status: "live", // planned | building | beta | live | deprecated | retired
    owner: "mark",
    apps: ["web"],
    audience: ["client", "coach"],
    acceptance: ["A client can tick off a task their coach added."], // required on beta and live
    visibility: "customer", // internal | customer | public | client:<name>
    access: "all", // or { plan: "pro" }: the id is the entitlement's lookup key
    reviewedAt: "2026-10-22",
    links: { code: ["src/components/TasksPanel.tsx"], docs: ["docs/tasks.md"], issue: "#42" },
    tagline: "Never lose a next step.", // with visibility "public": marketing output
    category: "Coaching",
  },
  billing: { name: "Billing", summary: "…", status: "planned", horizon: "next", /* … */ },
});

export type FeatureId = FeatureIdOf<typeof features>;
```

`defineFeatures` validates every entry with Zod and lists every problem at once:

- Unknown fields, bad dates and paths that leave the repo are errors.
- `planned` needs a `horizon` (now, next, later), and only planned or building features may have one. That's the roadmap, with no dates.
- `beta` and `live` need `acceptance`.
- `claimedBy` is only for `building`.
- Ids and `aliases` are unique.

It returns the same object, so code reads `features.tasks.status` directly. Name features by `FeatureId` everywhere, so a typo is a type error.

Ids are permanent. `check` and `build` refuse when an id recorded in `features.json` disappears. Retire a feature with `status: "retired"`, and rename one through `aliases`.

## Flags

```ts
import { defineFlags } from "@marktiderman/genesis-config";
import { features } from "./features";

export const flags = defineFlags(features, {
  "tasks.v2": { feature: "tasks", kind: "release", owner: "mark", default: false, scopes: ["platform", "user"], expires: "2026-12-01" },
  "tasks.kill": { feature: "tasks", kind: "ops", owner: "mark", default: true, scopes: ["platform"],
                  runbook: "docs/runbooks/tasks.md", splitReason: "a kill switch outlives the rollout" },
});
```

- `feature` must be a `FeatureId`: an unknown one is a type error and a runtime error.
- Flags are grouped by feature, so a feature's second flag needs a `splitReason`.
- `release` and `experiment` flags need `expires`, and `ops` flags need a `runbook`.
- A `permission` flag fails `check`, because paid access is `access`, not a flag.
- `check` scans the code for flag reads through the accessors (default `useFlag(…)`, `getFlag(…)` and `<Flag name=…>`; set them with `flagAccessors`). It fails on:
  - a computed key;
  - a key that is read but not defined, or defined but never read;
  - a flag past its `expires` date.

## Generated output and the check

```bash
genesis features build          # AGENTS.md pointer, features.json, flags.json, the skill, the marketing block; @AGENTS.md in CLAUDE.md
genesis features check          # CI. --labels "a,b" checks a PR's feature:<id> labels; --prs reads merged PRs with gh
genesis features check --summary  # for a SessionStart hook: counts, stale output, expired flags, planned-but-shipped, claims
genesis features find <term>    # search ids, aliases, names, summaries, flags and code paths
```

**Errors fail the check:**

- Generated output is stale.
- A `links.code` path doesn't exist.
- A flag breaks one of the rules above.
- An id was removed.
- A feature tag names an unknown id: `@feat:<id>` in tests, `Features: <id>` in a changeset's body, or `feature:<id>` on a PR.
- CLAUDE.md has no `@AGENTS.md` line.

**Warnings don't fail it:**

- A review is due: `reviewedAt` is over 90 days old, or missing.
- A live feature has no test tagged with its `@feat:<id>`.
- A feature is still `planned`, but shipped work is tagged with it: a changeset with `Features: <id>`, or (with `--prs`) a merged PR labelled `feature:<id>`. The warning names each one, e.g. "billing is still planned, but .changeset/x.md and PR #123 shipped work for it". `--prs` asks `gh pr list --state merged --label feature:<id>` for each planned id and alias; when `gh` is missing or fails, you get one warning and only changesets count. From code, pass the PRs yourself as `checkFeatureOutputs({ …, evidence: { prs: { billing: [{ number, title }] } } })`.
- A route or server-function file isn't covered by any `links.code`.
- A docs path is missing.

The check only ever compares generated output with the generator, never two hand-written files.

The AGENTS.md block is a short pointer with counts, not the list. Agents run `find` and read the skill (`.claude/skills/features/SKILL.md`, which covers finding, adding, changing and retiring features, and says to remove the code before the flag).

### Settings

The CLI reads settings from the `features` block of `genesis.config.json` (the app's one Genesis config, beside `doctor`), or from `"genesisFeatures"` in `package.json`. Command-line options win, then `genesis.config.json`.

```json
"genesisFeatures": {
  "registry": "src/features.ts",
  "flagsFile": "src/lib/flags/registry.ts",
  "command": "bun run features",
  "marketing": "README.md",
  "flagAccessors": ["useFlag", "flag", "<Flag name>"],
  "coverage": ["src/routes/**/*.tsx", "**/*.functions.ts"]
}
```

Other settings: `agents`, `claude`, `json`, `openfeature`, `skill` (each a path, or `false`), `scan`, `scanIgnore`, `tests`, `coverageIgnore`, `changesets`, `reviewDays`.

The flag scan ignores comments and test files. List the flags runtime itself (the files that define the accessors and read by variable) in `scanIgnore`; setting it replaces the default test globs, so include those too.

The CLI loads TypeScript itself, so the registry needs no build step. Keep its imports to packages, with no path aliases.

## App settings

Every package declares its settings next to its `defineBlock`, and the app resolves them through
one resolver on the server, the web and phones (`@marktiderman/genesis-config/settings`, free of
zod; also on the root).

```ts
import { defineSettings, resolveSettings, settingsCatalogue, withSettings } from "@marktiderman/genesis-config/settings";

export const supportSettings = defineSettings("support", {
  messenger: { type: "boolean", default: { max: true, standard: true, min: false }, scope: "tenant", feature: "support-messenger" },
  agentDesk: { type: "boolean", default: { max: true, standard: true, min: false }, requires: ["support.inbox"] },
  inbox: { type: "boolean", default: true },
  dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
  githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", store: "edge", setup: "github.issues" },
  sentryDsn: { type: "string", default: null, applies: "build" },
});

const catalogue = settingsCatalogue([supportSettings]);
const settings = resolveSettings(catalogue, { preset: "max", file, database, tenant, person });
settings.values["support.dumpRetentionDays"]; // 90
settings.sources["support.messenger"]; // { layer: "tenant" }
const ctx = withSettings({ platform: "web" }, catalogue, settings); // for featureOn
```

Each key has a `type` (`boolean`, `number`, `string`, `list`, `object`) and a `default`, or one per
preset (`{ max, standard, min }`). `scope` (`app`, the default, `tenant` or `person`) is the lowest
layer that may change it; `applies` is `runtime` (the default) or `build` (a new binary or bundle).
`requires` links other keys, `min`, `max` and `options` bound the value, and `needs:
"secret:NAME"` names the secret it needs and `store` where it lives (`vault`, `edge`, `server-env`
or `ci`): never its value. `feature` and `flag` link the key to the gate. A number with
`integer: true` takes whole numbers only (in every layer, and in the database).

**The layers**, low to high. A later layer wins unless an earlier one locked the value
(`{ value, locked: true }`):

1. **default**: the declared default (for a per-preset one, `max`'s);
2. **preset**: `max` (Genesis's default: everything on), `standard` or `min`, chosen in
   genesis.config.json (`"preset"`) but resolved as its own layer;
3. **file**: genesis.config.json `settings` (`settingsLayerFromFile`), the only layer that sets a
   build-time key;
4. **database**: the app's `genesis_settings` table (genesis-supabase's `settings` block);
5. **tenant**: only keys declared `scope: "tenant"`;
6. **person**: only keys declared `scope: "person"`.

Which layers may set each scope is one table, `SCOPE_LAYERS`. A lock always holds: a locked entry
whose own value is bad keeps the value from below and still locks it. `null` ("not set") is a value
only for a key whose default is `null`.

`resolveSettings` never throws: it skips a bad entry and reports it in `problems` (an unknown
key, a value of the wrong type or out of bounds, a tenant or person value for a key without that
scope, a runtime layer setting a build-time key, a change to a locked value, an unknown preset,
which resolves on `max`). A key on while one it requires is off keeps its value: that problem is
only reported. Every map it returns has no prototype,
so a key such as `__proto__` or `constructor` is just an unknown key. `sources` says which layer set each value and which locked it.

**Reading a result.** `values`, `sources` and the maps `settingsGateContext` returns have no
prototype, so they have no `hasOwnProperty` (or `toString`) of their own: `values.hasOwnProperty(k)`
throws. Read a key directly (`values["support.messenger"]`), test it with `k in values` or
`Object.prototype.hasOwnProperty.call(values, k)`, and copy one with `{ ...values }` if you need an
ordinary object.

**The gate.** A boolean key linked with `feature` that resolves to `false` puts the feature in
`GateContext.settingsOff` (`featureOn` answers `reason: "setting"`), and a key linked with `flag`
gives the flag its value when the context has none (`withSettings`, `settingsGateContext`). A key the
app locked (genesis.config.json or the database, `APP_LOCK_LAYERS`) wins over the context: the
tenant's switch can't turn off a feature locked on, nor the context's flag change a locked flag. A
tenant or person lock only stops later settings layers; it never beats a platform flag, an
entitlement or (for a person) the tenant's switch. It is the same gate, with one more check.

**Two keys switching one feature.** Nothing stops two keys from naming the same `feature` (say a
package's `messenger` and `helpCenter` both linked to its help desk). Then either key resolving to
`false` switches the feature off: `off` is "any linked key is false", never "the last one wins". A
lock on either key keeps the tenant's switch from turning the feature off. Link one key per feature
unless "off when any of them is off" is what you mean.

**Packages without running them.** A package also lists its declaration in package.json
(`genesis.settings`: `{ "namespace": …, "keys": { … } }`, read with `settingsFromManifest`), so
`genesis doctor` checks an app's genesis.config.json against the installed packages
(`invalid-setting`, `setting-requires`, and `setup-incomplete` and `secret-missing` for keys with a
`setup` step or a secret they `needs`, checked by name only). `catalogueManifest` is the catalogue as the database checks values against it.

### The Settings screen

One screen, two hosts: the localhost wizard (`genesis setup`) and the app's own platform-admin
page. `<GenesisSettings>` (`@marktiderman/genesis-config/settings/react`, Beta) draws it, and talks to its
host only through a `SettingsClient` (`@marktiderman/genesis-config/settings-protocol`, Beta, free of zod
and React).

**Beta.** The screen ships before the maintainer's design review: its look, copy keys and props may
change in a minor release.

```tsx
import { APP_HOST_CAPABILITIES, createSettingsClient } from "@marktiderman/genesis-config/settings-protocol";
import { GenesisSettings } from "@marktiderman/genesis-config/settings/react";

declare const accessToken: () => string | null;

const client = createSettingsClient(fetch, { baseUrl: "/api/genesis/settings", token: accessToken });

export function PlatformSettings() {
  return <GenesisSettings client={client} capabilities={APP_HOST_CAPABILITIES} />;
}
```

**Tabs.** Values (every key grouped by package, with its value, the layer it came from and its
lock), Health (the doctor's findings, each with its fix), Secrets (each secret's name, store and
whether it is set: never its value), Upgrades (installed and latest versions, release notes) and
Audit (the history of changes, a page at a time).

**What it may write.** The host reports its `capabilities` (`writeFiles`, `writeDatabase`,
`setSecrets`, `runCli`, `agent`, and optionally `proposeChanges`), and the `capabilities` prop can
only narrow them: a key the prop leaves out doesn't narrow, only `false` does
(`intersectCapabilities`). `settingWritability` holds the rules for the screen and a host's
handler alike: a build-time key is written only in the file layer; the file layer needs
`writeFiles`, the database layer `writeDatabase`; a key a lower layer locked can't be changed above
it.

- **The CLI host** writes the file layer by default (`preferredWriteLayer`), since it is reviewed
  like code; the database is an explicit choice in the edit sheet, except for a value that already
  comes from the database, which opens on the database. Writing a layer below the one
  the value comes from shows that the higher layer overrides it.
- **The app host** (`APP_HOST_CAPABILITIES`) edits runtime keys in the database layer only. A
  build-time key, or one the file layer locked (the lock lives in the file), shows "Change in repo"
  with the genesis.config.json change to commit (`settingFileSnippet`), or a pull request when the
  host can open one (`proposeChanges`).
- **Secrets** are set per store: `setSecrets` is `true` (every store) or `{ vault?, edge?,
  "server-env"?, ci? }` (`canSetSecret`). The app host may set and rotate Vault secrets only, when
  the host itself reports `{ vault: true }` (`APP_HOST_CAPABILITIES` is a mask that allows it but
  doesn't grant it): the `setSecret` op is write-only, the value is never returned, and the screen
  drops it once sent. Other stores are set from a terminal with `genesis fix secrets.set`. The host side comes with the
  app's settings handler.

**Fixes.** An automatic fix is planned first (`plan`): the screen shows the files it writes (with
a diff), the commands it runs, the settings layers it writes and the secrets it needs, asks to
confirm, then applies it with the plan's `hash` (`apply(fixId, expect)`). A host refuses a plan
that changed in between (`stale_plan`), and the screen offers to plan again. A plan needing more
than the host can do shows its `genesis fix <id>` command instead. The app host applies a fix only
when it writes the database layer and nothing else (`databaseOnly` on the fix, `layers` on the
plan). A guided fix opens its setup step (`onOpenStep`), or shows its `genesis fix <id>` command (the
wizard's `genesis setup --step <id>` isn't available yet); a manual
fix shows its instructions. Links (`href`, `notesUrl`) are followed only when `http:`, `https:` or
on the same site (`safeHref`).

**What a host must redact.** The screen never draws a secret's value: the Secrets tab shows names
and status only, and the audit history draws `before` and `after` only for a `set` or `clear` of a
catalogue key that needs no secret (`auditValuesVisible`). Free text is drawn as given, so a host
redacts secrets from it: a finding's `message`, a plan's `summary`, `why`, diffs and command
`args`, an apply's `message`, and an audit entry's `summary`.

**Audit.** The history is drawn as rows, a page at a time through the protocol's cursor, not as a
`ResourceView`: a ResourceView needs a `GenesisProvider` with a data provider and pages through
it, and this screen has neither (the wizard host has no app around it). It moves to a ResourceView
over a client-side source when ResourceView can take a cursor-paged source without a provider.
When `state` carries no `audit`, the tab fetches the first page itself.

**The protocol.** One endpoint, `POST`, JSON only, a bearer token and no cookies
(`credentials: "omit"`), every request `{ v, op, … }` (`SETTINGS_PROTOCOL_VERSION`). The ops are
`state`, `setValue`, `clearValue`, `plan`, `apply`, `upgrades`, `audit`, `propose` and `setSecret`
(`SETTINGS_OPS`, answers in `SettingsResponses`). A failure is `{ error: { code, message } }`,
thrown by the client as a `SettingsProtocolError` whose `code` is `bad_request`, `unauthenticated`,
`forbidden`, `unsupported`, `locked`, `stale_plan`, `not_found`, `version` or `error`. A host
answers an op it doesn't know (one a newer screen sends) with `unsupported`, so the screen can tell
"not here" from a bad request. The client
gives up after `timeoutMs` (default 30 seconds), refuses a response that isn't JSON, and refuses a
`state` without its lists or capabilities. Its own messages are in `messages`
(`SETTINGS_CLIENT_MESSAGES`).

Every word on the screen is in `copy` (defaults: `GENESIS_SETTINGS_COPY`), accessible names
included; a host's error messages are shown as the host wrote them. Every element a test or an
agent drives has a `data-testid` under the `testID` prefix (default `genesis-settings`). Pass
`header={false}` when the host page owns the title (under `AppShellPageHeader`).

## The gate

`featureOn(registry, context, id)` answers "is this feature on here?" the same way everywhere. Checks
run in a fixed order and the first "no" wins: **status** (beta, live or deprecated), **platform**, **setting**
(a setting switched it off, through `withSettings`), **tenant** (switched off), **flag** (each boolean release flag must be exactly `true`) and last **entitlement** (for
`access: { plan }`), so an upgrade prompt only appears when paying is the one thing missing. The answer
carries the reason, and for a paid feature the plan that unlocks it.

```ts
import { featureOn, gateSnapshot, isSnapshotStale, requireFeature } from "@marktiderman/genesis-config/gate";

const context = { platform: "web", entitlements: ["form-webhook-delivery"], off: ["library"], flags: { "sms.release": true } };
featureOn({ features, flags }, context, "library"); // { on: false, reason: "tenant" }

// Server functions refuse whatever the reason: FeatureOff has status 402 (entitlement) or 403.
requireFeature({ features, flags }, context, "form-webhook-delivery");

// The server hands the client every shipped feature's answer: plain JSON with `at` (and `version`).
const snapshot = gateSnapshot({ features, flags }, context, { version: buildVersion });
// A client keeps it, and replaces it when stale, after sign-in or a tenant switch, or after a refusal.
if (isSnapshotStale(snapshot, 5 * 60_000)) refresh();
```

`/gate` has no zod, React, Node built-ins or DOM globals, so it ships to browsers, extension service workers,
phones and edge functions. Context id sets are lists, Sets or functions (not iterators or strings). In React (web and React
Native), `/gate/react` reads the server's snapshot:

```tsx
import { FeatureGate, FeatureGateProvider, useFeature } from "@marktiderman/genesis-config/gate/react";

<FeatureGateProvider snapshot={snapshot}>
  <FeatureGate feature="form-webhook-delivery" upsell={({ unlock }) => <Upgrade plan={unlock.plan} />}>
    <WebhookSettings />
  </FeatureGate>
</FeatureGateProvider>;
```

A feature that `requires` other features in the registry (a module's parts) is off while any of them is off,
with `via` naming the one that said no, so switching a module off or not paying for it turns its parts off
too. Ids outside the registry don't gate.

The gate doesn't check roles: "may this person" stays with roles and row security. Why it works this
way: [ADR 0001](../../docs/adr/0001-one-feature-gate.md).

## Blocks

A block is a feature an app adds whole: account, push, observability, support, updates. It is
declared once, by its FeatureId, with what it needs and what it contributes. The app shell, the
navigation tree and Settings read the contributions by FeatureId; the app still decides where they
go. `@marktiderman/genesis-config/blocks` has no zod in it, so it ships to phones (the root
re-exports it).

```ts
import { defineBlock, resolveBlocks } from "@marktiderman/genesis-config/blocks";
import type { FeatureId } from "./features";

export const supportBlock = defineBlock<FeatureId>({
  id: "support",
  requires: ["account"], // other blocks, or app features that aren't blocks
  platforms: ["web", "native"], // default: everywhere
  contributes: {
    nav: [{ id: "help", label: "Help", path: "/help" }],
    settings: [{ id: "contact-support", section: "about", title: "Contact support", href: "/support" }],
    routes: [{ path: "/support", signedIn: true }],
    slots: { fatal: SupportFatalScreen }, // fills the host shell's slots; the app's own slots win
    migrations: [{ package: "@acme/support", file: "migrations/0001_support.sql" }],
    skills: [".claude/skills/support/SKILL.md"],
    privacy: { collects: [{ type: "email address", purposes: ["app functionality"], linked: true, tracking: false }] },
  },
});

const blocks = resolveBlocks([accountBlock, supportBlock], enabledIds, { platform: "native", features });
blocks.nav; // [{ feature: "support", id: "help", … }]: place them in your nav tree
blocks.settings; // by `order`, then dependency order
blocks.dropped; // with { missing: "drop" }: what was left out and why
```

`defineBlock` validates one block and freezes it. `resolveBlocks(blocks, enabled?, options?)`
takes the blocks that exist, the ids that are on (a list, a predicate, or every block when left
out) and returns the enabled ones in dependency order with their contributions merged, each tagged
with its `feature`. It throws a `BlockError` listing every problem at once:

- a bad id, a block requiring itself, an unknown contribution key, a duplicate id;
- a cycle through `requires` (the registry's own check, from `graph.ts`);
- with `features` (the registry), a block id or requirement that isn't a feature;
- an enabled block whose requirement is off, or doesn't run on `platform`. With `missing: "drop"` the
  block (and everything needing it) is left out instead and listed in `dropped`: for switches that
  change at run time, such as a tenant turning a feature off;
- two enabled blocks contributing the same nav entry, Settings row, route or slot, or (with `slots`)
  a fill for a slot the host doesn't have.

A requirement that isn't one of the blocks is a feature the app owns: it is met only when
`enabled` lists it, so a block that was never passed is an error, not a silent pass. With `slots`
(the host's slot names), a fill for any other slot is an error too.

Blocks shipped so far: `createUpdates(…)` (`app-updates`, in `@marktiderman/genesis-native/updates`),
`accountBlock` and `tenantFeaturesBlock` (in `@marktiderman/genesis-supabase`).
`<GenesisNativeApp blocks={…}>` runs them; see that package's README.

## Content packs

A content pack is versioned data that fills installed blocks: whatever those blocks hold (meeting types,
templates, checklists, forms) plus labels. Packs are code: the publishing package exports them, and an
installer copies them into a tenant's editable rows, keeping each row's source (pack, version, key) so an
update can tell what someone changed.

A pack's `sections` are keyed by the block that owns them. Genesis checks what every pack shares; what an
item holds is the block's business, checked by the validator it registers as `contributes.contentSection`:

```ts
import { contentPackProblems, defineBlock, defineContentPack } from "@marktiderman/genesis-config/blocks";

export const meetingsBlock = defineBlock({
  id: "meetings",
  contributes: {
    // Returns every problem with this block's items in a pack.
    contentSection: (items) =>
      (items as { key: string; minutes?: number }[]).filter((m) => !((m.minutes ?? 0) > 0)).map((m) => `${m.key}: minutes must be more than 0`),
  },
});

export const weeklyTeamRhythm = defineContentPack(
  {
    id: "weekly-team-rhythm",
    name: "Weekly team rhythm",
    version: "1.0.0",
    publisher: "@acme/content",
    requires: ["meetings"],
    labels: { "project.phase": "Stage" },
    sections: { meetings: [{ key: "weekly", name: "Weekly meeting", minutes: 60 }] },
  },
  { blocks: [meetingsBlock] },
);

contentPackProblems(weeklyTeamRhythm, { installed: installedBlockIds, blocks: [meetingsBlock] }); // [] when it can be installed
```

`defineContentPack` lists every problem at once: ids, semver versions, publisher, label keys, item keys
(unique per section, stable across versions), every block validator's problems, and any section whose
block `requires` doesn't list. `contentPackProblems(pack, installedBlockIds)` still takes the installed
blocks alone; `{ validators: { meetings: fn } }` gives validators by block id instead of blocks.

The typed sections packs had before (`sessionTypes`, `metricTemplates`, `fieldDefinitions`, `forms`,
`roadmapTemplates`) still work and are checked as before, but are deprecated: put that data in `sections`
under the block that owns it.

## The page

```tsx
import { FeatureList } from "@marktiderman/genesis-config/react";

<FeatureList features={features} flags={flags} pathHref={(p) => `https://github.com/acme/app/blob/main/${p}`} />
<FeatureList features={features} variant="marketing" title="What it does" />
```

The default view is a genesis-ui `ResourcePage` over static data:

- A table, and in its grid view a board grouped by status (`KanbanBoard`).
- Status chips (`StatusBadge`), plus filters by app, audience and visibility.
- A detail panel with links, acceptance and flags.
- Planned work stays off the list and shows on the roadmap (Now, Next, Later) below it.

`variant="marketing"` shows public, shipped features that have a tagline, as cards: highlights first, then grouped by category.

genesis-ui (3.0.0 or later), React and lucide-react are optional peers, needed only by `/react` and `/settings/react`. Gate the route yourself; the component shows whatever it is given.
