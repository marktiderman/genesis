---
"@marktiderman/genesis-support": patch
---

`SUPPORT_TO_CHAT_STATUS` maps `pending` (migration 0013) to chat's `pending`, as the database does, and the map is checked against every ticket status at compile time.
