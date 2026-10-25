# @marktiderman/genesis-chat

Chat for Genesis apps, in the app's own Supabase: direct messages, groups and the app's own
kinds of conversation (a cohort, a support ticket), with photos, files, voice notes and videos,
replies, threads, reactions, read state, live updates and push.

| Entry | What it is |
|---|---|
| `@marktiderman/genesis-chat` | The headless core: types, `createChatClient`, the send outbox, thread logic, media rules. No React. |
| `/react` | Hooks for web and native: `ChatProvider`, `useInbox`, `useConversation`, `useMessageActions`, and for 0002 `useTopics`, `useScheduled`, `useAvailability`, `useBroadcast`, `useSearch`, `useLinkPreviews`. |
| `/web` | Renderers on genesis-ui: inbox, thread, composer (text, photos, voice, video, emoji, scheduled send), media, topics, search, availability, broadcast. |
| `/native` | Coming in the next release: renderers on genesis-ui-native (`InboxPage` and `ThreadPage` wired to chat, voice notes with expo-audio). Empty in this version. |
| `/server` | `createChatRunner`: works the outbox (push, transcripts, storage cleanup). |
| `migrations/0001_genesis_chat.sql`, `0002_genesis_chat_coaching.sql` | The schema, copied into your app by `genesis add chat`, each with its pgTAP test. |

## On the web

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createChatClient } from "@marktiderman/genesis-chat";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import { ChatPanel } from "@marktiderman/genesis-chat/web";

const chat = createChatClient(supabase);

<QueryClientProvider client={queryClient}>
  <ChatProvider client={chat} userId={user.id}>
    <ChatPanel resolveUser={(id) => ({ name: people[id]?.name ?? "Someone", avatarUrl: people[id]?.avatar })} />
  </ChatProvider>
</QueryClientProvider>
```

`resolveUser` is required: the package knows no people tables, so the app names everyone. Use
`ChatInbox` and `ChatThread` on their own for your own layout, and `ChatComposer` with
`useConversation` for your own thread. Swap parts with `slots` (`header`, `empty`, `attachment`
for your own attachment kinds, `composerAccessory`). Mount a Genesis `<Toaster />` for refusals
(a file too big, a send not allowed). Tailwind must scan the package
(`@source "../node_modules/@marktiderman/genesis-chat/dist"`). `createMemoryChatClient` runs it
all with no backend, for demos, stories and tests.

## Kinds and rules

A kind of conversation carries its rules (`genesis_chat.register_kind`): how many members, who
posts (members or admins), who manages members (the app, or the conversation's admins), whether
threads are on, a **start check** (who may start one, with whom) and an **observer check** (who
reads without being a member, such as a support team). Both checks are functions of your own,
registered in a migration after 0001; without a start check only your server starts that kind.

```sql
create function public.chat_may_dm(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team t1 join public.team t2 using (org_id)
                 where t1.user_id = chat_may_dm.user_id and t2.user_id = member_ids[1])
$$;
revoke execute on function public.chat_may_dm(uuid[], text, text, uuid) from public, anon, authenticated;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.chat_may_dm(uuid[], text, text, uuid)');
```

A conversation tied to one of your records (a group, a ticket) is made by your server with
`genesis_chat.ensure_conversation(kind, subject_type, subject_id, title)`, and its members set with
`genesis_chat.sync_members(conversation, user_ids, role)`.

## Access

Members read a conversation; who posts follows its kind and settings (`{"who_posts": "admins"}`
makes it one-way). Observers read it and, where the kind allows, reply and leave internal notes
(`visibility: "observers"`) members never see. Files go in the private `genesis-chat` bucket under
`<conversation>/<uploader>/`, readable by whoever reads the message that carries them. anon
reaches nothing. The pgTAP test beside the migration proves each rule.

## Live updates

New and changed messages, reactions and memberships are broadcast as hints (ids only) to private
Realtime topics, `genesis-chat:conv:<id>` and `genesis-chat:user:<id>`; clients fetch through row
level security, and fetch what they missed every time a channel joins (`onJoin`), the first time included. Typing and recording are broadcast
by clients and never stored.

## The outbox

A message queues a `push` effect, a voice note or video a `transcribe` effect, a deleted file a
`storage.remove` effect. `createChatRunner` (from `/server`) claims and settles them; nothing is sent
from a trigger.

## Topics, scheduled send, availability, broadcast, search, previews (migration 0002)

Everything here is in the core and `/react`, so web and native share it; `/web` draws it.

### Core client

```ts
// Topics: named sub-threads; messages join one through `topic`.
chat.topics(conversationId): Promise<ChatTopic[]>
chat.setTopic(conversationId, topic, { title?, position?, closed? }): Promise<void>   // owners and admins

// Scheduled send: a minute to a year ahead, posted as you by the runner.
chat.schedule({ conversationId, clientId, sendAt, body?, attachments?, replyToId?, topic?, mentions?, silent? }): Promise<string>
chat.scheduled(conversationId?): Promise<ScheduledMessage[]>   // waiting or failed, soonest first
chat.cancelScheduled(id): Promise<void>

// Availability: away message, until when, hours per weekday, time zone.
chat.availabilityFor(conversationId): Promise<ChatAvailability[]>
chat.myAvailability(): Promise<ChatAvailability | null>
chat.setAvailability({ awayMessage?, awayUntil?, timeZone?, hours? }): Promise<void>  // replaces all four

// Broadcast: one text message into each conversation you may post in; replies come back privately.
chat.broadcast(conversationIds, clientId, body, { silent? }): Promise<string[]>

// Search: text and transcripts, newest first; snippets mark matches with « ».
chat.search(query, conversationId?, { limit? }): Promise<ChatSearchHit[]>

// Link previews the runner fetched (status ok only).
chat.linkPreviews(urls): Promise<ChatLinkPreview[]>
```

`ChatMessage.moderation` is `"flagged" | "hidden" | null`: a hidden message reaches only its
sender and the conversation's observers. Pure helpers: `isWithinWorkingHours(hours, timeZone,
now)` (an end at or before the start runs past midnight), `isAway(a, now)`, `hoursSummary(hours)`
("Mon–Fri, 9–5"), `awayLine(a, name, { now })` ("Mark replies Mon–Fri, 9–5 (Eastern)", "Away until
Monday: Back Monday", or null when they're around), `extractLinks(body)` (the database's rule),
`isHttpsUrl`, `snippetParts(snippet)`, `scheduleQuickPicks(now)`, `scheduleLabel`, `isSchedulable`,
`topicKey(title)`.

```ts
const line = awayLine(await chat.availabilityFor(id).then((a) => a[0]), "Mark");
```

### React hooks

```tsx
const { topics, setTopic } = useTopics(conversationId);          // live: set_topic's hint refreshes it
const thread = useConversation(conversationId, { topic: "week-1" }); // one topic; sends go into it
const { items, schedule, cancel } = useScheduled(conversationId);   // schedule(input, files?) uploads byte files first
const { mine, setMine, members, others, forUser } = useAvailability(conversationId);
const { send, sending } = useBroadcast();                          // send(ids, body) -> message ids
const { hits, isSearching, query } = useSearch(text, { conversationId, debounceMs: 250 });
const previews = useLinkPreviews(urls);                            // Record<url, ChatLinkPreview>
```

`useConversation` also returns `loadUntil(seq)` (loads earlier pages until that message is here,
for a search result), `accessError` and `refetchAccess` (the role check failed: offer a retry, not
"can't post"). It catches up (messages after the newest one held) every time its live channel
joins, the first time included, and keeps `hasEarlier` in the cached page.

`useChat()` adds `retryAll()` (call it from AppState or NetInfo on native; the web provider retries
on `online` and once after loading the saved outbox) and `clearOutbox()` (call it on sign-out).

`ChatProvider` takes two more props:

```tsx
<ChatProvider
  client={chat}
  userId={user.id}
  // Mux direct uploads: your server makes the upload; the composer PUTs the recording there and
  // sends { kind: "video", provider: "mux", providerId, status: "pending" }. Without it, videos
  // upload to storage as files.
  videoUpload={{ create: (conversationId) => fetch(`/api/video-upload?c=${conversationId}`, { method: "POST" }).then((r) => r.json()) }}
  // Cards for your own attachment kinds (no forms dependency): a title, a subtitle, one action.
  attachmentKinds={{
    form: {
      title: (a) => String(a.ref.title ?? "Form"),
      subtitle: (a) => (a.ref.dueAt ? `Due ${a.ref.dueAt}` : null),
      action: (a) => ({ label: "Fill in", href: `/forms/${a.ref.formId}` }),
    },
  }}
>
```

A registered kind draws as `ChatAttachmentCard`; any other app kind goes to `ChatThread`'s
`attachment` slot (a generic card by default). For anything richer than a card, render the kind
yourself in that slot:

```tsx
<ChatThread slots={{ attachment: (props) =>
  props.attachment.kind === "check-in"
    ? <CheckInCard id={String(props.attachment.ref.checkInId)} mine={props.mine} />
    : <GenericAttachment {...props} />
}} />
```

### Web components

- **Topics**: `ChatThread` shows `ChatTopicBar` (All plus each topic, a lock on closed ones) when
  the conversation has topics (`showTopics` shows it before the first, for owners). Owners and
  admins get "New topic" and close or reopen. In a closed topic members see "This topic is closed".
- **Scheduled send**: the arrow beside Send offers tomorrow 9 AM, Monday 9 AM, or a date and time;
  "N scheduled messages" above the box opens `ChatScheduledList` with Cancel (`scheduling={false}`
  turns it off). `ChatScheduledList` also works on its own, for all conversations.
- **Availability**: `ChatAwayBanner` above the messages when the other person (in a group, its
  owners and admins) is away or outside their hours; `ChatAvailabilitySettings` for your own.
- **Broadcast**: `<ChatBroadcast resolveUser={…} kind="direct" />` picks conversations from the inbox
  and sends once, saying replies come back privately.
- **Search**: `<ChatSearch resolveUser onOpen={(hit) => …} conversationId? />`; the thread header has
  it for one conversation and jumps to the message (loading earlier pages); `ChatPanel` has it
  across all (`search={false}` hides it) and opens the conversation at the message
  (`ChatThread jumpTo={{ messageId, seq }}`).
- **Link previews**: `ChatLinkPreview` under a message with a link: plain text only, the image only
  from an https URL, no referrer.
- **Moderation**: the sender sees "Hidden by moderation. Only you can see it."; observers see a
  "Hidden by moderation" or "Flagged" badge.
- **Emoji**: `ChatEmojiPicker` (frimousse) behind "+" in the reaction bar and the composer's smiley.
  Its data comes from jsDelivr's emojibase-data; self-host it with `emojibaseUrl`.
- **Video**: the composer's camera button opens `ChatVideoRecorder` (preview, a limit by role,
  retake, send). `ChatVideoPlayer` streams Mux (`https://stream.mux.com/<playbackId>.m3u8`) with
  native HLS where the browser has it and `hls.js` (an optional peer, imported only then)
  elsewhere, with Mux's thumbnail as the poster and "Processing…" while pending.

## Server: the runner

`@marktiderman/genesis-chat/server` works the outbox with a service-role client. It runs in Node,
edge functions and Deno (fetch and Web Crypto only).

```ts
import { createClient } from "@supabase/supabase-js";
import { createChatRunner, chatRunnerHandler, createExpoDeliver, deepgramTranscriber, muxVideo } from "@marktiderman/genesis-chat/server";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
export const video = muxVideo({
  tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET!, webhookSecret: process.env.MUX_WEBHOOK_SECRET!,
});
const runner = createChatRunner({
  supabase,
  // Or: (n) => notify({ type: "chat.message", recipients: n.recipients, data: n.data, idempotencyKey: n.idempotencyKey, threadKey: n.threadKey, collapseKey: n.collapseKey })
  deliver: createExpoDeliver({ tokensFor: myPushTokens, accessToken: process.env.EXPO_ACCESS_TOKEN }),
  transcriber: deepgramTranscriber({ apiKey: process.env.DEEPGRAM_API_KEY! }),
  video,
  resolveName: async (userId) => (await myProfile(userId))?.name,
});
export const POST = chatRunnerHandler({ runner, secret: process.env.CHAT_RUNNER_SECRET! });
```

Each `run()` claims up to 50 due effects (`batch.limit`), works up to 4 of a kind at once
(`batch.concurrency`), settles each (`complete_effect`; an error backs off 30 s × 2^attempts) and
answers `{ claimed, done, failed }`. It claims only `push`, `transcribe`, `storage.remove` and
`video.remove` (or the `kinds` you pass); after the 8th attempt an effect is left alone.

- **push**: one `deliver(notification)` per message, with every recipient and their badge. The
  title is the conversation's, or the sender's name (`resolveName`) in a direct conversation; in a
  group the body is `Name: preview`. `idempotencyKey` is `push:<message id>`, so a sender that
  dedupes never pushes a message twice. Throw from `deliver` to retry. `createExpoDeliver` sends
  through Expo in requests of 100 (`threadId`, `collapseId`, `badge`, channel `messages`, category
  `chat-message`) and returns the tickets: forget `deadTokens(tickets)`. It throws only when
  nothing was sent. Note that `collapseId` replaces a conversation's earlier notification on iOS.
- **transcribe**: a 10 minute signed URL to the transcriber, then `transcript_status: ready`. With no
  transcriber the status is `off`; on the last attempt a failure sets `failed`. Hosted videos get
  their transcript from Mux's captions instead. `openAiTranscriber` (gpt-4o-mini-transcribe, files
  up to 25 MB) is the other choice.
- **storage.remove** and **video.remove**: delete the file or the hosted asset; already gone is done.

### Run it every minute (Vercel cron)

`vercel.json`: `{ "crons": [{ "path": "/api/chat-runner", "schedule": "* * * * *" }] }`, and set
`CHAT_RUNNER_SECRET` to the value of Vercel's `CRON_SECRET` (Vercel sends it as
`Authorization: Bearer <CRON_SECRET>` on a GET; the handler takes GET and POST). Minute crons need
a paid Vercel plan; on Hobby, use the webhook below or a Supabase `pg_cron` + `pg_net` call.

### Or on every effect (Supabase database webhook)

Database → Webhooks → new hook on `genesis_chat.effects`, Insert, HTTP POST to your route, header
`Authorization: Bearer <CHAT_RUNNER_SECRET>`. Pushes are queued 2 seconds ahead (a burst
collapses) and retries are backed off, so keep a schedule too (every minute or five) to pick
those up.

### Env

| Variable | For |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | the service-role client |
| `CHAT_RUNNER_SECRET` | the handler's bearer, at least 32 characters |
| `EXPO_ACCESS_TOKEN` | `createExpoDeliver`, when the Expo project has enhanced push security |
| `DEEPGRAM_API_KEY` | `deepgramTranscriber` (nova-3, language detected; `Authorization: Token`) |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | `muxVideo` uploads and removal |
| `MUX_WEBHOOK_SECRET` | the Mux webhook's signing secret |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY` | only for `playbackPolicy: "signed"` (`signing` option) |

### Mux

The client asks your server for an upload (`video.createUpload({ corsOrigin, passthrough })`), puts
the file to its `url`, and sends the message with an attachment `{ kind: "video", provider: "mux",
provider_id: uploadId, status: "pending" }`. Point a Mux webhook (Settings → Webhooks) at a route
that calls `video.handleWebhook(request, { supabase })`. It checks `mux-signature` (HMAC-SHA256,
5 minutes' tolerance), and on `video.asset.ready` sets the attachment ready with its asset id,
playback id and duration; on `video.asset.errored` failed; on the English auto-generated caption
track's `video.asset.track.ready` it stores the caption text as the transcript. An event for an
attachment not there yet answers 404, so Mux retries it. Playback is public by default
(`https://stream.mux.com/<playback id>.m3u8`); with `playbackPolicy: "signed"` and `signing`,
`video.playbackUrl(id)` (or `muxPlaybackUrl`) returns a URL with an RS256 token.
