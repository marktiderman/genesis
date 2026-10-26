---
"@marktiderman/genesis-product": patch
---

- `/native`: the idea board (`IdeaBoardScreen` on InboxPage, a vote button per row, haptics), the Now / Next / Later roadmap (`RoadmapScreen`, a segmented control and a detail sheet) and "what's new" (`ProductWhatsNew`, once per app version plus over-the-air update, notes fetched when due), made of genesis-ui-native only.
- The core: a `ProductSource` contract with `memoryProductSource` for tests and demos, `roadmapFromBoard`, an offline vote queue (`createVoteQueue`, `memoryVoteQueueStore`, `storageVoteQueueStore`) and `createProductWhatsNew` / `whatsNewKey`. Still no React and no `node:` imports, which a test checks.
