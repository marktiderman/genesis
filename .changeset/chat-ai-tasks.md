---
"@marktiderman/genesis-chat": minor
---

New `@marktiderman/genesis-chat/ai` subpath: `chatRecapTask` and `chatDraftReplyTask`, chat's recap and reply draft as `@marktiderman/genesis-ai` tasks. They read the conversation as the caller (membership, last-read position, `genesis_chat.i_observe`, the latest 200 messages) from a conversation id alone, and send the same request `createChatAssistant` sends (a parity test holds them to it). `@marktiderman/genesis-ai` and `zod` are optional peers, needed only for this subpath. `createChatAssistant` is unchanged.
