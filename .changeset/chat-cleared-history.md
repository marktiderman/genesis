---
"@marktiderman/genesis-chat": patch
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test): history a member deleted for themselves (0007's Delete for me) stays out of three more places. A message they deleted unread no longer reads as read when their read place later moves past it, so its sender never sees "Read" on it (`read_passed`). `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back. `can_read_object` lets an uploader read their own recent file only until it's in a message, so a photo of their own in deleted history can't be fetched. Apply it after 0007.
