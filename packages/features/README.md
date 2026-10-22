# @marktiderman/genesis-features

A repo's features in one typed code file that running code imports. Every
other format (the AGENTS.md block, a JSON copy, the admin page) is generated
from it, and `genesis features check` fails CI when a generated copy is stale.

Phase 1 is deliberately small: one flat file per repo. No database, no sync,
no hierarchy.

## The registry

```ts
// src/features.ts
import { defineFeatures, type FeatureIdOf } from "@marktiderman/genesis-features";

export const features = defineFeatures({
  tasks: {
    name: "Tasks",
    summary: "Coach and client both add and check off next steps.",
    status: "live", // planned | building | beta | live | retired
    owner: "mark",
    apps: ["web"],
    audience: ["client", "coach"],
    since: "2026-09",
    links: { code: ["src/components/workspace/TasksPanel.tsx"], docs: ["docs/tasks.md"], issue: "#42" },
  },
});

export type FeatureId = FeatureIdOf<typeof features>;
```

`defineFeatures` validates every entry with Zod (unknown fields, bad dates and
paths that leave the repo are errors), lists every problem at once, and returns
the same object, so code reads `features.tasks.status` directly. Use
`FeatureId` wherever code names a feature, so a typo is a type error.

## Flags

```ts
import { defineFlags } from "@marktiderman/genesis-features";
import { features } from "./features";

export const flags = defineFlags(features, {
  tasks_v2: { feature: "tasks", owner: "mark", kind: "release", expires: "2026-12-01" },
  tasks_kill: { feature: "tasks", owner: "mark", kind: "ops", splitReason: "a kill switch outlives the rollout" },
});
```

- `feature` must be a `FeatureId`: an unknown one is a type error (and a runtime error).
- Flags are grouped by feature. A feature's second flag needs a `splitReason`.
- Every flag needs an `owner`; a `release` flag needs an `expires` date.
- A feature's flags are found by reverse lookup (`flagsForFeature`), never written on the feature.

## Generated output

```bash
genesis features build   # writes the marked block in AGENTS.md (and --json <file>)
genesis features check   # CI: fails on stale output or a links.code path that doesn't exist
```

Options: `--registry <file>` (default `src/features.ts`, then `features.ts`),
`--flags <file>` (a file exporting `flags`; default the registry's own
`flags` export), `--agents <file>` / `--no-agents`, `--json <file>`, `-d <dir>`.
The CLI loads TypeScript itself, so the registry needs no build step; keep its
imports to packages (no path aliases).

`check` compares generated output with what the generator makes now, and only
inside the `<!-- genesis-features:start -->` / `end` markers. It never compares
two hand-written files. Expired release flags print a warning.

The same functions are exported for scripts: `toJson`, `toAgentsMarkdown`,
`replaceAgentsBlock` (root) and `buildFeatureOutputs` / `checkFeatureOutputs`
(`/node`).

## The page

```tsx
import { FeatureList } from "@marktiderman/genesis-features/react";
import { features } from "@/features";
import { flags } from "@/lib/flags";

<FeatureList features={features} flags={flags} pathHref={(p) => `https://github.com/acme/app/blob/main/${p}`} />
```

A genesis-ui `ResourcePage` over static data: a table, and in its grid view a
board grouped by status (`KanbanBoard`), with status chips (`StatusBadge`),
filters by app and audience, search, and a detail panel with links and flags.
genesis-ui, React and lucide-react are optional peers, needed only by `/react`.
Gate the route yourself (an admin page, say); the component shows whatever it
is given.
