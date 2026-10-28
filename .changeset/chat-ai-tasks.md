---
"@marktiderman/genesis-chat": minor
---

New `@marktiderman/genesis-chat/ai` subpath: `chatRecapTask` and `chatDraftReplyTask`, chat's recap and reply draft as `@marktiderman/genesis-ai` tasks. They read the conversation as the caller (membership, last-read position, `genesis_chat.i_observe`, the latest 200 messages) from a conversation id alone, and send the same request `createChatAssistant` sends (a parity test holds them to it). `@marktiderman/genesis-ai` and `zod` (3.25 or 4; the tasks import `zod/v4`) are optional peers, needed only for this subpath. `createChatAssistant` is unchanged.

genesis-ui is a peer from 2.21.0 (`>=2.21.0 <3.0.0`): chat uses nothing newer, so apps on 2.21 install it without a genesis-core 2 upgrade.
