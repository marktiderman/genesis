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
genesis features check          # CI. --labels "a,b" checks a PR's feature:<id> labels
genesis features check --summary  # for a SessionStart hook: counts, stale output, expired flags, claims
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
- A route or server-function file isn't covered by any `links.code`.
- A docs path is missing.

The check only ever compares generated output with the generator, never two hand-written files.

The AGENTS.md block is a short pointer with counts, not the list. Agents run `find` and read the skill (`.claude/skills/features/SKILL.md`, which covers finding, adding, changing and retiring features, and says to remove the code before the flag).

### Settings

The CLI reads settings from `package.json`, which also needs `"genesisFeatures"`. Command-line options win.

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

Other settings: `agents`, `claude`, `json`, `openfeature`, `skill` (each a path, or `false`), `scan`, `tests`, `coverageIgnore`, `changesets`, `reviewDays`.

The CLI loads TypeScript itself, so the registry needs no build step. Keep its imports to packages, with no path aliases.

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
