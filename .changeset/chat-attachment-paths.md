---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-cli": patch
---

Migration 0005 tightens how attachments are stored: only an attachment with `provider = 'storage'` has a `path`, and only those count when a file's read access is worked out. Paths on other providers are cleared, and kept for the service role in `genesis_chat.attachment_paths_cleared`. Genesis's clients never send them, so nothing changes for them. Run `genesis migrate` to pick it up; it needs nothing from your app.
