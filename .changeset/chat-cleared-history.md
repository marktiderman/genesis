---
"@marktiderman/genesis-chat": minor
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test) keeps history a member deleted for themselves (0007's Delete for me) out of the places that still reached it. Apply it after 0007.

- **Read receipts.** The public read place, `members.last_read_seq`, is now held: it never passes a message someone else sent that the member deleted unread, until they read someone else's message after it. So posting after Delete for me no longer turns the other person's message to "Read", or counts the member in "Read by N", and every client, old ones included, gets this without a change. It's exact in a direct conversation and approximate in a group. Rows from before 0008 aren't changed. The read time (`last_read_at`) and the `read` hint move only with the held place.
- **Your own read place.** While the public one is held, the member's own read place is kept in `member_state.read_seq` (private). Unread counts (the inbox, `unread_total`, a push's badge), the inbox's `last_read_seq` and `mentioned`, `mark_read`'s result, the new `my_read_seq(conversation_id)`, the client's own row in `members()` and the AI recap all use it.
- **Pushes.** `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back.
- **Files.** `can_read_object` lets an uploader read their own recent file only until it's in a message, and not again once that attachment is deleted and the file's removal is queued, so a photo of their own in deleted history can't be fetched.
- **Reports.** `report_message` refuses a message in the deleted history, and one hidden by moderation that the reporter can't see. Its snapshot's context holds only messages after that history that aren't deleted or hidden from the reporter; before, it copied those too.
- **Writes.** `react`, `pin_message`, `save_message`, `edit_message`, `delete_message`, and `send_message`'s reply and thread root refuse a message in the deleted history.

Privacy: as before, everyone in a conversation sees one read place for each member (`last_read_seq`, with `last_read_at`), and nothing beside it to compare; `cleared_seq` and `read_seq` stay in `member_state`, which only that member reads. A member's own `last_read_seq` can now lag what they've read after Delete for me: read your own place from `my_read_seq`, the inbox or `mark_read`.
