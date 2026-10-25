# @marktiderman/genesis-chat

## 0.1.1

### Patch Changes

- d2d246b: What the native renderer needed from the core and hooks:
  - Client ids no longer need `crypto.randomUUID`: `randomId()` falls back to `getRandomValues`. `createOutbox` and `ChatProvider` take a `newId`.
  - A pending message carries its files' details (`PendingMessage.files`: name, type, kind, meta), so a pending voice note shows its duration.
  - A file held as bytes (a pasted image, a recording) survives a relaunch when the app passes `persistFile`. Without it, the message waits for the file to be attached again (`reattach`) and is never sent without it.
  - `useConversation` adds `accessLoading`, the kind's rules (`kind`) and `canPin`.
  - `useMessageActions` returns stable callbacks.
  - `ChatProvider` takes `loadPeople` for `usePeople` and `usePerson` (names and avatars, batched).
  - Push from `createExpoDeliver` uses the `messages` category, and its data carries the message `seq`.
- 4535cee: Live updates join private Realtime topics only after setting the signed-in user's token, so a page that subscribes before its session loads still gets hints (and a channel left before it joined never joins). The runner takes `linkFor(conversationId, messageId)` for where a tapped notification opens; the default stays `/messages/<id>`.
- 7765add: Review fixes:
  - A hosted video (Mux, Cloudflare) belongs to one attachment and always starts pending, so nobody can attach, delete or take the webhook for someone else's upload by copying its id.
  - The badge, push badge and inbox count unread the same way: readable messages from others on the main timeline, never internal notes.
  - Your own sent message lands in the list straight away.
  - The composer stops loading when you have no role here and says you can't post.
- a2ba16a: New package: Genesis Chat. Conversations of kinds the app registers, with members, observers and internal notes; messages with replies, threads, topics, mentions, reactions, edits and deletes; photos, files, voice notes and videos in a private bucket; read state and live hints on private Realtime topics; an outbox for push, transcripts and storage cleanup. Ships the schema migration and its pgTAP test, and a headless core (client, send outbox, thread logic, media rules).

  The `/web` renderers on Genesis UI: `ChatPanel` (inbox and thread side by side, one at a time on a phone), `ChatInbox` (avatars, previews, times, unread counts, mention, muted and pinned marks, arrow keys), `ChatThread` (sticks to the bottom with a "New messages" pill, loads earlier messages at the top without moving your place, day dividers and the "New" line, grouped bubbles, reply quotes that jump to the original, edited and deleted states, system lines, internal notes, sending and failed states with Retry and Delete, reactions, a hover bar and right-click or long-press menu, inline edit, delete confirmation, report reasons, a pinned bar, typing line, and incoming messages announced to screen readers) and `ChatComposer` (Enter sends, photos and files by picker, paste or drop with previews, a reply banner, internal notes for observers, voice notes recorded in place). Also `VoiceNote` (waveform, seek, 1×/1.5×/2×, transcript), `useVoiceRecorder`, a safe inline markdown renderer, and `createMemoryChatClient` for demos and tests. Slots: header, empty, attachment (the app's own kinds) and composerAccessory. `@marktiderman/genesis-ui`, `@marktiderman/genesis-core`, `react-dom` and `lucide-react` are optional peers, needed only by `/web`.

  The server runner (`/server`): `createChatRunner` claims and settles the outbox (push through the app's `deliver`, transcripts, storage and hosted-video removal), `chatRunnerHandler` runs it from a cron or database webhook behind a bearer secret, `createExpoDeliver` sends through Expo in batches of 100, `deepgramTranscriber` and `openAiTranscriber` turn voice notes into text, and `muxVideo` makes direct uploads, verifies Mux webhooks and keeps generated captions as transcripts.
