# @marktiderman/genesis-product

The product system for a Genesis repo, first version: what is being built now, next and later,
what people are asking for, and release notes that tell them when it shipped.

Status: experimental and private. This repo uses it on itself first.

- **The catalog is `features.ts`.** Features, their status, `horizon` (now, next, later) and
  `claimedBy` come from the registry's generated `features.json`. There is no second list.
- **Signals are the evidence.** An idea, a piece of feedback or a bug, linked to a FeatureId, with
  an importance (1 to 3) and votes. They come from a `SignalSource`: GitHub issues today, a
  database later, with nothing above it changing.
- **Demand** is each open signal's importance (1 when unset) plus its votes. Closed signals don't
  count, so demand falls as asks are answered.

## Use it on a repo

People ask through the issue forms in `.github/ISSUE_TEMPLATE` (Idea, Feedback or bug). A 👍 on
an issue is a vote. To triage an issue, link it to a feature: put the id under **Feature**, or add
a `feature:<id>` label. `importance:low|medium|high` sets its weight.

```bash
pnpm product board                       # print the board: Now / Next / Later, top ideas, triage inbox
pnpm product board --issue               # write it to the repo's "Product board" issue (GITHUB_TOKEN)
pnpm product release --from <tag>        # draft release notes for what reached beta or live since <tag>
pnpm product release --from <tag> --notify   # also comment on and close the issues it answers
```

Reading a public repo needs no token, though an anonymous read is rate-limited. If the issues
can't be read, the board shows the catalog only. A write (`--issue`, `--notify`) never runs on a
partial read.

The `product-board` workflow refreshes the board issue every day and on demand.

## Core

```ts
import { buildBoard, renderBoard, diffRelease, renderRelease, answeredBy } from "@marktiderman/genesis-product";
import { readCatalog, githubSignals, catalogAt } from "@marktiderman/genesis-product/node";

const board = buildBoard(readCatalog(), await githubSignals({ repo: "owner/repo" }).list());
const markdown = renderBoard(board, { date: "2026-10-25" });
```

The core (`.`) has no React and no I/O. `/node` reads the catalog from a file or a git ref, maps
GitHub issues to signals, and writes the board issue and the "shipped" comments.

## Not yet

- No database source, no insights captured from support reports, and no screens: the board is
  markdown.
- No notifications beyond GitHub's own: `--notify` comments on the issue, which tells its
  author and everyone subscribed to it.
- Demand doesn't yet count each person once per feature.
