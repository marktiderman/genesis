---
"@marktiderman/genesis-chat": patch
---

Live updates join private Realtime topics only after setting the signed-in user's token, so a page that subscribes before its session loads still gets hints (and a channel left before it joined never joins). The runner takes `linkFor(conversationId, messageId)` for where a tapped notification opens; the default stays `/messages/<id>`.
