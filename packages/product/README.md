# @marktiderman/genesis-product

The product system for a Genesis repo, first version: what is being built now, next and later,
what people are asking for, and release notes that tell them when it shipped.

Status: experimental and private. This repo uses it on itself first. It is private on purpose:
publishing it means flipping `private`, setting a hand-made first version and the owner's first
`npm publish` and `npm trust` (see docs/RELEASING.md), so it can't reach npm by accident.

- **The catalog is `features.ts`.** Features, their status, `horizon` (now, next, later) and
  `claimedBy` come from the registry's generated `features.json`. There is no second list.
- **Signals are the evidence.** An idea, a piece of feedback or a bug, linked to a FeatureId, with
  an importance (1 to 3) and votes. They come from a `SignalSource`: GitHub issues today, a
  database later, with nothing above it changing.
- **Demand** is each open signal's importance (1 when unset) plus its votes. Closed signals don't
  count, so demand falls as asks are answered.

## Use it on a repo

People ask through the issue forms in `.github/ISSUE_TEMPLATE` (Idea, Feedback or bug). A 👍 on
an issue is a vote: one per person, not counting the issue's author or bots.

To triage an issue, a triager links it to a feature with a `feature:<id>` label. The id a sender
types under **Feature** is only a suggestion, shown in the triage inbox: anyone can open an issue,
so only a label (which only triagers can add) counts toward demand or lets a release close it.
`importance:low|medium|high` sets its weight.

```bash
pnpm product board                       # print the board: Now / Next / Later, top ideas, triage inbox
pnpm product board --issue               # write it to the repo's "Product board" issue (GITHUB_TOKEN)
pnpm product release --from <tag>        # draft release notes for what reached beta or live since <tag>
pnpm product release --from <tag> --notify          # list the idea issues it answers (a dry run)
pnpm product release --from <tag> --notify --yes    # close them and comment on each (GITHUB_TOKEN)
```

A release closes only ideas: feedback and bugs linked to a shipped feature stay open. A `--from`
ref that doesn't exist is an error, and more than 10 changed features need `--force`, so a wrong
ref can't close everything.

Reading a public repo needs no token, though an anonymous read is rate-limited. If the issues
can't be read, the board shows the catalog only. A write (`--issue`, `--notify --yes`) never runs
on a partial read.

The `product-board` workflow refreshes the board issue (labelled `product-board`, opened by the
workflow) every day and on demand. Scheduled and manual runs use the default branch, so it starts
once this is on main.

## Core

```ts
import { buildBoard, renderBoard, diffRelease, renderRelease, answeredBy } from "@marktiderman/genesis-product";
import { readCatalog, githubSignals, catalogAt } from "@marktiderman/genesis-product/node";

const board = buildBoard(readCatalog(), await githubSignals({ repo: "owner/repo" }).list());
const markdown = renderBoard(board, { date: "2026-10-25" });
```

The core (`.`) has no React and no I/O. `/node` reads the catalog from a file or a git ref, maps
GitHub issues to signals, and writes the board issue and the "shipped" comments.

## On this repo's releases

Release (`.github/workflows/release.yml`, its Release notes job) runs `release` around each
publish: draft notes as a comment on the open version PR, then, after a successful publish, a
`release/<YYYY-MM-DD>` tag whose GitHub release holds the notes (when a feature changed), and
`--notify --yes` to close the ideas it answered. The
diff starts from the previous `release/*` tag (the first time, the last version packages merge),
so the job checks out with `fetch-depth: 0`. See docs/RELEASING.md, "Release notes".

## Not yet

- Not on npm: an app installs it once the owner publishes it (see Status above).

- No database source, no insights captured from support reports, and no screens: the board is
  markdown.
- No notifications beyond GitHub's own: `--notify` comments on the issue, which tells its
  author and everyone subscribed to it.
- Demand counts votes once per person per issue, but not yet once per person per feature.
