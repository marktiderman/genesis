---
"@marktiderman/genesis-support": patch
---

Support threads on genesis-chat: a new `support-chat` block (migration `migrations/0001_genesis_support_chat.sql` with its pgTAP test, after 0006 and genesis-chat's 0001 and 0002). A report stays the record; its conversation runs on genesis-chat (kind `support`: the reporter its member, staff observers who reply and write internal notes, an assignee), with status, reply times and read state kept in step, existing replies copied without push, and `support_replies` mirrored both ways for one release. Additive client API: the `chat` option on `createSupportClient` and `createSupport` (a genesis-chat client; with the block, `replies`, `reply`, `markRead` and `subscribe` use the conversation, otherwise `support_replies`), `thread`, `conversationId`, `subscribe`, `isStaff`, `setStatus`, `assign`, `reply(…, { internal })`, optional `internal`, `attachments` and `seq` on replies and `userId` on reports, `defineSupportChatBlock`, native `useSupportConversation` and `mode`/`conversationId` from `useSupportThread` (live on chat, no polling), and `@marktiderman/genesis-support/web-chat` (`SupportReportThread`, `SupportStaffThread`). genesis-chat is a new optional peer.

Features: support-chat
