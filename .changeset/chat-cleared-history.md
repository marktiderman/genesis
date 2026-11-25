---
"@marktiderman/genesis-chat": minor
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test) keeps history a member deleted for themselves (0007's Delete for me) out of the places that still reached it. Apply it after 0007.

- **Read receipts.** The public read place (`members.last_read_seq`, what a sender's "Read" reads) is now held: it never passes a message the member deleted unread until they read someone else's message after it. So posting after Delete for me no longer turns the other person's message to "Read", or counts the member in "Read by N", and there's still one public number: nothing shows beyond what a correct "not read" implies. Their true read place is kept privately in the new `member_state.read_seq` while it differs, and their unread counts, mentions, the inbox's `last_read_seq`, `mark_read`'s answer and the new `my_read_seq` use it. The client's `members()` and the AI recap read your own place from `my_read_seq`, falling back to the members row on a database without 0008. A reply in a thread whose root is in the deleted history doesn't let the hold go. No rows are rewritten. It's exact in a direct conversation and approximate in a group. The read time (`last_read_at`) and the `read` hint move only for a message after the deleted history.
- **Pushes.** `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back.
- **Files.** `can_read_object` lets an uploader read their own recent file only until it's in a message, so a photo of their own in deleted history can't be fetched.
- **Reports.** `report_message` refuses a message in the deleted history or one moderation hides from the reporter. Its snapshot's context holds only messages after that history that aren't deleted and that moderation doesn't hide from them; before, it copied messages deleted for everyone and hidden ones too.
- **Writes.** `react`, `pin_message`, `save_message`, `edit_message` and `delete_message` refuse a message in the deleted history. `send_message` still accepts a reply to, or a thread on, one.
