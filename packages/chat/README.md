# @marktiderman/genesis-chat

Chat for Genesis apps, in the app's own Supabase: direct messages, groups and the app's own
kinds of conversation (a cohort, a support ticket), with photos, files, voice notes and videos,
replies, threads, reactions, read state, live updates and push.

| Entry | What it is |
|---|---|
| `@marktiderman/genesis-chat` | The headless core: types, `createChatClient`, the send outbox, thread logic, media rules. No React. |
| `/react` | Hooks for web and native: `ChatProvider`, `useInbox`, `useConversation`, `useMessageActions`, and for 0002 `useTopics`, `useScheduled`, `useAvailability`, `useBroadcast`, `useSearch`, `useLinkPreviews`. |
| `/web` | Renderers on genesis-ui: inbox, thread, composer (text, photos, voice, video, emoji, scheduled send), media, topics, search, availability, broadcast. |
| `/native` | Beta: screens and parts on genesis-ui-native (inbox, thread, search, availability), voice notes, photos and video, and the push block's glue. See "On native" below. |
| `/server` | `createChatRunner`: works the outbox (push, transcripts, storage cleanup). |
| `migrations/0001_genesis_chat.sql`, `0002_genesis_chat_coaching.sql`, `0003_genesis_chat_search_threads.sql` | The schema, copied into your app by `genesis add chat` in order, each with its pgTAP test. 0003 makes `search_messages` return a hit's `thread_root_id`. |

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

## On native

`@marktiderman/genesis-chat/native` (Beta) draws chat on genesis-ui-native, over the same
`/react` hooks. Mount `ChatProvider` (from `/react`) and `ChatNativeProvider` (the native modules,
copy and people) inside `GenesisNativeApp`, then put the screens in your routes:

| Screen | What it is | Main props |
|---|---|---|
| `ChatInboxScreen` | The conversations on `InboxPage`: avatars, unread counts, the last message, pull to refresh, Mark read, Pin and Archive. | `onOpen(conversationId)`, `onStart`, `kind` / `kinds` / `excludeKinds`, `archived`, `pageProps` |
| `ChatThreadScreen` | One conversation: grouped bubbles, day lines, replies, reactions, the composer (text, photos, voice notes, video, emoji, scheduled send), topics and the away line. | `conversationId`, `threadRootId`, `jumpTo` (open at a search result), `topic` / `showTopics`, `scheduling`, `availability`, `onOpenAttachment`, `focused` (the navigator's `useIsFocused()`), `keyboardVerticalOffset` |
| `ChatSearchScreen` | Search across your conversations or in one, with matches highlighted and transcripts marked. | `onOpen(hit)`, `conversationId`, `conversationTitle` |
| `ChatAvailabilityScreen` | Your away message, its end, working hours and time zone. | `onSaved` |

`ChatNativeProvider` takes `modules` (expo-audio, expo-image-picker, expo-haptics, expo-clipboard,
expo-camera, expo-video, expo-web-browser and the rest are passed in, never imported), `copy`
overrides and `getPerson(userId)` for names and avatars. `useChatThreadStackOptions` gives the
thread's header options.

The parts (`ChatComposer`, `MessageBubble`, `MessageActionsSheet`, `VoiceNotePlayer`,
`ChatPhotoViewer`, `ChatEmojiPicker`, `ChatStartSheet`, `ChatBroadcastSheet`) build your own
screen, and the logic under them (`composerReducer`, `buildThreadRows`, `useChatComposer`,
`useVoiceRecorder`) is exported too. Glue: `createTusUpload` (resumable uploads for
`ChatProvider upload`), and for genesis-native's push block the `messages` category with Reply and
Mark read (`registerChatNotificationActions`, `handleChatPushResponse`, `chatThreadMatch`, also on
`/push` alone).

Voice notes show their transcript under the player once the server has made one ("Transcribing…"
until then), folded to three lines with "Show more"; the bubble reads the whole transcript to
VoiceOver.

### Your own attachment kinds on native

A kind registered in `ChatProvider attachmentKinds` draws as `ChatAttachmentCard` (its title,
subtitle and one button). For more than a card, pass `ChatThreadScreen slots={{ attachment }}`
(`MessageBubble attachmentSlot` in your own screen): the native twin of the web `attachment` slot.
It draws every kind the package doesn't draw itself (anything but image, voice, video, file and
link), registered or not; `null` hides the kinds that aren't registered. Its props
(`ChatAttachmentSlotProps`):

| Prop | What it is |
|---|---|
| `attachment`, `message`, `url`, `mine` | As on the web: the attachment (`ref` holds what the sender put there), its message, its signed URL when it has a file, and whether you sent it. `url` is http(s) only (null for any other scheme), since the sender controls it. |
| `kind` | Its `attachmentKinds` entry, when registered. |
| `action` | The kind's `action`, ready to call (`{ label, run }`), or null. |
| `run(task)` | Runs an app action. A task that returns a promise makes the card `pending` until it settles; if it throws or rejects, `error` holds a short message (copy `cardActionFailed`). One still running after 30 seconds stops being busy and reads `cardActionTimedOut` (`ChatThreadScreen cardActionTimeoutMs` changes it, 0 for never). A second run while one is pending is ignored. `action.run` goes through it. |
| `pending`, `error` | That state, for drawing a busy control and the error. |
| `fallback` | The card the package would have drawn: return it for kinds the slot doesn't draw. |
| `testID` | The bubble's id for this card. |

The bubble is one VoiceOver element, so the controls inside your card are hidden from VoiceOver:
give the kind an `action` and call `action.run` from your control, and the bubble offers the same
action (named by its `label`) to VoiceOver and Switch Control. Keep tap targets at least 44 points.
A slot that throws shows the fallback card until its attachment, message, kind or slot changes,
then tries again. A slot that returns null draws nothing for that attachment, and it leaves the
bubble's label and actions; a message left with nothing to show is not drawn at all. Reply quotes, the reply bar, the long-press sheet and
the inbox's last message name the kind by its `label`. Build the kinds where the app's live data
is (a hook, memoized on it), so the title and action follow it; define the slot at module scope.

A task with a checkbox:

```tsx
import { Pressable, View } from "react-native";
import { NativeText } from "@marktiderman/genesis-ui-native/components";
import { ChatThreadScreen, type ChatAttachmentSlotProps } from "@marktiderman/genesis-chat/native";

// In the component that mounts ChatProvider, so the kind reads the tasks' live state.
const tasks = useTasks(); // your own query: { [taskId]: { done } }
const toggle = useToggleTask(); // returns a promise
const attachmentKinds = useMemo(
  () => ({
    task: {
      label: "Task",
      title: (a) => String(a.ref.title ?? "Task"),
      subtitle: (a) => (tasks[String(a.ref.taskId)]?.done ? "Done" : "To do"),
      // The checkbox's action, and the bubble's VoiceOver action.
      action: (a) => {
        const done = Boolean(tasks[String(a.ref.taskId)]?.done);
        return { label: done ? "Mark not done" : "Mark done", onPress: () => toggle(String(a.ref.taskId), !done) };
      },
    },
  }),
  [tasks, toggle],
);

function TaskCard({ attachment, action, pending, error, fallback }: ChatAttachmentSlotProps) {
  const task = useTask(String(attachment.ref.taskId ?? "")); // your own hook, before any return
  if (attachment.kind !== "task") return fallback;
  const done = Boolean(task?.done);
  return (
    <View style={{ minWidth: 220, gap: 4 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, busy: pending }}
        disabled={pending || !action}
        onPress={action?.run}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}
      >
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, opacity: pending ? 0.5 : 1 }}>{done ? <NativeText>✓</NativeText> : null}</View>
        <NativeText>{String(attachment.ref.title)}</NativeText>
      </Pressable>
      {error ? <NativeText preset="caption">{error}</NativeText> : null}
    </View>
  );
}

<ChatThreadScreen conversationId={id} slots={{ attachment: TaskCard }} />
```

The same slot draws a win card or a worksheet with its progress; `run` is there for actions that
aren't the kind's button (save an answer). `useCardRuns`, `AppAttachment` and `CardError` are
exported for your own bubble.

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
// A hit that is a reply in a thread has `threadRootId`: open that thread to show it.
chat.search(query, conversationId?, { limit? }): Promise<ChatSearchHit[]>

// Storage upload; with onProgress, bytes go to a signed upload URL through XMLHttpRequest
// (browsers, React Native) so progress is reported; elsewhere it reports once, at the end.
chat.upload(conversationId, userId, bytes, { name, contentType, onProgress?(sent, total), signal? }): Promise<string>

// Link previews the runner fetched (status ok only), by message id, through link_previews_for
// (one call per message, six at a time): only for messages you can read. The table is closed.
chat.linkPreviewsFor(messageIds): Promise<Record<string, ChatLinkPreview[]>>
```

`ChatMessage.moderation` is `"flagged" | "hidden" | null`: a hidden message reaches only its
sender and the conversation's observers. Pure helpers: `isWithinWorkingHours(hours, timeZone,
now)` (an end at or before the start runs past midnight), `isAway(a, now)`, `hoursSummary(hours)`
("Mon–Fri, 9–5"), `awaySummary(people, { now })` (a group: "Sam, Lee and 2 others are away"),
`awayLine(a, name, { now })` ("Mark replies Mon–Fri, 9–5 (Eastern)", "Away until
Monday: Back Monday", or null when they're around), `extractLinks(body)` (the database's `message_links` rule, which skips credential-looking queries),
`isHttpsUrl`, `snippetParts(snippet)`, `scheduleQuickPicks(now)`, `scheduleLabel`, `isSchedulable`,
`topicKey(title)`.

```ts
const line = awayLine(await chat.availabilityFor(id).then((a) => a[0]), "Mark");
```

### React hooks

```tsx
const { topics, setTopic } = useTopics(conversationId);          // live: set_topic's hint refreshes it
const thread = useConversation(conversationId, { topic: "week-1" }); // one topic; sends go into it
const { items, schedule, cancel } = useScheduled(conversationId);   // schedule(input, files?) uploads files first, as send does; cancel also removes a failed one
const { mine, setMine, members, others, forUser } = useAvailability(conversationId);
const { send, sending } = useBroadcast();                          // send(ids, body) -> message ids
const { hits, isSearching, query } = useSearch(text, { conversationId, debounceMs: 250 });
const previews = useLinkPreviews(messageIds);                      // Record<messageId, ChatLinkPreview[]>, in link order
```

`useConversation` also returns `signalRecordingVideo()` (throttled, like `signalRecording`), `loadUntil(seq)` (loads earlier pages until that message is here,
for a search result), `accessError` and `refetchAccess` (the role check failed: offer a retry, not
"can't post"). It catches up (messages after the newest one held) every time its live channel
joins, the first time included, and keeps `hasEarlier` in the cached page. Catch-up pages 200 at a
time until a short page; after 10 full pages it shows the newest page instead, with `hasEarlier`.
Only the whole timeline marks the conversation read: a topic or thread view doesn't (the read
place is one number per conversation, and a topic's newest message would pass unseen messages in
other topics).

`useChat()` adds `retryAll()` (call it from AppState or NetInfo on native; the web provider retries
on `online` and once after loading the saved outbox) and `clearOutbox()` (call it on sign-out).
`retryAll` goes through each conversation in order and stops at the first message that can't go on
its own: one waiting for a lost file, or one the server refused (`permanent`: 42501, 22xxx, 23xxx,
42xxx, P0001), which only a manual `retry` sends again. `clearOutbox` stops sends in flight at once:
uploads get an aborted `signal` (the `upload` prop's third argument), and nothing posts or is saved
afterwards, so a send can't go out under the next account. The outbox owns a file's `previewUrl`
once queued and lets go of it (`releasePreview`, default: revoke `blob:` URLs) when the message
lands or is discarded.

A pending message's files carry their upload progress: `PendingMessage.files[i].progress` (0 to 1),
reported by `client.upload`'s `onProgress` or by your `upload` prop calling `opts.onProgress(sent,
total)`. The web bubble draws it as a bar.

### Hosted video in the outbox

A file marked `hosted: true` goes to the hosted video provider instead of storage, through the
outbox, in its place in the order:

1. The outbox calls `hostedUpload(conversationId, file, { signal, onProgress, resume? })`, which
   mints the upload and resolves at once with `{ provider: "mux" | "cloudflare", providerId,
   status: "pending", url?, done? }`; `done` settles when the bytes are up.
2. The message is sent straight away with `{ kind: "video", provider, providerId, status:
   "pending" }`, so text written after it lands after it. The provider's webhook flips it ready.
3. The message stays in the outbox (hidden from the thread, which has the server's copy) until
   `done` settles, with the upload saved as `QueuedMessage.hosted[i]` (`provider`, `providerId`,
   `url`). After a relaunch the outbox calls `hostedUpload` again with `resume` set to that record,
   then sends the message again with the same clientId (posting nothing twice). A failed transfer
   marks it failed without holding later messages; Retry (or `retryAll`) resumes it the same way.

On the web, `ChatProvider videoUpload` gives the default `hostedUpload` (`hostedUploadFrom`: one PUT
of the whole file, with progress) and the composer's video recorder sends `hosted` files. Without
`videoUpload` (or `hostedUpload`), hosted files go to storage like any other.

**Native contract.** Pass your own `hostedUpload` to `ChatProvider` (it wins over `videoUpload`),
and send recordings through `useChat().outbox.send(input, [{ data: uri, name, contentType, hosted:
true, meta: { kind: "video", durationMs } }])` instead of uploading first:

```ts
hostedUpload={async (conversationId, file, { signal, onProgress, resume }) => {
  // Resuming (a relaunch, a retry): keep the providerId; the message may already carry it.
  const minted = resume?.url ? { url: resume.url, providerId: resume.providerId, provider: resume.provider }
                             : await videoUpload.create(conversationId);
  const done = putChunks(minted.url, file.data as string, { signal, onProgress, resume: Boolean(resume) });
  return { provider: minted.provider, providerId: minted.providerId, status: "pending", url: minted.url, done };
}}
```

Resolve as soon as the provider id exists; never wait for the bytes. On `resume`, carry the same
upload on (ask the server how much it has) and return the same `providerId`. Mint a new one only
when the old upload is gone: a message already posted keeps the old id, and its video stays
pending. Persist the file (`persistFile`) so a relaunch still has its bytes.

`ChatProvider` takes two more props:

```tsx
<ChatProvider
  client={chat}
  userId={user.id}
  // Mux direct uploads: your server makes the upload; the composer's recording goes through the
  // outbox as a hosted file, sent at once as { kind: "video", provider: "mux", providerId,
  // status: "pending" } while its bytes are PUT there. Without it, videos upload to storage.
  // Pairs with createVideoUploadHandler from /server, which mints the upload and its passthrough;
  // the client sends only the upload id (no attachment id).
  videoUpload={{
    create: (conversationId) =>
      fetch("/api/chat-video-upload", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ conversationId }),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't start the upload")))),
  }}
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
yourself in that slot (on native the slot draws registered kinds too; see "Your own attachment
kinds on native"):

```tsx
<ChatThread slots={{ attachment: (props) =>
  props.attachment.kind === "check-in"
    ? <CheckInCard id={String(props.attachment.ref.checkInId)} mine={props.mine} />
    : <GenericAttachment {...props} />
}} />
```

### Web components

One message can't break a thread: each row renders inside `ChatErrorBoundary` ("This message
couldn't be shown"), an `attachment` slot that throws falls back to `GenericAttachment`, and an
`attachmentKinds` entry is used only for its own key (never `constructor` and the like) when its
`title` returns a string; a kind whose functions throw or return the wrong shapes gets the
generic card. A row that can't be drawn is reported through `reportError` from
`@marktiderman/genesis-core/errors` (source `chat:render`), unless you pass `ChatErrorBoundary`
an `onError`. On native, a card's action that fails and an `attachmentKinds` entry that throws are
reported the same way (`chat:attachment-action`, `chat:attachment-kind`): the native
observability block sends them to Sentry; without a reporter they go to the console in
development.

- **Topics**: `ChatThread` shows `ChatTopicBar` (All plus each topic, a lock on closed ones) when
  the conversation has topics (`showTopics` shows it before the first, for owners). Owners and
  admins get "New topic" and close or reopen. In a closed topic members see "This topic is closed".
- **Scheduled send**: the arrow beside Send offers tomorrow 9 AM, Monday 9 AM, or a date and time;
  "N scheduled messages" above the box opens `ChatScheduledList` with Cancel, or Remove for one that
  failed when due (`scheduling={false}` turns it off). `ChatScheduledList` also works on its own, for all conversations.
- **Availability**: `ChatAwayBanner` above the messages when the other person is away or outside
  their hours, or in a group everyone who is (two names, then "and N others"); `ChatAvailabilitySettings` for your own.
- **Broadcast**: `<ChatBroadcast resolveUser={…} kind="direct" />` picks conversations from the inbox
  and sends once, saying replies come back privately.
- **Search**: `<ChatSearch resolveUser onOpen={(hit) => …} conversationId? />`; the thread header has
  it for one conversation and jumps to the message (loading earlier pages); `ChatPanel` has it
  across all (`search={false}` hides it) and opens the conversation at the message
  (`ChatThread jumpTo={{ messageId, seq, threadRootId }}`). A hit that is a reply in a thread
  calls `onOpenThread(root, { jumpTo: { messageId, seq } })` (pass `jumpTo` to the thread's own
  `ChatThread`) and scrolls the timeline to the thread's first message.
- **Link previews**: `ChatLinkPreview` under a message with a link: plain text only, no referrer,
  and **no image by default**. An og:image lives on the linked site, so loading it in readers'
  browsers tells that site (which the sender may control) each reader's IP and when they read it.
  `ChatThread linkPreviewImages`: `"off"` (default), `"proxy"` (loads `linkPreviewProxyUrl(url)`,
  your own image proxy; no image without it), or `"direct"` (from the linked site, https only, if
  you accept that). `ChatLinkPreview` takes the same as `images` and `proxyUrl`.
- **Moderation**: the sender sees "Hidden by moderation. Only you can see it."; observers see a
  "Hidden by moderation" or "Flagged" badge.
- **Emoji**: `ChatEmojiPicker` (frimousse) behind "+" in the reaction bar and the composer's smiley,
  offered only when you pass `emojibaseUrl` (`ChatThread`, `ChatComposer`): host the
  `emojibase-data` package's `en/data.json` and `en/messages.json` there (frimousse fetches
  `${emojibaseUrl}/en/data.json`). Without it nothing is fetched and only the quick reactions show;
  frimousse's own default, jsDelivr's unpinned `emojibase-data@latest`, is never used. If you point
  it at a CDN instead, add that host to your CSP's `connect-src`.
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
answers `{ claimed, done, failed }`, plus `scheduled` (`{ due, posted, skipped, failed }`) unless
`scheduled: false`, and `purged` and `errors` when there are any. It
claims `push`, `transcribe`, `storage.remove` and `video.remove`, plus `moderate` with a `moderator`
and `unfurl` with an `unfurler` (or the `kinds` you pass); after the 8th attempt an effect is left
alone. Each run also posts due scheduled messages (`due_scheduled`, then `post_scheduled` each, as
their sender, with every check `send_message` makes; a refusal is recorded on the row at once, a
passing error such as a deadlock is tried again on the next run, up to five times; `scheduled:
false` turns it off) and, with
`retention: true`, removes messages past their kind's retention (up to 10 `purge_expired` calls a run,
each removing up to `retentionBatch`, default 1 000; never in a conversation on legal hold). A failed
`due_scheduled` or `purge_expired` is reported in `errors`, never thrown; a scheduled message whose
`post_scheduled` throws counts in `scheduled.failed` and is logged, not added to `errors`.

- **push**: one `deliver(notification)` per message, with every recipient and their badge. The
  title is the conversation's, or the sender's name (`resolveName`) in a direct conversation; in a
  group the body is `Name: preview`. `idempotencyKey` is `push:<message id>`, so a sender that
  dedupes never pushes a message twice; `data` always carries `messageId` and `seq` (native derives
  a reply's client id from them). There is no `collapseKey` unless you pass `collapse: true`: on iOS
  the collapse id becomes the notification's identifier, so replies from two notifications of one
  conversation would collide. Throw from `deliver` to retry. `createExpoDeliver` sends
  through Expo in requests of 100 (`threadId`, `collapseId`, `badge`, channel `messages`, category
  `messages`, the one `/native` registers Reply and Mark read under) and returns the tickets: forget `deadTokens(tickets)`. It throws only when
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
  actions: { messages: MESSAGE_ACTIONS },
  types: { "chat.message": { ...CHAT_NOTIFICATION_TYPES["chat.message"], actions: "messages" } },
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
`moderator: openAiModerator({ apiKey: process.env.OPENAI_API_KEY! })`: it sends the text and every
photo (signed 10 minute URLs; the text with the first, the others one request each) to
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

### A fake video provider for development

`fakeVideoProvider` stands in for Mux locally, so the hosted path (pending, upload, ready) runs
without an account. It throws when `NODE_ENV` is `production` unless you pass `force: true`.

```ts
import { createVideoUploadHandler, fakeVideoProvider } from "@marktiderman/genesis-chat/server";
const video = fakeVideoProvider({
  supabase: serviceRoleClient,                          // writes the bucket, calls update_attachment
  uploadUrl: "http://localhost:3000/api/dev/fake-video", // where you mount video.handler
});
export const mint = createVideoUploadHandler({ video, authorize, corsOrigin: "http://localhost:3000" });
export const PUT = video.handler;      // takes the bytes, stores them, marks the attachment ready
export const OPTIONS = video.handler;
// Or by hand, as Mux's video.asset.ready webhook would:
await video.markReady(providerId, { durationMs: 4200, posterPath });
```

`createUpload` returns `uploadUrl?id=fake_<uuid>`. `handler` stores the PUT body in the genesis-chat
bucket under the upload's conversation and uploader, then calls `markReady`, waiting up to
`readyWaitMs` (10 s) for the message carrying the upload; past that it answers 202 and you can call
`markReady` later. `markReady` calls `genesis_chat.update_attachment` with status ready, playback id
`fake-<upload id>`, a fake HLS URL (`https://fake-video.invalid/...`) and the duration and poster
you give. `video.playbackUrl(playbackId)` signs a link to the stored file.

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
