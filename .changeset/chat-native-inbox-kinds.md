---
"@marktiderman/genesis-chat": patch
---

`ChatInboxScreen` takes `kinds` and `excludeKinds`, passed to `useInbox`, so a messages inbox can leave out support tickets (`excludeKinds={["support"]}`).
