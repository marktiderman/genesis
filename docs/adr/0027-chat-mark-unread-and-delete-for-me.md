# ADR 0027: Mark as Unread and Delete for me in genesis-chat

- Status: proposed
- Date: 2026-11-23
- Features: `chat`, `inbox-thread`
- Related: packages/chat/migrations/0007_genesis_chat_unread_and_delete_for_me.sql, genesis-chat migration 0006 (read receipts)

## Context

A consumer app's Messages is being made to look and work like Apple's Messages, so people feel at
home. Messages offers two per-person actions on a conversation that genesis-chat has no way to do:

- **Mark as Unread**: the conversation shows as unread again, whoever sent the last message.
- **Delete** (for you): the conversation leaves your list and its history your screen; a new
  message brings it back with only what came after. The other people keep everything.

The app first built both against its own copy of the chat schema. Both are database contracts
(columns, RPCs, read rules), so an app copy would have to be migrated a second time when Genesis
gained them; they belong in genesis-chat.

`pnpm features find unread`, `archive`, `delete`:
- `archived` (members, 0001) hides a conversation but keeps its history, and never comes back on
  its own.
- `delete_message` removes one message for everyone.
- Moving `last_read_seq` back would show a conversation unread, but it is what senders read as
  "Read" (0006). Moving it back would make a sender's receipt untrue, and it shows nothing when your
  own message is the last one.

None of these fits, so this adds a member's private state beside the members row (G2: extend before
inventing). It can't go on `members` itself: everyone in a conversation reads every member's row
(`members_read`), and both are only the member's business.

## Decision

genesis-chat migration 0007:

0. `member_state (conversation_id, user_id, marked_unread, cleared_seq)`, one row per member who
   has used either, removed with their membership. Its read policy is `user_id = auth.uid()`, and
   it's written only by the functions below, so nobody else in the conversation learns that a
   member marked it unread or deleted it.
1. `member_state.marked_unread`: set by `set_my_settings(p_marked_unread => true|false)` (a new
   argument with a default; the old call shape works). The member's inbox, `unread_total` and the
   push badge (`push_targets`) count the conversation as at least one unread while it's set.
   `mark_read` clears it. It never touches `last_read_seq`, so receipts stay true.
2. `member_state.cleared_seq` (null: never deleted):
   `delete_conversation_for_me(conversation_id, p_seq => …)` sets it to `p_seq`, the latest message
   the member saw (the inbox row they deleted), or the conversation's `last_seq` without it, clamped
   to `last_seq` and never moving back. A message that arrived after what they saw isn't deleted
   unseen. It also clears `marked_unread`, unpins and unarchives (so the conversation comes back to
   the inbox, not to Archived). Then:
   - the inbox and badges leave the conversation out until a message the member can read on the
     main timeline arrives after `cleared_seq` (`readable_after`): not an observers-only note, a
     thread reply, a deleted message or one moderation hid. The next such message brings it back;
   - a restrictive read policy, `messages_cleared_for_me`, hides messages at or before
     `cleared_seq` from that member, so every read path agrees (thread pages, attachments and
     reactions through their message). Another, `pins_cleared_for_me`, drops pins of those
     messages. The security-definer paths that read messages themselves get the same guard
     (`my_cleared_seq`): search, the attachment files' read check (`can_read_object`) and link
     previews (`link_previews_for`);
   - unread counts start after `greatest(last_read_seq, cleared_seq)`.

   Nothing is deleted, and no other member's rows change.
3. `set_my_settings` and `delete_conversation_for_me` send an `inbox` hint to the member's own topic
   (`genesis-chat:user:<id>`), so their other devices refetch the inbox.
4. The core client gains `setMySettings(id, { markedUnread })`, sent only when given so a client on
   a database before 0007 keeps working, and `deleteConversationForMe(id, seq?)`.

## Glossary

- **Mark as Unread**: a per-person flag that makes a conversation count as unread for them only.
  Don't say "unread marker" or "reset read".
- **Delete for me**: removes a conversation from one person's inbox and view until a new message
  they can read.
  Don't call it "archive" (archiving keeps history and doesn't come back by itself) or "delete
  conversation" (that reads as for everyone).

## Alternatives

- **Move `last_read_seq` back.** This breaks read receipts (0006) and does nothing when your own
  message is last.
- **Reuse `archived` for Delete.** It keeps history, never returns on a new message, and the app
  already uses Archive as a separate action.
- **Hard-delete the member's copy, or leave the conversation.** Leaving changes membership, which
  everyone sees and which affects who receives messages. There is no per-member copy to delete.
- **Filter cleared history in the client.** Search, attachments and every future read path would
  each have to remember it. One restrictive policy covers them all.

## Consequences

- Apps apply 0007 after 0006 (`genesis migrate` / `upgrade`) and copy its pgTAP test.
- Native and web inbox rows offer Mark as Unread and Delete through the swipe and menu actions
  from the iOS standards work (G1-315), which call these client methods. Delete asks first.
- `ChatInboxItem` gains no new field: `unread` already reflects the mark.
- Later: per-message "delete for me" (one message rather than the whole history) would need a
  table of hidden messages; this doesn't attempt it.
