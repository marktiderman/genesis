---
"@marktiderman/genesis-chat": patch
---

Migration 0003: `genesis_chat.search_messages` also returns `thread_root_id`, so a search hit inside a reply thread opens that thread. (Moved out of 0002, which is released as it stands.)
