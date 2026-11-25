---
"@marktiderman/genesis-chat": patch
---

New migration `0008_genesis_chat_cleared_history.sql` (with its pgTAP test) keeps history a member deleted for themselves (0007's Delete for me) out of the places that still reached it. Apply it after 0007.

- **Read receipts.** A new column, `members.receipt_seq`, is the read place a sender's "Read" now reads. It's backfilled from `last_read_seq`, and a trigger keeps it. It never passes a message the member deleted unread until they read someone else's message after it. `ChatMember.receiptSeq` carries it, and `lastSentReceipt` reads it, falling back to `lastReadSeq` on a database without 0008. So posting after Delete for me no longer turns the other person's message to "Read", or counts the member in "Read by N". It's exact in a direct conversation and approximate in a group. `cleared_seq` stays private. The read time (`last_read_at`) and the `read` hint move only for a message after the deleted history, and the hint's `seq` is the receipt place.
- **Pushes.** `push_targets` never notifies them of a message in the deleted history, even once a later message has brought the conversation back.
- **Files.** `can_read_object` lets an uploader read their own recent file only until it's in a message, so a photo of their own in deleted history can't be fetched.
- **Reports.** `report_message` refuses a message in the deleted history. Its snapshot's context holds only messages after that history that aren't deleted; before, it copied messages deleted for everyone too.
- **Writes.** `react`, `pin_message`, `save_message`, `edit_message` and `delete_message` refuse a message in the deleted history.
