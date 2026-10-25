---
"@marktiderman/genesis-supabase": patch
---

The README marks migration 0005 (`genesis_push`) and the `genesis-push-send` function as superseded by `@marktiderman/genesis-notifications`, which adopts 0005's tables in place and replaces the sender. Both stay unchanged here for apps that run them. Moving: remove 0005's pgTAP test from the app (two of its assertions describe the old register and forget) and stop calling `genesis-push-send`.

Features: push-sender, notifications
