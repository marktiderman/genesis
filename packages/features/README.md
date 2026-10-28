# @marktiderman/genesis-features

A repo's features in one typed code file that running code imports. Every other format (the
AGENTS.md pointer, `features.json`, an OpenFeature `flags.json`, the agent skill, a README
section, the admin page) is generated from it, and `genesis features check` fails CI when a
generated copy is stale or the registry and the code disagree.

Phase 1 is deliberately small: one flat file per repo. No database, no sync, no hierarchy.

## The registry

```ts
// src/features.ts
import { defineFeatures, type FeatureIdOf } from "@marktiderman/genesis-features";

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
import { defineFlags } from "@marktiderman/genesis-features";
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

## The gate

`featureOn(registry, context, id)` answers "is this feature on here?" the same way everywhere. Checks
run in a fixed order and the first "no" wins: **status** (beta, live or deprecated), **platform**, **tenant**
(switched off), **flag** (each boolean release flag must be exactly `true`) and last **entitlement** (for
`access: { plan }`), so an upgrade prompt only appears when paying is the one thing missing. The answer
carries the reason, and for a paid feature the plan that unlocks it.

```ts
import { featureOn, gateSnapshot, isSnapshotStale, requireFeature } from "@marktiderman/genesis-features/gate";

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
import { FeatureGate, FeatureGateProvider, useFeature } from "@marktiderman/genesis-features/gate/react";

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
go. `@marktiderman/genesis-features/blocks` has no zod in it, so it ships to phones (the root
re-exports it).

```ts
import { defineBlock, resolveBlocks } from "@marktiderman/genesis-features/blocks";
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
import { contentPackProblems, defineBlock, defineContentPack } from "@marktiderman/genesis-features/blocks";

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
import { FeatureList } from "@marktiderman/genesis-features/react";

<FeatureList features={features} flags={flags} pathHref={(p) => `https://github.com/acme/app/blob/main/${p}`} />
<FeatureList features={features} variant="marketing" title="What it does" />
```

The default view is a genesis-ui `ResourcePage` over static data:

- A table, and in its grid view a board grouped by status (`KanbanBoard`).
- Status chips (`StatusBadge`), plus filters by app, audience and visibility.
- A detail panel with links, acceptance and flags.
- Planned work stays off the list and shows on the roadmap (Now, Next, Later) below it.

`variant="marketing"` shows public, shipped features that have a tagline, as cards: highlights first, then grouped by category.

genesis-ui (2.7.0 or later), React and lucide-react are optional peers, needed only by `/react`. Gate the route yourself; the component shows whatever it is given.
