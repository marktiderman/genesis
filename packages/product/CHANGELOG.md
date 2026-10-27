# @marktiderman/genesis-product

## 0.0.5

### Patch Changes

- a5a174a: - `/native`: the idea board (`IdeaBoardScreen` on InboxPage, a vote button per row, haptics), the Now / Next / Later roadmap (`RoadmapScreen`, a segmented control and a detail sheet) and "what's new" (`ProductWhatsNew`, once per app version plus over-the-air update, notes fetched when due), made of genesis-ui-native only.
  - The core: a `ProductSource` contract with `memoryProductSource` for tests and demos, `roadmapFromBoard`, an offline vote queue (`createVoteQueue`, `memoryVoteQueueStore`, `storageVoteQueueStore`) and `createProductWhatsNew` / `whatsNewKey`. Still no React and no `node:` imports, which a test checks.
  - `/native` resolves to its source under React Native (the `react-native` export condition, `src` in the package), as genesis-ui-native and genesis-chat do.
- 6f8653f: `productNotifications`, from `/server` (a new entry) and the core: a genesis-notifications fragment the app spreads into its own `defineNotifications`, with type `product.idea_shipped` in category `product_updates` (not critical, not transactional; in the feed and by email, push as an opt-in) and a render with a title, body and url. `notifyShipped(notify, { release, feature, recipients })` sends one notification per shipped feature to everyone who asked, keyed `shipped:<release>:<feature>`, deduplicated and 1,000 recipients a call; its `url` must be a path on the app. `cancelShipped(cancel, { release, featureId })` stops what hasn't gone out when a release is withdrawn and archives the feed rows. On a GitHub-only repo the `--notify` comment is the notice, so don't call `notify()` there.
- a3a42ff: - `catalogAt` tells "the file isn't at that ref" from "its contents couldn't be read" by checking the tree, which a partial (`blob:none`) clone has without the network. A blob that can't be fetched now throws instead of reading as an empty catalog, which made every beta or live feature look new.
  - The README says how this repo's Release workflow runs `genesis-product release`: draft notes as a sticky comment on the open version PR, then after a successful publish a `release/<YYYY-MM-DD>` tag whose GitHub release holds the notes, and `--notify --yes` to close the ideas it answered.
- c2372c9: First published release. The RN starter depends on it (the product demo, off by default), so `genesis init --template native` can now pin it. Still experimental.

## 0.0.4

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.0.3

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.0.2

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.0.1

### Patch Changes

- 4b9ac80: New, private package: the product system's first version, used on this repo first. `genesis-product board` lays out features.ts as a Now / Next / Later board with the top ideas by demand and a triage inbox (as markdown, or the repo's "Product board" issue); `genesis-product release --from <ref>` drafts release notes for what reached beta or live and, with `--notify`, closes the issues it answers. Ideas and feedback come from GitHub issue forms behind a `SignalSource` contract.

  Features: product-roadmap, product-insights, product-releases
