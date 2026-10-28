---
"@marktiderman/genesis-chat": minor
---

The AI recap and reply-draft prompts are neutral: they speak of "a conversation" and draft for the person labelled You, in their voice, where they assumed coaching before. `createChatAssistant({ context })` (optional, a noun phrase such as "a coaching conversation" or "a support ticket") tells the model what kind of conversation it is. `recapSystem(context?)` and `draftSystem(context?)` return the system prompts.

Behaviour change: the prompt text changed, and `context` does not restore the old wording. `draftPrompt` now ends with "Their voice: …" and "Draft the next message from You." (it said "The coach's voice: …" and "Draft the coach's next message."), so code or tests that match the old prompt strings need updating, and drafts may read slightly differently. The README notes that migration 0002 is the chat extras and its file name is historical.

Features: chat
