---
"@marktiderman/genesis-chat": minor
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test): history a member deleted for themselves (0007's Delete for me) stays out of the places that still reached it. **Apply it before you upgrade the client**: `members()` now reads it.

- Read receipts: a sender never sees "Read" on a message the reader deleted unread. `member_state.cleared_read_seq` keeps where the reader had read to when they deleted, and the new `member_reads(conversation)` gives each member's read place as you may count it (stopped before what they deleted unread while your latest message is in it). `members()` reads it instead of the members table, so receipts, "Read by N" included, come from the server. A message they deleted unread also no longer sets their read time (`last_read_at`) or sends a `read` hint (`read_passed`).
- `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back.
- `can_read_object` lets an uploader read their own recent file only until it's in a message, so a photo of their own in deleted history can't be fetched.
- `report_message` refuses a message in history the reporter deleted, and its snapshot (which the reporter reads) leaves out deleted messages and that history.
- `react`, `pin_message` and `save_message` refuse a message in history you deleted.
