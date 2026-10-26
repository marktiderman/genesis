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

## Native screens (`/native`)

The idea board, the Now / Next / Later roadmap and "what's new" for a React Native app, made of
genesis-ui-native only (`InboxPage`, `NativeSegmentedControl`, `NativeSheet`). React, React Native
and genesis-ui-native are optional peers; native modules are passed in, never imported.

```tsx
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { IdeaBoardScreen, RoadmapScreen, createVoteQueue, storageVoteQueueStore } from "@marktiderman/genesis-product/native";

// Once, outside render: votes are kept on the phone until they reach the source.
const votes = createVoteQueue({ source, store: storageVoteQueueStore(AsyncStorage) });

<IdeaBoardScreen source={source} queue={votes} haptics={Haptics}
  onReconnect={(run) => NetInfo.addEventListener((s) => { if (s.isConnected) run(); })} />
<RoadmapScreen source={source} haptics={Haptics} />
```

- **Data** comes through a `ProductSource` (`ideas`, `vote`, `unvote`, `roadmap`, `whatsNew`). There
  is no Supabase source yet; `memoryProductSource(seed)` is for tests and demos, and
  `roadmapFromBoard(buildBoard(...))` turns the board into roadmap rows: only `public`, `customer` and
  unset visibility, never `internal` or a `client:<name>` feature unless you pass that `{ client }`.
- **Idea board** (`useIdeaBoard` for InboxPage props, or `IdeaBoardScreen`): each row shows "N votes"
  and a vote button at its end; swipe, long press and screen readers get the same vote. A vote shows
  at once with a light haptic and goes through the vote queue: saved, sent on start, after each vote
  and on reconnect, and toggling back before it is sent sends nothing. A refusal that retrying won't
  fix (`VoteRefusedError`, or an HTTP 4xx other than 408 and 429) is dropped and rolled back, with an
  error haptic, screen readers hear `copy.ideas.refused`, and `onRefused(ids)` lets the app show a
  toast; anything else waits for the next flush. The vote button says which idea it is for and
  whether it is cast (`accessibilityState.selected`), and a cast vote reads "You voted" on the row.
- **Roadmap** (`useRoadmap`, `RoadmapScreen`): a segmented control over the rows; a tap opens the
  item in a sheet.
- **What's new** (`createProductWhatsNew`, `ProductWhatsNew`): once per app version plus over-the-air
  update (`whatsNewKey`, e.g. `1.4.0+3f2a…` or `1.4.0+embedded`). A first install remembers the key
  and shows nothing; a new key fetches its notes then, never from the bundle, and opens the sheet
  when there are any. The last 20 keys seen are remembered, so falling back to the embedded code
  after a failed update shows nothing again. An app that adds this to a build that didn't have it
  starts like a first install: nothing shows until the next version or update. To hang it off genesis-native's updates block, turn the block's own sheet off
  and render this one with the same modules:

  ```tsx
  createUpdates({ whatsNew: false, application: Application, updates: Updates, … });
  const whatsNew = createProductWhatsNew({ source, storage: AsyncStorage,
    key: whatsNewKey({ application: Application, updates: Updates }) });
  <ProductWhatsNew store={whatsNew} />   // inside GenesisNativeApp
  ```

The RN starter has a demo behind `productDemo` (off by default) in `starter.config.ts`.

## Not yet

- Releases aren't wired into this repo's release flow yet. The plan, from the review: release.yml
  pushes a `release/<date>` tag after a successful publish; the notes diff from the latest
  `release/*` tag, go in a sticky comment on the Version Packages pull request (changesets
  rewrites its body), and become the GitHub release's body; `--notify --yes` runs after the
  publish, never before. A CI run of `release` needs `fetch-depth: 0` for the tags.
- Not on npm: an app installs it once the owner publishes it (see Status above).

- No database source and no insights captured from support reports. The board issue is markdown;
  the native screens read an injected source (no web screens yet).
- No notifications beyond GitHub's own: `--notify` comments on the issue, which tells its
  author and everyone subscribed to it.
- Demand counts votes once per person per issue, but not yet once per person per feature.
