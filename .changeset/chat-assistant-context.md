---
"@marktiderman/genesis-chat": minor
---

The AI recap and reply-draft prompts are neutral: they speak of "a conversation" and draft for the person labelled You, in their voice, where they assumed coaching before. `createChatAssistant({ context })` (optional, a noun phrase such as "a coaching conversation" or "a support ticket") tells the model what kind of conversation it is. `recapSystem(context?)` and `draftSystem(context?)` return the system prompts. The README notes that migration 0002 is the chat extras and its file name is historical.

Features: chat
