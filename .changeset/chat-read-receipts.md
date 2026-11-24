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
- `ChatMember.lastReadAt` (optional) and a `read` `ChatSignal` (an exhaustive `switch` over
  `ChatSignal` needs the new case); on one, `useConversation` reads the members again (once for a
  burst), never the payload's numbers. It reads them again on every channel join too.
- 0006 also lets clients broadcast only `activity` and presence on a conversation's topic, so only
  the database sends `read` (or `message`) hints; a hidden or deleted message doesn't count as read,
  and conversations of more than 32 members get no `read` hint (their read state updates when the
  members are next read). An observers-only or hidden message of yours shows no status.
- **Privacy:** with 0006 every member and observer of a conversation can see when each member last
  read it (`lastReadAt`), as they already see how far. There is no opt-out of sending receipts yet;
  `receipts="hide"` only hides them on that screen. Decide before upgrading if your app's privacy
  policy says otherwise.
- Someone typing now shows as a bubble of three dots at the bottom of the thread
  (`ChatTypingBubble`, with the typer's avatar in a group), not a line of italic text; recording a
  voice note or video keeps its words.

Native feel (an iOS audit of the thread):

- Bubbles take iMessage's shape: tight corners where a run's bubbles meet and a tail on the last
  one (`bubbleCorners`, `bubblePosition`). Drag the thread left for every message's time
  (`TIME_REVEAL_WIDTH`, `startsTimeReveal`, `timeRevealFor`); the run's last time stays.
- Swipe to reply runs on `GenesisModules.swipeable` (gesture-handler's `ReanimatedSwipeable`) when
  given. A message you just sent rises in with `GenesisModules.reanimated`'s `FadeInDown` (not with
  Reduce Motion). The held mic follows the finger (`micOffset`). Long press taps a medium impact
  (haptic event `"long-press"`).
- The message actions, attach, emoji, scheduled and readers sheets fit their content. The + button
  opens `NativeContextMenu`, which opens the picker once it has gone, instead of an 800 ms wait.
- `ChatThreadScreen` opens at the first unread when the "New" line would be off screen, shows a
  "↓ N new messages" pill when scrolled up (`countUnseenBelow`) (copy `newMessagesPill`, `newMessagesPillOne`,
  `newMessagesPillHint`), "Waiting for network…" / "Connecting…" (`waitingForNetwork`,
  `connecting`, `connectionState`, `useOnline`), and an error with Retry when nothing could be read
  (`threadErrorTitle`, `threadErrorBody`).
- New `ChatThreadScreen` props: `active` (mounted without marking read), `header`, `accessory`
  (`ChatThreadAccessoryContext`) and `videoLimitMs`. `useChatThreadStackOptions` takes `avatar`,
  `subtitle` (the away line by default, with `conversationId`), `onPressTitle` and `titleHint`
  (`ChatThreadTitle`).
- `useConversation` returns `reload`, `live` (the realtime channel's state, from the client's new
  `onLive` handler) and `firstUnreadKnown`. `useFileUrls`, `usePeople` and `usePins` return one
  frozen empty value instead of a fresh `{}` / `[]` each render, and `useFileUrls` keeps the links
  it has while new ones are signed (`placeholderData: keepPreviousData`). Photos are cached by
  their storage path (`cacheKey`), so a re-signed link doesn't download again.
