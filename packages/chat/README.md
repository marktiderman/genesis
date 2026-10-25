# @marktiderman/genesis-chat

Chat for Genesis apps, in the app's own Supabase: direct messages, groups and the app's own
kinds of conversation (a cohort, a support ticket), with photos, files, voice notes and videos,
replies, threads, reactions, read state, live updates and push.

| Entry | What it is |
|---|---|
| `@marktiderman/genesis-chat` | The headless core: types, `createChatClient`, the send outbox, thread logic, media rules. No React. |
| `/react` | Hooks for web and native: `ChatProvider`, `useInbox`, `useConversation`, `useSend`, `useMessageActions`. |
| `/web` | Renderers on genesis-ui: inbox, thread, composer (text, photos, voice), media. |
| `/native` | Coming in the next release: renderers on genesis-ui-native (`InboxPage` and `ThreadPage` wired to chat, voice notes with expo-audio). Empty in this version. |
| `/server` | `createChatRunner`: works the outbox (push, transcripts, storage cleanup). |
| `migrations/0001_genesis_chat.sql` | The schema, copied into your app by `genesis add chat`, with its pgTAP test. |

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
level security, and fetch what they missed after a reconnect. Typing and recording are broadcast
by clients and never stored.

## The outbox

A message queues a `push` effect, a voice note or video a `transcribe` effect, a deleted file a
`storage.remove` effect. `createChatRunner` (from `/server`) claims and settles them; nothing is sent
from a trigger.

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
  // Or through genesis-notifications: notificationsDeliver({ notify, client: supabase, registry: notifications })
  deliver: createExpoDeliver({ tokensFor: myPushTokens, accessToken: process.env.EXPO_ACCESS_TOKEN }),
  transcriber: deepgramTranscriber({ apiKey: process.env.DEEPGRAM_API_KEY! }),
  video,
  resolveName: async (userId) => (await myProfile(userId))?.name,
});
export const POST = chatRunnerHandler({ runner, secret: process.env.CHAT_RUNNER_SECRET! });
```

Each `run()` claims up to 50 due effects (`batch.limit`), works up to 4 of a kind at once
(`batch.concurrency`), settles each (`complete_effect`; an error backs off 30 s × 2^attempts) and
answers `{ claimed, done, failed, scheduled }` (plus `purged` and `errors` when there are any). It
claims `push`, `transcribe`, `storage.remove` and `video.remove`, plus `moderate` with a `moderator`
and `unfurl` with an `unfurler` (or the `kinds` you pass); after the 8th attempt an effect is left
alone. Each run also posts due scheduled messages (`due_scheduled`, then `post_scheduled` each, as
their sender, with every check `send_message` makes; a refusal is recorded on the row at once, a
passing error such as a deadlock is tried again on the next run, up to five times; `scheduled:
false` turns it off) and, with
`retention: true`, removes messages past their kind's retention (`purge_expired`, up to 10 000 a run,
never in a conversation on legal hold). A failure there is reported in `errors`, never thrown.

- **push**: one `deliver(notification)` per message, with every recipient and their badge. The
  title is the conversation's, or the sender's name (`resolveName`) in a direct conversation; in a
  group the body is `Name: preview`. `idempotencyKey` is `push:<message id>`, so a sender that
  dedupes never pushes a message twice; `data` always carries `messageId` and `seq` (native derives
  a reply's client id from them). There is no `collapseKey` unless you pass `collapse: true`: on iOS
  the collapse id becomes the notification's identifier, so replies from two notifications of one
  conversation would collide. Throw from `deliver` to retry. `createExpoDeliver` sends
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
| `OPENAI_API_KEY` | `openAiModerator` (omni-moderation-latest) |
| `ANTHROPIC_API_KEY` | `createChatAssistant` on the fetch path (or pass an `@anthropic-ai/sdk` client) |

### Mux

The client asks your server for an upload (`createVideoUploadHandler`, below), puts the file to its
`url`, and sends the message with an attachment `{ kind: "video", provider: "mux", provider_id:
uploadId, status: "pending" }`. Point a Mux webhook (Settings → Webhooks) at a route that calls
`video.handleWebhook(request, { supabase })`. It checks `mux-signature` (HMAC-SHA256, 5 minutes'
tolerance) and finds the attachment only by that upload id (unique per attachment). It applies an
asset event only when the upload's passthrough, which the upload handler sets, names the
attachment's conversation (and its sender, when `authorize` named the uploader); anything else
answers 409 and changes nothing. On `video.asset.ready` it sets the attachment ready with its asset id,
playback id and duration; on `video.asset.errored` failed; on the English auto-generated caption
track's `video.asset.track.ready` it stores the caption text as the transcript. An event for an
attachment not there yet answers 404, so Mux retries it. Playback is public by default
(`https://stream.mux.com/<playback id>.m3u8`); with `playbackPolicy: "signed"` and `signing`,
`video.playbackUrl(id)` (or `muxPlaybackUrl`) returns a URL with an RS256 token.

### Push through genesis-notifications

```ts
import { defineNotifications, MESSAGE_ACTIONS } from "@marktiderman/genesis-notifications";
import { notify } from "@marktiderman/genesis-notifications/server";
import { CHAT_NOTIFICATION_CATEGORIES, CHAT_NOTIFICATION_TYPES, notificationsDeliver } from "@marktiderman/genesis-chat/server";

export const notifications = defineNotifications({
  categories: { ...CHAT_NOTIFICATION_CATEGORIES },
  actions: { message: MESSAGE_ACTIONS },
  types: { "chat.message": { ...CHAT_NOTIFICATION_TYPES["chat.message"], actions: "message" } },
});
const deliver = notificationsDeliver({ notify, client: supabase, registry: notifications });
```

One `notify()` per message: type `chat.message` (category `messages`, in the feed and pushed),
every recipient with their own badge, `idempotencyKey: push:<message id>`, `threadKey` the
conversation, `data` `{ url, conversationId, messageId, seq, title, body, senderId }`, and
`collapseKey` only when the runner's `collapse` is on. Preferences, quiet hours and devices are
genesis-notifications'.

### Moderation

`set_kind_options('cohort', p_moderate => true)` (a migration of yours) queues a `moderate` effect
for each new or edited text message in that kind, and holds the message's push until the verdict:
clean or flagged sends it, hidden never does (nor counts the message in a badge or shows it in the
inbox). So a runner without a moderator sends no pushes for that kind. Give the runner
`moderator: openAiModerator({ apiKey: process.env.OPENAI_API_KEY! })`: it sends the text and up to
four photos (signed 10 minute URLs; the text with the first, the others one request each) to
`omni-moderation-latest`. A category score at or over `hide` (default 0.9) hides the message from
members and files a report for observers; at or over `flag` (default 0.5), or flagged by OpenAI,
files the report only. `sexual/minors` hides at 0.5; `self-harm/intent` and
`self-harm/instructions` flag at 0.3 so a coach sees them. Change them with `thresholds` and
`categories`. The report names the categories and scores, never the text. A verdict never lowers
one already given (a retry can't un-hide a message), the same verdict on the same text files one
report, and a moderator still failing on the last of 8 attempts files `flagged` with the reason
"moderation unavailable", so observers see it and the push goes.

### Link previews

`unfurler: createLinkUnfurler()` works `unfurl` effects (a message's first three https links,
leaving out any whose query carries a credential such as `token=`, `sig=`, `code=` or
`X-Amz-Signature=`) and stores `ok`, `failed` or `blocked` with `save_link_preview`. Clients read
previews with `genesis_chat.link_previews_for(message_id)`, which returns them only for a message
the caller can read; the table itself is not readable, since its URLs come from private messages.
It fetches https on port 443 only, follows at most 3 redirects and checks each one, refuses private,
loopback, link-local, carrier-grade NAT and cloud metadata addresses and the IPv6 forms that carry
them (and `localhost`, `*.local`, `*.internal`, single-label names), holds og:image to the same
rules (else drops it), reads HTML only, up to 512 KiB, in 5 seconds (the DNS lookup included), and
runs nothing. It resolves the host first through `node:dns` or `Deno.resolveDns`; where neither
exists (some edge runtimes) it refuses every named host and logs once, unless you pass `resolve`,
or `allowUnresolved: true` behind an egress firewall. fetch resolves the name again; on Node, close
that rebinding gap with `dispatcher: new Agent({ connect: { lookup: guardedLookup } })` (`Agent`
from `undici`), which checks the address each connection actually uses. Elsewhere, firewall private
ranges from the runner.

### Video uploads

```ts
import { createVideoUploadHandler } from "@marktiderman/genesis-chat/server";
const handler = createVideoUploadHandler({
  video, // muxVideo(...) from above
  // Confirm the session's user may post there (e.g. a select on genesis_chat.members as that
  // user) and name them, so the upload is bound to its uploader.
  authorize: async (request, { conversationId }) => {
    const user = await userFrom(request);
    return user && (await mayPost(user, conversationId)) ? { userId: user.id } : false;
  },
  corsOrigin: ["https://app.example.com"], // required; native apps send no origin and get the first
  rateLimit: async (_request, { userId }) => underUploadCap(userId), // optional: 429 when false
});
export const POST = handler;
export const OPTIONS = handler; // CORS preflight for a web client on another origin
```

The composer POSTs `{ conversationId }` and gets `{ url, providerId, provider: "mux" }`; it PUTs
the file to `url` and sends the attachment with `provider_id: providerId`. The client chooses
nothing the webhook trusts: the server sets the upload's passthrough to the conversation and
uploader. A refusal answers 403; over the cap, 429.

### AI recaps and reply drafts

```ts
import { createChatAssistant } from "@marktiderman/genesis-chat/server";
const assistant = createChatAssistant({ apiKey: process.env.ANTHROPIC_API_KEY! }); // or { anthropic: new Anthropic() }
const { text, model, labelled } = await assistant.recap({ messages, since: lastReadAt, me: userId, resolveName });
const draft = await assistant.draftReply({ messages, me: coachId, voice: "warm, brief, first names", resolveName });
```

Default model `claude-sonnet-5-5`, low effort, with `fallbacks: "default"` (a declined request is
re-run on Anthropic's recommended model; `fallbacks: false` turns it off). Nothing is sent: show the
text as written by AI (`labelled: true`) and let the person edit and send it. Internal notes and
hidden messages are left out unless you pass `observer: true` for a staff reader: take it from
`genesis_chat.i_observe(conversation)` asked as that reader, never from the request. The transcript
goes in as data, with `<` and `>` in bodies and names replaced so nothing can close its tags, and
the prompt tells the model to ignore instructions inside it. Call it from your server only, for a
user you have checked may read the conversation. `fallbacks` is a Claude API feature: Bedrock,
Vertex AI and Foundry clients reject it, so pass `fallbacks: false` with those.

### Retention once a day

Run a second runner daily with retention on (and scheduled posting off, since the minute runner
does it). `vercel.json`: `{ "crons": [{ "path": "/api/chat-runner", "schedule": "* * * * *" },
{ "path": "/api/chat-retention", "schedule": "30 3 * * *" }] }`, and:

```ts
// app/api/chat-retention/route.ts
const retention = createChatRunner({ supabase, deliver, kinds: [], scheduled: false, retention: true });
export const GET = chatRunnerHandler({ runner: retention, secret: process.env.CHAT_RUNNER_SECRET! });
```

Set a kind's retention with `set_kind_options('support', p_retention => interval '365 days')`, and
hold a conversation with `set_legal_hold(id, true)` (service role).
