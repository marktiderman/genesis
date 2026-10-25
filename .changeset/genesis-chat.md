---
"@marktiderman/genesis-chat": minor
---

New package: Genesis Chat. Conversations of kinds the app registers, with members, observers and internal notes; messages with replies, threads, topics, mentions, reactions, edits and deletes; photos, files, voice notes and videos in a private bucket; read state and live hints on private Realtime topics; an outbox for push, transcripts and storage cleanup. Ships the schema migration and its pgTAP test, and a headless core (client, send outbox, thread logic, media rules).

The server runner (`/server`): `createChatRunner` claims and settles the outbox (push through the app's `deliver`, transcripts, storage and hosted-video removal), `chatRunnerHandler` runs it from a cron or database webhook behind a bearer secret, `createExpoDeliver` sends through Expo in batches of 100, `deepgramTranscriber` and `openAiTranscriber` turn voice notes into text, and `muxVideo` makes direct uploads, verifies Mux webhooks and keeps generated captions as transcripts.
