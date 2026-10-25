---
"@marktiderman/genesis-chat": patch
---

Server for chat phases 2–4: the runner works `moderate` (a `Moderator`, `openAiModerator` on omni-moderation-latest with configurable thresholds) and `unfurl` (`createLinkUnfurler`, an SSRF-safe Open Graph fetcher) effects, posts due scheduled messages and, with `retention: true`, purges expired ones, and reports the counts. Adds `notificationsDeliver` and the `chat.message` notification type for genesis-notifications, `createChatAssistant` (Claude recaps and reply drafts, never sent, internal notes stripped) and `createVideoUploadHandler` (Mux direct uploads behind an `authorize` check). Pushes no longer carry `collapseKey` unless the runner's `collapse` option is on.
