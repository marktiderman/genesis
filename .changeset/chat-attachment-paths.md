---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-cli": patch
---

Migration 0005 tightens attachment paths: only an attachment in storage has one. Genesis's clients are unaffected. Run `genesis migrate` to pick it up; it needs nothing from your app. It keeps any paths it clears in `genesis_chat.attachment_paths_cleared`, for the service role: they contain user ids, and account deletion doesn't touch that table, so look at it once and drop it (the migration's header says how).
