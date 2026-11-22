---
"@marktiderman/genesis-chat": minor
---

Message status on native, as iMessage shows it. Under the last message you sent, `ChatThreadScreen`
says "Sending…", "Sent" (posted while a video's bytes still go up), "Delivered", then "Read 9:41"
in a direct conversation (the other member's `lastReadSeq` has reached it) or "Read by 2" / "Read
by everyone" in a group, a button that opens a sheet of who has read it. A failed send keeps its
failure, Retry and Delete. New prop `receipts?: "show" | "hide"` (default "show"); the logic is
exported as `lastSentReceipt` and `receiptText`, and the words are copy (`receiptSending`,
`receiptSent`, `receiptDelivered`, `receiptRead`, `receiptReadAt`, `receiptReadBy`,
`receiptReadByEveryone`, `receiptReadersTitle`, `receiptReadersHint`).

- New migration `0006_genesis_chat_read_receipts.sql` (with its pgTAP test): `members.last_read_at`,
  set when a member's read place moves past someone else's message, and a `read` hint on the
  conversation's topic, so "Delivered" turns to "Read" while the thread is open. Without it the
  status still works, and "Read" has no time.
- `ChatMember.lastReadAt` (optional) and a `read` `ChatSignal`; `useConversation` moves the member's
  read place in its cache when one comes, with nothing fetched.
- Someone typing now shows as a bubble of three dots at the bottom of the thread
  (`ChatTypingBubble`, with the typer's avatar in a group), not a line of italic text; recording a
  voice note or video keeps its words.
