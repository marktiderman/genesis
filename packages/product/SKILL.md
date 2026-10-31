---
name: genesis-product
description: Show an app's own people a Now / Next / Later roadmap, an idea board with votes and what's new with @marktiderman/genesis-product (a module), and tell them when their idea shipped. Load before building a roadmap, idea board, changelog or what's-new screen.
---

# genesis-product

A module: the roadmap, idea board and release notes an app shows its own people. The catalog
is the app's `features.ts` (status, `horizon`, visibility); ideas and votes come through a
`ProductSource`.

## Install

```bash
genesis add product-board
pnpm add @marktiderman/genesis-product
```

## Which entry point

| Need | Import |
|---|---|
| The board, signals, demand, release diffs (no React, no I/O) | `@marktiderman/genesis-product` |
| The phone: `IdeaBoardScreen`, `RoadmapScreen`, `ProductWhatsNew`, `createVoteQueue` | `@marktiderman/genesis-product/native` |
| Telling people it shipped: `productNotifications`, `notifyShipped` | `@marktiderman/genesis-product/server` |

`/node` and the `genesis-product` bin are repository tooling (the board issue, release notes on
a repo's GitHub issues). They are not for app code: no runtime package imports them.

## Rules

- Roadmap rows come from `features.ts` through `roadmapFromBoard`; never keep a second list.
- Votes go through the vote queue, made once outside render.
- Shipped notices go through genesis-notifications with the package's fragment, so preferences
  and unsubscribe apply.
- Which plan unlocks Product is the app's call, in its own `features.ts`.

Details: the package README.
