---
"@marktiderman/genesis-chat": patch
---

- An app attachment kind's `title`, `subtitle` and `action` get `{ mine }` (`ChatCardContext`, now in `/react`) on the web too, so your own check-in can drop its button. A kind's optional `label` names it in previews (the native and web inbox, the long-press sheet); its title by default.
- Upload answers: 408 is retried like a 5xx, 429 waits as rate limited (`GS429`) instead of blocking the conversation as a refusal.
- Upload progress moves in whole percents, so the chat tree re-renders at most 100 times per file.
- `ChatProvider` reads `videoUpload`, `hostedUpload`, `upload`, `readFile` and `persistFile` at call time: an inline `videoUpload.create` closing over a refreshed token keeps working.
