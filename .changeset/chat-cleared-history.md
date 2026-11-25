---
"@marktiderman/genesis-chat": minor
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test): history a member deleted for themselves (0007's Delete for me) stays out of the places that still reached it. Apply it after 0007, then upgrade the client: on a database without 0008, `members()` falls back to the members table, so an older database still works, minus the cleared-history receipt fix.

- Read receipts: a sender never sees "Read" on a message the reader deleted unread. `member_state.cleared_read_seq` keeps where the reader had read to when they deleted, and the new `member_reads(conversation)` gives each member's read place as you may count it (stopped before what they deleted unread while your latest message is in it). `members()` reads it instead of the members table, so receipts, "Read by N" included, come from the server. The members table (under its read policy) and the `read` broadcast's `seq` still carry the raw read place; receipts read `member_reads`. An index on messages `(conversation_id, sender_id, seq)` keeps its lookup of your latest message quick. A message they deleted unread also no longer sets their read time (`last_read_at`) or sends a `read` hint (`read_passed`).
- `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back.
- `can_read_object` lets an uploader read their own recent file only until it's in a message, so a photo of their own in deleted history can't be fetched.
- `report_message` refuses a message in history the reporter deleted, and its snapshot (which the reporter reads) leaves out deleted messages and that history.
- `react`, `pin_message` and `save_message` refuse adding to a message in history you deleted; taking your own reaction off, unpinning and forgetting a save still work.
