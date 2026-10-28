# @marktiderman/genesis-chat

## 0.4.0

### Minor Changes

- 9a254df: The AI recap and reply-draft prompts are neutral: they speak of "a conversation" and draft for the person labelled You, in their voice, where they assumed coaching before. `createChatAssistant({ context })` (optional, a noun phrase such as "a coaching conversation" or "a support ticket") tells the model what kind of conversation it is. `recapSystem(context?)` and `draftSystem(context?)` return the system prompts.

  Behaviour change: the prompt text changed, and `context` does not restore the old wording. `draftPrompt` now ends with "Their voice: …" and "Draft the next message from You." (it said "The coach's voice: …" and "Draft the coach's next message."), so code or tests that match the old prompt strings need updating, and drafts may read slightly differently. The README notes that migration 0002 is the chat extras and its file name is historical.

  Features: chat

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0

## 0.3.4

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.3.3

### Patch Changes

- c103d2d: Errors chat survives are reported through `reportError` from `@marktiderman/genesis-core/errors` instead of the console: `ChatErrorBoundary` without `onError` (`chat:render`, before: `console.error`), and on native a card's action that failed (`chat:attachment-action`) and an `attachmentKinds` entry that threw (`chat:attachment-kind`), which were written to the console in development only. With the native observability block they reach Sentry; with no reporter they still go to the console in development.

## 0.3.2

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.3.1

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.3.0

### Minor Changes

- 2ef7db1: - Native: an `attachment` slot for the app's own attachment kinds (`ChatThreadScreen slots={{ attachment }}`, `MessageBubble attachmentSlot`), the twin of the web slot. It gets the web slot's props (`attachment`, `message`, `url`, `mine`) plus `kind`, the kind's `action` ready to call, `run(task)` with `pending` and `error` for the app's own actions (tick a task), `fallback` (the card it would have been) and `testID`. It draws every kind the package doesn't draw, registered or not; `null` hides unregistered kinds; a slot that throws shows the card. The kind's action stays the bubble's VoiceOver action. The default card's button is 44 points tall and shows busy while an `onPress` that returns a promise runs, and an error line if it rejects.
  - A kind's `action().onPress` may return a promise (the web card catches its rejection).
  - Native reply quotes, the reply bar and the jump announcement name an app kind by its `label`, as the inbox and the long-press sheet do.
  - Native voice notes show their transcript under the player ("Transcribing…" until it is ready), folded to three lines with "Show more", and the bubble reads it to VoiceOver.
  - `ChatErrorBoundary` moved to `src/react/error-boundary.tsx` (no DOM) so native shares it; `/web` still exports it.
- b8ab65a: Native attachment slot, after review:
  - A slot that threw tries again once its attachment, message, kind or slot changes (`ChatErrorBoundary resetKeys`), instead of keeping the card for the row's life.
  - A slot that returns null draws nothing for that attachment and leaves the bubble's label and VoiceOver actions; a message left with nothing to show (also one that is only an unregistered kind under `slots={{ attachment: null }}`) is not drawn or read.
  - The slot's `url` is http(s) only, else null (`slotUrl`).
  - A card action still running after 30 seconds stops being busy and reads `cardActionTimedOut`; `cardActionTimeoutMs` on `ChatThreadScreen` and `MessageBubble` changes it (0 for never).
  - A voice note's transcript folds behind "Show more" by its measured line count (an unclamped copy laid out out of sight), not its length.

### Patch Changes

- 4f231f7: `ChatSearchScreen` clears a large-title or see-through (Liquid Glass) navigation bar: its search field, hint, loading and empty states now sit in the results list (the field as its header), whose automatic content inset moves them below the bar, as `InboxPage` does. Before, the field was a plain view at the top of the screen and drew behind the navigation bar, where it couldn't be tapped.
- a85f1c7: Docs. genesis-chat: the README covers `/native` (Beta: its screens and their main props), lists migration 0003 and names the push category `messages`. genesis-native: the rich push plugin's first-build steps for the Notification Service Extension (enable Communication Notifications on `<bundle id>.NotificationService`, then `eas credentials` to make its profile). genesis-notifications: a push carries a type's `push.ids` (and, with previews shown, `push.display` and `mutableContent`), and the Notification Service Extension works with it through genesis-native.
- b3b8712: Chat pushes sent through genesis-notifications now get Reply, Mark as read and the Communication Notification:

  - Chat's Mark read action id is `mark_read`, the same as `MESSAGE_ACTIONS` (device ids take no "-"). A notification already on a phone with the old `mark-read` still marks read.
  - The docs and examples put `MESSAGE_ACTIONS` under the `messages` id, the category chat's push handler and genesis-native's notification service extension look for. Before, they said `message`, so on that path Mark read did nothing and the extension skipped the push. If your registry copied the old example, rename `actions: { message: MESSAGE_ACTIONS }` to `messages` and the type's `actions: "message"` to `"messages"`.

## 0.2.2

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.2.1

### Patch Changes

- 2ce9ff8: Migration 0003: `genesis_chat.search_messages` also returns `thread_root_id`, so a search hit inside a reply thread opens that thread. (Moved out of 0002, which is released as it stands.)
- 177829a: - `refetchConversation` (and so `refetchAccess`, the offline Retry) refetches the conversation, topics, availability, members, role and pins, never the message lists: a refetch had replaced loaded history and merged live messages with one fresh page.
  - The web inbox previews a message that is only an app card by its kind's `label`, else its title, as native does: both use the same previews module (`src/react/previews.ts`).
  - `ChatVideoRecorder`'s `videoUpload` says it must match the provider's (or the provider needs a `hostedUpload`).
- 4f4e0a4: - An app attachment kind's `title`, `subtitle` and `action` get `{ mine }` (`ChatCardContext`, now in `/react`) on the web too, so your own check-in can drop its button. A kind's optional `label` names it in previews (the native and web inbox, the long-press sheet); its title by default.
  - Upload answers: 408 is retried like a 5xx, 429 waits as rate limited (`GS429`) instead of blocking the conversation as a refusal.
  - Upload progress moves in whole percents, so the chat tree re-renders at most 100 times per file.
  - `ChatProvider` reads `videoUpload`, `hostedUpload`, `upload`, `readFile` and `persistFile` at call time: an inline `videoUpload.create` closing over a refreshed token keeps working.
- 28439ee: Chat on native, from a simulator check: a video pauses when the app goes to the background and when it unmounts, and `ChatThreadScreen focused={false}` (the navigator's `useIsFocused()`) pauses what the thread is playing, since a tab switch keeps it mounted (`pauseChatPlayback`). Each scheduled row's Cancel names its message. The long-press sheet's caption has room under the sheet's top edge and names an app card by its kind's title, as the inbox preview now does (`attachmentPreview`). A newly added topic's chip scrolls into view. The topic and schedule sheets fit their content. A closed topic with no messages says it is closed. App attachment kinds get `{ mine }` as a second argument (`ChatCardContext`), so the sender's card can drop its button.

  genesis-ui-native: `NativeSheet fitContent`, a sheet as tall as its content (on iOS a bottom panel over a scrim, kept above the keyboard; under `NativeSheetProvider`, the library's dynamic sizing).

- 93f7243: Native team requests for chat's core, react, web and server:

  - A hosted video joins the outbox at start: a `LocalFile` marked `hosted` goes through the outbox's `hostedUpload` (`ChatProvider hostedUpload`, or `hostedUploadFrom(videoUpload)` by default), the message is sent at once in order with the attachment pending, and the upload is saved with it, so a relaunch carries it on (`resume`) and re-sends with the same clientId. The web video recorder uses it.
  - Upload progress: `client.upload(..., { onProgress, signal })` (XMLHttpRequest to a signed upload URL where there is one), passed to the `upload` hook too, shown as `PendingMessage.files[i].progress` and a bar on web pending bubbles.
  - `fakeVideoProvider()` in `/server`: a dev-only `VideoProvider` with a mountable upload handler and `markReady`, refusing `NODE_ENV=production` unless forced.
  - `useScheduled().schedule` takes native file URIs and the provider's `upload` hook, as `send` does.
  - Search hits carry `threadRootId` (`genesis_chat.search_messages` returns `thread_root_id`; migration 0003), and the web thread opens a reply's thread.
  - A failed scheduled message can be removed: the memory client matches `cancel_scheduled`, and the web scheduled list offers Remove.

- 85a9ea5: The access Retry (`refetchAccess`, also `refetchConversation`) refetches every lookup of a conversation, so the away line and the rest recover too. Migration 0003 also broadcasts any change to a message's moderation, however it's made, so a hidden message updates live.
- 8ef3ad2: The 0002 pgTAP test checks the push badge's kind exclusion against a real recipient, a new direct message, instead of an assertion that could never fail. Copy `migrations/tests/0002_genesis_chat_coaching.test.sql` again.

## 0.2.0

### Minor Changes

- 099084a: Native chat: async video messages, link previews and app attachment cards. `ChatVideoRecorder` records in the thread on expo-camera (`modules.camera`): tap to start and tap to send, or hold and let go; flip between takes; the time against the role's limit; close to throw a take away; camera and microphone asked for when it opens. A recording goes through `ChatProvider videoUpload` (a Mux direct upload, minted when recording starts) in resumable chunks (`chunkedPut`, retried and resumed after a dropped connection), with progress and Retry above the composer (`VideoUploadTray`), then is sent through the outbox as a pending Mux attachment; without `videoUpload` it goes to storage as a file. `ChatVideoPlayer` plays HLS and files on expo-video (`modules.video`): poster and duration, tap to play, pause, mute, 1x / 1.5x / 2x, full screen, "Processing" until Mux is done, one at a time with voice notes. `ChatLinkPreviewCard` shows a link's site, title and description under its message (no preview for hidden messages; the image only with `linkPreviewImages`), opening in expo-web-browser when given (`modules.webBrowser`), else the system browser. `ChatAttachmentCard` draws `ChatProvider attachmentKinds` (a form, a check-in) with its button, or `ChatThreadScreen onOpenAttachment`. Genesis UI Native adds the icons `video`, `camera-flip`, `volume`, `volume-off`, `expand` and `stop`.
- 4f7ed6f: Native chat for migration 0002's organising features, in `@marktiderman/genesis-chat/native`, matching the web:

  - **Topics:** `ChatThreadScreen` shows a topic bar (`ChatTopicBar`: "All" and each topic as chips, a lock on closed ones) when the conversation has topics, and lists the topic chosen, with "Message #Topic" in the field. Owners and admins add, rename, close and reopen topics from its options sheet. A member sees "This topic is closed." instead of the field in a closed topic.
  - **Scheduled send:** touch and hold Send (also a VoiceOver action) to open `ChatScheduleSheet`, with tomorrow 9 AM, Monday 9 AM, or a date and time from genesis-ui-native's `NativeDatePicker` and `NativeTimePicker`. `ChatScheduledBar` ("2 scheduled messages") over the composer opens `ChatScheduledList`, where each one can be cancelled. Text only for now: a message with photos asks you to send or remove them.
  - **Availability:** the thread shows `ChatAwayLine` under the header when the other person is away or outside their hours (everyone away, in a group), re-read each minute (`useAwayLine`). `ChatAvailabilityScreen` sets your away message and its end, working hours per weekday and the time zone, on a `SettingsSubPage`.
  - **Broadcast:** `ChatBroadcastSheet` picks conversations from the inbox (filter, select all) and sends one message into each, so replies come back privately. It says how many it reached.
  - **Search:** `ChatSearchScreen` searches all conversations or one, with the matched words highlighted, a Transcript badge, and who, where and when. `ChatThreadScreen jumpTo` opens a thread at a result, loading earlier pages until it is there (`loadUntil`), then scrolls to it and highlights it.
  - **Moderation:** a hidden message tells its sender "Only you can see it"; observers see "Hidden by moderation" and "Flagged" markers.
  - Also: `ChatIconButton` (a 44-point icon button for headers), `ChatComposer onSchedule` and `placeholder`, `MessageBubble observer`, `ChatOrganiseCopy` (its strings, part of `ChatNativeCopy`), and the pure helpers behind each (`checkTopicName`, `scheduleInputFrom`, `weekFromHours`, `hoursFromWeek`, `availabilityInput`, `broadcastRows`, `moderationNote`, `rowIndexOf`).

- 8e039cd: Native chat review fixes. The thread list is upright and oldest first: FlashList in its bottom-anchored chat mode (FlashList 2 never read the `autoscrollToTopThreshold` the inverted list relied on, so a new message could land off screen), FlatList following new messages by hand, both going to the bottom when you send, and VoiceOver reading each day's heading and the "New messages" line before their messages. A bubble with media carries its hidden controls as VoiceOver actions (play or pause a voice note, change its speed, open each photo). A push reply goes through the outbox (the live one, waited on briefly, or the saved one when the chat screens aren't mounted), so an offline reply waits with Retry, and its client id comes from the notification and `data.messageId` (or the text), so two replies under one collapsed notification never collide. The voice recorder shows a notice when its stop fails or leaves no file, and ends cleanly (with a notice, nothing sent) when the app goes to the background or a call or another app takes the microphone; leaving the screen while a stop is under way lets it finish. Drafts are kept per signed-in person under a new prefix, `clearDrafts(storage, userId)` removes one person's on sign-out and `clearDrafts(storage, { except: userId })` everyone else's on sign-in (both also remove drafts saved before this), and the composer starts empty when the screen moves to another conversation. Breaking for Rung 3 callers (the package is Beta): `draftKey(userId, conversationId, threadRootId)` and `useChatComposer(conversationId, threadRootId, userId)` take the user id, and `handleChatPushResponse` can answer `"queued"`. TUS uploads read a file a chunk at a time through the new `openFile` option, and a 409 on create counts as done only when the object is really there.
- ac5e025: `@marktiderman/genesis-chat/native`: chat on genesis-ui-native, over the `/react` hooks.

  - **`ChatInboxScreen`** is built on `InboxPage`. It shows avatars, unread counts and the last message, supports pull to refresh, has an empty state that starts a conversation, and offers Mark read, Pin and Archive.
  - **`ChatThreadScreen`** is an inverted FlashList that keeps its place while earlier messages load. It has:
    - day separators and the New line;
    - grouped bubbles, with names and avatars in groups;
    - typing and recording activity;
    - Retry and Delete on a failed send;
    - a long-press sheet (react, reply, copy, pin, delete) and swipe to reply;
    - pictures in a full-screen viewer.
  - **The composer**:
    - grows with its text and keeps a draft per thread;
    - takes photos and videos from expo-image-picker, and a pasted picture;
    - plays haptics;
    - says why when the person can't post.
  - **Voice notes on expo-audio**:
    - hold to record, slide to cancel, lock for hands-free;
    - a live waveform while recording;
    - playback with scrubbing and 1x / 1.5x / 2x speed, one note playing at a time.
  - **`createTusUpload`**: resumable uploads through Supabase Storage's TUS endpoint, for `ChatProvider upload`.
  - **Push glue** for genesis-native's push block:
    - the `messages` category, with Reply and Mark read actions;
    - `handleChatPushResponse`: a reply's client id is the notification's id, so replying twice posts once;
    - `chatThreadMatch`, to suppress pushes for the open thread.

  Native modules are passed in and are optional peers.

### Patch Changes

- 9cab4b5: The push badge can leave kinds out to match the app's own badge: `createChatRunner({ badgeExcludeKinds })`, backed by `genesis_chat.push_targets(message, p_badge_exclude_kinds)` (migration 0002).
- 6a1c2f4: Fixes from the review of the phases 2–4 client:
  - Working hours are normalised when read (`normalizeHours`; only mon..sun days of `"HH:MM"` string pairs, at most four a day), the availability helpers never throw, and migration 0002 refuses anything else (`genesis_chat.valid_working_hours`, in `set_availability` and as a table check).
  - One message can't crash a thread: rows render inside `ChatErrorBoundary`, app attachment kinds are looked up by own key only (`constructor` no longer resolves) with checked results, and a throwing slot falls back to the generic card.
  - The outbox: `clear()` stops sends in flight (nothing posts or saves afterwards; uploads get an aborted `signal`); retries go in order per conversation and stop at the first that can't go; refusals are `permanent` and only retried by hand; `releasePreview` frees a preview URL once its message lands.
  - Catch-up on join pages until it has everything (10 pages at most, then the newest page with `hasEarlier`).
  - The video recorder turns off a camera that answers after it closed, handles recorder errors, keeps the preview for the outbox, and can cancel a hosted upload.
  - Broadcast and scheduled send keep one clientId per draft until it goes, and guard against a double submit.
  - Privacy: link preview images are off by default (`linkPreviewImages: "off" | "proxy" | "direct"`, `linkPreviewProxyUrl`), and the emoji picker loads only from the app's `emojibaseUrl`, never jsDelivr.
  - Link previews load one query per message, at most four at once.
  - A topic view no longer marks the conversation read; search snippets can't be faked with « »; the schedule dialog's default time is set when it opens.
- 035ec24: Migration 0002 (coaching, search and safety), with its pgTAP test: topics (named sub-threads such as a cohort's lessons, closable); scheduled send, posted as the sender when due; availability (away message and working hours) for people who share a conversation; broadcast with private replies; search over messages and voice and video transcripts; link previews (an `unfurl` effect); moderation per kind (a `moderate` effect, with hidden messages kept for observers); retention per kind and legal hold.
- 5f167f7: The inbox and the unread badge take several kinds or leave some out: `inbox({ kinds, excludeKinds })`, `unreadTotal({ excludeKinds })`, `useInbox` and `useUnreadTotal`, backed by new `p_kinds`/`p_exclude_kinds` parameters on `genesis_chat.inbox` and `unread_total` (migration 0002). Messages can now leave support tickets out of both the list and the badge.
- 43ae674: Native composer: after sliding up to lock a voice recording, the first tap on Send (or anywhere else) no longer does nothing. The mic now stays one view through the lock, so the finger that locked it keeps a live responder, and a tap that starts on the locked button stops and sends.
- 58f3003: Native: "Attach again" asks only for the files that were lost, and the composer keeps the conversation its state belongs to in state rather than a ref written during render.
- 698f176: `ChatInboxScreen` takes `kinds` and `excludeKinds`, passed to `useInbox`, so a messages inbox can leave out support tickets (`excludeKinds={["support"]}`).
- 9c63a78: Native chat polish:
  - Full emoji picker (`ChatEmojiPicker`, `ChatEmojiPickerSheet`): search, category tabs and a grid, with the person's recent emoji kept with their drafts (cleared on sign-out by `clearDrafts`). About 1,870 emoji are bundled from emojibase-data (MIT), with no network and no CDN, and written as keyboards type them, so a picked 👍 counts with the quick one. The long-press sheet has "+" beside the quick reactions, and the composer has an emoji button that types at the cursor.
  - Photo viewer (`ChatPhotoViewer`): full screen on black instead of a white page sheet, swiping through the tapped message's photos, pinch and double-tap zoom, and swipe down to close. Share and Save to Photos appear when the app passes `modules.sharing` (expo-sharing), `modules.mediaLibrary` (expo-media-library) and `modules.downloadFile`. `ChatMediaViewer` now opens the same viewer.
  - `ChatAutoRetry` / `useChatAutoRetry`: `retryAll()` runs when the app comes back to the front and, with `modules.netInfo`, when the connection comes back (messages the server refused for good, `permanent`, are left alone).
  - The thread shows `ChatAccessError` with Retry (`refetchAccess`) in place of the composer when your role couldn't be read.
  - genesis-ui-native: `NativeFullScreenModal` (full-screen media and camera content, dark by default), and the `smile` and `download` icons.
- 16c9e90: Native renderer:
  - `useChatThreadStackOptions` (and `chatThreadStackOptions`): the thread's header with an opaque bar. On iOS 26 and later a see-through bar draws its scroll edge effect over the inverted list and the whole thread renders blurred once it reaches the bar. `ChatThreadScreen` now measures its own top for the keyboard offset when none is given.
  - Voice notes draw as many bars as fit (`barsThatFit`), so the waveform never runs under the time and speed.
  - On the #241 APIs: `PendingMessage.files`, `accessLoading`, `canPin`, `reattach` ("Attach again" on a message whose files were lost), `usePeople` (`ChatPeopleScope`), and `randomId` as `createTusUpload`'s default id. `MessageActionContext.direct` is now `canPin`.
- 9b9e615: Server for chat phases 2–4: the runner works `moderate` (a `Moderator`, `openAiModerator` on omni-moderation-latest with configurable thresholds) and `unfurl` (`createLinkUnfurler`, an SSRF-hardened Open Graph fetcher; DNS rebinding needs `guardedLookup` or an egress firewall, see the README) effects, posts due scheduled messages and, with `retention: true`, purges expired ones, and reports the counts. Adds `notificationsDeliver` and the `chat.message` notification type for genesis-notifications, `createChatAssistant` (Claude recaps and reply drafts, never sent, internal notes stripped) and `createVideoUploadHandler` (Mux direct uploads behind an `authorize` check). Pushes no longer carry `collapseKey` unless the runner's `collapse` option is on.
- 0122db7: Chat on the web for migration 0002, with the core and hooks native shares. Core: `topics`, `setTopic`, `schedule`, `scheduled`, `cancelScheduled`, `availabilityFor`, `myAvailability`, `setAvailability`, `broadcast`, `search` and `linkPreviewsFor` (through `link_previews_for`, by message), `ChatMessage.moderation`, and pure helpers (`isWithinWorkingHours`, `awayLine`, `hoursSummary`, `extractLinks`, `scheduleQuickPicks`, `topicKey`). Hooks: `useTopics`, `useScheduled`, `useAvailability`, `useBroadcast`, `useSearch` (debounced), `useLinkPreviews` (by message), and `useConversation().loadUntil` and `signalRecordingVideo`. Web: a topic bar, scheduled send from the send button with a list to cancel, an away banner (every member away, in a group) and `ChatAvailabilitySettings`, `ChatBroadcast`, `ChatSearch` (in the thread and across the panel, jumping to the message), link preview cards (https images only, no HTML), moderation notices and badges, a full emoji picker (frimousse) for reactions and the composer, video recording and Mux HLS playback (`hls.js` optional), and `ChatAttachmentCard` for app kinds registered through `ChatProvider attachmentKinds`; `ChatProvider videoUpload` sends recordings through Mux direct uploads. Fixes: a message sent while the saved outbox loads is no longer lost; a thread catches up every time its live channel joins, the first time included; "Load earlier" works on a cached thread; a failed role check offers a retry (`accessError`, `refetchAccess`) instead of "can't post"; unsent messages retry once after loading and when the browser comes back online, with `useChat().retryAll()` for native; `useChat().clearOutbox()` empties the outbox on sign-out.
- 1fa5bf3: `reattach` fills only the lost file slots and keeps the files that survived a relaunch, and the saved queue keeps track of which slot was lost. The package exports its source under the `react-native` condition (as genesis-ui-native does), so Metro picks up edits without a build.
- bb716fc: Search no longer shows members a hidden message's voice or video transcript (observers find hidden messages, as they read them). The runner sends the moderator every photo of a message, in order, not the first four. The link unfurler's HTML parsing runs in linear time on a hostile page. `useConversation` returns `conversationLoading`, and the web composer waits on it, so a conversation that settles to nothing shows "can't post" instead of loading forever.
- 2641a64: The runner builds each push with `chatPushPayload`, so iOS shows chat pushes as Communication Notifications: the sender's name and photo (`resolveAvatar`, https only), the group name, `mutableContent`, the `messages` category, and the message ids. `createExpoDeliver` sends `mutableContent`, and the `chat.message` notification type renders `push: { ids, display, mutableContent }` for genesis-notifications (display values only when previews are shown).
- 08b4d96: Chat server review fixes: the video upload handler mints the Mux passthrough itself (conversation and uploader) and the webhook matches an attachment only by its upload id, checking the binding; it requires `corsOrigin`, answers preflight and takes a `rateLimit` hook. In kinds that moderate, pushes wait for the verdict and hidden messages are never pushed, counted in badges or shown in the inbox; edits are moderated; a verdict never un-hides a message or files a duplicate report; a moderator failing on its last attempt files "moderation unavailable". Link previews are read through `link_previews_for(message_id)` only, and links carrying credentials are never fetched. The unfurler refuses named hosts it can't resolve unless `allowUnresolved`, times out DNS, blocks more IPv6 forms, checks og:image hosts and can pin connections with `guardedLookup`. The assistant neutralises tags in transcripts and leaves hidden messages out. A transient error no longer drops a scheduled message.
- 6ea7a91: Typing and recording signals are dropped until a conversation's live channel has joined, so supabase-js no longer falls back to REST and warns. The "New messages" line uses your read place as fetched for this opening, never a cached one from an earlier visit.
- edfb983: iOS rich push. `@marktiderman/genesis-native/rich-push-plugin` is an Expo config plugin that adds a Notification Service Extension. The extension attaches `data.image` and `data.senderAvatar` (https only; it always shows the notification, even when a download fails), and it turns `messages` pushes into Communication Notifications: the sender's photo is shown, and Focus treats them as messages. The plugin also sets the communication entitlement, `NSUserActivityTypes` and the extension's EAS app extension entry. `richPushMessage` (in `/push` and the React-free `/push-payload`) sets `mutableContent: true`, without which iOS never runs the extension. genesis-chat adds `chatPushPayload`, which builds a message push's category, thread, `mutableContent` and data (sender, group, photo; ids only with hidden previews). It is server safe, from the new `@marktiderman/genesis-chat/push` subpath.

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
