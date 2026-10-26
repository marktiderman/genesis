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

## Telling people it shipped (an app's own database)

On a repo whose ideas are GitHub issues, `--notify --yes` is the notice: its "Shipped in release …"
comment tells the issue's author and everyone subscribed. Don't also call `notify()` there.

An app whose ideas live in its own database (people with logins or emails) tells them through
genesis-notifications. The app owns its registry and spreads in product's fragment, the way it
composes features: type `product.idea_shipped` in category `product_updates`, not critical and not
transactional, so preferences, quiet hours and the unsubscribe link apply. In the feed and by
email by default, with push offered as an opt-in.

```ts
import { defineNotifications } from "@marktiderman/genesis-notifications";
import { notify, cancelNotification } from "@marktiderman/genesis-notifications/server";
import { productNotifications, notifyShipped, cancelShipped } from "@marktiderman/genesis-product/server";

export const notifications = defineNotifications({
  categories: { ...productNotifications.categories, /* the app's own */ },
  types: { ...productNotifications.types, /* the app's own */ },
});

// Once per shipped feature, to everyone who asked for or voted on it (deduplicated, 1,000 a call).
await notifyShipped((input) => notify(supabase, input, { registry: notifications }), {
  release: "2026-10-26",
  feature,             // a CatalogFeature: its tagline (or summary) is the body
  recipients: askers,  // user ids, { userId }, or { email, name }
  url: "/whats-new",   // a path on the app; anything else throws (the notifier would drop it)
});

// The release was withdrawn: stop what hasn't gone out, and take it out of the feed (archive is on by default).
await cancelShipped((input) => cancelNotification(supabase, input), { release: "2026-10-26", featureId: feature.id });
```

Run genesis-notifications' `syncNotificationTypes` after adding the fragment (on deploy), or
`notify` refuses the type. The key is `shipped:<release>:<feature>` (neither may contain `:`), so
a re-run sends nobody a second one, and the same feature shipped again under a new release name
notifies again. A cancel stops only what is still waiting: email goes as soon as the runner picks
it up, so most of it has usually gone. The sent rows stay, so re-publish a withdrawn release under
a new name; under the same one nobody is told again. Pass a `tenantId` (a uuid) to both calls, or
to neither. `/server` and the core (`.`) export
the same things: the registry is imported by the web and the phone too, and neither does I/O.
This package doesn't depend on genesis-notifications; the shapes are structural and tested against
it.

## Not yet

- Releases aren't wired into this repo's release flow yet. The plan, from the review: release.yml
  pushes a `release/<date>` tag after a successful publish; the notes diff from the latest
  `release/*` tag, go in a sticky comment on the Version Packages pull request (changesets
  rewrites its body), and become the GitHub release's body; `--notify --yes` runs after the
  publish, never before. A CI run of `release` needs `fetch-depth: 0` for the tags.
- Not on npm: an app installs it once the owner publishes it (see Status above).

- No database source, no insights captured from support reports, and no screens: the board is
  markdown.
- Nothing calls `notifyShipped` yet: the askers come from a database source, which isn't built.
- Demand counts votes once per person per issue, but not yet once per person per feature.
