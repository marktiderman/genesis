# Genesis — Component Reference

> **Auto-generated.** Do not edit by hand. Run `pnpm gen:component-reference` (or `node scripts/gen-component-reference.mjs`) to regenerate.

> **Source:** [`scripts/gen-component-reference.mjs`](../scripts/gen-component-reference.mjs). Reads every entry point in each published package's `exports`, follows it to its source barrel, and reads the adjacent JSDoc and `<Name>Props` types with a lightweight regex parser.

**Totals:** 589 components · 4055 other exports · 3225 standalone types across 189 entry points in 29 packages.

**Cross-link:** [`docs/README.md`](./README.md) — canonical Genesis docs entry point.

**Stability tags** (per the C2.0 convention; populate in JSDoc as `@stability Stable|Beta|Deprecated|Experimental`):

- `Stable` — public API; breaking change requires major (1.x+) or minor (0.x).
- `Beta` — public but volatile; signature may change without a major bump.
- `Experimental` — wraps an upstream `unstable_*` API; props may change in a minor.
- `Deprecated` — slated for removal; consult `MIGRATION.md` for the replacement.
- `—` — untagged (default; treat as Beta until tagged).

---
## @marktiderman/genesis-ai

One server-side pipeline for every AI call a Genesis app makes: consent, the feature gate, a bounded budget, server-side loading with a context manifest, safety routing, guardrails, the model call with rollouts, refusal and outage fallbacks, a usage row with no content and a trace. Tasks are versioned prompts with typed arguments and outputs, called by id; processors such as moderation and transcription are wrapped in place. Vendors are adapters (Anthropic and OpenAI ship), keys can be the platform's or a tenant's or person's own (BYOK, in Supabase Vault), and model records carry prices and capabilities that fail loudly on an unknown model. On the Vercel AI SDK, server only except /react. Part of the Genesis framework.

**Barrel:** [`packages/ai/src/index.ts`](../packages/ai/src/index.ts)

### Other exports (11)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AI_SPEC`](../packages/ai/src/types.ts) | const | — | The version of the definition format (tasks today; tools and agents next), apart from the package's version: a definition written for spec 1 keeps its meaning while the package moves. |
| [`ANTHROPIC_API_VERSION`](../packages/ai/src/models.ts) | const | — | Anthropic API version Genesis pins (sampling parameters are refused on it). |
| [`checkTasks`](../packages/ai/src/define.ts) | function | — | _(no summary)_ |
| [`costOf`](../packages/ai/src/models.ts) | function | — | Cost of one call in USD from its usage. `cacheTtl` prices cache writes (default 5 minutes). |
| [`defineAi`](../packages/ai/src/define.ts) | function | — | Checks and freezes an app's AI configuration. Every alias and rollout must resolve to a model record (no billing at a guess) whose vendor is configured, and every fallback must name an alias that exists. |
| [`defineTask`](../packages/ai/src/define.ts) | function | — | Checks a task definition. Tasks are server-only modules: never import one into client code. |
| [`estimateCost`](../packages/ai/src/models.ts) | function | — | Upper bound for the budget: the prompt at the input price plus the full output cap. |
| [`GuardrailError`](../packages/ai/src/types.ts) | class | — | Stops a call with a typed outcome and a message the UI can show. Thrown by a guardrail, or by a task's `load` when there is nothing to do ("Nothing to catch up on yet") or the person may not read what it needs (`forbidden`). Before the m... |
| [`MODEL_RECORDS`](../packages/ai/src/models.ts) | const | — | Prices from Anthropic's model table as of 2026-10-06, first-party API. Cache reads are 0.05× of input on Opus 5.5 and Sonnet 5.5, 0.025× on Fable 5.1 and 0.1× elsewhere (prompt-caching docs, checked 2026-10-28). |
| [`RUN_EVENT_TYPES`](../packages/ai/src/run-events.ts) | const | — | The names of {@link RunEvent}, in the order a text run sends them. |
| [`textStreamToRunEvents`](../packages/ai/src/run-events.ts) | function | — | Turns the text stream's events into {@link RunEvent}s, one stream at a time: the first text opens the run and the message, `done` closes them. `threadId` defaults to the run's id (a run outside a conversation is its own thread). |

### Types (41)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Ai };
export type { AiActor };
export type { AiConfig };
export type { AiContext };
export type { AiMessage };
export type { AiOutcome };
export type { AiResult };
export type { AiSchema };
export type { AiSpan };
export type { AiSpec };
export type { AiStore };
export type { AiUsage };
export type { AiVendor };
export type { AliasConfig };
export type { AliasFallbacks };
export type { BeganCall };
export type { BeginInput };
export type { BudgetStore };
export type { CacheTtl };
export type { Capability };
export type { ConsentStore };
export type { ContextLayerRecord };
export type { FinishInput };
export type { Guardrail };
export type { JsonPatchOperation };
export type { KeySource };
export type { KeyStore };
export type { LoadContext };
export type { Loaded };
export type { ModelLike };
export type { ModelRecord };
export type { ResolvedAlias };
export type { RunEvent };
export type { SafetyProtocol };
export type { SafetyRoute };
export type { TaskDefinition };
export type { TelemetrySink };
export type { TextStreamEvent };
export type { UsageStore };
export type { VendorAdapter };
export type { VendorKey };
```

---

## @marktiderman/genesis-ai/server

**Barrel:** [`packages/ai/src/server/index.ts`](../packages/ai/src/server/index.ts)

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AiCallError`](../packages/ai/src/server/wrap.ts) | class | — | A processor call the pipeline stopped before it ran. |
| [`createAiHandler`](../packages/ai/src/server/handler.ts) | function | — | One HTTP endpoint for every task: `POST { task, args }` → the task's {@link AiResult} as JSON. A web-standard handler, so it mounts in TanStack Start, Next, Hono or a Supabase Edge Function. With `stream: true`, a text task answers as se... |
| [`evaluate`](../packages/ai/src/server/evaluate.ts) | function | — | Runs a target's cases through the real pipeline and model, for a check before an alias, rollout or prompt version changes: run it with a live key in CI or by hand, and compare reports. Cases run one at a time, so a budget and the vendor'... |
| [`memoryStore`](../packages/ai/src/server/memory-store.ts) | function | — | An {@link AiStore} in memory, for tests and local work. It admits a call while platform spend plus the estimates of calls still open stays within the budget, the same bounded overshoot as the database store. Calls on a tenant's or person... |
| [`otelSink`](../packages/ai/src/server/telemetry.ts) | const | — | Sends genesis-ai's spans to an OpenTelemetry tracer: `telemetry: otelSink(trace.getTracer("ai"))`. |
| [`runTask`](../packages/ai/src/server/run.ts) | function | — | Runs a task for a person: consent → gate → load (with a manifest) → safety routing → guardrails → budget → the model (rollout, outage fallbacks, refusals) → output guardrails → a usage row and a span. Content never reaches the usage row ... |
| [`streamTask`](../packages/ai/src/server/run.ts) | function | — | Streams a text task. The same steps run before the model; the usage row is written when the stream ends, is aborted or fails. No outage fallback mid-stream: a conversation keeps one model. Output guardrails need the whole answer, so a ta... |
| [`wrap`](../packages/ai/src/server/wrap.ts) | function | — | Puts a processor (moderation, transcription) through the same steps as a task: consent, the gate, the budget, a usage row and a span. The processor itself is unchanged; the wrapped function has its signature and throws {@link AiCallError... |

### Types (13)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AiHandlerOptions };
export type { EvalCase };
export type { EvalReport };
export type { EvalTarget };
export type { MemoryStore };
export type { MemoryStoreOptions };
export type { ScoreResult };
export type { Scorer };
export type { StreamOptions };
export type { StreamResult };
export type { TracerLike };
export type { UsageRow };
export type { WrapOptions };
```

---

## @marktiderman/genesis-ai/anthropic

**Barrel:** [`packages/ai/src/anthropic.ts`](../packages/ai/src/anthropic.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`anthropic`](../packages/ai/src/anthropic.ts) | function | — | Anthropic as a Genesis vendor: the pinned API version, effort, the server-side refusal fallback where the model has one, structured output as `output_config.format`, and prompt caching when the alias asks. `apiKey` is the platform's; a t... |
| [`createGenesisAnthropic`](../packages/ai/src/anthropic.ts) | function | — | Anthropic's AI SDK provider with the API version Genesis pins. The provider sends 2023-06-01 unless told otherwise; Genesis's model records and options (no sampling parameters, effort, server-side fallbacks) are written against {@link AN... |

---

## @marktiderman/genesis-ai/openai

**Barrel:** [`packages/ai/src/openai.ts`](../packages/ai/src/openai.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`openai`](../packages/ai/src/openai.ts) | function | — | OpenAI as a Genesis vendor, on the Responses API: effort as `reasoningEffort`, strict JSON schemas for structured output. OpenAI caches prompts on its own, so `cache` sends nothing. Genesis ships no OpenAI price records: add the models y... |

---

## @marktiderman/genesis-ai/supabase

**Barrel:** [`packages/ai/src/supabase.ts`](../packages/ai/src/supabase.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AiStoreError`](../packages/ai/src/supabase.ts) | class | — | A database refusal, with its SQLSTATE; never the row it refused. |
| [`supabaseStore`](../packages/ai/src/supabase.ts) | function | — | The {@link AiStore} over migration 0001's functions (`genesis_ai.begin_call`, `finish_call`, `has_consent`, `key_for`). People are logins: `AiContext.personId` is the `auth.users` id, and `tenantId` a uuid or null. Keys people and tenant... |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AiRpcClient };
```

---

## @marktiderman/genesis-ai/react

**Barrel:** [`packages/ai/src/react.tsx`](../packages/ai/src/react.tsx)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`useAiStream`](../packages/ai/src/react.tsx) | function | — | Streams a text task by id through `createAiHandler` (`stream: true`): text as it arrives, then the result. A stop before the model (no consent, over budget) comes back as the result at once. |
| [`useAiTask`](../packages/ai/src/react.tsx) | function | — | Calls a server task by id through `createAiHandler`. The client sends ids, never content: the task's `load` reads what the model sees, as the signed-in person. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AiStreamState };
export type { AiTaskState };
export type { UseAiTaskOptions };
```

---

## @marktiderman/genesis-chat

Chat for Genesis apps, in the app's own Supabase: conversations of kinds the app defines (direct, group, cohort, support ticket) with members, observers and internal notes; messages with replies, threads, topics, mentions, reactions, edits and deletes; photos, files, voice notes and videos; read state, live updates and typing over private Realtime topics; an outbox for push, transcripts and storage cleanup. A headless core, React hooks, web and native renderers on Genesis UI, and a server runner. Part of the Genesis framework.

**Barrel:** [`packages/chat/src/index.ts`](../packages/chat/src/index.ts)

### Other exports (64)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`activityLine`](../packages/chat/src/core/thread.ts) | function | — | "Sam is typing…", "Sam and Lee are typing…", "Sam is recording a voice message…". |
| [`ALLOWED_EXTENSIONS`](../packages/chat/src/core/media.ts) | const | — | Mirrors genesis_chat.allowed_extension. Never SVG or HTML, which a browser runs as a page. |
| [`attachmentKindFor`](../packages/chat/src/core/media.ts) | function | — | What an upload becomes in a message. |
| [`awayLine`](../packages/chat/src/core/availability.ts) | function | — | The line a thread shows about someone, or null when they are around: - away with a date: "Away until Monday: Back Monday" (the away message after the colon); - away with no date: "Mark is away: On a retreat"; - outside working hours: "Ma... |
| [`awaySummary`](../packages/chat/src/core/availability.ts) | function | — | The line for several people (a group's members): one person's full `awayLine`, or for more "Sam and Lee are away", "Sam, Lee and 2 others are outside their hours", or "… are away or outside their hours" when it's a mix. Null when everyon... |
| [`CHAT_BUCKET`](../packages/chat/src/core/client.ts) | const | — | _(no summary)_ |
| [`CHAT_LIMITS`](../packages/chat/src/core/media.ts) | const | — | Default limits (decision 5): an app may lower them, not raise them past the bucket's 100 MB. |
| [`CHAT_SCHEMA`](../packages/chat/src/core/client.ts) | const | — | _(no summary)_ |
| [`ChatError`](../packages/chat/src/core/client.ts) | class | — | A refusal from the database, with its SQLSTATE (`42501` not allowed, `22023` bad input, `GS429` too many). |
| [`conversationTopic`](../packages/chat/src/core/client.ts) | const | — | _(no summary)_ |
| [`createChatClient`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`createOutbox`](../packages/chat/src/core/outbox.ts) | function | — | _(no summary)_ |
| [`currentActivity`](../packages/chat/src/core/thread.ts) | function | — | Who is doing what now: activity older than six seconds has stopped. |
| [`dayLabel`](../packages/chat/src/core/thread.ts) | function | — | "Today", "Yesterday", "Monday", or "12 Mar 2026". |
| [`extractLinks`](../packages/chat/src/core/extras.ts) | function | — | The https links in a message's text that get a preview, at most three, as genesis_chat.message_links finds them. |
| [`fileExtension`](../packages/chat/src/core/media.ts) | function | — | The extension a file is stored under: from its content type, else its name. |
| [`firstUnreadId`](../packages/chat/src/core/thread.ts) | function | — | The first message after what you had read, from someone else: where "New" goes. |
| [`formatDuration`](../packages/chat/src/core/media.ts) | function | — | 0:42, 1:05:09. |
| [`hoursSummary`](../packages/chat/src/core/availability.ts) | function | — | "Mon–Fri, 9–5", "Mon–Thu, 9–5; Fri, 9–1". Days with the same hours are grouped. Empty when none. |
| [`isAllowedExtension`](../packages/chat/src/core/media.ts) | function | — | _(no summary)_ |
| [`isAway`](../packages/chat/src/core/availability.ts) | function | — | Away now: an away message with no end date, or an end date still ahead. |
| [`isHttpsUrl`](../packages/chat/src/core/extras.ts) | function | — | An absolute https URL with a host: the only kind a preview image may load from. |
| [`isSchedulable`](../packages/chat/src/core/extras.ts) | function | — | The send time the database accepts: at least a minute and at most a year ahead. |
| [`isWithinWorkingHours`](../packages/chat/src/core/availability.ts) | function | — | Is `now` inside these working hours, read in `timeZone`? No hours set means always. A range whose end is at or before its start runs overnight into the next day (`fri: [["22:00","02:00"]]` covers Friday 22:00 to Saturday 02:00). |
| [`itemSender`](../packages/chat/src/core/thread.ts) | function | — | _(no summary)_ |
| [`itemTime`](../packages/chat/src/core/thread.ts) | function | — | _(no summary)_ |
| [`localClock`](../packages/chat/src/core/availability.ts) | function | — | The weekday and minute of the day at `now` in `timeZone` (the device's zone when null or unknown). |
| [`MAX_RANGES_PER_DAY`](../packages/chat/src/core/availability.ts) | const | — | At most this many ranges a day, as the database allows. |
| [`memoryOutboxStore`](../packages/chat/src/core/outbox.ts) | const | — | _(no summary)_ |
| [`mergeThread`](../packages/chat/src/core/thread.ts) | function | — | The server's messages (by seq), then what is still sending, oldest first. A pending message the server already has (same clientId) is dropped, so a send that landed never shows twice. |
| [`minutesOf`](../packages/chat/src/core/availability.ts) | function | — | "09:30" → 570; a bad value (anything but such a string) → null. "24:00" is allowed as the end of a day. |
| [`namesLine`](../packages/chat/src/core/availability.ts) | function | — | "Sam", "Sam and Lee", "Sam, Lee and 3 others": at most two names. |
| [`nextPlaybackRate`](../packages/chat/src/core/media.ts) | function | — | _(no summary)_ |
| [`normalizeHours`](../packages/chat/src/core/availability.ts) | function | — | Working hours as they may safely be read: only mon..sun, each an array of `["HH:MM", "HH:MM"]` string pairs (at most four a day); every other day, range or value is dropped. Null when nothing is left. Hours come from other people, so the... |
| [`parseMentions`](../packages/chat/src/core/thread.ts) | function | — | The ids @mentioned in markdown written as `@[Name](user:<uuid>)`. |
| [`PLAYBACK_RATES`](../packages/chat/src/core/media.ts) | const | — | Playback speeds offered for voice and video (free for everyone, decision 5). |
| [`previewText`](../packages/chat/src/core/thread.ts) | function | — | A one-line preview: text, or what was attached. |
| [`randomId`](../packages/chat/src/core/media.ts) | function | — | A random UUID (v4): `crypto.randomUUID` where the platform has it (some React Native runtimes don't), else `crypto.getRandomValues`, else Math.random as a last resort. Ids only need to be unique per sender: the server checks (sender, cli... |
| [`recordingLimitMs`](../packages/chat/src/core/media.ts) | function | — | The longest recording this role may make. |
| [`releaseObjectUrl`](../packages/chat/src/core/outbox.ts) | function | — | Revokes a `blob:` object URL; anything else (a native file URI) is left alone. |
| [`sameDay`](../packages/chat/src/core/thread.ts) | function | — | _(no summary)_ |
| [`scheduleLabel`](../packages/chat/src/core/extras.ts) | function | — | When a scheduled message goes: "Tomorrow, 9:00 AM", "Mon 12 Oct, 9:00 AM". |
| [`scheduleQuickPicks`](../packages/chat/src/core/extras.ts) | function | — | "Tomorrow, 9:00 AM" and "Monday, 9:00 AM" (the next Monday after tomorrow; one pick when they're the same day). |
| [`sendBytes`](../packages/chat/src/core/transfer.ts) | function | — | Sends `body` to `url`; resolves with the response text, throws a ChatError on a non-2xx answer. |
| [`snippetParts`](../packages/chat/src/core/extras.ts) | function | — | "a «word» here" → [{a }, {word, match}, { here}]. Unbalanced marks are kept as text. |
| [`startsDay`](../packages/chat/src/core/thread.ts) | function | — | A day divider goes before this item. |
| [`startsGroup`](../packages/chat/src/core/thread.ts) | function | — | Runs of one sender within five minutes share a header (name, avatar). |
| [`summarizeReactions`](../packages/chat/src/core/thread.ts) | function | — | Reactions by emoji, most first, then in first-used order. |
| [`throttle`](../packages/chat/src/core/thread.ts) | function | — | Sends activity at most once every `everyMs`. |
| [`timeZoneLabel`](../packages/chat/src/core/availability.ts) | function | — | "Eastern" for America/New_York (the zone's generic name, less " Time"); the city when Intl has no name. |
| [`toAttachment`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`toAvailability`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`toLinkPreview`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`toMessage`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`topicKey`](../packages/chat/src/core/extras.ts) | function | — | A topic's key from its title: "Week 1: Habits" → "week-1-habits" (at most 120 characters). |
| [`toScheduled`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`toSearchHit`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`toTopic`](../packages/chat/src/core/client.ts) | function | — | _(no summary)_ |
| [`untilLabel`](../packages/chat/src/core/availability.ts) | function | — | "3:00 PM" today, "Monday" within the week, else "12 Mar". |
| [`upsertMessages`](../packages/chat/src/core/thread.ts) | function | — | Adds or replaces messages in a page, keeping it sorted and free of duplicates. |
| [`userTopic`](../packages/chat/src/core/client.ts) | const | — | _(no summary)_ |
| [`waveformFromMetering`](../packages/chat/src/core/media.ts) | function | — | Peaks from a level meter read while recording (expo-audio's `metering`, in dB, about -160…0): resampled to `count` values 0–100. |
| [`waveformPeaks`](../packages/chat/src/core/media.ts) | function | — | Peaks for a waveform: `count` values 0–100 from raw samples (-1…1), the loudest in each bucket, scaled so the loudest bucket is 100. Quiet recordings still show a shape; silence shows a flat line. |
| [`WEEKDAYS`](../packages/chat/src/core/availability.ts) | const | — | _(no summary)_ |

### Types (52)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AttachmentInput };
export type { AttachmentKind };
export type { AttachmentProvider };
export type { AvailabilityInput };
export type { AwayLineOptions };
export type { ChatActivity };
export type { ChatAttachment };
export type { ChatAvailability };
export type { ChatClient };
export type { ChatClientOptions };
export type { ChatConversation };
export type { ChatInboxItem };
export type { ChatKindRules };
export type { ChatLinkPreview };
export type { ChatMember };
export type { ChatMessage };
export type { ChatPreview };
export type { ChatReaction };
export type { ChatRole };
export type { ChatSearchHit };
export type { ChatSignal };
export type { ChatSupabase };
export type { ChatTopic };
export type { ConversationChannel };
export type { ConversationHandlers };
export type { HostedAttachment };
export type { HostedUpload };
export type { HostedUploadOptions };
export type { HostedUploadRecord };
export type { HostedUploadStart };
export type { LocalFile };
export type { MessagePage };
export type { Outbox };
export type { OutboxOptions };
export type { OutboxStore };
export type { PendingFile };
export type { PendingMessage };
export type { QueuedMessage };
export type { QuickPick };
export type { ReactionSummary };
export type { ScheduleInput };
export type { ScheduledMessage };
export type { SendBytesOptions };
export type { SendInput };
export type { SnippetPart };
export type { StorageUpload };
export type { Subscription };
export type { ThreadItem };
export type { TopicInput };
export type { UploadProgress };
export type { Weekday };
export type { WorkingHours };
```

---

## @marktiderman/genesis-chat/react

**Barrel:** [`packages/chat/src/react/index.tsx`](../packages/chat/src/react/index.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ChatProvider`](../packages/chat/src/react/index.tsx) | `ChatProviderProps` | — | Puts chat in reach of every hook below it. Needs a TanStack QueryClientProvider above it. |

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`belongsTo`](../packages/chat/src/react/index.tsx) | function | — | Does a messages list (`[genesis-chat, conversation, id, messages, threadRootId, topic]`) hold this message? |
| [`CATCH_UP_MAX_PAGES`](../packages/chat/src/react/index.tsx) | const | — | _(no summary)_ |
| [`CATCH_UP_PAGE`](../packages/chat/src/react/index.tsx) | const | — | How many messages a catch-up asks for at a time, and how many pages before it gives up and jumps to the newest. |
| [`chatKeys`](../packages/chat/src/react/index.tsx) | const | — | _(no summary)_ |
| [`hostedUploadFrom`](../packages/chat/src/react/index.tsx) | function | — | The outbox's `hostedUpload` from a `ChatVideoUpload`: mints the upload (or, resuming, reuses the one minted before), resolves at once with its id, and PUTs the whole file to its URL in the background (XMLHttpRequest where there is one, f... |
| [`LINK_PREVIEW_CONCURRENCY`](../packages/chat/src/react/index.tsx) | const | — | At most this many link-preview reads at once, per client. |
| [`useAvailability`](../packages/chat/src/react/index.tsx) | function | — | Availability: yours (`mine`, `setMine`) and, given a conversation, its members' (`members`, `forUser`). Pair with `awayLine` and `isWithinWorkingHours` from the core. |
| [`useBroadcast`](../packages/chat/src/react/index.tsx) | function | — | Sends one message into many conversations (replies come back privately in each). |
| [`useChat`](../packages/chat/src/react/index.tsx) | function | — | _(no summary)_ |
| [`useConversation`](../packages/chat/src/react/index.tsx) | function | — | One conversation: its messages (with what you are still sending), members, your role, and who is typing. |
| [`useDebouncedValue`](../packages/chat/src/react/index.tsx) | function | — | The value, once it has stopped changing for `ms`. |
| [`useFileUrls`](../packages/chat/src/react/index.tsx) | function | — | Signed links for files (cached by the client until shortly before they expire). |
| [`useInbox`](../packages/chat/src/react/index.tsx) | function | — | Your conversations, live. `kind` narrows to one kind; `archived` shows the archived ones. |
| [`useLinkPreviews`](../packages/chat/src/react/index.tsx) | function | — | Link previews for these messages, by message id, in link order (only those the server has fetched). Pass the messages whose text has links (`extractLinks(body).length > 0`). One query per message, so a new message asks only for its own, ... |
| [`useMessageActions`](../packages/chat/src/react/index.tsx) | function | — | Edit, delete, react, pin, save and report, refreshing what they change. |
| [`usePeople`](../packages/chat/src/react/index.tsx) | function | — | Names and avatars for these people, from the provider's `loadPeople`, fetched as one batch per set of ids and cached. Unknown ids are left out. |
| [`usePerson`](../packages/chat/src/react/index.tsx) | function | — | One person's name and avatar (see usePeople). |
| [`usePins`](../packages/chat/src/react/index.tsx) | function | — | The pinned message ids of a conversation. |
| [`useScheduled`](../packages/chat/src/react/index.tsx) | function | — | Your scheduled messages (in one conversation, or all), soonest first, with `schedule` and `cancel` (which also removes one that failed). `schedule` uploads its files to storage first, the way `send` does (the provider's `upload` hook, or... |
| [`useSearch`](../packages/chat/src/react/index.tsx) | function | — | Search, debounced (250 ms by default), in one conversation or all of yours. Queries under two characters return nothing. |
| [`useStartConversation`](../packages/chat/src/react/index.tsx) | function | — | Starts (or finds again) a conversation, then refreshes the inbox. |
| [`useTopics`](../packages/chat/src/react/index.tsx) | function | — | A conversation's topics, live (set_topic's hint refreshes them), and `setTopic` for owners and admins: add one (`setTopic("week-1", { title: "Week 1" })`), close or reopen it. |
| [`useUnreadTotal`](../packages/chat/src/react/index.tsx) | function | — | How many messages wait for you everywhere (for a badge), live. |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChatAttachmentKind };
export type { ChatCardContext };
export type { ChatPerson };
export type { ChatVideoUpload };
export type { ConversationState };
export type { MessagesData };
export type { UseConversationOptions };
```

---

## @marktiderman/genesis-chat/web

**Barrel:** [`packages/chat/src/web/index.ts`](../packages/chat/src/web/index.ts)

### Components (23)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ChatAttachmentCard`](../packages/chat/src/web/cards.tsx) | `ChatAttachmentCardProps` | — | A card for an app's own attachment kind: an icon, a title, a subtitle and one action. |
| [`ChatAvailabilitySettings`](../packages/chat/src/web/availability.tsx) | `ChatAvailabilitySettingsProps` | — | Your availability: an away message (and until when), working hours per weekday, and the time zone they're read in. One range per day here; extra ranges saved elsewhere are kept for the days you don't change. |
| [`ChatAwayBanner`](../packages/chat/src/web/availability.tsx) | `ChatAwayBannerProps` | — | "Mark replies Mon–Fri, 9–5 (Eastern)", "Away until Monday: Back Monday", "Sam, Lee and 2 others are away"; nothing when everyone is around. |
| [`ChatBroadcast`](../packages/chat/src/web/broadcast.tsx) | `ChatBroadcastProps` | — | _(no summary)_ |
| [`ChatComposer`](../packages/chat/src/web/composer.tsx) | `ChatComposerProps` | — | _(no summary)_ |
| [`ChatEmojiPicker`](../packages/chat/src/web/emoji-picker.tsx) | `ChatEmojiPickerProps` | — | _(no summary)_ |
| [`ChatErrorBoundary`](../packages/chat/src/react/error-boundary.tsx) | `ChatErrorBoundaryProps` | — | _(no summary)_ |
| [`ChatInbox`](../packages/chat/src/web/inbox.tsx) | `ChatInboxProps` | — | _(no summary)_ |
| [`ChatLinkPreview`](../packages/chat/src/web/cards.tsx) | `ChatLinkPreviewProps` | — | _(no summary)_ |
| [`ChatMarkdown`](../packages/chat/src/web/markdown.tsx) | `ChatMarkdownProps` | — | Renders a message body's inline markdown as React elements. |
| [`ChatPanel`](../packages/chat/src/web/panel.tsx) | `ChatPanelProps` | — | _(no summary)_ |
| [`ChatScheduledList`](../packages/chat/src/web/schedule.tsx) | `ChatScheduledListProps` | — | Your scheduled messages, soonest first, each with when it goes and Cancel (Remove for one that failed). |
| [`ChatScheduleMenu`](../packages/chat/src/web/schedule.tsx) | `ChatScheduleMenuProps` | — | The chevron beside Send: "Schedule message" with quick picks and a custom time. |
| [`ChatSearch`](../packages/chat/src/web/search.tsx) | `ChatSearchProps` | — | _(no summary)_ |
| [`ChatThread`](../packages/chat/src/web/thread.tsx) | `ChatThreadProps` | — | _(no summary)_ |
| [`ChatTopicBar`](../packages/chat/src/web/topics.tsx) | `ChatTopicBarProps` | — | _(no summary)_ |
| [`ChatVideoPlayer`](../packages/chat/src/web/video.tsx) | `ChatVideoPlayerProps` | — | Plays a chat video: Mux HLS (native, else hls.js loaded on demand), or a file. |
| [`ChatVideoRecorder`](../packages/chat/src/web/video.tsx) | `ChatVideoRecorderProps` | — | The composer's video dialog: preview, record (to the role's limit), review, retake, send. |
| [`ImageGrid`](../packages/chat/src/web/attachments.tsx) | `ImageGridProps` | — | Up to four photos in a grid (a "+N" on the fourth for more), opening a lightbox. |
| [`Lightbox`](../packages/chat/src/web/attachments.tsx) | `LightboxProps` | — | A photo full size, with the previous and next ones on the arrow keys. |
| [`MessageAttachments`](../packages/chat/src/web/attachments.tsx) | `MessageAttachmentsProps` | — | Every attachment of one message, photos grouped into one grid. |
| [`MessageRow`](../packages/chat/src/web/bubble.tsx) | `MessageRowProps` | — | _(no summary)_ |
| [`VoiceNote`](../packages/chat/src/web/voice-note.tsx) | `VoiceNoteProps` | — | _(no summary)_ |

### Other exports (27)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`canPickEmoji`](../packages/chat/src/web/emoji-picker.tsx) | const | — | The picker can load: an emojibase URL was given. |
| [`clockTime`](../packages/chat/src/web/format.ts) | function | — | 10:42 (in the reader's locale). |
| [`createMemoryChatClient`](../packages/chat/src/web/memory-client.ts) | function | — | _(no summary)_ |
| [`FileChip`](../packages/chat/src/web/attachments.tsx) | function | — | _(no summary)_ |
| [`formatBytes`](../packages/chat/src/web/format.ts) | function | — | 12 KB, 3.4 MB. |
| [`GenericAttachment`](../packages/chat/src/web/attachments.tsx) | function | — | Generic card for an app's own kind, when no `attachment` slot is given. |
| [`inboxTitle`](../packages/chat/src/web/inbox.tsx) | function | — | The title an inbox row shows. |
| [`isSafeHref`](../packages/chat/src/web/markdown.tsx) | function | — | True for an absolute http or https URL; everything else (javascript:, data:, relative) is refused. |
| [`linkPreviewImageSrc`](../packages/chat/src/web/cards.tsx) | function | — | The image a preview may show under this setting, or null. Only https image URLs are ever considered. |
| [`messageLabel`](../packages/chat/src/web/format.ts) | function | — | What a screen reader hears for one bubble: "Sam, 10:42: See you then". |
| [`muxPosterUrl`](../packages/chat/src/web/video.tsx) | const | — | _(no summary)_ |
| [`muxStreamUrl`](../packages/chat/src/web/video.tsx) | const | — | _(no summary)_ |
| [`parseMarkdown`](../packages/chat/src/web/markdown.tsx) | function | — | Parses one message body into inline nodes. Never throws. |
| [`pickVideoMimeType`](../packages/chat/src/web/video.tsx) | function | — | MP4 where the browser records it (Safari, recent Chrome), else WebM. |
| [`pickVoiceMimeType`](../packages/chat/src/web/use-voice-recorder.ts) | function | — | The type to record in: Opus in WebM where the browser has it, else MP4 (Safari). |
| [`plainText`](../packages/chat/src/web/bubble.tsx) | function | — | Plain text for the clipboard: mentions as @Name. |
| [`QUICK_REACTIONS`](../packages/chat/src/web/thread-context.ts) | const | — | The six quick reactions. |
| [`relativeTime`](../packages/chat/src/web/format.ts) | function | — | The inbox's time: "now", "5m", "10:42" today, "Yesterday", "Mon", or "12 Mar". |
| [`SearchSnippet`](../packages/chat/src/web/search.tsx) | function | — | A snippet with its « » marks as <mark>. |
| [`toAttachmentView`](../packages/chat/src/web/attachments.tsx) | function | — | _(no summary)_ |
| [`toLocalInput`](../packages/chat/src/web/schedule.tsx) | function | — | `YYYY-MM-DDTHH:mm` in local time, for a datetime-local input. |
| [`uploadVideo`](../packages/chat/src/web/video.tsx) | function | — | Uploads a recording through the app's `videoUpload` (a Mux direct upload: PUT the bytes to the URL it returns) and gives back the attachment to send, pending until Mux's webhook marks it ready. The composer no longer uses it: it sends `v... |
| [`useVideoRecorder`](../packages/chat/src/web/video.tsx) | function | — | _(no summary)_ |
| [`useVoiceRecorder`](../packages/chat/src/web/use-voice-recorder.ts) | function | — | _(no summary)_ |
| [`VideoAttachment`](../packages/chat/src/web/attachments.tsx) | function | — | A video: a hosted one (Mux) streams once ready and says "Processing…" until then; a file plays from storage. |
| [`videoFile`](../packages/chat/src/web/video.tsx) | function | — | A recording as a file for the outbox: `hosted` sends it to the hosted provider (the provider's `videoUpload`, the message going at once with the video pending); otherwise it goes to storage. |
| [`voiceFile`](../packages/chat/src/web/use-voice-recorder.ts) | function | — | A recording as a file the outbox sends: a voice attachment with its duration and waveform. |

### Types (24)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AttachmentView };
export type { ChatAttachmentSlotProps };
export type { ChatComposerAccessoryProps };
export type { ChatComposerHandle };
export type { ChatInboxEmptyProps };
export type { ChatPanelNoSelectionProps };
export type { ChatThreadEmptyProps };
export type { ChatThreadHeaderProps };
export type { ChatThreadSlots };
export type { ChatUser };
export type { LinkPreviewImages };
export type { MarkdownNode };
export type { MemoryChatClient };
export type { MemoryChatOptions };
export type { MemoryConversationSeed };
export type { ResolveUser };
export type { UseVideoRecorderOptions };
export type { UseVoiceRecorderOptions };
export type { VideoRecorder };
export type { VideoRecorderState };
export type { VideoRecording };
export type { VoiceRecorder };
export type { VoiceRecorderState };
export type { VoiceRecording };
```

---

## @marktiderman/genesis-chat/native

**Barrel:** [`packages/chat/src/native/index.ts`](../packages/chat/src/native/index.ts)

### Components (29)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppAttachment`](../packages/chat/src/native/attachment-cards.tsx) | `AppAttachmentProps` | — | One app attachment in a bubble: through the app's slot when there is one, else the card. |
| [`ChatAccessError`](../packages/chat/src/native/access-error.tsx) | `ChatAccessErrorProps` | — | _(no summary)_ |
| [`ChatAttachmentCard`](../packages/chat/src/native/attachment-cards.tsx) | `ChatAttachmentCardProps` | — | _(no summary)_ |
| [`ChatAvailabilityScreen`](../packages/chat/src/native/availability.tsx) | `ChatAvailabilityScreenProps` | — | Your availability, as a Settings sub-page: an away message and, optionally, until when; working hours per weekday (one range a day here; extra ranges saved elsewhere are kept for the days you don't turn off); the time zone they're read i... |
| [`ChatAwayLine`](../packages/chat/src/native/availability.tsx) | `ChatAwayLineProps` | — | The away line, as a quiet strip under the header; nothing when `text` is null. |
| [`ChatBroadcastSheet`](../packages/chat/src/native/broadcast-sheet.tsx) | `ChatBroadcastSheetProps` | — | _(no summary)_ |
| [`ChatComposer`](../packages/chat/src/native/composer.tsx) | `ChatComposerProps` | — | _(no summary)_ |
| [`ChatEmojiPicker`](../packages/chat/src/native/emoji-picker.tsx) | `ChatEmojiPickerProps` | — | _(no summary)_ |
| [`ChatEmojiPickerSheet`](../packages/chat/src/native/emoji-picker.tsx) | `ChatEmojiPickerSheetProps` | — | The picker in a sheet, with a title and Done. |
| [`ChatIconButton`](../packages/chat/src/native/icon-button.tsx) | `ChatIconButtonProps` | — | _(no summary)_ |
| [`ChatInboxScreen`](../packages/chat/src/native/inbox-screen.tsx) | `ChatInboxScreenProps` | — | _(no summary)_ |
| [`ChatLinkPreviewCard`](../packages/chat/src/native/link-preview.tsx) | `ChatLinkPreviewCardProps` | — | _(no summary)_ |
| [`ChatMediaViewer`](../packages/chat/src/native/photo-viewer.tsx) | `ChatMediaViewerProps` | — | One picture in the full-screen viewer (`ChatPhotoViewer` pages through several). |
| [`ChatNativeProvider`](../packages/chat/src/native/context.tsx) | `ChatNativeProviderProps` | — | Inside `ChatProvider` (from `/react`). Optional: without it there are no native extras and people are "Someone". |
| [`ChatPhotoViewer`](../packages/chat/src/native/photo-viewer.tsx) | `ChatPhotoViewerProps` | — | _(no summary)_ |
| [`ChatScheduledBar`](../packages/chat/src/native/schedule-sheet.tsx) | `ChatScheduledBarProps` | — | "2 scheduled messages" over the composer when there are any, opening their list. |
| [`ChatScheduledList`](../packages/chat/src/native/schedule-sheet.tsx) | `ChatScheduledListProps` | — | Your scheduled messages, soonest first, each with when it goes and Cancel. |
| [`ChatScheduleSheet`](../packages/chat/src/native/schedule-sheet.tsx) | `ChatScheduleSheetProps` | — | _(no summary)_ |
| [`ChatSearchScreen`](../packages/chat/src/native/search-screen.tsx) | `ChatSearchScreenProps` | — | _(no summary)_ |
| [`ChatStartSheet`](../packages/chat/src/native/start-sheet.tsx) | `ChatStartSheetProps` | — | _(no summary)_ |
| [`ChatThreadScreen`](../packages/chat/src/native/thread-screen.tsx) | `ChatThreadScreenProps` | — | _(no summary)_ |
| [`ChatTopicBar`](../packages/chat/src/native/topics.tsx) | `ChatTopicBarProps` | — | _(no summary)_ |
| [`ChatVideoPlayer`](../packages/chat/src/native/video-player.tsx) | `ChatVideoPlayerProps` | — | The bubble's video. Renders nothing without `modules.video` (the bubble shows a row instead). |
| [`ChatVideoRecorder`](../packages/chat/src/native/video-recorder.tsx) | `ChatVideoRecorderProps` | — | Renders nothing without `modules.camera`. |
| [`MessageActionsSheet`](../packages/chat/src/native/message-actions-sheet.tsx) | `MessageActionsSheetProps` | — | _(no summary)_ |
| [`MessageBubble`](../packages/chat/src/native/message-bubble.tsx) | `MessageBubbleProps` | — | _(no summary)_ |
| [`VideoUploadTray`](../packages/chat/src/native/video-upload-tray.tsx) | `VideoUploadTrayProps` | — | _(no summary)_ |
| [`VoiceNotePlayer`](../packages/chat/src/native/voice-player.tsx) | `VoiceNotePlayerProps` | — | _(no summary)_ |
| [`VoiceTranscript`](../packages/chat/src/native/media.tsx) | `VoiceTranscriptProps` | — | A voice note's transcript under the player: "Transcribing…" while it is made, then the text, folded to three lines with "Show more" when it is longer. The bubble reads the whole transcript to VoiceOver, so the toggle is for sight only. |

### Other exports (166)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`activePlaybackId`](../packages/chat/src/native/voice-player.tsx) | function | — | The playing voice note's id, for tests. |
| [`AT_BOTTOM_POINTS`](../packages/chat/src/native/thread-screen.tsx) | const | — | Points from the bottom that still count as "at the bottom" (FlatList, which follows by hand). |
| [`attachmentKindOf`](../packages/chat/src/native/attachment-cards.tsx) | function | — | The app's registered kind for this attachment kind (own keys only, never `constructor` and the like). |
| [`attachmentPaths`](../packages/chat/src/native/media.tsx) | function | — | The paths a set of messages needs signed links for. |
| [`attachmentPreview`](../packages/chat/src/react/previews.ts) | function | — | A message's one-line preview: its text, else what it carries, where an app kind reads as its title ("Check-in") instead of "Attachment". `attachment` is the kind alone (the inbox) or the attachment itself. |
| [`availabilityInput`](../packages/chat/src/native/availability.tsx) | function | — | What `setAvailability` gets from the form. |
| [`awayLineFor`](../packages/chat/src/native/availability.tsx) | function | — | The away line for a conversation, or null when everyone is around: the other person in a two-person conversation; in a group, everyone (but you) away or outside their hours. |
| [`barsThatFit`](../packages/chat/src/native/voice-player.tsx) | function | — | How many bars fit across `width` points, one bar plus a gap each; never fewer than one. |
| [`base64ToBytes`](../packages/chat/src/native/composer-state.ts) | function | — | Base64 to bytes without `atob` (not on every Hermes build). |
| [`base64Utf8`](../packages/chat/src/native/tus.ts) | function | — | Base64 of a UTF-8 string, for TUS's Upload-Metadata (no `btoa`, which isn't on every Hermes build). |
| [`broadcastOutcome`](../packages/chat/src/native/broadcast-sheet.tsx) | function | — | What a broadcast's toast says: all reached, one, or some of them. |
| [`broadcastRows`](../packages/chat/src/native/broadcast-sheet.tsx) | function | — | Rows to pick from: the filter's, named as the inbox names them, in name order, matching the query. |
| [`buildThreadRows`](../packages/chat/src/native/rows.ts) | function | — | Oldest first. |
| [`BUILT_IN_KINDS`](../packages/chat/src/native/attachment-cards.tsx) | const | — | The kinds the package draws itself; every other kind is the app's. |
| [`canManageTopics`](../packages/chat/src/native/topics.tsx) | function | — | Owners and admins add, rename, close and reopen topics. |
| [`canReactTo`](../packages/chat/src/native/actions.ts) | function | — | _(no summary)_ |
| [`canSend`](../packages/chat/src/native/composer-state.ts) | function | — | Something to send: text that isn't blank, or a file. |
| [`CARD_ACTION_TIMEOUT_MS`](../packages/chat/src/native/attachment-cards.tsx) | const | — | How long a card's action may run before it reads as failed (`useCardRuns`, `cardActionTimeoutMs`). |
| [`cardAction`](../packages/chat/src/native/attachment-cards.tsx) | function | — | What a card does: the kind's own handler, else the app's, else an https href; null without a button. |
| [`CardError`](../packages/chat/src/native/attachment-cards.tsx) | function | — | The line under a card whose action failed. |
| [`cardTitle`](../packages/chat/src/react/previews.ts) | function | — | A card's title (the kind's, else the file's name, else the kind); an app kind that throws reads as its name. |
| [`CHAT_MARK_READ_ACTION`](../packages/chat/src/native/push.ts) | const | — | The same id as genesis-notifications' `MESSAGE_ACTIONS` (device ids take no "-" or ":"). |
| [`CHAT_PUSH_CATEGORY`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`CHAT_REPLY_ACTION`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`ChatAutoRetry`](../packages/chat/src/native/auto-retry.ts) | function | — | `useChatAutoRetry` as a component, for a provider tree. |
| [`chatNativeCopy`](../packages/chat/src/native/copy.ts) | const | — | _(no summary)_ |
| [`chatNotificationActions`](../packages/chat/src/native/push.ts) | function | — | The actions on a message's notification: Reply (a text field) and Mark read, neither opening the app. |
| [`chatOrganiseCopy`](../packages/chat/src/native/organise-copy.ts) | const | — | _(no summary)_ |
| [`chatPath`](../packages/chat/src/native/push.ts) | function | — | The path a message's push opens. |
| [`chatPushCategory`](../packages/chat/src/native/push.ts) | function | — | The category for createPush's `categories` (genesis-native's NotificationCategory). |
| [`chatPushCopy`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`chatPushPayload`](../packages/chat/src/native/push.ts) | function | — | The category, thread, `mutableContent` and `data` of a message's push, for the server that sends it: |
| [`ChatStartButton`](../packages/chat/src/native/start-sheet.tsx) | function | — | A 44pt compose button for the inbox's header (`headerRight`). |
| [`chatThreadMatch`](../packages/chat/src/native/push.ts) | function | — | For the push block's `suppress` / `useSuppressNotifications`: this conversation's pushes, while its thread is open. |
| [`chatThreadStackOptions`](../packages/chat/src/native/stack-options.ts) | function | — | The thread's header options with an opaque bar in `background` (the thread's own background). |
| [`checkTopicName`](../packages/chat/src/native/topics.tsx) | function | — | Checks a topic's name: its key, or why it can't be saved. Renaming keeps the key (messages carry it), so only a new topic can clash with another's key. |
| [`chunkedPut`](../packages/chat/src/native/video-upload.ts) | function | — | Uploads `source` to a resumable upload URL, a chunk at a time. Resolves once the server has every byte. |
| [`claimPlayback`](../packages/chat/src/native/voice-player.tsx) | function | — | Called when a voice note starts: pauses whichever other one was playing. |
| [`clearDrafts`](../packages/chat/src/native/composer-state.ts) | function | — | Removes drafts from the phone: one person's (`clearDrafts(storage, userId)`, on sign-out), or everyone's but one (`{ except: userId }`, on sign-in, which also covers a session that ended while the app was closed). Drafts saved before dra... |
| [`clockToDate`](../packages/chat/src/native/availability.tsx) | function | — | "09:30" as a Date today at that time (for a time picker), and back. |
| [`composerDisabledReason`](../packages/chat/src/native/composer-state.ts) | function | — | Why this person can't post here, for the disabled composer; null when they can. `canPost` is the server's answer (null while it loads, which disables quietly). |
| [`composerReducer`](../packages/chat/src/native/composer-state.ts) | function | — | _(no summary)_ |
| [`conversationIdFromData`](../packages/chat/src/native/push.ts) | function | — | The conversation a push is about: `data.conversationId`, else the id in `data.url`. |
| [`createDraftSaver`](../packages/chat/src/native/composer-state.ts) | function | — | Saves the draft a moment after typing stops (and at once on `flush`); an empty composer removes it. Storage errors are swallowed: a draft is a nicety. |
| [`createTusUpload`](../packages/chat/src/native/tus.ts) | function | — | _(no summary)_ |
| [`createVideoUploads`](../packages/chat/src/native/video-upload.ts) | function | — | _(no summary)_ |
| [`cycleVideoRate`](../packages/chat/src/native/video-player.tsx) | function | — | Moves the playing video with this id to its next speed. |
| [`cycleVoiceNoteRate`](../packages/chat/src/native/voice-player.tsx) | function | — | Moves the voice note with this id to its next speed; false when none is on screen with playback. |
| [`dateToClock`](../packages/chat/src/native/availability.tsx) | function | — | _(no summary)_ |
| [`defaultScheduleAt`](../packages/chat/src/native/schedule-sheet.tsx) | function | — | An hour from now, on the next five minutes: where the custom picker starts. |
| [`defaultWeek`](../packages/chat/src/native/availability.tsx) | function | — | Monday to Friday, 9 to 5: where a first setup starts. |
| [`deviceTimeZone`](../packages/chat/src/native/availability.tsx) | function | — | _(no summary)_ |
| [`DISMISS_DISTANCE`](../packages/chat/src/native/photo-viewer.tsx) | const | — | Points pulled down (or dragged, on Android) that close the viewer on release. |
| [`DISMISS_VELOCITY`](../packages/chat/src/native/photo-viewer.tsx) | const | — | Or a quick flick down, in points per millisecond. |
| [`displayBody`](../packages/chat/src/native/message-bubble.tsx) | function | — | Mentions written `@[Name](user:<id>)` read as `@Name`. |
| [`draftKey`](../packages/chat/src/native/composer-state.ts) | function | — | One draft per signed-in person, per conversation, and per thread within it. The person comes first, so `clearDrafts` can find all of theirs on sign-out, and a second login on the phone never sees the first one's drafts. |
| [`EMOJI_CATEGORIES`](../packages/chat/src/native/emoji.ts) | const | — | The categories in the order the picker shows them, each with the emoji its tab shows. |
| [`emojiEntry`](../packages/chat/src/native/emoji.ts) | function | — | An emoji's entry (its label for screen readers), or a bare one for an emoji the data doesn't have. |
| [`emojiInCategory`](../packages/chat/src/native/emoji.ts) | function | — | One category's emoji, parsed the first time it's asked for. |
| [`emptyComposer`](../packages/chat/src/native/composer-state.ts) | const | — | _(no summary)_ |
| [`failedReply`](../packages/chat/src/native/push.ts) | function | — | A reply that couldn't be sent, as the outbox keeps it: shown failed in its thread, with Retry. |
| [`fileFromDataUri`](../packages/chat/src/native/composer-state.ts) | function | — | A pasted picture (a data URI from the clipboard) as a file to send. |
| [`filesFromAssets`](../packages/chat/src/native/composer-state.ts) | function | — | Picked photos and videos as files to send, with what was refused and why: a type the bucket won't take, a file over the limit. |
| [`fileSource`](../packages/chat/src/native/video-upload.ts) | function | — | Opens a file URI for upload: in chunks with `openFile` (expo-file-system), else read whole through fetch. |
| [`fill`](../packages/chat/src/native/copy.ts) | function | — | `fill("Replying to {name}", { name: "Sam" })`. |
| [`forgetRecentEmoji`](../packages/chat/src/native/emoji-picker.tsx) | function | — | Forgets the recent emoji held in memory (one person's, or everyone's): call it on sign-out, with `clearDrafts`. |
| [`formatClock`](../packages/chat/src/native/message-bubble.tsx) | function | — | _(no summary)_ |
| [`formFrom`](../packages/chat/src/native/availability.tsx) | function | — | _(no summary)_ |
| [`fullScreenVideo`](../packages/chat/src/native/video-player.tsx) | function | — | Opens the video with this id full screen (starting it); false when none is on screen. |
| [`galleryFor`](../packages/chat/src/native/photo-viewer.tsx) | function | — | The photos of the message a tapped photo belongs to, and where it is among them, for `ChatPhotoViewer`: swiping goes through that message's photos. A photo in no message (one still sending, shown from the phone) opens alone. |
| [`handleChatPushResponse`](../packages/chat/src/native/push.ts) | function | — | Handles Reply and Mark read from a message's notification (pass it as the push block's `onResponse`). Taps on the notification itself are the block's routing, not this. Never throws: a failure is the outcome "failed" (and `onError`). |
| [`haptic`](../packages/chat/src/native/modules.ts) | function | — | Plays a haptic when the app gave expo-haptics; never throws. |
| [`hoursFromWeek`](../packages/chat/src/native/availability.tsx) | function | — | The hours to save: each day that's on, its range first, then any extra ranges saved elsewhere. |
| [`idleRecorder`](../packages/chat/src/native/recorder-machine.ts) | const | — | _(no summary)_ |
| [`inboxRow`](../packages/chat/src/native/inbox-screen.tsx) | function | — | An inbox row from a conversation. Exported for apps that build their own list. |
| [`initials`](../packages/chat/src/native/context.tsx) | function | — | "SA" for "Sam Altman", "S" for "sam". |
| [`initialVideoRecorder`](../packages/chat/src/native/video-recorder-state.ts) | const | — | _(no summary)_ |
| [`insertAtSelection`](../packages/chat/src/native/emoji.ts) | function | — | Puts `insert` in place of the selected text (or at the cursor), and where the cursor goes after it. |
| [`invertedRows`](../packages/chat/src/native/rows.ts) | function | — | Newest first, for an inverted list (its first row sits at the bottom). The thread screen no longer uses it: VoiceOver reads an inverted list's rows newest first, each day's heading after its messages. |
| [`isLocalUri`](../packages/chat/src/native/photo-viewer.tsx) | function | — | A file already on the phone, which shares and saves without a download. |
| [`isOnline`](../packages/chat/src/native/auto-retry.ts) | function | — | Whether a NetInfo state is online: unknown counts as online, so only a real "offline" waits. |
| [`isOpenableHref`](../packages/chat/src/native/attachment-cards.tsx) | function | — | A link a card may open by itself: https only. A kind's href is often built from what another person sent, so any other scheme (tel:, sms:, another app's links) goes through the app's own `onOpenAttachment` or the kind's `onPress` instead. |
| [`isVideoPlaying`](../packages/chat/src/native/video-player.tsx) | function | — | Whether the video with this id is playing. |
| [`linkHost`](../packages/chat/src/native/link-preview.tsx) | function | — | The site a link is on, without `www.`. |
| [`linkPreviewIds`](../packages/chat/src/native/link-preview.tsx) | function | — | The messages to ask previews for: shown (not deleted, not hidden by moderation), with a link. |
| [`liveBars`](../packages/chat/src/native/recorder-machine.ts) | function | — | The last `count` levels as bar heights 0–1, for the live waveform while recording. |
| [`loadDraft`](../packages/chat/src/native/composer-state.ts) | function | — | _(no summary)_ |
| [`loadRecentEmoji`](../packages/chat/src/native/emoji.ts) | function | — | _(no summary)_ |
| [`MAX_ZOOM`](../packages/chat/src/native/photo-viewer.tsx) | const | — | _(no summary)_ |
| [`memoryDraftStorage`](../packages/chat/src/native/composer-state.ts) | function | — | _(no summary)_ |
| [`messageActionsFor`](../packages/chat/src/native/actions.ts) | function | — | _(no summary)_ |
| [`MessageAttachments`](../packages/chat/src/native/media.tsx) | function | — | _(no summary)_ |
| [`messagePreview`](../packages/chat/src/react/previews.ts) | function | — | The long-press sheet's caption for a message. |
| [`ModerationMarker`](../packages/chat/src/native/moderation.tsx) | function | — | _(no summary)_ |
| [`moderationNote`](../packages/chat/src/native/moderation.tsx) | function | — | The note a bubble shows, or null. Deleted messages carry none. |
| [`moderationText`](../packages/chat/src/native/moderation.tsx) | function | — | The note's words (for the bubble's accessibility label too). |
| [`muxPosterUrl`](../packages/chat/src/native/video-player.tsx) | const | — | _(no summary)_ |
| [`muxStreamUrl`](../packages/chat/src/native/video-player.tsx) | const | — | _(no summary)_ |
| [`nearBottom`](../packages/chat/src/native/thread-screen.tsx) | function | — | Whether a scroll position is at (or near) the bottom of its content. |
| [`nextOffset`](../packages/chat/src/native/video-upload.ts) | function | — | The next byte the server wants, from a 308's `Range: bytes=0-N` (none: it has nothing yet). |
| [`openChatLink`](../packages/chat/src/native/link-preview.tsx) | function | — | Opens a link from chat: https only, in the in-app browser when there is one. |
| [`panLimit`](../packages/chat/src/native/photo-viewer.tsx) | function | — | How far a zoomed photo may pan before an edge shows, per axis. |
| [`pauseChatPlayback`](../packages/chat/src/native/voice-player.tsx) | function | — | Pauses the voice note or video playing, if any; with `ids` (or a test of an id), only when it is one of them (a screen's own attachments). For a screen losing focus: a tab switch keeps it mounted, so its player would play on. Returns whe... |
| [`pinchScale`](../packages/chat/src/native/photo-viewer.tsx) | function | — | The zoom a pinch has reached: from where it started, by how far the fingers spread. |
| [`previewToShow`](../packages/chat/src/native/link-preview.tsx) | function | — | The preview a bubble shows: the first one the server fetched for a link in its text, https only. |
| [`PUSH_REPLY_WAIT_MS`](../packages/chat/src/native/push.ts) | const | — | How long a reply queued in the live outbox is waited for before it counts as queued, not sent. |
| [`pushRecentEmoji`](../packages/chat/src/native/emoji.ts) | function | — | `emoji` first, once, the oldest dropped past `max`. |
| [`QUICK_REACTIONS`](../packages/chat/src/native/actions.ts) | const | — | The quick reactions on the long-press sheet. |
| [`RECENT_EMOJI_MAX`](../packages/chat/src/native/emoji.ts) | const | — | How many recent emoji the picker keeps. |
| [`recentEmojiKey`](../packages/chat/src/native/emoji.ts) | function | — | Where a person's recent emoji are kept: under their drafts' prefix, so `clearDrafts` removes them too. |
| [`recordedVideoFile`](../packages/chat/src/native/video-upload.ts) | function | — | The video as a file the outbox uploads to storage (without `videoUpload`). |
| [`recorderStep`](../packages/chat/src/native/recorder-machine.ts) | function | — | _(no summary)_ |
| [`recordingType`](../packages/chat/src/native/video-recorder-state.ts) | function | — | The kind of file a recording is, from its URI: .mov on iOS, .mp4 on Android. |
| [`registerChatNotificationActions`](../packages/chat/src/native/push.ts) | function | — | Registers the actions with the OS (once, at start; it is idempotent). |
| [`releasePlayback`](../packages/chat/src/native/voice-player.tsx) | function | — | Called when a voice note stops or unmounts. |
| [`replyClientId`](../packages/chat/src/native/push.ts) | function | — | The client id a reply from this notification sends with: the notification's own id, as a uuid (it already is one on iOS; anything else is hashed into one), so the same reply delivered twice posts once. |
| [`replyClientIdFor`](../packages/chat/src/native/push.ts) | function | — | The client id for one reply: from the notification's id, the message it is about (`data.messageId`) and the reply's text. The same reply delivered twice posts once; two replies to one conversation never share an id, even when iOS reuses ... |
| [`replyTargetFor`](../packages/chat/src/native/composer-state.ts) | function | — | A reply target from a message. |
| [`resolveChatCopy`](../packages/chat/src/native/copy.ts) | function | — | _(no summary)_ |
| [`rowIndexOf`](../packages/chat/src/native/use-jump.ts) | function | — | The row a message is drawn in, or -1. |
| [`rowKey`](../packages/chat/src/native/rows.ts) | function | — | _(no summary)_ |
| [`sameTimeDays`](../packages/chat/src/native/availability.tsx) | function | — | A day that's on with the same start and end (the database refuses it). |
| [`saveRecentEmoji`](../packages/chat/src/native/emoji.ts) | function | — | _(no summary)_ |
| [`scheduleInputFrom`](../packages/chat/src/native/schedule-sheet.tsx) | function | — | What the composer holds, as a message to schedule, or why it can't be: nothing to send, or files (a native file is a URI, and `useScheduled` uploads bytes only). |
| [`scrubSeconds`](../packages/chat/src/native/voice-player.tsx) | function | — | Where a finger at `x` across a waveform `width` wide puts the playhead, in seconds. |
| [`searchEmoji`](../packages/chat/src/native/emoji.ts) | function | — | Emoji whose label or tags have a word starting with every word of the query, those whose label starts with the query first. "thumbs up" finds 👍, "heart" every heart, "gri" 😀. |
| [`SearchSnippet`](../packages/chat/src/native/search-screen.tsx) | function | — | A snippet with its « » marks drawn highlighted, inside one Text (so it wraps as one). |
| [`shouldDismiss`](../packages/chat/src/native/photo-viewer.tsx) | function | — | Whether a drag down that ended here closes the viewer. |
| [`slotUrl`](../packages/chat/src/native/attachment-cards.tsx) | function | — | A URL a slot may be given: http or https only, else null. |
| [`snippetText`](../packages/chat/src/native/search-screen.tsx) | function | — | The snippet without its marks, for a screen reader. |
| [`splitCardAttachments`](../packages/chat/src/native/attachment-cards.tsx) | function | — | A message's attachments split into the app's cards and the rest (photos, voice, video, files). A card is a registered kind; with `slot` (the app draws its kinds) also any kind the package doesn't draw itself, as on the web. |
| [`threadListMode`](../packages/chat/src/native/thread-screen.tsx) | function | — | How the thread's list is set up, oldest first and not inverted. FlashList: its chat mode (opens at the bottom, follows new rows while within a fifth of a screen of it, keeps the first visible row in place when earlier ones load at the to... |
| [`timeZones`](../packages/chat/src/native/availability.tsx) | function | — | Every IANA zone the engine knows (Hermes has `Intl.supportedValuesOf`), else a short list. |
| [`toggleVideo`](../packages/chat/src/native/video-player.tsx) | function | — | Plays or pauses the video with this id; false when none with it is on screen. |
| [`toggleVideoMute`](../packages/chat/src/native/video-player.tsx) | function | — | Mutes or unmutes the video with this id while it plays. |
| [`toggleVoiceNote`](../packages/chat/src/native/voice-player.tsx) | function | — | Plays or pauses the voice note with this id; false when none with it is on screen with playback. |
| [`topicClosedFor`](../packages/chat/src/native/topics.tsx) | function | — | A closed topic takes posts only from owners, admins and observers. |
| [`topicMenuFor`](../packages/chat/src/native/topics.tsx) | function | — | What the options sheet offers: always New; Rename and Close or Reopen when a topic is shown. |
| [`toSend`](../packages/chat/src/native/composer-state.ts) | function | — | What `useConversation().send` takes: the input and the files. |
| [`TRANSCRIPT_LINES`](../packages/chat/src/native/media.tsx) | const | — | Lines a transcript shows before "Show more". |
| [`transcriptIsLong`](../packages/chat/src/native/media.tsx) | function | — | Whether a transcript folds behind "Show more": by its laid-out line count once measured. Before any layout (unit tests, where nothing is laid out) a rough guess from its length stands in. |
| [`TUS_CHUNK_BYTES`](../packages/chat/src/native/tus.ts) | const | — | Supabase requires 6 MB chunks for TUS (every chunk but the last). |
| [`useAwayLine`](../packages/chat/src/native/availability.tsx) | function | — | `awayLineFor` over the conversation's members, live (`useAvailability`), re-read each minute. |
| [`useCardRuns`](../packages/chat/src/native/attachment-cards.tsx) | function | — | Runs the app's actions for a message's cards (tick a task, answer a check-in) and keeps each card's state by attachment id: `pending` until the action settles, then `error` (the copy's `cardActionFailed`) if it threw or rejected. Only a ... |
| [`useChatAutoRetry`](../packages/chat/src/native/auto-retry.ts) | function | — | _(no summary)_ |
| [`useChatComposer`](../packages/chat/src/native/use-composer.ts) | function | — | `userId` is the signed-in person's (`useChat().userId`): drafts are kept per person. |
| [`useChatNative`](../packages/chat/src/native/context.tsx) | function | — | _(no summary)_ |
| [`useChatThreadStackOptions`](../packages/chat/src/native/stack-options.ts) | function | — | `chatThreadStackOptions` in the theme's grouped background, the color `ChatThreadScreen` draws. |
| [`useJumpToMessage`](../packages/chat/src/native/use-jump.ts) | function | — | _(no summary)_ |
| [`usePlayingVideo`](../packages/chat/src/native/video-player.tsx) | function | — | Which of these videos is playing, or null (re-renders only when that answer changes). |
| [`usePlayingVoiceNote`](../packages/chat/src/native/voice-player.tsx) | function | — | Which of these voice notes is playing, or null (re-renders only when that answer changes). |
| [`useScheduleSend`](../packages/chat/src/native/schedule-sheet.tsx) | function | — | Scheduled send from a thread's composer: `request` (Send held) checks there's text and no files and opens the sheet; `scheduleAt` schedules what's written, then empties the composer if it still holds just that. Pass `enabled: false` wher... |
| [`useVideoUploads`](../packages/chat/src/native/video-upload.ts) | function | — | The signed-in person's videos on their way to this conversation, live. |
| [`useVoiceRecorder`](../packages/chat/src/native/use-voice-recorder.ts) | function | — | _(no summary)_ |
| [`VIDEO_CHUNK_BYTES`](../packages/chat/src/native/video-upload.ts) | const | — | 8 MiB: a multiple of 256 KiB, as resumable uploads require for every chunk but the last. |
| [`VIDEO_HOLD_MS`](../packages/chat/src/native/video-recorder-state.ts) | const | — | _(no summary)_ |
| [`VIDEO_MIN_MS`](../packages/chat/src/native/video-recorder-state.ts) | const | — | _(no summary)_ |
| [`videoRecorderStep`](../packages/chat/src/native/video-recorder-state.ts) | function | — | _(no summary)_ |
| [`videoSource`](../packages/chat/src/native/video-player.tsx) | function | — | What expo-video loads: HLS for a playback id, else the file. |
| [`videoState`](../packages/chat/src/native/video-player.tsx) | function | — | What the player can show: a hosted video waits for its provider, a stored one for its link. |
| [`videoUploads`](../packages/chat/src/native/video-upload.ts) | const | — | The app's uploads in flight (one for the app; the thread screen reads it). |
| [`voiceNoteFile`](../packages/chat/src/native/use-voice-recorder.ts) | function | — | The voice note a finished recording becomes. |
| [`waveformBars`](../packages/chat/src/native/voice-player.tsx) | function | — | Bars 0–1 from stored peaks (0–100), resampled to `count`; flat when there are none. |
| [`weekFromHours`](../packages/chat/src/native/availability.tsx) | function | — | Each day's first range from saved hours (a day with none is off). |
| [`withDay`](../packages/chat/src/native/schedule-sheet.tsx) | function | — | `base` on the day of `day` (its time kept). |
| [`withTime`](../packages/chat/src/native/schedule-sheet.tsx) | function | — | `base` at the time of `time` (its day kept). |

### Types (96)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppStateLike };
export type { AudioPlayerLike };
export type { AudioRecorderLike };
export type { AudioStatusLike };
export type { AvailabilityForm };
export type { BubbleAttachment };
export type { BuildRowsOptions };
export type { ByteSource };
export type { CameraViewHandleLike };
export type { CardRunOptions };
export type { CardRunState };
export type { ChatAttachmentSlot };
export type { ChatAttachmentSlotProps };
export type { ChatAutoRetryOptions };
export type { ChatCardContext };
export type { ChatComposerHandle };
export type { ChatNativeContextValue };
export type { ChatNativeCopy };
export type { ChatNativeCopyOverrides };
export type { ChatNativeModules };
export type { ChatOrganiseCopy };
export type { ChatPerson };
export type { ChatPhoto };
export type { ChatPushCopy };
export type { ChatPushData };
export type { ChatPushOutboxDeps };
export type { ChatPushOutcome };
export type { ChatPushPayload };
export type { ChatPushPayloadInput };
export type { ChatPushResponseLike };
export type { ChatStartPerson };
export type { ChatThreadScreenSlots };
export type { ChatThreadStackOptionsProps };
export type { ChatVideoState };
export type { ChunkFileLike };
export type { ChunkedPutOptions };
export type { ClipboardLike };
export type { ComposerAction };
export type { ComposerAttachment };
export type { ComposerDraft };
export type { ComposerState };
export type { DayHours };
export type { DraftStorageLike };
export type { EmojiCategoryId };
export type { EmojiEntry };
export type { ExpoAudioLike };
export type { ExpoCameraLike };
export type { ExpoVideoLike };
export type { HapticEvent };
export type { HapticsLike };
export type { ImagePickerLike };
export type { JumpTarget };
export type { KeyboardAvoidingLike };
export type { MediaLibraryLike };
export type { MessageActionContext };
export type { MessageActionId };
export type { MintedUpload };
export type { ModerationNote };
export type { NetInfoLike };
export type { NotificationCategoriesLike };
export type { OpenAttachment };
export type { OutboxSend };
export type { PermissionLike };
export type { PickedAssetLike };
export type { PickerResultLike };
export type { RecordedVideo };
export type { RecorderConfig };
export type { RecorderEffect };
export type { RecorderEvent };
export type { RecorderNotice };
export type { RecorderPhase };
export type { RecorderState };
export type { RecorderStateLike };
export type { ReplyTarget };
export type { SharingLike };
export type { StartVideoInput };
export type { ThreadRow };
export type { TopicMenuAction };
export type { TusSendInfo };
export type { TusTransport };
export type { TusUploadOptions };
export type { TusUploadRecord };
export type { TusUploadSource };
export type { UseJumpOptions };
export type { UseVoiceRecorderOptions };
export type { VideoPlayerLike };
export type { VideoRecorderEffect };
export type { VideoRecorderEvent };
export type { VideoRecorderPhase };
export type { VideoRecorderState };
export type { VideoUploadError };
export type { VideoUploadTask };
export type { VideoUploads };
export type { VideoViewHandleLike };
export type { WebBrowserLike };
export type { WeekHours };
```

---

## @marktiderman/genesis-chat/push

**Barrel:** [`packages/chat/src/native/push.ts`](../packages/chat/src/native/push.ts)

### Other exports (16)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`CHAT_MARK_READ_ACTION`](../packages/chat/src/native/push.ts) | const | — | The same id as genesis-notifications' `MESSAGE_ACTIONS` (device ids take no "-" or ":"). |
| [`CHAT_PUSH_CATEGORY`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`CHAT_REPLY_ACTION`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`chatNotificationActions`](../packages/chat/src/native/push.ts) | function | — | The actions on a message's notification: Reply (a text field) and Mark read, neither opening the app. |
| [`chatPath`](../packages/chat/src/native/push.ts) | function | — | The path a message's push opens. |
| [`chatPushCategory`](../packages/chat/src/native/push.ts) | function | — | The category for createPush's `categories` (genesis-native's NotificationCategory). |
| [`chatPushCopy`](../packages/chat/src/native/push.ts) | const | — | _(no summary)_ |
| [`chatPushPayload`](../packages/chat/src/native/push.ts) | function | — | The category, thread, `mutableContent` and `data` of a message's push, for the server that sends it: |
| [`chatThreadMatch`](../packages/chat/src/native/push.ts) | function | — | For the push block's `suppress` / `useSuppressNotifications`: this conversation's pushes, while its thread is open. |
| [`conversationIdFromData`](../packages/chat/src/native/push.ts) | function | — | The conversation a push is about: `data.conversationId`, else the id in `data.url`. |
| [`failedReply`](../packages/chat/src/native/push.ts) | function | — | A reply that couldn't be sent, as the outbox keeps it: shown failed in its thread, with Retry. |
| [`handleChatPushResponse`](../packages/chat/src/native/push.ts) | function | — | Handles Reply and Mark read from a message's notification (pass it as the push block's `onResponse`). Taps on the notification itself are the block's routing, not this. Never throws: a failure is the outcome "failed" (and `onError`). |
| [`PUSH_REPLY_WAIT_MS`](../packages/chat/src/native/push.ts) | const | — | How long a reply queued in the live outbox is waited for before it counts as queued, not sent. |
| [`registerChatNotificationActions`](../packages/chat/src/native/push.ts) | function | — | Registers the actions with the OS (once, at start; it is idempotent). |
| [`replyClientId`](../packages/chat/src/native/push.ts) | function | — | The client id a reply from this notification sends with: the notification's own id, as a uuid (it already is one on iOS; anything else is hashed into one), so the same reply delivered twice posts once. |
| [`replyClientIdFor`](../packages/chat/src/native/push.ts) | function | — | The client id for one reply: from the notification's id, the message it is about (`data.messageId`) and the reply's text. The same reply delivered twice posts once; two replies to one conversation never share an id, even when iOS reuses ... |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChatPushCopy };
export type { ChatPushData };
export type { ChatPushOutboxDeps };
export type { ChatPushOutcome };
export type { ChatPushPayload };
export type { ChatPushPayloadInput };
export type { ChatPushResponseLike };
export type { NotificationCategoriesLike };
```

---

## @marktiderman/genesis-chat/server

**Barrel:** [`packages/chat/src/server/index.ts`](../packages/chat/src/server/index.ts)

### Other exports (41)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ANTHROPIC_MESSAGES_URL`](../packages/chat/src/server/assistant.ts) | const | — | AI help for a conversation, through the Claude API: a short recap of what came in since someone last looked, and a reply draft in the reader's voice. Nothing is ever sent: the caller shows the text, labelled as written by AI, and a perso... |
| [`ANTHROPIC_VERSION`](../packages/chat/src/server/assistant.ts) | const | — | The Messages API version the fetch path sends. |
| [`carriesCredential`](../packages/chat/src/server/unfurl.ts) | function | — | True when the URL's query or fragment carries what looks like a credential (exported for tests). |
| [`CHAT_ASSISTANT_MODEL`](../packages/chat/src/server/assistant.ts) | const | — | The default model: the current Sonnet. |
| [`CHAT_MAX_ATTEMPTS`](../packages/chat/src/server/runner.ts) | const | — | `claim_effects` stops claiming an effect after this many attempts. |
| [`CHAT_NOTIFICATION_CATEGORIES`](../packages/chat/src/server/notifications.ts) | const | — | The `messages` category, for `defineNotifications({ categories })`. |
| [`CHAT_NOTIFICATION_TYPE_ID`](../packages/chat/src/server/notifications.ts) | const | — | The notification type id chat pushes go out as. |
| [`CHAT_NOTIFICATION_TYPES`](../packages/chat/src/server/notifications.ts) | const | — | The `chat.message` type, for `defineNotifications({ types })`: in the feed and pushed, no email unless the app adds it. Spread it and override what you need (`actions: "message"` with genesis-notifications' `MESSAGE_ACTIONS` for reply an... |
| [`chatNotifyInput`](../packages/chat/src/server/notifications.ts) | function | — | Maps a chat push onto genesis-notifications' `notify()` (exported for tests and apps that call notify themselves). |
| [`chatRunnerHandler`](../packages/chat/src/server/handler.ts) | function | — | _(no summary)_ |
| [`chatUploadPassthrough`](../packages/chat/src/server/upload.ts) | function | — | `gc1:<conversation id>:<user id or empty>`: the passthrough the upload handler sets. |
| [`createChatAssistant`](../packages/chat/src/server/assistant.ts) | function | — | _(no summary)_ |
| [`createChatRunner`](../packages/chat/src/server/runner.ts) | function | — | _(no summary)_ |
| [`createExpoDeliver`](../packages/chat/src/server/expo.ts) | function | — | _(no summary)_ |
| [`createLinkUnfurler`](../packages/chat/src/server/unfurl.ts) | function | — | _(no summary)_ |
| [`createVideoUploadHandler`](../packages/chat/src/server/upload.ts) | function | — | _(no summary)_ |
| [`deadTokens`](../packages/chat/src/server/expo.ts) | function | — | The tokens Expo says are gone (`DeviceNotRegistered`): forget them. |
| [`decodeEntities`](../packages/chat/src/server/unfurl.ts) | function | — | Decodes HTML entities (named, decimal, hex). |
| [`deepgramTranscriber`](../packages/chat/src/server/transcribers.ts) | function | — | Deepgram pre-recorded transcription by URL (https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded): `POST /v1/listen?model=…&smart_format=true&detect_language=true` with `{ url }` and `Authorization: Token <key>`; ... |
| [`draftPrompt`](../packages/chat/src/server/assistant.ts) | function | — | The draft's user turn (exported for tests). |
| [`draftSystem`](../packages/chat/src/server/assistant.ts) | function | — | The draft's system prompt (exported for tests); `context` names the kind of conversation. |
| [`EXPO_BATCH`](../packages/chat/src/server/expo.ts) | const | — | _(no summary)_ |
| [`EXPO_SEND_URL`](../packages/chat/src/server/expo.ts) | const | — | _(no summary)_ |
| [`fakeVideoProvider`](../packages/chat/src/server/fake-video.ts) | function | — | _(no summary)_ |
| [`guardedLookup`](../packages/chat/src/server/unfurl.ts) | function | — | A `dns.lookup` for Node's socket `connect.lookup` (undici `Agent({ connect: { lookup } })`): resolves the name and refuses it when any address is private, so the connection goes only to an address that was checked. That closes DNS rebind... |
| [`isPrivateAddress`](../packages/chat/src/server/unfurl.ts) | function | — | True when `ip` (v4 or v6, brackets allowed) is not a public unicast address. Unparseable counts as private. |
| [`moderationVerdict`](../packages/chat/src/server/moderation.ts) | function | — | Maps category scores to a verdict with the given thresholds (exported for tests and other providers). |
| [`muxPlaybackToken`](../packages/chat/src/server/mux.ts) | function | — | _(no summary)_ |
| [`muxPlaybackUrl`](../packages/chat/src/server/mux.ts) | function | — | A signed playback URL (RS256 JWT with `sub` = playback id, `aud` = v, `kid` in the header), valid for `expiresInSeconds` (default 6 hours). |
| [`muxVideo`](../packages/chat/src/server/mux.ts) | function | — | _(no summary)_ |
| [`notificationsDeliver`](../packages/chat/src/server/notifications.ts) | function | — | _(no summary)_ |
| [`OPENAI_MODERATION_CATEGORIES`](../packages/chat/src/server/moderation.ts) | const | — | The categories omni-moderation scores (text and images, or text only where noted in OpenAI's guide). |
| [`OPENAI_MODERATIONS_URL`](../packages/chat/src/server/moderation.ts) | const | — | _(no summary)_ |
| [`openAiModerator`](../packages/chat/src/server/moderation.ts) | function | — | _(no summary)_ |
| [`openAiTranscriber`](../packages/chat/src/server/transcribers.ts) | function | — | OpenAI `POST /v1/audio/transcriptions` (multipart: file, model, language): the file is downloaded from the signed URL first, as OpenAI takes no URL. Files over 25 MB are refused by OpenAI, so they fail here without the upload. |
| [`parseChatUploadPassthrough`](../packages/chat/src/server/upload.ts) | function | — | Reads a passthrough the upload handler set, or null for anything else. |
| [`parseOpenGraph`](../packages/chat/src/server/unfurl.ts) | function | — | Open Graph data from a page's HTML (exported for tests). `base` resolves a relative og:image. The page is hostile input and this runs synchronously, so every scan is linear in its length. |
| [`recapPrompt`](../packages/chat/src/server/assistant.ts) | function | — | The recap's user turn (exported for tests). |
| [`recapSystem`](../packages/chat/src/server/assistant.ts) | function | — | The recap's system prompt (exported for tests); `context` names the kind of conversation. |
| [`transcriptLines`](../packages/chat/src/server/assistant.ts) | function | — | The transcript lines (exported for tests): notes and hidden messages stripped unless `observer`, deleted messages left out, angle brackets neutralised, oldest first. |
| [`verifyMuxSignature`](../packages/chat/src/server/mux.ts) | function | — | Verifies a `mux-signature` header (`t=<unix>,v1=<hex>`) over the raw body. |

### Types (43)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnthropicLike };
export type { AssistantMessage };
export type { AssistantResult };
export type { ChatAssistant };
export type { ChatAssistantOptions };
export type { ChatDeliver };
export type { ChatEffect };
export type { ChatEffectKind };
export type { ChatNotification };
export type { ChatNotifyInput };
export type { ChatRecipient };
export type { ChatRunReport };
export type { ChatRunner };
export type { ChatRunnerHandlerOptions };
export type { ChatRunnerOptions };
export type { ChatUploadBinding };
export type { DeepgramOptions };
export type { DraftReplyInput };
export type { ExpoDeliverOptions };
export type { ExpoDeliveryTicket };
export type { ExpoPushMessage };
export type { ExpoPushTicket };
export type { FakeReadyOptions };
export type { FakeVideoProviderOptions };
export type { LinkPreview };
export type { LinkUnfurler };
export type { LinkUnfurlerOptions };
export type { ModerateInput };
export type { ModerationResult };
export type { ModerationThresholds };
export type { ModerationVerdict };
export type { Moderator };
export type { MuxSigningKey };
export type { MuxVideoOptions };
export type { NotificationsDeliverOptions };
export type { OpenAiModeratorOptions };
export type { OpenAiTranscriberOptions };
export type { RecapInput };
export type { TranscribeInput };
export type { TranscribeResult };
export type { Transcriber };
export type { VideoProvider };
export type { VideoUploadHandlerOptions };
```

---

## @marktiderman/genesis-chat/ai

**Barrel:** [`packages/chat/src/ai/index.ts`](../packages/chat/src/ai/index.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`CHAT_AI_REFUSALS`](../packages/chat/src/ai/index.ts) | const | — | _(no summary)_ |
| [`chatDraftReplyTask`](../packages/chat/src/ai/index.ts) | function | — | A draft of the caller's next message, in their voice. Nothing is sent: a person decides. |
| [`chatRecapTask`](../packages/chat/src/ai/index.ts) | function | — | "Catch me up": a short recap of what came in since the caller last read the conversation. |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChatAiDb };
export type { ChatAiTaskOptions };
export type { DraftTaskOptions };
export type { LoadedConversation };
```

---

## @marktiderman/genesis-collab

Collaboration and sharing for Genesis apps: a space (a subject, an audience, roles, a visibility policy and timing) for anything more than one person works on, with the rules for who sees whose contributions and when, in the app's own Supabase (the genesis_collab schema) and in a headless core for the interface. Part of the Genesis framework.

**Barrel:** [`packages/collab/src/index.ts`](../packages/collab/src/index.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`canSee`](../packages/collab/src/policy.ts) | function | — | Whether the viewer may read one contribution's contents. |
| [`DEFAULT_POLICY`](../packages/collab/src/policy.ts) | const | — | _(no summary)_ |
| [`describePolicy`](../packages/collab/src/policy.ts) | function | — | One sentence anyone can read: "Members see each other's answers once they've sent their own." |
| [`gateOf`](../packages/collab/src/policy.ts) | function | — | _(no summary)_ |
| [`mayAggregate`](../packages/collab/src/policy.ts) | function | — | Whether the viewer may see combined results (counts, averages, spread) of others' work. These need the minimum group at every level, Full included: an average of two is the other person's answer. Full still shows the contributions themse... |
| [`MIN_GROUP`](../packages/collab/src/policy.ts) | const | — | Combined results never show for fewer contributors than this, besides the viewer. |
| [`normalizePolicy`](../packages/collab/src/policy.ts) | function | — | A policy with every field present and in range; anything unknown takes the default. |
| [`REVEAL_RULES`](../packages/collab/src/policy.ts) | const | — | When they see it. |
| [`runsSpace`](../packages/collab/src/policy.ts) | function | — | Owners and facilitators run the space: they see every contribution that isn't private. |
| [`showsNames`](../packages/collab/src/policy.ts) | function | — | Whether the viewer sees who contributed (names on contents, the who's-done list). |
| [`SPACE_ROLES`](../packages/collab/src/policy.ts) | const | — | Who may do what in a space, most to least. |
| [`strongerRole`](../packages/collab/src/policy.ts) | function | — | The stronger of two roles (a person in a space directly and through a group). |
| [`VISIBILITY_LEVELS`](../packages/collab/src/policy.ts) | const | — | What participants see of each other's contributions, least to most. |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ContributionFacts };
export type { Reveal };
export type { SpaceGate };
export type { SpacePolicy };
export type { SpaceRole };
export type { SpaceState };
export type { SpaceViewer };
export type { Visibility };
```

---

## @marktiderman/genesis-connect

Connect an outside account, server side: encrypted secrets with key versioning (AES-256-GCM, HKDF per purpose, a keyring with rotation) and an OAuth connector kit (authorization code with PKCE, a signed state, the verifier in a cookie, a pinned callback origin) on Web Request and Response, with Google built in. fetch and WebCrypto only, no dependencies: Node 20+, edge and Workers. Part of the Genesis framework.

**Barrel:** [`packages/connect/src/index.ts`](../packages/connect/src/index.ts)

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`clearAccessTokenCache`](../packages/connect/src/oauth.ts) | function | — | Forgets every cached access token (tests, or after a key or client change). |
| [`CONNECT_RESULTS`](../packages/connect/src/oauth.ts) | const | — | Every result `callback` can send back with. |
| [`ConnectError`](../packages/connect/src/oauth.ts) | class | — | A failure with a message safe to show and log: never a token, a code or a secret. |
| [`createConnector`](../packages/connect/src/oauth.ts) | function | — | Sets up a connector for one provider. Checks its config now, so a mistake shows at boot. |
| [`createSecrets`](../packages/connect/src/secrets.ts) | function | — | Seals and opens secrets of one purpose with a keyring (see `parseKeyring` for what it takes). Derived keys are cached on the returned object. |
| [`deriveSecretKey`](../packages/connect/src/secrets.ts) | function | — | An AES-GCM key for one purpose, derived from a 32-byte key with HKDF-SHA-256 (`info` naming the purpose; the salt empty unless given). Keep `info` and the salt fixed once anything is sealed with them. |
| [`GOOGLE_SCOPES`](../packages/connect/src/providers.ts) | const | — | Google scopes apps commonly connect with. Prefer the narrowest. |
| [`googleProvider`](../packages/connect/src/providers.ts) | const | — | Google's OAuth 2.0 endpoints, asking for offline access (a refresh token) every time. |
| [`isConnectError`](../packages/connect/src/oauth.ts) | function | — | Whether `error` is a `ConnectError`, by its name and code rather than `instanceof`, so it also matches a copy from another bundle. |
| [`isSafeReturnOrigin`](../packages/connect/src/oauth.ts) | function | — | Whether `origin` is exactly an https origin on `domain`, so it is safe to send the browser back to. |
| [`isSecretError`](../packages/connect/src/secrets.ts) | function | — | Whether `error` is a `SecretError`, by its name and code rather than `instanceof`, so it also matches a copy bundled into another package (genesis-forms bundles one). |
| [`KEY_ID`](../packages/connect/src/secrets.ts) | const | — | A key id: letters, digits, `_` and `-`, at most 32 (it is written into every sealed secret). |
| [`openWithKey`](../packages/connect/src/secrets.ts) | function | — | Opens what `sealWithKey` sealed with the same key and `aad`. |
| [`parseKeyring`](../packages/connect/src/secrets.ts) | function | — | A keyring from config: an object, its JSON text (one environment variable: `{"active":"k2","keys":{"k1":"…","k2":"…"}}`), or a single bare key, which becomes `{ active: "k1", keys: { k1 } }` (how a single-key secret moves onto a keyring)... |
| [`sealWithKey`](../packages/connect/src/secrets.ts) | function | — | Seals with one derived key in the single-key format, `v1.<iv>.<ciphertext>`. Kept for genesis-forms' `sealSecret`; new code uses `createSecrets`, whose `v2.` form names its key so the key can be rotated. |
| [`SecretError`](../packages/connect/src/secrets.ts) | class | — | A failure whose message is safe to log: never a key, a plaintext or a ciphertext. |
| [`secretKeyBytes`](../packages/connect/src/secrets.ts) | function | — | The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32` prints), or the bytes themselves. |

### Types (22)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ConnectErrorCode };
export type { ConnectLogEvent };
export type { ConnectResult };
export type { ConnectedAccount };
export type { Connector };
export type { ConnectorConfig };
export type { DeriveSecretKeyOptions };
export type { HttpOptions };
export type { Keyring };
export type { KeyringInput };
export type { OAuthProvider };
export type { RefreshedToken };
export type { Salt };
export type { SecretErrorCode };
export type { Secrets };
export type { SecretsOptions };
export type { StartOptions };
export type { StartResult };
export type { StateData };
export type { StoreResult };
export type { TokenCallOptions };
export type { WebCryptoKey };
```

---

## @marktiderman/genesis-connect/secrets

**Barrel:** [`packages/connect/src/secrets.ts`](../packages/connect/src/secrets.ts)

### Other exports (9)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSecrets`](../packages/connect/src/secrets.ts) | function | — | Seals and opens secrets of one purpose with a keyring (see `parseKeyring` for what it takes). Derived keys are cached on the returned object. |
| [`deriveSecretKey`](../packages/connect/src/secrets.ts) | function | — | An AES-GCM key for one purpose, derived from a 32-byte key with HKDF-SHA-256 (`info` naming the purpose; the salt empty unless given). Keep `info` and the salt fixed once anything is sealed with them. |
| [`isSecretError`](../packages/connect/src/secrets.ts) | function | — | Whether `error` is a `SecretError`, by its name and code rather than `instanceof`, so it also matches a copy bundled into another package (genesis-forms bundles one). |
| [`KEY_ID`](../packages/connect/src/secrets.ts) | const | — | A key id: letters, digits, `_` and `-`, at most 32 (it is written into every sealed secret). |
| [`openWithKey`](../packages/connect/src/secrets.ts) | function | — | Opens what `sealWithKey` sealed with the same key and `aad`. |
| [`parseKeyring`](../packages/connect/src/secrets.ts) | function | — | A keyring from config: an object, its JSON text (one environment variable: `{"active":"k2","keys":{"k1":"…","k2":"…"}}`), or a single bare key, which becomes `{ active: "k1", keys: { k1 } }` (how a single-key secret moves onto a keyring)... |
| [`sealWithKey`](../packages/connect/src/secrets.ts) | function | — | Seals with one derived key in the single-key format, `v1.<iv>.<ciphertext>`. Kept for genesis-forms' `sealSecret`; new code uses `createSecrets`, whose `v2.` form names its key so the key can be rotated. |
| [`SecretError`](../packages/connect/src/secrets.ts) | class | — | A failure whose message is safe to log: never a key, a plaintext or a ciphertext. |
| [`secretKeyBytes`](../packages/connect/src/secrets.ts) | function | — | The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32` prints), or the bytes themselves. |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DeriveSecretKeyOptions };
export type { Keyring };
export type { KeyringInput };
export type { Salt };
export type { SecretErrorCode };
export type { Secrets };
export type { SecretsOptions };
export type { WebCryptoKey };
```

---

## @marktiderman/genesis-core

Platform-agnostic providers, hooks, and data layer. Use anywhere — web, native, Node.

**Barrel:** [`packages/core/src/index.ts`](../packages/core/src/index.ts)

### Components (4)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataProviderRoot`](../packages/core/src/provider/context.tsx) | `DataProviderRootProps` | — | _(no summary)_ |
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | Convenience root: a `QueryClientProvider`, storage, and a data provider (yours, or a mock built from datasets). It creates its own `QueryClient` unless you pass `queryClient`; an app that already has one should pass it, or mount `DataPro... |
| [`ViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | `ViewerScopeProps` | — | Keeps one viewer's cached data from ever showing to the next. Children render only once the viewer is known, under a key of that viewer, so a sign-out or a new person signing in unmounts every screen and its queries before the cache is e... |
| [`WorkspaceScope`](../packages/core/src/hooks/workspace-scope.tsx) | `WorkspaceScopeProps` | Beta | `ViewerScope` for an app with workspaces: use it in place of `ViewerScope`. It reads the current workspace from the URL and scopes everything under it to that workspace (its `scope`, `roles` and `timeZone`), so every view with `scope: ["... |

### Other exports (69)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`blankValues`](../packages/core/src/hooks/use-resource-form.ts) | function | — | What a save sends for an input left empty: `""`, or `undefined` (a cleared number input). Only a field whose column the form knows about (`nullable` set, as ResourceView sets it from a generated contract) is changed: a create leaves it o... |
| [`buildArrayItemDefaults`](../packages/core/src/hooks/use-resource-form.ts) | function | — | Build default values for a single array item from its sub-field definitions |
| [`callRpc`](../packages/core/src/provider/write-helpers.ts) | function | — | Calls a database function and returns its result. A failure throws a DataWriteError with the usual outcome and code, and words a person can read: yours for the code, a guard's own message (P0001), the defaults above, or a generic sentenc... |
| [`classifyError`](../packages/core/src/errors.ts) | function | — | What kind of error this is, a sentence that is safe to show, and whether it is worth reporting. Understands the provider's `DataWriteError` and `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's auth and fetch error... |
| [`clearViewerCache`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Empties the query cache for a new viewer: sends the old viewer's waiting undoable writes (the session is still theirs), cancels reads in flight, then removes every query. Call it in the sign-in and sign-out actions, before the session ch... |
| [`createLocalStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | localStorage adapter with SSR safety. |
| [`createMemoryStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | In-memory adapter for testing and SSR. |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createNoopStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | No-op adapter — all operations silently do nothing. |
| [`createOrAdopt`](../packages/core/src/provider/write-helpers.ts) | function | — | "One live row per key": creates the row, or, when one with the same key is already there (a `duplicate`), adopts it, optionally merging changes in. `adopted` says which, and `final` that the row already there is finished. Key fields that... |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | The Supabase data provider. Reads and writes go through the client you pass, under that client's session and RLS. |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`decodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | The inverse of {@link encodeRecordKey}: field name → value. |
| [`DEFAULT_DRAFT_DELAY_MS`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DEFAULT_LIVE_DEBOUNCE_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How long a burst of change events is gathered into one refetch. |
| [`DEFAULT_LIVE_RESYNC_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How often a live read refetches anyway while the page is visible. Realtime checks each change against the row's new state, so a row the viewer stops being allowed to see (binned, made a draft, moved to another practice) sends them nothin... |
| [`DEFAULT_RPC_MESSAGES`](../packages/core/src/provider/write-helpers.ts) | const | — | The words shown for a code when the caller gives none. A guard's own `raise exception` (P0001) keeps its words. |
| [`DEFAULT_UNDO_DELAY_MS`](../packages/core/src/hooks/mutation-mode.ts) | const | — | How long an `undoable` write waits for an undo before it is sent. |
| [`DEFAULT_UNSAVED_CHANGES_MESSAGE`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | const | — | _(no summary)_ |
| [`defaultErrorReporter`](../packages/core/src/errors.ts) | const | — | The reporter used when the app registered none: `console.warn` in development, nothing in production. |
| [`defineQueryKeys`](../packages/core/src/query-keys.ts) | function | — | The keys of one domain. Each query maps its arguments to the fields that make it distinct (sort arrays so order never makes two keys): |
| [`defineResource`](../packages/core/src/schema/types.ts) | function | — | Declares a resource contract for a row type, keeping the literal contract (field names, key, labelField) and attaching the row type so views can read it with `RowOf`. `labelField` must be one of the row's fields. |
| [`DRAFT_NOT_SAVED`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DraftController`](../packages/core/src/hooks/draft-controller.ts) | class | — | The rules of a draft, without React: one write at a time, add then change, no write when nothing changed or for an empty value, merge into a row another tab started, start again on a new revision, retry network failures, and a final writ... |
| [`dropPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Drops every write on this client not yet sent, without reporting them: the viewer who made them is gone, so they must never be sent (or re-applied) under the next one. Writes already sending finish under the old session. |
| [`encodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | One `Identifier` for a row. |
| [`errorMessages`](../packages/core/src/errors.ts) | const | — | The English catalogue. Plain words, never the store's text. |
| [`fieldErrorsFromPostgrest`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Reads which columns a Postgres constraint error is about, from PostgREST's `message` / `details`, and gives safe messages for them. Only plain column names are taken from the store's text; the values it echoes are never used. A unique vi... |
| [`flushPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Sends every optimistic or undoable write still waiting on this client now, and resolves once all have settled. Call it while the session that made them still holds (a sign-out action, before signing out). |
| [`getErrorReporter`](../packages/core/src/errors.ts) | function | — | The reporter `reportError` uses now. |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isNetworkFailure`](../packages/core/src/hooks/draft-controller.ts) | function | — | The default `isRetryable`: a request that never reached the store. A refusal never is. |
| [`isSafeUrl`](../packages/core/src/urls.ts) | function | — | True when `url` is safe to put in an `href`: an absolute http(s), mailto or tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`). |
| [`keyFields`](../packages/core/src/schema/keys.ts) | function | — | The key of a contract as a list, whichever form `key` was declared in. |
| [`loadRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | The words for one linked id, batched with every other id asked for in the same tick: one `getList(resource, { filters: [{ field, operator: "in" }] })` per linked resource and naming field. Resolves null when the row has no words or isn't... |
| [`NO_VIEWER`](../packages/core/src/viewer.ts) | const | — | The viewer outside any ViewerScope: no one, nowhere, no roles. |
| [`normalizeLinkUrl`](../packages/core/src/urls.ts) | function | — | Turn what a person typed into the link field into a safe href, or `null`. `example.com/page` becomes `https://example.com/page`; an email address becomes a `mailto:` link. |
| [`pendingWriteCount`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Optimistic or undoable writes on `resource` not yet settled. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |
| [`readOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a store error code to the read outcome it means: the write mapping, with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116, `42703` unknown column, `42P01` unknown table) read as `invalid`. |
| [`rememberedWorkspaceId`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The workspace this viewer was last in on this device, for the app's front door (`defaultWorkspace(workspaces, rememberedWorkspaceId(viewer))`). Null when unknown. |
| [`reportError`](../packages/core/src/errors.ts) | function | — | Report an error a package caught and handled. Never throws: a failing reporter must not take the caller (an event handler, a render) down. `context` may be just the source. |
| [`resourceKeys`](../packages/core/src/query-keys.ts) | function | — | The keys Genesis's own hooks cache a resource under, for writing into or invalidating them by hand: `[resource]` covers them all. |
| [`RPC_FAILED`](../packages/core/src/provider/write-helpers.ts) | const | — | _(no summary)_ |
| [`scopeClock`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The scope's clock: `scopeTimeZone` when the runtime knows it, else the viewer's. A zone it doesn't know is never a quiet fallback: it throws in development, and in production it is reported (`reportError`, once per zone) before the viewe... |
| [`setErrorReporter`](../packages/core/src/errors.ts) | function | — | Send every `reportError` to `reporter` (`null` puts the default back). Returns a function that restores the reporter that was there before. The native observability block calls it when it is created. |
| [`stableJson`](../packages/core/src/hooks/draft-controller.ts) | function | — | JSON with object keys sorted, so values compare equal whatever order a store keeps keys in. |
| [`titleCase`](../packages/core/src/utils.ts) | function | — | Convert a key string to title case. "created_at" -> "Created At" "firstName" -> "First Name" |
| [`toDataWriteError`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Turns anything a write threw, or the `{ message, code }` error a Supabase client returned, into a `DataWriteError`. A `DataWriteError` passes through unchanged; anything else keeps its message and `code`, and is kept as the `cause`. |
| [`useCapabilities`](../packages/core/src/hooks/use-capabilities.ts) | function | — | What the data provider can do for `resource` (`provider.capabilities`), cached per provider and resource. `data` stays undefined for a provider that doesn't report capabilities, so a UI keeps its defaults. |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useDraft`](../packages/core/src/hooks/use-draft.ts) | function | — | Autosave one draft row: saved a moment after each change, one write at a time, added on the first save that has something in it, merged into a row another tab started (`adopt`), and started again when the server's copy wins (`revision`).... |
| [`useInfiniteResource`](../packages/core/src/hooks/use-infinite-resource.ts) | function | — | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useOptionalViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Like useViewerScope, or null outside a ViewerScope. |
| [`useRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | A linked row's words for a `relation` cell: `undefined` while they load, `null` when there are none (the row is hidden from this viewer, gone, unnamed, or the read failed), so a screen shows its own words then, never the raw id. Cached p... |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useUnsavedChangesGuard`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | function | — | Warns before unsaved changes are lost, without depending on a router. |
| [`useViewer`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer for guards: `{ id, scope, roles }` from the nearest ViewerScope, or {@link NO_VIEWER} without one. The object is stable while those are equal by value, so it can sit in a memo's dependencies. |
| [`useViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer and scope from the nearest `ViewerScope`. Throws without one: screens that cache per viewer need it. |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |
| [`useWorkspace`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The nearest `WorkspaceScope`'s workspaces, or null outside one. |
| [`useWrite`](../packages/core/src/hooks/use-write.ts) | function | — | A one-off write that isn't a resource page's create, update or remove: a database function, `createOrAdopt`, several writes in a row. It invalidates what it made stale and reports failures in plain words. |
| [`WRITE_FAILED`](../packages/core/src/hooks/use-write.ts) | const | — | _(no summary)_ |
| [`writeOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it means. Anything not listed is `error`: a code is only read as a refusal or a bad value when it says so. |

### Types (112)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { AuditEntry };
export type { BaseRecord };
export type { BulkChange };
export type { BulkResult };
export type { CallRpcOptions };
export type { ClassifiedError };
export type { ClassifyErrorOptions };
export type { CountMode };
export type { CreateOrAdoptOptions };
export type { CreateOrAdoptResult };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DataReadErrorOptions };
export type { DataRow };
export type { DataWriteErrorOptions };
export type { DeleteParams };
export type { DeleteResult };
export type { DraftAdoption };
export type { DraftOptions };
export type { DraftSeed };
export type { DraftState };
export type { DraftStatus };
export type { DraftValue };
export type { ErrorKind };
export type { ErrorMessages };
export type { ErrorReportContext };
export type { ErrorReporter };
export type { FieldPermissions };
export type { FieldReference };
export type { FieldSchema };
export type { FieldType };
export type { FilterOperator };
export type { FilterParam };
export type { GenesisViewerRoles };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { HistoryParams };
export type { Identifier };
export type { ImportParams };
export type { InfinitePageParam };
export type { InvalidationKey };
export type { KeyFilter };
export type { KeyScope };
export type { ListParams };
export type { ListResult };
export type { LiveOptions };
export type { MockProviderOptions };
export type { MutationMode };
export type { MutationModeOptions };
export type { NullFilter };
export type { PaginationParam };
export type { PostgrestFieldErrors };
export type { ProviderCapabilities };
export type { QueryKeys };
export type { RangeFilter };
export type { ReadOutcome };
export type { RecordComment };
export type { ResourceAccess };
export type { ResourceChangeEvent };
export type { ResourceContract };
export type { ResourceFormFieldDef };
export type { ResourceRelation };
export type { ResourceSchema };
export type { ResourceScope };
export type { ResourceSummary };
export type { RowAction };
export type { RowFailure };
export type { RowOf };
export type { RpcClient };
export type { ScalarFilter };
export type { ScopedKey };
export type { SelectOption };
export type { SortParam };
export type { StorageAdapter };
export type { StorageType };
export type { SubscribeParams };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { SupabaseProviderOptions };
export type { SupabaseRealtimeChannel };
export type { SupabaseRealtimePayload };
export type { SupabaseResourceConfig };
export type { SupabaseWriteContext };
export type { UndoableWrite };
export type { UpdateParams };
export type { UpdateResult };
export type { UseDraftReturn };
export type { UseInfiniteResourceOptions };
export type { UseInfiniteResourceReturn };
export type { UseOneOptions };
export type { UseRelationLabelOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourceReturn };
export type { UseUnsavedChangesGuardOptions };
export type { UseUnsavedChangesGuardReturn };
export type { UseWizardReturn };
export type { UseWriteOptions };
export type { UseWriteReturn };
export type { VersionField };
export type { Viewer };
export type { ViewerContext };
export type { WidgetHint };
export type { WizardStep };
export type { WorkspaceContext };
export type { WriteEvent };
export type { WriteOutcome };
```

---

## @marktiderman/genesis-core/provider

**Barrel:** [`packages/core/src/provider/index.ts`](../packages/core/src/provider/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataProviderRoot`](../packages/core/src/provider/context.tsx) | `DataProviderRootProps` | — | _(no summary)_ |
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | Convenience root: a `QueryClientProvider`, storage, and a data provider (yours, or a mock built from datasets). It creates its own `QueryClient` unless you pass `queryClient`; an app that already has one should pass it, or mount `DataPro... |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`callRpc`](../packages/core/src/provider/write-helpers.ts) | function | — | Calls a database function and returns its result. A failure throws a DataWriteError with the usual outcome and code, and words a person can read: yours for the code, a guard's own message (P0001), the defaults above, or a generic sentenc... |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createOrAdopt`](../packages/core/src/provider/write-helpers.ts) | function | — | "One live row per key": creates the row, or, when one with the same key is already there (a `duplicate`), adopts it, optionally merging changes in. `adopted` says which, and `final` that the row already there is finished. Key fields that... |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | The Supabase data provider. Reads and writes go through the client you pass, under that client's session and RLS. |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`DEFAULT_RPC_MESSAGES`](../packages/core/src/provider/write-helpers.ts) | const | — | The words shown for a code when the caller gives none. A guard's own `raise exception` (P0001) keeps its words. |
| [`fieldErrorsFromPostgrest`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Reads which columns a Postgres constraint error is about, from PostgREST's `message` / `details`, and gives safe messages for them. Only plain column names are taken from the store's text; the values it echoes are never used. A unique vi... |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |
| [`readOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a store error code to the read outcome it means: the write mapping, with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116, `42703` unknown column, `42P01` unknown table) read as `invalid`. |
| [`RPC_FAILED`](../packages/core/src/provider/write-helpers.ts) | const | — | _(no summary)_ |
| [`toDataWriteError`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Turns anything a write threw, or the `{ message, code }` error a Supabase client returned, into a `DataWriteError`. A `DataWriteError` passes through unchanged; anything else keeps its message and `code`, and is kept as the `cause`. |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`writeOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it means. Anything not listed is `error`: a code is only read as a refusal or a bad value when it says so. |

### Types (49)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { BaseRecord };
export type { BulkChange };
export type { BulkResult };
export type { CallRpcOptions };
export type { CountMode };
export type { CreateOrAdoptOptions };
export type { CreateOrAdoptResult };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DataReadErrorOptions };
export type { DataWriteErrorOptions };
export type { DeleteParams };
export type { DeleteResult };
export type { FilterParam };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { HistoryParams };
export type { Identifier };
export type { ImportParams };
export type { InvalidationKey };
export type { ListParams };
export type { ListResult };
export type { MockProviderOptions };
export type { NullFilter };
export type { PaginationParam };
export type { PostgrestFieldErrors };
export type { RangeFilter };
export type { ReadOutcome };
export type { ResourceChangeEvent };
export type { RowFailure };
export type { RpcClient };
export type { ScalarFilter };
export type { SortParam };
export type { SubscribeParams };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { SupabaseProviderOptions };
export type { SupabaseRealtimeChannel };
export type { SupabaseRealtimePayload };
export type { SupabaseResourceConfig };
export type { SupabaseWriteContext };
export type { UpdateParams };
export type { UpdateResult };
export type { WriteEvent };
export type { WriteOutcome };
```

---

## @marktiderman/genesis-core/hooks

**Barrel:** [`packages/core/src/hooks/index.ts`](../packages/core/src/hooks/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | `ViewerScopeProps` | — | Keeps one viewer's cached data from ever showing to the next. Children render only once the viewer is known, under a key of that viewer, so a sign-out or a new person signing in unmounts every screen and its queries before the cache is e... |
| [`WorkspaceScope`](../packages/core/src/hooks/workspace-scope.tsx) | `WorkspaceScopeProps` | Beta | `ViewerScope` for an app with workspaces: use it in place of `ViewerScope`. It reads the current workspace from the URL and scopes everything under it to that workspace (its `scope`, `roles` and `timeZone`), so every view with `scope: ["... |

### Other exports (34)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`blankValues`](../packages/core/src/hooks/use-resource-form.ts) | function | — | What a save sends for an input left empty: `""`, or `undefined` (a cleared number input). Only a field whose column the form knows about (`nullable` set, as ResourceView sets it from a generated contract) is changed: a create leaves it o... |
| [`buildArrayItemDefaults`](../packages/core/src/hooks/use-resource-form.ts) | function | — | Build default values for a single array item from its sub-field definitions |
| [`clearViewerCache`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Empties the query cache for a new viewer: sends the old viewer's waiting undoable writes (the session is still theirs), cancels reads in flight, then removes every query. Call it in the sign-in and sign-out actions, before the session ch... |
| [`DEFAULT_DRAFT_DELAY_MS`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DEFAULT_LIVE_DEBOUNCE_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How long a burst of change events is gathered into one refetch. |
| [`DEFAULT_LIVE_RESYNC_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How often a live read refetches anyway while the page is visible. Realtime checks each change against the row's new state, so a row the viewer stops being allowed to see (binned, made a draft, moved to another practice) sends them nothin... |
| [`DEFAULT_UNDO_DELAY_MS`](../packages/core/src/hooks/mutation-mode.ts) | const | — | How long an `undoable` write waits for an undo before it is sent. |
| [`DEFAULT_UNSAVED_CHANGES_MESSAGE`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | const | — | _(no summary)_ |
| [`DRAFT_NOT_SAVED`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DraftController`](../packages/core/src/hooks/draft-controller.ts) | class | — | The rules of a draft, without React: one write at a time, add then change, no write when nothing changed or for an empty value, merge into a row another tab started, start again on a new revision, retry network failures, and a final writ... |
| [`dropPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Drops every write on this client not yet sent, without reporting them: the viewer who made them is gone, so they must never be sent (or re-applied) under the next one. Writes already sending finish under the old session. |
| [`flushPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Sends every optimistic or undoable write still waiting on this client now, and resolves once all have settled. Call it while the session that made them still holds (a sign-out action, before signing out). |
| [`isNetworkFailure`](../packages/core/src/hooks/draft-controller.ts) | function | — | The default `isRetryable`: a request that never reached the store. A refusal never is. |
| [`loadRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | The words for one linked id, batched with every other id asked for in the same tick: one `getList(resource, { filters: [{ field, operator: "in" }] })` per linked resource and naming field. Resolves null when the row has no words or isn't... |
| [`NO_VIEWER`](../packages/core/src/viewer.ts) | const | — | The viewer outside any ViewerScope: no one, nowhere, no roles. |
| [`pendingWriteCount`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Optimistic or undoable writes on `resource` not yet settled. |
| [`rememberedWorkspaceId`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The workspace this viewer was last in on this device, for the app's front door (`defaultWorkspace(workspaces, rememberedWorkspaceId(viewer))`). Null when unknown. |
| [`scopeClock`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The scope's clock: `scopeTimeZone` when the runtime knows it, else the viewer's. A zone it doesn't know is never a quiet fallback: it throws in development, and in production it is reported (`reportError`, once per zone) before the viewe... |
| [`stableJson`](../packages/core/src/hooks/draft-controller.ts) | function | — | JSON with object keys sorted, so values compare equal whatever order a store keeps keys in. |
| [`useCapabilities`](../packages/core/src/hooks/use-capabilities.ts) | function | — | What the data provider can do for `resource` (`provider.capabilities`), cached per provider and resource. `data` stays undefined for a provider that doesn't report capabilities, so a UI keeps its defaults. |
| [`useDraft`](../packages/core/src/hooks/use-draft.ts) | function | — | Autosave one draft row: saved a moment after each change, one write at a time, added on the first save that has something in it, merged into a row another tab started (`adopt`), and started again when the server's copy wins (`revision`).... |
| [`useInfiniteResource`](../packages/core/src/hooks/use-infinite-resource.ts) | function | — | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useOptionalViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Like useViewerScope, or null outside a ViewerScope. |
| [`useRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | A linked row's words for a `relation` cell: `undefined` while they load, `null` when there are none (the row is hidden from this viewer, gone, unnamed, or the read failed), so a screen shows its own words then, never the raw id. Cached p... |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useUnsavedChangesGuard`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | function | — | Warns before unsaved changes are lost, without depending on a router. |
| [`useViewer`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer for guards: `{ id, scope, roles }` from the nearest ViewerScope, or {@link NO_VIEWER} without one. The object is stable while those are equal by value, so it can sit in a memo's dependencies. |
| [`useViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer and scope from the nearest `ViewerScope`. Throws without one: screens that cache per viewer need it. |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |
| [`useWorkspace`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The nearest `WorkspaceScope`'s workspaces, or null outside one. |
| [`useWrite`](../packages/core/src/hooks/use-write.ts) | function | — | A one-off write that isn't a resource page's create, update or remove: a database function, `createOrAdopt`, several writes in a row. It invalidates what it made stale and reports failures in plain words. |
| [`WRITE_FAILED`](../packages/core/src/hooks/use-write.ts) | const | — | _(no summary)_ |

### Types (31)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DraftAdoption };
export type { DraftOptions };
export type { DraftSeed };
export type { DraftState };
export type { DraftStatus };
export type { DraftValue };
export type { GenesisViewerRoles };
export type { InfinitePageParam };
export type { LiveOptions };
export type { MutationMode };
export type { MutationModeOptions };
export type { ResourceScope };
export type { UndoableWrite };
export type { UseDraftReturn };
export type { UseInfiniteResourceOptions };
export type { UseInfiniteResourceReturn };
export type { UseOneOptions };
export type { UseRelationLabelOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourceReturn };
export type { UseUnsavedChangesGuardOptions };
export type { UseUnsavedChangesGuardReturn };
export type { UseWizardReturn };
export type { UseWriteOptions };
export type { UseWriteReturn };
export type { Viewer };
export type { ViewerContext };
export type { WizardStep };
export type { WorkspaceContext };
```

---

## @marktiderman/genesis-core/storage

**Barrel:** [`packages/core/src/storage/index.ts`](../packages/core/src/storage/index.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createLocalStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | localStorage adapter with SSR safety. |
| [`createMemoryStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | In-memory adapter for testing and SSR. |
| [`createNoopStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | No-op adapter — all operations silently do nothing. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { StorageAdapter };
```

---

## @marktiderman/genesis-core/schema

**Barrel:** [`packages/core/src/schema/index.ts`](../packages/core/src/schema/index.ts)

### Other exports (9)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`decodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | The inverse of {@link encodeRecordKey}: field name → value. |
| [`defineResource`](../packages/core/src/schema/types.ts) | function | — | Declares a resource contract for a row type, keeping the literal contract (field names, key, labelField) and attaching the row type so views can read it with `RowOf`. `labelField` must be one of the row's fields. |
| [`encodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | One `Identifier` for a row. |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`keyFields`](../packages/core/src/schema/keys.ts) | function | — | The key of a contract as a list, whichever form `key` was declared in. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |

### Types (22)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AuditEntry };
export type { DataReadErrorOptions };
export type { DataRow };
export type { DataWriteErrorOptions };
export type { FieldPermissions };
export type { FieldReference };
export type { FieldSchema };
export type { FilterOperator };
export type { ProviderCapabilities };
export type { ReadOutcome };
export type { RecordComment };
export type { ResourceAccess };
export type { ResourceContract };
export type { ResourceRelation };
export type { ResourceSchema };
export type { ResourceSummary };
export type { RowAction };
export type { RowOf };
export type { StorageType };
export type { VersionField };
export type { WidgetHint };
export type { WriteOutcome };
```

---

## @marktiderman/genesis-core/slots

**Barrel:** [`packages/core/src/slots.tsx`](../packages/core/src/slots.tsx)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`renderSlot`](../packages/core/src/slots.tsx) | function | — | Renders one slot: the override if given, the default otherwise, nothing if ejected with `null`. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SlotOverride };
export type { SlotPropsFor };
export type { Slots };
```

---

## @marktiderman/genesis-core/navigation

**Barrel:** [`packages/core/src/navigation.ts`](../packages/core/src/navigation.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`isPathActive`](../packages/core/src/navigation.ts) | function | Beta | Default active-path matcher, mirroring React Router's `NavLink` (prefix match, with `/` treated as exact). Consumers can override via an `isActive` prop where components accept one. |
| [`resolveNavigation`](../packages/core/src/navigation.ts) | function | Beta | Resolve where `pathname` sits in a logical navigation tree. Pure: it never reads browser history or `window`. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { IsPathActiveOptions };
export type { NavigationNode };
export type { ResolvedNavigation };
```

---

## @marktiderman/genesis-core/workspaces

**Barrel:** [`packages/core/src/workspaces.ts`](../packages/core/src/workspaces.ts)

### Other exports (10)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`defaultWorkspace`](../packages/core/src/workspaces.ts) | function | Beta | The workspace to open when the URL names none (the app's front door): the remembered one if the viewer still has it, else the first tenant, else the first workspace. |
| [`filterWorkspaces`](../packages/core/src/workspaces.ts) | function | Beta | The workspaces whose label or second line contains every word of `query`, ignoring case and accents, in the order given. An empty query keeps them all. For the switcher's search box, on the web and on the phone. |
| [`groupWorkspaces`](../packages/core/src/workspaces.ts) | function | Beta | The workspaces grouped by kind, in `order` (default {@link WORKSPACE_KIND_ORDER}, then any kind an app added), each group in the order given. Empty groups are left out. |
| [`keepSection`](../packages/core/src/workspaces.ts) | function | — | The default `keep`: the same kind keeps the section (the first segment), never a record. |
| [`orderedWorkspaces`](../packages/core/src/workspaces.ts) | function | Beta | The workspaces in the order the switcher lists them (grouped by kind, in `order`): the order its keyboard jump numbers them, 1 to 9. |
| [`pathInWorkspace`](../packages/core/src/workspaces.ts) | function | Beta | The path inside a workspace: `/o/acme/clients/42` in `/o/acme` is `/clients/42`; the workspace's own landing page is `/`. |
| [`WORKSPACE_KIND_ORDER`](../packages/core/src/workspaces.ts) | const | — | The kinds in their default order: personal, roll-up, then each tenant. |
| [`workspaceAt`](../packages/core/src/workspaces.ts) | function | Beta | The workspace a URL is in: the one whose `path` is the longest prefix of `pathname`, or undefined when the URL is in none (a sign-in page, the app's front door). |
| [`workspaceHref`](../packages/core/src/workspaces.ts) | function | Beta | Where switching to `to` goes from `pathname`. The URL moves with the viewer: it lands in the same section of the new workspace when that makes sense (see `keep`), else on its landing page. |
| [`workspaceInitials`](../packages/core/src/workspaces.ts) | function | Beta | Initials for a workspace with no image: the first letters of its first two words. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { GenesisWorkspaceKinds };
export type { Workspace };
export type { WorkspaceGroup };
export type { WorkspaceHrefOptions };
export type { WorkspaceKind };
export type { WorkspaceTheme };
```

---

## @marktiderman/genesis-core/testing

**Barrel:** [`packages/core/src/testing/index.ts`](../packages/core/src/testing/index.ts)

### Other exports (11)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ContractError`](../packages/core/src/testing/index.ts) | class | — | A broken contract: the message says what happened instead. |
| [`expectAllowed`](../packages/core/src/testing/index.ts) | function | — | The write succeeds. Returns what it resolved to. |
| [`expectBinned`](../packages/core/src/testing/index.ts) | function | — | A delete on a recycle-bin table moves the row to the bin: `as` deletes it, can no longer read it (gone or forbidden), and `inBin` (a check with the service role or a bin query) confirms the row is still stored. |
| [`expectNeverShows`](../packages/core/src/testing/index.ts) | function | — | `marker` (a value only a private row holds) appears nowhere in what the read returns: use a list or report read that returns the rows around the private one. A refused read (42501, or `forbidden` / `unauthenticated`) shows nothing and pa... |
| [`expectPlainMessage`](../packages/core/src/testing/index.ts) | function | — | The error's message is plain words: no raw database text or error codes. |
| [`expectRefused`](../packages/core/src/testing/index.ts) | function | — | The write is refused, in plain words: a refusal code (42501, P0001) or the provider's `forbidden` / `unauthenticated`. A write that reaches no row (`gone`) counts only with a `control` that makes the same write and changes a row, so a ty... |
| [`expectSees`](../packages/core/src/testing/index.ts) | function | — | The read returns exactly `expected` rows (a list result, a getMany result or an array). |
| [`expectServerOwned`](../packages/core/src/testing/index.ts) | function | — | A client can't change a column only the server sets. First `system` (the service role, or whoever the server writes as) sets `field` to `value` and must change the stored value, then puts it back: that proves the row exists and the value... |
| [`FIXTURE_USERS`](../packages/core/src/testing/index.ts) | const | — | The shared fixture logins, the same ids `genesis_testing.user_id()` uses. |
| [`fixtureAccessToken`](../packages/core/src/testing/index.ts) | function | — | A signed access token for a fixture person (or any user id), for a test database's legacy JWT secret. Hand it to the client as `Authorization: Bearer <token>`; `auth.uid()` then reads that user. Test databases only: never give it a produ... |
| [`isRefusal`](../packages/core/src/testing/index.ts) | function | — | Whether a failed write is a refusal: a refusal code (42501, P0001), or the provider's own `forbidden` (the row is still visible but unchanged) or `unauthenticated`. `gone` is not: it also means the id matched nothing. |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ExpectRefusedOptions };
export type { FixtureUser };
```

---

## @marktiderman/genesis-core/dates

**Barrel:** [`packages/core/src/dates.ts`](../packages/core/src/dates.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`addDays`](../packages/core/src/dates.ts) | function | Beta | `day` moved by `days` (negative goes back). Calendar arithmetic: no zone, no daylight saving. @stability Beta |
| [`dayIn`](../packages/core/src/dates.ts) | function | Beta | The day on `zone`'s clock at `at` (default now). @stability Beta |
| [`dayRangeIn`](../packages/core/src/dates.ts) | function | Beta | The `[start, end)` instants of `day` on `zone`'s clock (23 or 25 hours on daylight-saving days). @stability Beta |
| [`daysBetween`](../packages/core/src/dates.ts) | function | Beta | Whole days from `from` to `to` (`to` − `from`; negative when `to` is earlier). @stability Beta |
| [`deviceTimeZone`](../packages/core/src/dates.ts) | function | Beta | The device's (or server's) zone, `"UTC"` when the runtime can't say. @stability Beta |
| [`isDay`](../packages/core/src/dates.ts) | function | Beta | Whether `value` is a real `YYYY-MM-DD` day (not `2026-02-30`). @stability Beta |
| [`isTimeZone`](../packages/core/src/dates.ts) | function | Beta | Whether the runtime knows `zone` (`"America/Denver"`). @stability Beta |
| [`personDay`](../packages/core/src/dates.ts) | function | Beta | Today (or the day at `at`) for this person: `dayIn(personTimeZone(person), at)`. |
| [`personTimeZone`](../packages/core/src/dates.ts) | function | Beta | The zone a person's days are counted in: their saved zone if the runtime knows it, else the device's, else UTC. On a server, pass the person's zone: the server's own is rarely theirs. |
| [`startOfDayIn`](../packages/core/src/dates.ts) | function | Beta | The instant `day` starts on `zone`'s clock: what to compare `created_at` with for "since midnight". Where midnight doesn't exist (a daylight-saving jump at 00:00), it's the first instant of the day that does. |
| [`startOfWeek`](../packages/core/src/dates.ts) | function | Beta | The first day of `day`'s week, with weeks starting on `weekStartsOn` (0 Sunday … 6 Saturday; default 1, Monday). @stability Beta |
| [`wallClock`](../packages/core/src/dates.ts) | function | Beta | What the clock on the wall in `zone` says at `at`. @stability Beta |
| [`weekdayOf`](../packages/core/src/dates.ts) | function | Beta | The weekday of a day, 0 for Sunday. @stability Beta |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Day };
export type { PersonClock };
export type { WallClock };
```

---

## @marktiderman/genesis-core/resource

**Barrel:** [`packages/core/src/resource/index.ts`](../packages/core/src/resource/index.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`dayLabel`](../packages/core/src/resource/days.ts) | function | — | A day (YYYY-MM-DD) in words, given today on the same clock: "Today", "Yesterday", "Oct 21", "Oct 21, 2025". |
| [`embedSnippet`](../packages/core/src/resource/share.ts) | function | — | An `<iframe>` that shows the page on another website, full width. |
| [`prefilledUrl`](../packages/core/src/resource/share.ts) | function | — | `url` with `values` set as search params (empty values left out), keeping what it has. An absolute link stays absolute; a relative one (`/f/a?x=1`) stays relative, so it never throws while a page is still working out its origin. |
| [`readinessChip`](../packages/core/src/resource/status.ts) | function | — | The readiness chip's label and tone. |
| [`readinessOf`](../packages/core/src/resource/status.ts) | function | — | Readiness from an editor's findings (any list of `{ level, code? }`): errors block publishing, warnings ask for a look. One pass over the findings. |
| [`SAVE_STATE_LABEL`](../packages/core/src/resource/status.ts) | const | — | _(no summary)_ |

### Types (9)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChipTone };
export type { HeadlineNumber };
export type { HeadlineTone };
export type { PrefillChoice };
export type { Readiness };
export type { ReadinessFinding };
export type { ReadinessLabels };
export type { ReadinessOptions };
export type { SaveState };
```

---

## @marktiderman/genesis-core/resource-view

**Barrel:** [`packages/core/src/resource-view/index.ts`](../packages/core/src/resource-view/index.ts)

### Other exports (19)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cascadeSelection`](../packages/core/src/resource-view/tree.ts) | function | — | The selection after toggling `id` with cascade: the node and every descendant take the node's new state. Without cascade, use a plain toggle; selection never cascades by default. |
| [`defineRecordView`](../packages/core/src/resource-view/record-view.ts) | function | — | One record's screen from its view: |
| [`defineView`](../packages/core/src/resource-view/define-view.ts) | function | — | Describe what a resource means to people. The result is frozen and platform-neutral: |
| [`defineWorkspace`](../packages/core/src/resource-view/record-view.ts) | const | — | _(no summary)_ |
| [`deriveDisplay`](../packages/core/src/resource-view/define-view.ts) | function | — | The display a field gets when the view doesn't name one. |
| [`initialExpanded`](../packages/core/src/resource-view/tree.ts) | function | — | The open ids a tree starts with: `true` opens every parent, a number opens parents shallower than that depth (`1` opens the roots), `false` or nothing opens none. |
| [`initialsOf`](../packages/core/src/resource-view/picture.ts) | function | — | First and last initial of a name, from letters only: "Ada Lovelace" → "AL", "Ana-María López" → "AL", "李 小龙" → "李小", "Cher" → "C". Empty when the name has no letters (" ", "🎉🎉"). |
| [`isRecordView`](../packages/core/src/resource-view/record-view.ts) | function | — | Whether a value is a record view (`defineRecordView`'s result). |
| [`isWorkspace`](../packages/core/src/resource-view/record-view.ts) | const | — | _(no summary)_ |
| [`NO_VIEWER`](../packages/core/src/viewer.ts) | const | — | The viewer outside any ViewerScope: no one, nowhere, no roles. |
| [`plural`](../packages/core/src/resource-view/define-view.ts) | function | — | A noun's plural, the inverse of `singular`: entry → entries, box → boxes, person → people. |
| [`rowPicture`](../packages/core/src/resource-view/picture.ts) | function | — | What to draw for a summary's picture: |
| [`scopeFilter`](../packages/core/src/resource-view/scope.ts) | function | — | The view's scope keys as a list filter, the way `ResourceView` applies them itself: like {@link scopeValues}, but a list (`{ orgId: ["o1", "o2"] }`, a roll-up across organizations) filters to any of its values, and a key the scope doesn'... |
| [`scopeValues`](../packages/core/src/resource-view/scope.ts) | function | — | The view's declared scope keys with their values from the viewer's scope, ready to pass as a screen's `filter`: `scope: ["league_id"]` reads `scope.league_id`, then `scope.leagueId`. |
| [`setExpanded`](../packages/core/src/resource-view/tree.ts) | function | — | The open set with `id` opened or closed: a new set, or the same one when nothing changes. |
| [`singular`](../packages/core/src/resource-view/define-view.ts) | function | — | A table name's singular, for the default noun. A wrong guess is fixed with `@genesis {"noun"}`. |
| [`treeRows`](../packages/core/src/resource-view/tree.ts) | function | — | Build the tree from flat rows. Siblings are sorted by `compare`, else keep the rows' order, so either way the sort applies within each set of siblings. A row whose parent isn't among `rows` is a root, and so is a row whose parent would c... |
| [`valueText`](../packages/core/src/resource-view/define-view.ts) | function | — | A value in words: its entry in `labels`, else the value in title case (`draft` → "Draft"). |
| [`ViewDefinitionError`](../packages/core/src/resource-view/define-view.ts) | class | — | A view that names a field, preset or section its contract doesn't have. |

### Types (46)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Allowed };
export type { ComputedColumn };
export type { DisplayHint };
export type { FieldNameOf };
export type { GenesisViewerRoles };
export type { RecordView };
export type { RecordViewDefinition };
export type { RecordViewFilter };
export type { RecordViewHeader };
export type { RecordViewHeaderAction };
export type { RecordViewHeaderOptions };
export type { RecordViewListSection };
export type { RecordViewReadinessItem };
export type { RecordViewSection };
export type { RecordViewSettingsSection };
export type { RecordViewSlotSection };
export type { ResolvedColumn };
export type { ResolvedFormField };
export type { ResolvedReadinessItem };
export type { ResolvedRecordViewSection };
export type { ResolvedViewAction };
export type { ResourceTree };
export type { ResourceView };
export type { ResourceWorkspace };
export type { RowImage };
export type { RowOf };
export type { RowPicture };
export type { RowSummary };
export type { TimeZoneName };
export type { TreeNode };
export type { TreeOptions };
export type { TreeResult };
export type { ViewAction };
export type { ViewColumn };
export type { ViewCopy };
export type { ViewDefinition };
export type { ViewField };
export type { ViewFormItem };
export type { ViewGuards };
export type { ViewPreset };
export type { ViewTimeZone };
export type { ViewTone };
export type { Viewer };
export type { WorkspaceDefinition };
export type { WorkspaceHeaderAction };
export type { WorkspaceSection };
```

---

## @marktiderman/genesis-core/urls

**Barrel:** [`packages/core/src/urls.ts`](../packages/core/src/urls.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`isSafeUrl`](../packages/core/src/urls.ts) | function | — | True when `url` is safe to put in an `href`: an absolute http(s), mailto or tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`). |
| [`normalizeLinkUrl`](../packages/core/src/urls.ts) | function | — | Turn what a person typed into the link field into a safe href, or `null`. `example.com/page` becomes `https://example.com/page`; an email address becomes a `mailto:` link. |

---

## @marktiderman/genesis-core/csv

**Barrel:** [`packages/core/src/csv.ts`](../packages/core/src/csv.ts)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`csvField`](../packages/core/src/csv.ts) | function | — | RFC 4180 field: quoted when it holds a comma, quote or line break. |
| [`exportCsv`](../packages/core/src/csv.ts) | function | — | _(no summary)_ |
| [`parseCsv`](../packages/core/src/csv.ts) | function | — | Parse CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF) into a header and rows. A cell is always text: nothing is guessed or coerced, so the database decides whether "1,5" is a number. |
| [`toCsv`](../packages/core/src/csv.ts) | function | — | _(no summary)_ |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ExportOptions };
```

---

## @marktiderman/genesis-core/errors

**Barrel:** [`packages/core/src/errors.ts`](../packages/core/src/errors.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`classifyError`](../packages/core/src/errors.ts) | function | — | What kind of error this is, a sentence that is safe to show, and whether it is worth reporting. Understands the provider's `DataWriteError` and `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's auth and fetch error... |
| [`defaultErrorReporter`](../packages/core/src/errors.ts) | const | — | The reporter used when the app registered none: `console.warn` in development, nothing in production. |
| [`errorMessages`](../packages/core/src/errors.ts) | const | — | The English catalogue. Plain words, never the store's text. |
| [`getErrorReporter`](../packages/core/src/errors.ts) | function | — | The reporter `reportError` uses now. |
| [`reportError`](../packages/core/src/errors.ts) | function | — | Report an error a package caught and handled. Never throws: a failing reporter must not take the caller (an event handler, a render) down. `context` may be just the source. |
| [`setErrorReporter`](../packages/core/src/errors.ts) | function | — | Send every `reportError` to `reporter` (`null` puts the default back). Returns a function that restores the reporter that was there before. The native observability block calls it when it is created. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ClassifiedError };
export type { ClassifyErrorOptions };
export type { ErrorKind };
export type { ErrorMessages };
export type { ErrorReportContext };
export type { ErrorReporter };
```

---

## @marktiderman/genesis-design-system

DTCG design tokens, brand schema, theme generators. Brand-agnostic; consumer brand packages satisfy the canonical schema.

**Barrel:** [`packages/design-system/src/index.ts`](../packages/design-system/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/index.ts) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (73)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`borderRadius`](../packages/design-system/src/tokens/spacing.ts) | const | — | Shared spacing and layout tokens for all Genesis projects. |
| [`brandRoleVariables`](../packages/design-system/src/factories/brand-roles.ts) | function | Beta | The theme role variables for `brand`, per mode, as `{ "--primary": "243 75% 59%", … }` maps: the same names and format as `themes/genesis.css`. |
| [`clampBounds`](../packages/design-system/src/schema/brand.ts) | function | — | A clamp's min and max, in rem; undefined for a plain length. |
| [`classicDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Today's look, unchanged: it emits no tokens, so every component keeps the stylesheet's own sizes, spacing and colours. The default for a brand that names no design system. |
| [`composite`](../packages/design-system/src/design-systems/color.ts) | function | — | `top` over `bottom` at `alpha` (0–1), blended in sRGB as browsers do: a hex. |
| [`contrast`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 contrast ratio (1–21) of two hex colours. |
| [`CORNER_RADII`](../packages/design-system/src/design-systems/tokens.ts) | const | — | Radius per corners set, in px: chips and inputs, cards, feature images, buttons, photos. |
| [`CORNERS`](../packages/design-system/src/design-systems/define.ts) | const | — | Corner radius sets, from square to friendly. |
| [`crispDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Cool and exact: a cool ground, hairlines, crisp corners, no shadows, calm motion. |
| [`debugBrandPreset`](../packages/design-system/src/factories/from-brand.ts) | function | — | Debug utility — dumps the resolved Tailwind preset and NativeWind theme side-by-side so brand authors can introspect token mis-resolution without reading factory source. |
| [`DEFAULT_DESIGN_SYSTEM_ID`](../packages/design-system/src/design-systems/built-in.ts) | const | — | The design system a brand that names none gets. |
| [`DEFAULT_EYEBROW`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_FONT_CLASS_RULES`](../packages/design-system/src/design-systems/define.ts) | const | — | How each font class is set at display sizes, when a design system says nothing else. |
| [`DEFAULT_LEADING`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_RAMP`](../packages/design-system/src/design-systems/define.ts) | const | — | A ramp that suits most brands: 16 → 18px body, 48 → 112px display. |
| [`defineDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | Beta | Define a design system: checks it and returns it frozen, with its id (`name@version`). Throws with every problem when it isn't sound. |
| [`DENSITIES`](../packages/design-system/src/design-systems/define.ts) | const | — | Section padding. |
| [`designSystemTheme`](../packages/design-system/src/design-systems/tokens.ts) | function | Beta | The CSS variables for one design system and one brand, per mode, and the colour pairs they promise. |
| [`fluid`](../packages/design-system/src/design-systems/tokens.ts) | function | — | `{ min: 3, max: 7 }` → `clamp(3rem, 1.6667rem + 5.9259vw, 7rem)`: `min` at a 360px viewport, `max` at 1440px, linear between. |
| [`FONT_CHOICES`](../packages/design-system/src/fonts.ts) | const | — | The fonts a brand may choose. Every one but `system` is self-hosted. |
| [`FONT_CLASSES`](../packages/design-system/src/fonts.ts) | const | — | How a family is drawn at display sizes: design systems set weight, tracking and case per class. |
| [`FONT_IDS`](../packages/design-system/src/fonts.ts) | const | — | Every font choice id, `system` first. |
| [`fontFamily`](../packages/design-system/src/tokens/typography.ts) | const | — | Shared typography tokens for all Genesis projects. |
| [`fontFileKey`](../packages/design-system/src/fonts.ts) | const | — | The key of one font file (`inter-700`): what the asset table and the renderer name it by. |
| [`fontForStack`](../packages/design-system/src/fonts.ts) | function | — | The font choice a font stack starts with (`["Bebas Neue", "Impact", …]` or `"\"Bebas Neue\", Impact"`), when it is one of `FONT_CHOICES`. |
| [`fontSize`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`fontWeight`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`generateDarkTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for dark mode. |
| [`generateLightTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for light mode. |
| [`GENESIS_THEME_V2`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`genesisBrand`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis OOTB brand — the single source of truth for the full brand palette. |
| [`genesisColors`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | _(no summary)_ |
| [`genesisTheme`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis brand — indigo (distinct from the emerald `success`). |
| [`getDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | A design system by id (`crisp@1`): a built-in one or a registered one. |
| [`GROUNDS`](../packages/design-system/src/design-systems/color.ts) | const | — | The page's ground: warm, cool, the brand's own hue barely tinted, or dark. |
| [`hexToHslTriplet`](../packages/design-system/src/design-systems/color.ts) | function | — | `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's role variables hold (`hsl(var(--primary))`). |
| [`hexToOklch`](../packages/design-system/src/design-systems/color.ts) | function | — | sRGB hex → OKLCH. |
| [`IMAGE_FILTERS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`isColorScale`](../packages/design-system/src/schema/brand.ts) | function | — | Type guard: returns true when `value` looks like a `ColorScale`. |
| [`LATIN_UNICODE_RANGE`](../packages/design-system/src/fonts.ts) | const | — | The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. |
| [`listDesignSystems`](../packages/design-system/src/design-systems/registry.ts) | function | — | Every design system available: the built-in ones, then the registered ones. |
| [`maxChroma`](../packages/design-system/src/design-systems/color.ts) | function | — | The most chroma sRGB can show at this lightness and hue, up to `c`. |
| [`MOTION_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | How much things move. CSS only; reduced motion always means `none`. |
| [`neutral`](../packages/design-system/src/tokens/colors.ts) | const | — | Shared semantic colors used across all Genesis projects. Brand-specific primary colors belong in presets, not here. |
| [`NEUTRAL_DESIGN_SYSTEMS`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Every neutral design system, by id. |
| [`oklchToHex`](../packages/design-system/src/design-systems/color.ts) | function | — | OKLCH → sRGB hex, reducing chroma (never lightness or hue) until it fits the gamut. |
| [`palette`](../packages/design-system/src/design-systems/color.ts) | function | Beta | The palette for a brand: colour roles for light and dark, and the ramps. |
| [`ramp`](../packages/design-system/src/design-systems/color.ts) | function | — | An 11-step ramp from one colour, with the colour itself at its nearest step. |
| [`RAMP_STEPS`](../packages/design-system/src/design-systems/color.ts) | const | — | The ramp's steps and their OKLCH lightness. |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`registerDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | Beta | Make a design system available by its id, so a brand that names it (`brand.designSystem.id`) resolves to it. Registering an id again with a different definition throws: a changed look is a new version. |
| [`relativeLuminance`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 relative luminance of a hex colour. |
| [`resolveChoices`](../packages/design-system/src/design-systems/define.ts) | function | — | The design system's choices for a brand: the brand's, else the design system's defaults. |
| [`resolveThemeRoles`](../packages/design-system/src/tokens/roles.ts) | function | Beta | Every role's color for one platform and scheme. |
| [`resolveTokens`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`rolePairs`](../packages/design-system/src/design-systems/color.ts) | function | — | Every pair the roles promise, for a contrast check or a test. |
| [`SCRIMS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`SELF_HOSTED_FONTS`](../packages/design-system/src/fonts.ts) | const | — | Every self-hosted family, by its font choice id. |
| [`semantic`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`SHADOW_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`softDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Warm and open: a warm ground, generous space, soft corners and shadows. |
| [`spacing`](../packages/design-system/src/tokens/spacing.ts) | const | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`tailwindFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a Tailwind v4 preset from a {@link CanonicalBrand} config. |
| [`THEME_ROLES`](../packages/design-system/src/tokens/roles.ts) | const | Beta | _(no summary)_ |
| [`themeFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a NativeWind v5 theme from a {@link CanonicalBrand} config. |
| [`themeToCss`](../packages/design-system/src/tokens/themes.ts) | function | — | Convert a theme variable map to a CSS string block. |
| [`TYPE_STEPS`](../packages/design-system/src/design-systems/define.ts) | const | — | The type ramp's steps, smallest first. |
| [`unregisterDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | Remove a registered design system (for tests). Built-in ones stay. |
| [`useTheme`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`validateBrand`](../packages/design-system/src/schema/brand.ts) | function | — | Validate a candidate brand object against the canonical schema. |
| [`validateDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a design system input; empty when it is sound. |
| [`validateDesignSystemChoice`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a brand's design system choice; empty when it is sound. |

### Types (48)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandExtensions };
export type { BrandFactoryOptions };
export type { BrandRoleVariables };
export type { BrandRoleVariablesOptions };
export type { BrandValidationResult };
export type { CanonicalBrand };
export type { ColorRoles };
export type { ColorScale };
export type { ContrastPair };
export type { Corners };
export type { Density };
export type { DesignSystem };
export type { DesignSystemChoice };
export type { DesignSystemInput };
export type { DesignSystemPair };
export type { DesignSystemTheme };
export type { DesignSystemTokenInput };
export type { EyebrowRule };
export type { FluidSize };
export type { FontClass };
export type { FontClassRule };
export type { FontId };
export type { FontInfo };
export type { GradientToken };
export type { Ground };
export type { ImageFilter };
export type { MotionLevel };
export type { NativeBrandOutput };
export type { Oklch };
export type { Palette };
export type { PaletteInput };
export type { PlatformOverridable };
export type { RampStep };
export type { ResolveThemeRolesOptions };
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { Scrim };
export type { SelfHostedFont };
export type { ShadowLevel };
export type { ShadowToken };
export type { TailwindBrandOutput };
export type { ThemeConfig };
export type { ThemeMode };
export type { ThemeRole };
export type { TypeStep };
export type { TypographyTokens };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis-design-system/tokens

**Barrel:** [`packages/design-system/src/tokens/index.ts`](../packages/design-system/src/tokens/index.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`borderRadius`](../packages/design-system/src/tokens/spacing.ts) | const | — | Shared spacing and layout tokens for all Genesis projects. |
| [`fontFamily`](../packages/design-system/src/tokens/typography.ts) | const | — | Shared typography tokens for all Genesis projects. |
| [`fontSize`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`fontWeight`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`generateDarkTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for dark mode. |
| [`generateLightTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for light mode. |
| [`neutral`](../packages/design-system/src/tokens/colors.ts) | const | — | Shared semantic colors used across all Genesis projects. Brand-specific primary colors belong in presets, not here. |
| [`resolveThemeRoles`](../packages/design-system/src/tokens/roles.ts) | function | Beta | Every role's color for one platform and scheme. |
| [`semantic`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`spacing`](../packages/design-system/src/tokens/spacing.ts) | const | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`THEME_ROLES`](../packages/design-system/src/tokens/roles.ts) | const | Beta | _(no summary)_ |
| [`themeToCss`](../packages/design-system/src/tokens/themes.ts) | function | — | Convert a theme variable map to a CSS string block. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ResolveThemeRolesOptions };
export type { ThemeConfig };
export type { ThemeRole };
```

---

## @marktiderman/genesis-design-system/tokens/native

**Barrel:** [`packages/design-system/src/tokens/native.ts`](../packages/design-system/src/tokens/native.ts)

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`nativeColors`](../packages/design-system/src/tokens/native.ts) | const | — | Native tokens — generated by Style Dictionary from DTCG tokens. Do not edit by hand. Run: pnpm build:tokens |
| [`nativeFontFamily`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeFontSize`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeFontWeight`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeLineHeight`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeRadius`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeSpacing`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |
| [`nativeTypography`](../packages/design-system/src/tokens/native.ts) | const | — | _(no summary)_ |

---

## @marktiderman/genesis-design-system/providers/native

**Barrel:** [`packages/design-system/src/providers/native.ts`](../packages/design-system/src/providers/native.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/providers/native.ts) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`GENESIS_PRIMARY`](../packages/design-system/src/providers/native.ts) | const | — | Default `genesis` brand primary (indigo-600 — matches the DTCG brand primary). |
| [`GENESIS_PRIMARY_DARK`](../packages/design-system/src/providers/native.ts) | const | — | The default primary in dark mode: the same hue 10 points lighter, as the web theme renders it (`243 75% 69%`), so dark text on it stays above 4.5:1. |
| [`useGenesisTheme`](../packages/design-system/src/providers/native.ts) | function | — | _(no summary)_ |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Brand };
export type { BrandColors };
export type { BrandRegistry };
export type { GenesisTheme };
```

---

## @marktiderman/genesis-design-system/schema/brand

**Barrel:** [`packages/design-system/src/schema/brand.ts`](../packages/design-system/src/schema/brand.ts)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`clampBounds`](../packages/design-system/src/schema/brand.ts) | function | — | A clamp's min and max, in rem; undefined for a plain length. |
| [`isColorScale`](../packages/design-system/src/schema/brand.ts) | function | — | Type guard: returns true when `value` looks like a `ColorScale`. |
| [`isLength`](../packages/design-system/src/schema/brand.ts) | function | — | Whether a length passes LENGTH_REGEX, and, for a clamp, its min isn't above its max. |
| [`validateBrand`](../packages/design-system/src/schema/brand.ts) | function | — | Validate a candidate brand object against the canonical schema. |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandExtensions };
export type { BrandValidationResult };
export type { CanonicalBrand };
export type { ColorScale };
export type { GradientToken };
export type { PlatformOverridable };
export type { ShadowToken };
export type { TypographyTokens };
```

---

## @marktiderman/genesis-design-system/design-systems

**Barrel:** [`packages/design-system/src/design-systems/index.ts`](../packages/design-system/src/design-systems/index.ts)

### Other exports (39)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`classicDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Today's look, unchanged: it emits no tokens, so every component keeps the stylesheet's own sizes, spacing and colours. The default for a brand that names no design system. |
| [`composite`](../packages/design-system/src/design-systems/color.ts) | function | — | `top` over `bottom` at `alpha` (0–1), blended in sRGB as browsers do: a hex. |
| [`contrast`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 contrast ratio (1–21) of two hex colours. |
| [`CORNER_RADII`](../packages/design-system/src/design-systems/tokens.ts) | const | — | Radius per corners set, in px: chips and inputs, cards, feature images, buttons, photos. |
| [`CORNERS`](../packages/design-system/src/design-systems/define.ts) | const | — | Corner radius sets, from square to friendly. |
| [`crispDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Cool and exact: a cool ground, hairlines, crisp corners, no shadows, calm motion. |
| [`DEFAULT_DESIGN_SYSTEM_ID`](../packages/design-system/src/design-systems/built-in.ts) | const | — | The design system a brand that names none gets. |
| [`DEFAULT_EYEBROW`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_FONT_CLASS_RULES`](../packages/design-system/src/design-systems/define.ts) | const | — | How each font class is set at display sizes, when a design system says nothing else. |
| [`DEFAULT_LEADING`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_RAMP`](../packages/design-system/src/design-systems/define.ts) | const | — | A ramp that suits most brands: 16 → 18px body, 48 → 112px display. |
| [`defineDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | Beta | Define a design system: checks it and returns it frozen, with its id (`name@version`). Throws with every problem when it isn't sound. |
| [`DENSITIES`](../packages/design-system/src/design-systems/define.ts) | const | — | Section padding. |
| [`designSystemTheme`](../packages/design-system/src/design-systems/tokens.ts) | function | Beta | The CSS variables for one design system and one brand, per mode, and the colour pairs they promise. |
| [`fluid`](../packages/design-system/src/design-systems/tokens.ts) | function | — | `{ min: 3, max: 7 }` → `clamp(3rem, 1.6667rem + 5.9259vw, 7rem)`: `min` at a 360px viewport, `max` at 1440px, linear between. |
| [`getDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | A design system by id (`crisp@1`): a built-in one or a registered one. |
| [`GROUNDS`](../packages/design-system/src/design-systems/color.ts) | const | — | The page's ground: warm, cool, the brand's own hue barely tinted, or dark. |
| [`hexToHslTriplet`](../packages/design-system/src/design-systems/color.ts) | function | — | `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's role variables hold (`hsl(var(--primary))`). |
| [`hexToOklch`](../packages/design-system/src/design-systems/color.ts) | function | — | sRGB hex → OKLCH. |
| [`IMAGE_FILTERS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`listDesignSystems`](../packages/design-system/src/design-systems/registry.ts) | function | — | Every design system available: the built-in ones, then the registered ones. |
| [`maxChroma`](../packages/design-system/src/design-systems/color.ts) | function | — | The most chroma sRGB can show at this lightness and hue, up to `c`. |
| [`MOTION_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | How much things move. CSS only; reduced motion always means `none`. |
| [`NEUTRAL_DESIGN_SYSTEMS`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Every neutral design system, by id. |
| [`oklchToHex`](../packages/design-system/src/design-systems/color.ts) | function | — | OKLCH → sRGB hex, reducing chroma (never lightness or hue) until it fits the gamut. |
| [`palette`](../packages/design-system/src/design-systems/color.ts) | function | Beta | The palette for a brand: colour roles for light and dark, and the ramps. |
| [`ramp`](../packages/design-system/src/design-systems/color.ts) | function | — | An 11-step ramp from one colour, with the colour itself at its nearest step. |
| [`RAMP_STEPS`](../packages/design-system/src/design-systems/color.ts) | const | — | The ramp's steps and their OKLCH lightness. |
| [`registerDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | Beta | Make a design system available by its id, so a brand that names it (`brand.designSystem.id`) resolves to it. Registering an id again with a different definition throws: a changed look is a new version. |
| [`relativeLuminance`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 relative luminance of a hex colour. |
| [`resolveChoices`](../packages/design-system/src/design-systems/define.ts) | function | — | The design system's choices for a brand: the brand's, else the design system's defaults. |
| [`rolePairs`](../packages/design-system/src/design-systems/color.ts) | function | — | Every pair the roles promise, for a contrast check or a test. |
| [`SCRIMS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`SHADOW_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`softDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Warm and open: a warm ground, generous space, soft corners and shadows. |
| [`TYPE_STEPS`](../packages/design-system/src/design-systems/define.ts) | const | — | The type ramp's steps, smallest first. |
| [`unregisterDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | Remove a registered design system (for tests). Built-in ones stay. |
| [`validateDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a design system input; empty when it is sound. |
| [`validateDesignSystemChoice`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a brand's design system choice; empty when it is sound. |

### Types (23)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ColorRoles };
export type { ContrastPair };
export type { Corners };
export type { Density };
export type { DesignSystem };
export type { DesignSystemChoice };
export type { DesignSystemInput };
export type { DesignSystemPair };
export type { DesignSystemTheme };
export type { DesignSystemTokenInput };
export type { EyebrowRule };
export type { FluidSize };
export type { FontClassRule };
export type { Ground };
export type { ImageFilter };
export type { MotionLevel };
export type { Oklch };
export type { Palette };
export type { PaletteInput };
export type { RampStep };
export type { Scrim };
export type { ShadowLevel };
export type { TypeStep };
```

---

## @marktiderman/genesis-design-system/fonts

**Barrel:** [`packages/design-system/src/fonts.ts`](../packages/design-system/src/fonts.ts)

### Other exports (7)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FONT_CHOICES`](../packages/design-system/src/fonts.ts) | const | — | The fonts a brand may choose. Every one but `system` is self-hosted. |
| [`FONT_CLASSES`](../packages/design-system/src/fonts.ts) | const | — | How a family is drawn at display sizes: design systems set weight, tracking and case per class. |
| [`FONT_IDS`](../packages/design-system/src/fonts.ts) | const | — | Every font choice id, `system` first. |
| [`fontFileKey`](../packages/design-system/src/fonts.ts) | const | — | The key of one font file (`inter-700`): what the asset table and the renderer name it by. |
| [`fontForStack`](../packages/design-system/src/fonts.ts) | function | — | The font choice a font stack starts with (`["Bebas Neue", "Impact", …]` or `"\"Bebas Neue\", Impact"`), when it is one of `FONT_CHOICES`. |
| [`LATIN_UNICODE_RANGE`](../packages/design-system/src/fonts.ts) | const | — | The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. |
| [`SELF_HOSTED_FONTS`](../packages/design-system/src/fonts.ts) | const | — | Every self-hosted family, by its font choice id. |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FontClass };
export type { FontId };
export type { FontInfo };
export type { SelfHostedFont };
```

---

## @marktiderman/genesis-design-system/theme

**Barrel:** [`packages/design-system/src/theme/index.ts`](../packages/design-system/src/theme/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/provider.web.tsx) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`GENESIS_THEME_V2`](../packages/design-system/src/theme/flag.ts) | const | — | Resolved flag value at module-load time. Most consumer code should read this instead of calling {@link readGenesisThemeV2Flag} repeatedly. |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/flag.ts) | function | — | Read the GENESIS_THEME_V2 flag in a platform-agnostic way. |
| [`resolveTokens`](../packages/design-system/src/theme/theme.ts) | function | — | Resolves the brand's tokens for a given mode. Pure function; same implementation on web + native (consumed by both providers). |
| [`useTheme`](../packages/design-system/src/theme/use-theme.ts) | function | — | Read the active theme from the nearest `<GenesisThemeProvider>`. |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { ThemeMode };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis-extension

Build Chrome extensions (Manifest V3) with Genesis: checked messaging, settings storage, the UI as a floating panel, a top bar or Chrome's side panel, an in-page bar, native-helper jobs, React pieces built on Genesis UI, and a Chrome fake for tests. Part of the Genesis framework.

**Barrel:** [`packages/extension/src/index.ts`](../packages/extension/src/index.ts)

### Other exports (16)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`broadcast`](../packages/extension/src/messaging.ts) | function | — | Tell every listening page; nobody listening isn't an error. |
| [`commandKeys`](../packages/extension/src/keys.ts) | function | — | The shortcut Chrome has for a command now (people can change it), as keys. |
| [`connectSurface`](../packages/extension/src/surfaces.ts) | function | — | In the surface page: what it's shown as, and how to talk to its host. With `autoResize`, a bar keeps the host as tall as the page's content. |
| [`createPrefs`](../packages/extension/src/prefs.ts) | function | — | _(no summary)_ |
| [`createRouter`](../packages/extension/src/messaging.ts) | function | — | Listen for messages: `pages` handlers answer the extension's own pages, `content` handlers answer its scripts in web pages. Call once, at the top level of the service worker (listeners must be added before it idles). |
| [`getChrome`](../packages/extension/src/chrome.ts) | function | — | The extension APIs (`globalThis.chrome`); throws outside an extension. |
| [`isFromContentScript`](../packages/extension/src/messaging.ts) | function | — | Sent by this extension's script inside a web page (a content script). |
| [`isFromExtensionPage`](../packages/extension/src/messaging.ts) | function | — | Sent by one of this extension's own pages (not a script inside a web page). |
| [`isMac`](../packages/extension/src/keys.ts) | function | — | _(no summary)_ |
| [`openSurface`](../packages/extension/src/surfaces.ts) | function | — | Toggle (or open) the surface on this tab. |
| [`pingNativeHost`](../packages/extension/src/native.ts) | function | — | Whether a native messaging host is installed and answers `ping` (with `pong`). |
| [`request`](../packages/extension/src/messaging.ts) | function | — | Ask the service worker; resolves with its answer, throws its error. |
| [`shortcutKeys`](../packages/extension/src/keys.ts) | function | — | The keys of a shortcut, each a label, e.g. ["⌥ Option", "⇧ Shift", "S"]. |
| [`showPageBar`](../packages/extension/src/page-bar.ts) | function | — | Show the bar on this tab, or take it away with `null`. Pages Chrome won't touch are skipped. |
| [`startNativeJob`](../packages/extension/src/native.ts) | function | — | _(no summary)_ |
| [`syncSidePanel`](../packages/extension/src/surfaces.ts) | function | — | Tell Chrome whether the icon and shortcut open the side panel. Call when the setting changes and on start. |

### Types (20)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChromeLike };
export type { ContentContext };
export type { Handler };
export type { Message };
export type { MessageSender };
export type { NativeJob };
export type { NativeJobOptions };
export type { OpenSurfaceOptions };
export type { PageBarAction };
export type { PageBarChip };
export type { PageBarIcon };
export type { PageBarModel };
export type { PageContext };
export type { Port };
export type { Prefs };
export type { Router };
export type { StorageArea };
export type { Surface };
export type { SurfaceMode };
export type { Tab };
```

---

## @marktiderman/genesis-extension/react

**Barrel:** [`packages/extension/src/react/index.tsx`](../packages/extension/src/react/index.tsx)

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ExtensionSettings`](../packages/extension/src/react/index.tsx) | function | — | The options page's frame: a header (name, mark, an account area) and tabs (Library, Capture, Settings, Account, say). The chosen tab is kept in the address (#tab=…), so a link can open a tab and reloading keeps it; each tab's content is ... |
| [`LazyListFooter`](../packages/extension/src/react/index.tsx) | function | — | The end of a lazy list: loading, an error with Retry, or nothing more. |
| [`ListSkeleton`](../packages/extension/src/react/index.tsx) | function | — | Rows of placeholders while a list's first page loads. |
| [`ShortcutKeys`](../packages/extension/src/react/index.tsx) | function | — | A shortcut as keys, in Mac names on a Mac. With `command`, shows the keys Chrome has for it now (people can change them), else `keys`. |
| [`SurfaceModePicker`](../packages/extension/src/react/index.tsx) | function | — | Choose where the extension's main page opens. |
| [`useLazyList`](../packages/extension/src/react/index.tsx) | function | — | A list loaded a page at a time as it's scrolled, for a library of hundreds of items: the first page shows at once, the rest follow. `load` gets the offset and page size; a page shorter than the size is the last. A newer reset drops answe... |
| [`usePrefs`](../packages/extension/src/react/index.tsx) | function | — | The extension's settings, kept current when any page changes them. `null` until loaded. |
| [`useSurface`](../packages/extension/src/react/index.tsx) | function | — | This page as a surface (panel, bar, side panel or popup); see `connectSurface`. |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { LazyList };
export type { SettingsTab };
```

---

## @marktiderman/genesis-extension/testing

**Barrel:** [`packages/extension/src/testing/index.ts`](../packages/extension/src/testing/index.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`installChromeFake`](../packages/extension/src/testing/index.ts) | function | — | _(no summary)_ |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChromeFake };
export type { NativeHostScript };
```

---

## @marktiderman/genesis-features

A typed feature registry: `defineFeatures` and `defineFlags` in one `features.ts` that running code imports, plus the AGENTS.md and JSON generators. `genesis features build|check` keeps the generated output in step. See packages/features/README.md.

**Barrel:** [`packages/features/src/index.ts`](../packages/features/src/index.ts)

### Other exports (58)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AGENTS_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated block in AGENTS.md. |
| [`AGENTS_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated block in AGENTS.md. |
| [`BlockError`](../packages/features/src/blocks.ts) | class | Beta | Thrown by {@link defineBlock} and {@link resolveBlocks}; lists every problem at once. @stability Beta |
| [`BrokenBlockError`](../packages/features/src/generate.ts) | class | — | Thrown when a generated block's markers are broken: one is missing, repeated or out of order. |
| [`CONTENT_PACK_FIELD_TARGETS`](../packages/features/src/content-packs-legacy.ts) | const | Beta | Where a custom field lives, and the block that owns that table. |
| [`contentPackBlocks`](../packages/features/src/content-packs.ts) | function | Beta | The block ids a pack's sections need, whatever it declares. @stability Beta |
| [`ContentPackError`](../packages/features/src/content-packs.ts) | class | Beta | Thrown by {@link defineContentPack}; lists every problem at once. @stability Beta |
| [`contentPackProblems`](../packages/features/src/content-packs.ts) | function | Beta | Every problem with a pack: its shape, each section's items (through the validator its block registers, when given) and, given the installed blocks, any block it fills that isn't installed. An empty list means it can be installed. The sec... |
| [`cycleProblems`](../packages/features/src/graph.ts) | function | Beta | Cycles through `requires`, each reported once, from where the depth-first search found it. @stability Beta |
| [`defineBlock`](../packages/features/src/blocks.ts) | function | Beta | Declare a block. Validates it (id, requirements, platforms, contribution keys and duplicate ids within the block) and returns it frozen, so a typo fails where the block is written rather than where it is used: |
| [`defineContentPack`](../packages/features/src/content-packs.ts) | function | Beta | Declare a content pack: returns it unchanged, typed, after checking its shape (throws a {@link ContentPackError} listing every problem). Give the blocks it fills, or validators by block id, to check each section's items too. Whether its ... |
| [`defineFeatures`](../packages/features/src/model.ts) | function | Beta | The one source of truth for a repo's features. Validates every entry and returns the same object, so running code reads it directly and the key type becomes the repo's `FeatureId`: |
| [`defineFlags`](../packages/features/src/model.ts) | function | Beta | Flags, each tied to a feature of `features`. An unknown `feature` is a type error, and at runtime: - every flag needs an `owner`, a `kind`, a `default` and its `scopes`; - `release` and `experiment` flags need an `expires` date, `ops` fl... |
| [`dependencyOrder`](../packages/features/src/graph.ts) | function | — | The ids in dependency order (what a node requires comes first), ties kept in the given order. Requirements outside `nodes` are ignored. Assumes no cycles ({@link requiresProblems} reports them). |
| [`expiredFlags`](../packages/features/src/model.ts) | function | Beta | Flags whose `expires` date is before `today` (`YYYY-MM-DD`, default today in UTC): remove the code path, then the flag. |
| [`FEATURE_HORIZONS`](../packages/features/src/model.ts) | const | Beta | When a planned or building feature is due, without dates: the roadmap's three columns. |
| [`FEATURE_KINDS`](../packages/features/src/model.ts) | const | Beta | What kind of thing a feature is, from smallest to largest, so an agent looking for a building block can tell an element from a whole block: `token`, `element` (one component), `pattern` (a composed component with slots), `layout` (a page... |
| [`FEATURE_LAYERS`](../packages/features/src/model.ts) | const | — | _(no summary)_ |
| [`FEATURE_PLATFORMS`](../packages/features/src/platforms.ts) | const | Beta | Where a feature runs. `server` covers Node, edge functions and the database. |
| [`FEATURE_STATUSES`](../packages/features/src/types.ts) | const | Beta | Where a feature is in its life. The order is the board's column order. `idea` is captured but not agreed: it is in the list so `find` turns it up before someone builds the same thing twice. |
| [`featureKind`](../packages/features/src/model.ts) | function | Beta | A feature's kind: `kind`, or else the deprecated `layer` field (read until the next major). |
| [`featureLayer`](../packages/features/src/model.ts) | function | Beta | A kind written in the deprecated `layer` field, with its old name `"primitive"` mapped to `"element"`. |
| [`FeatureOff`](../packages/features/src/gate.ts) | class | Beta | Thrown by {@link requireFeature} when a feature is off. Servers map it to a refusal that carries the reason (HTTP 403, or 402 for `entitlement`). |
| [`featureOn`](../packages/features/src/gate.ts) | function | Beta | Is feature `id` on for this context? Returns the first check that said no as `reason`, and for a paid feature the plan that unlocks it. An unknown id is off with reason `unknown`; it never throws for one. |
| [`featurePackageLayer`](../packages/features/src/model.ts) | function | Beta | A feature's layer, derived from the package that owns it: the first `entry` import whose package is known, else the first `links.code` path inside a known package folder. Undefined when no package owns it (an app's own feature, a tool in... |
| [`FeatureRegistryError`](../packages/features/src/model.ts) | class | — | Thrown by {@link defineFeatures} and {@link defineFlags}; lists every problem at once. |
| [`featureSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FeatureDef}, field by field. Cross-field rules live in {@link featureProblems}. |
| [`findFeatures`](../packages/features/src/model.ts) | function | Beta | Features matching `term` in their id, aliases, name, keywords, summary, tagline, category, import paths, slots, contributions or code paths, best matches (id, name and keywords) first. With `options` and an empty `term`, every feature th... |
| [`FLAG_KINDS`](../packages/features/src/types.ts) | const | Beta | Why a flag exists. `release` and `experiment` flags need `expires`, `ops` flags need a `runbook`, and `permission` flags fail `check`: paid access belongs in entitlements (`access`), not flags. |
| [`flagSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FlagDef}. Cross-flag rules live in {@link defineFlags}. |
| [`flagsForFeature`](../packages/features/src/model.ts) | function | Beta | The names of the flags that belong to a feature, in declaration order. |
| [`fromSnapshot`](../packages/features/src/gate.ts) | function | Beta | One feature's answer from a snapshot. An id missing from it is off, as an unknown feature. @stability Beta |
| [`gateSnapshot`](../packages/features/src/gate.ts) | function | Beta | _(no summary)_ |
| [`isSnapshotStale`](../packages/features/src/gate.ts) | function | Beta | Whether a snapshot is older than `maxAgeMs`: refresh it then. A client (an extension worker, a tab left open) keeps a snapshot, replaces it when it is stale, after sign-in or a tenant switch, and right after a refusal. |
| [`MARKETING_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated marketing block. |
| [`MARKETING_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated marketing block (e.g. in README.md). |
| [`marketingRecords`](../packages/features/src/generate.ts) | function | — | The public, shipped features a marketing page shows: visibility public, a tagline, live or beta. |
| [`OPENFEATURE_MANIFEST_SCHEMA`](../packages/features/src/generate.ts) | const | — | The schema an OpenFeature CLI flag manifest points at. |
| [`overlayUpstream`](../packages/features/src/overlay.ts) | function | Beta | The upstream package name and version of a marker: `{ name, version }`. |
| [`PACKAGE_GROUPS`](../packages/features/src/packages.ts) | const | Beta | Where a package appears on the site and in Storybook. `modules` holds every module. |
| [`PACKAGE_LAYERS`](../packages/features/src/packages.ts) | const | Beta | The package layers, bottom to top, with tooling beside them. |
| [`packageLayerProblems`](../packages/features/src/packages.ts) | function | Beta | Every layering problem across a set of packages, as strings: |
| [`readAgentsBlock`](../packages/features/src/generate.ts) | const | — | The generated AGENTS.md block inside `doc`, or null. |
| [`readOverlayMarker`](../packages/features/src/overlay.ts) | function | Beta | A package's `genesis.overlay` marker, or null when it doesn't validate. Problems go in `problems`, each prefixed with the package name. |
| [`readPackageMeta`](../packages/features/src/packages.ts) | function | Beta | A package's layer metadata, or null when it has none valid. Problems go in `problems`, each prefixed with the package name. |
| [`replaceAgentsBlock`](../packages/features/src/generate.ts) | const | Beta | `doc` with its generated AGENTS.md block replaced by `block`, or with `block` appended when it has none yet. |
| [`requireFeature`](../packages/features/src/gate.ts) | function | Beta | Refuse unless the feature is on: call it at the top of every server function and route that belongs to a feature. |
| [`requirementProblem`](../packages/features/src/graph.ts) | function | Beta | One requirement's problem (itself, or an unknown id), or undefined when it is fine. @stability Beta |
| [`requiresProblems`](../packages/features/src/graph.ts) | function | Beta | Self-requirements, unknown requirements and cycles through `requires`, as problem strings (`a.requires: …`). Each cycle is reported once, from where the depth-first search found it: `a.requires: a cycle: a → b → a`. |
| [`resolveBlocks`](../packages/features/src/blocks.ts) | function | Beta | The blocks that are on, checked and merged: |
| [`SHIPPED_STATUSES`](../packages/features/src/gate.ts) | const | Beta | The statuses in which a feature is on. A deprecated feature still works until it is retired. @stability Beta |
| [`statusOn`](../packages/features/src/status.ts) | function | Beta | A feature's status on one platform, or undefined when it isn't there. Zod-free so the gate can use it on phones and in browsers. |
| [`toAgentsMarkdown`](../packages/features/src/generate.ts) | function | Beta | The marker-delimited block for AGENTS.md: deliberately short. It points agents at `find` and the skill and gives counts, never the whole list, so AGENTS.md stays small however many features there are. |
| [`toJson`](../packages/features/src/generate.ts) | function | Beta | The registry as JSON, for tools that can't import TypeScript. Stable: no timestamps, features in declaration order, so `check` can compare it. It is also the record of every id ever used, which keeps ids permanent. |
| [`toMarketingMarkdown`](../packages/features/src/generate.ts) | function | Beta | A benefit-led feature list for a README or a marketing page: public, shipped features with a tagline, highlights first, grouped by category. |
| [`toOpenFeatureManifest`](../packages/features/src/generate.ts) | function | Beta | The flags as an OpenFeature CLI flag manifest (`flags.json`), so `openfeature generate` can make typed accessors from the same registry. |
| [`toRecords`](../packages/features/src/model.ts) | function | Beta | Features as records, in declaration order, each with its flags attached. |
| [`toSkillMarkdown`](../packages/features/src/generate.ts) | function | Beta | The agent skill for working with the registry, written to `.claude/skills/features/SKILL.md` by `genesis features build`. `outputs` names what the build writes in this repo, so the skill never claims a file the repo turned off. |

### Types (60)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BlockContributions };
export type { BlockDataUse };
export type { BlockDef };
export type { BlockMigration };
export type { BlockNavItem };
export type { BlockPrivacy };
export type { BlockRoute };
export type { BlockSettingsRow };
export type { ContentPackCheckOptions };
export type { ContentPackDef };
export type { ContentPackFieldDefinition };
export type { ContentPackFieldTarget };
export type { ContentPackForm };
export type { ContentPackMetricTemplate };
export type { ContentPackRoadmapTemplate };
export type { ContentPackSectionValidator };
export type { ContentPackSections };
export type { ContentPackSessionType };
export type { Contributed };
export type { DeprecatedFeatureLayer };
export type { EnabledBlocks };
export type { FeatureAccess };
export type { FeatureDef };
export type { FeatureHorizon };
export type { FeatureIdOf };
export type { FeatureKind };
export type { FeatureLayer };
export type { FeatureLinks };
export type { FeatureMedia };
export type { FeaturePackage };
export type { FeaturePlatform };
export type { FeatureRecord };
export type { FeatureStatus };
export type { FeatureVisibility };
export type { Features };
export type { FindOptions };
export type { FlagDef };
export type { FlagKind };
export type { FlagValue };
export type { Flags };
export type { GateAnswer };
export type { GateContext };
export type { GateFeature };
export type { GateFlag };
export type { GateReason };
export type { GateRegistry };
export type { GateSnapshot };
export type { GateSnapshotOptions };
export type { GenerateOptions };
export type { IdSet };
export type { LayerPackage };
export type { ModuleMeta };
export type { OverlayMarker };
export type { PackageGroup };
export type { PackageLayer };
export type { PackageMeta };
export type { RequiresNode };
export type { RequiresProblemsOptions };
export type { ResolveBlocksOptions };
export type { ResolvedBlocks };
```

---

## @marktiderman/genesis-features/blocks

**Barrel:** [`packages/features/src/blocks.ts`](../packages/features/src/blocks.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BlockError`](../packages/features/src/blocks.ts) | class | Beta | Thrown by {@link defineBlock} and {@link resolveBlocks}; lists every problem at once. @stability Beta |
| [`defineBlock`](../packages/features/src/blocks.ts) | function | Beta | Declare a block. Validates it (id, requirements, platforms, contribution keys and duplicate ids within the block) and returns it frozen, so a typo fails where the block is written rather than where it is used: |
| [`resolveBlocks`](../packages/features/src/blocks.ts) | function | Beta | The blocks that are on, checked and merged: |

### Types (12)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BlockContributions };
export type { BlockDataUse };
export type { BlockDef };
export type { BlockMigration };
export type { BlockNavItem };
export type { BlockPrivacy };
export type { BlockRoute };
export type { BlockSettingsRow };
export type { Contributed };
export type { EnabledBlocks };
export type { ResolveBlocksOptions };
export type { ResolvedBlocks };
```

---

## @marktiderman/genesis-features/gate

**Barrel:** [`packages/features/src/gate.ts`](../packages/features/src/gate.ts)

### Other exports (7)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureOff`](../packages/features/src/gate.ts) | class | Beta | Thrown by {@link requireFeature} when a feature is off. Servers map it to a refusal that carries the reason (HTTP 403, or 402 for `entitlement`). |
| [`featureOn`](../packages/features/src/gate.ts) | function | Beta | Is feature `id` on for this context? Returns the first check that said no as `reason`, and for a paid feature the plan that unlocks it. An unknown id is off with reason `unknown`; it never throws for one. |
| [`fromSnapshot`](../packages/features/src/gate.ts) | function | Beta | One feature's answer from a snapshot. An id missing from it is off, as an unknown feature. @stability Beta |
| [`gateSnapshot`](../packages/features/src/gate.ts) | function | Beta | _(no summary)_ |
| [`isSnapshotStale`](../packages/features/src/gate.ts) | function | Beta | Whether a snapshot is older than `maxAgeMs`: refresh it then. A client (an extension worker, a tab left open) keeps a snapshot, replaces it when it is stale, after sign-in or a tenant switch, and right after a refusal. |
| [`requireFeature`](../packages/features/src/gate.ts) | function | Beta | Refuse unless the feature is on: call it at the top of every server function and route that belongs to a feature. |
| [`SHIPPED_STATUSES`](../packages/features/src/gate.ts) | const | Beta | The statuses in which a feature is on. A deprecated feature still works until it is retired. @stability Beta |

### Types (9)

Type-only exports not consumed as a component's `Props`.

```ts
export type { GateAnswer };
export type { GateContext };
export type { GateFeature };
export type { GateFlag };
export type { GateReason };
export type { GateRegistry };
export type { GateSnapshot };
export type { GateSnapshotOptions };
export type { IdSet };
```

---

## @marktiderman/genesis-features/gate/react

**Barrel:** [`packages/features/src/gate-react.tsx`](../packages/features/src/gate-react.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureGate`](../packages/features/src/gate-react.tsx) | `FeatureGateProps` | Beta | Renders `children` when the feature is on; `upsell` when a plan would turn it on; otherwise `fallback`. |

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureGateProvider`](../packages/features/src/gate-react.tsx) | function | Beta | Hands the session's gate answers to every {@link useFeature} below it. @stability Beta |
| [`useFeature`](../packages/features/src/gate-react.tsx) | function | Beta | The gate's answer for one feature. Outside a {@link FeatureGateProvider} this throws: a missing provider would otherwise turn every feature off without a word. |

---

## @marktiderman/genesis-features/node

`buildFeatureOutputs` and `checkFeatureOutputs`, the file-system half that `genesis features build|check` runs.

**Barrel:** [`packages/features/src/node.ts`](../packages/features/src/node.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`blankComments`](../packages/features/src/node.ts) | function | — | `text` with its comments blanked to spaces (newlines kept), so a flag named in a comment isn't read as a flag read and line numbers stay right. Strings, regex literals and template text are left alone; a template's `${…}` is code. With `... |
| [`buildFeatureOutputs`](../packages/features/src/node.ts) | function | Beta | Writes every generated output (the AGENTS.md block, the JSON, the flag manifest, the skill, the marketing block) and adds `@AGENTS.md` to CLAUDE.md when it's missing. Refuses, writing nothing, when an id recorded in the JSON has disappea... |
| [`checkFeatureOutputs`](../packages/features/src/node.ts) | function | Beta | Checks the registry against the repo. Errors (exit 1): generated output that is stale, `links.code` paths that don't exist, the flag rules (a permission flag, an expired flag, a dynamic key, a key read but not defined or defined but neve... |
| [`globToRegExp`](../packages/features/src/node.ts) | function | — | A glob (`*`, `**`, `?`, `{a,b}`) as a RegExp over `/`-separated relative paths. |
| [`scanFlagReads`](../packages/features/src/node.ts) | function | — | Flag reads in `text`: each key read through an accessor with a literal, and each read whose key isn't a literal (`dynamic`), as `path:line`. Comments don't count. |
| [`summarizeCheck`](../packages/features/src/node.ts) | function | Beta | A few lines for a session's start: counts, stale output, expired flags, planned features with shipped work and open claims. Meant for a SessionStart hook (`genesis features check --summary`). |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FeatureCheckResult };
export type { FeatureEvidence };
export type { FeaturePrEvidence };
export type { FeatureProjectOptions };
export type { PlannedButShipped };
```

---

## @marktiderman/genesis-features/react

`FeatureList`: the registry as a genesis-ui ResourcePage — a table, a board grouped by status, filters by app and audience. genesis-ui, React and lucide-react are optional peers, loaded only by this subpath.

**Barrel:** [`packages/features/src/react.tsx`](../packages/features/src/react.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureList`](../packages/features/src/react.tsx) | `FeatureListProps` | Beta | A repo's features as a page. The default (`variant="admin"`) is a ResourcePage over static data: a table, and in its grid view a board grouped by status, with status chips, filters by app, audience and visibility, search, and a detail pa... |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureStatusBadge`](../packages/features/src/react.tsx) | function | Beta | A feature's status as a badge. `StatusBadge` covers the active states and deprecated; idea, planned and retired have no status there, so they use the secondary and outline `Badge`. |

---

## @marktiderman/genesis-forms

Genesis Forms engine: a serializable form definition, logic, navigation, validation and server-side checking. Zero dependencies; runs in browsers, React Native, Node and edge runtimes. Part of the Genesis framework.

**Barrel:** [`packages/forms/src/index.ts`](../packages/forms/src/index.ts)

### Other exports (135)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answersFromSnapshots`](../packages/forms/src/options.ts) | function | — | The reverse of `answerSnapshots`, for an edit link: the answers to prefill from stored snapshots. A pick whose value is still an option keeps it; otherwise an option with the same label (ignoring case and accents) stands in, such as a lo... |
| [`answerSnapshots`](../packages/forms/src/options.ts) | function | — | Each answer to a choice question that takes options from the app (`props.optionsFrom`), as `{ value, label }` pairs as of now, by field id: store them beside the answers so reports group by the value (an id) while history keeps the name ... |
| [`answersOnPath`](../packages/forms/src/options.ts) | function | — | The answers on the respondent's path, by field id: what a filter reads. An answer to a question off the path (hidden by logic, jumped over) counts as none, as it does for logic. Pass these to `visibleOptions` from a renderer, so it shows... |
| [`CALCULATED_TYPE`](../packages/forms/src/calculated.ts) | const | — | The calculated field type's registry key. |
| [`calculatedProps`](../packages/forms/src/calculated.ts) | function | — | A calculated field's settings, with anything malformed left out. |
| [`calculatedValue`](../packages/forms/src/calculated.ts) | function | — | What a formula's result is stored as. `number` and `percent` keep a number (`0.25` for 25%), rounded to `decimals`; `text` keeps text. Without a format, numbers, text and true / false are kept as they are. A list, and anything the format... |
| [`canonicalJson`](../packages/forms/src/hash.ts) | function | — | JSON with object keys sorted, so equal definitions serialize identically. |
| [`carryAnswers`](../packages/forms/src/carry.ts) | function | — | Answers given to one version of a form, as answers to another (by field id), matched by field key: what an edit link prefills when the form has a newer version. Answers to fields the other version doesn't have are dropped; `extra` (by ke... |
| [`CHOICE_FIELD_TYPES`](../packages/forms/src/options.ts) | const | — | The built-in field types whose answer is one or more of their options. A host's own choice kinds (`FieldTypeManifest.choice`) aren't in it: ask `isChoiceField` or `choiceKind`. |
| [`choiceKind`](../packages/forms/src/fields.ts) | function | — | A choice kind's answer shape (`FieldTypeManifest.choice`), or undefined for any other kind. |
| [`choiceOptions`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`clearFilteredAnswers`](../packages/forms/src/options.ts) | function | — | `values` after the answer to `changedId` changed, with every choice its filter no longer shows taken out: a single choice or dropdown is cleared, a multiple choice keeps the options that still show (and a typed "Other" answer). It follow... |
| [`coerceHidden`](../packages/forms/src/hidden.ts) | function | — | Type raw hidden inputs (from a query string, the host app or the server) by the definition's declarations. `undefined` values are skipped silently. |
| [`coerceHiddenValue`](../packages/forms/src/hidden.ts) | function | — | Convert one raw value to a hidden input's declared type, or `undefined` when it cannot be. Only string, number and boolean primitives are accepted. - `string`: a string (at most 1000 characters), or a number or boolean as text. - `number... |
| [`COMPUTED_FIELD_TYPES`](../packages/forms/src/calculated.ts) | const | — | Field types the builder offers only to a host that names them in its palette, like `STRUCTURED_FIELD_TYPES`: `calculated` shows a value worked out from other answers, so it is opt-in for hosts that want formulas. |
| [`computePath`](../packages/forms/src/logic.ts) | function | — | The respondent's path, derived from the answers on the path, so the client, the server and a replay always agree. It is built in one forward pass: a block's show/hide rules, and the jumps from it, see only the fields already on the path ... |
| [`contentText`](../packages/forms/src/fields.ts) | function | — | A content block's display text: its kind's `text` (when it gives a string without throwing), or `block.text`. |
| [`createDraftAutosave`](../packages/forms/src/drafts.ts) | function | — | Save the engine's answers to `store` as they change, `delayMs` after the last change, one write at a time and in order. Answers cleared to nothing remove the draft (one this autosave wrote, or the one restored: `stored`), so an emptied f... |
| [`createDraftStore`](../packages/forms/src/drafts.ts) | function | — | A `DraftStore` over key-value storage, one entry per form and respondent (the version is inside it, so a new version finds the old draft and `restoreDraft` decides whether it still fits). A stored entry that doesn't read as a draft is an... |
| [`createForm`](../packages/forms/src/engine.ts) | function | — | _(no summary)_ |
| [`createSubmitOutbox`](../packages/forms/src/outbox.ts) | function | — | Each submission is stored under its own key, with an index of keys beside it. The index is read again and merged on every change, so two outboxes on one storage (two tabs) don't write each other's submissions out; both may send one, and ... |
| [`dateLimits`](../packages/forms/src/fields.ts) | function | — | A `date` field's earliest and latest days (`YYYY-MM-DD`), when set. |
| [`DEFAULT_PHOTO_FILES`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`DEFAULT_PHOTO_SIZE_MB`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`defineForm`](../packages/forms/src/define.ts) | function | — | Define a form in code. The result's `definition` is the same canonical JSON a builder or `parseForm` produces; answer types are inferred from the blocks. |
| [`describeCondition`](../packages/forms/src/explain.ts) | function | — | A condition as a plain-English clause: `contact_me is not Yes`. |
| [`DRAFT_KEY_PREFIX`](../packages/forms/src/drafts.ts) | const | — | _(no summary)_ |
| [`DRAFT_MAX_AGE_MS`](../packages/forms/src/drafts.ts) | const | — | 30 days: the default for how long a draft is kept. |
| [`draftOf`](../packages/forms/src/drafts.ts) | function | — | The engine's answers so far as a draft (null when nothing is answered). |
| [`evaluate`](../packages/forms/src/logic.ts) | function | — | Evaluate a condition. Never throws. An empty value (unanswered, `null`, blank text, an empty list: see `isEmptyValue`) is unanswered: it fails every comparison, including `eq`, `in` and `contains`, and passes `neq`. |
| [`evaluateFormula`](../packages/forms/src/formula.ts) | function | — | Evaluate a parsed formula. Never throws; a value it can't work out is `null`. |
| [`explain`](../packages/forms/src/explain.ts) | function | — | Explain a block's visibility. `blockId` may also be a field key. |
| [`f`](../packages/forms/src/define.ts) | const | — | _(no summary)_ |
| [`filteredChoiceError`](../packages/forms/src/options.ts) | function | — | Null, or the error for a (non-empty) choice answer that is one of the question's options but not one it shows now because of its filter (`visibleOptions`). A typed "Other" answer is left to the field type's own check. The engine and `val... |
| [`fingerprint`](../packages/forms/src/hash.ts) | function | — | A short content fingerprint (cyrb53, 14 hex characters). It detects drift between a definition and its published version; it is not a security hash. |
| [`formatCalculated`](../packages/forms/src/calculated.ts) | function | — | A calculated value as shown: `12.5`, `25%`, the text, Yes / No. Empty when there is none. |
| [`formatTimestamp`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`formProgress`](../packages/forms/src/progress.ts) | function | — | Where the respondent is: the furthest step and the furthest question reached. What genesis-forms-web's `onProgress` passes; `engine.answers()` has the answers so far. |
| [`FORMULA_FUNCTIONS`](../packages/forms/src/formula.ts) | const | — | _(no summary)_ |
| [`formulaInput`](../packages/forms/src/calculated.ts) | function | — | The value a formula reads for an answer: numbers and text as they are, a list's items, one table column's cells. A list or table of more than `MAX_FORMULA_ITEMS` reads as blank. Each call builds a new list. |
| [`formulaNumber`](../packages/forms/src/formula.ts) | function | — | A value as a number: numbers, numeric text ("1,200" too), yes / no as 1 / 0. Anything else is blank (`null`). |
| [`formulaRefs`](../packages/forms/src/formula.ts) | function | — | The answers a formula names, each once (none when it doesn't parse). |
| [`furthestReached`](../packages/forms/src/progress.ts) | function | — | The furthest block on the path the respondent has reached: the one on screen, one they went back from, or (in classic layout, where every question shows at once) the last one they answered. Null when the path is empty. |
| [`getContentType`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`getFieldType`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`hasOptionFilters`](../packages/forms/src/options.ts) | function | — | Whether any choice question in the definition filters its options by another answer. |
| [`hiddenByPrefill`](../packages/forms/src/options.ts) | function | — | Questions on the path the respondent skips because a prefill answered them: those with `props.prefill.hideWhenPrefilled` whose answer is still the prefilled one (the last answer event for them came from `initialValues` or a link) and has... |
| [`HIGHLIGHT_NOTE_MESSAGE`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`IDEMPOTENCY_KEY_PATTERN`](../packages/forms/src/submit-protocol.ts) | const | — | What an idempotency key matches: 16 to 128 letters, digits, `-` and `_`. |
| [`isBuiltInFieldType`](../packages/forms/src/fields.ts) | function | — | Whether `type` is one of the field kinds the package ships. |
| [`isChoiceField`](../packages/forms/src/fields.ts) | function | — | Whether a block is a field of a choice kind: its answer is one or more of its options. |
| [`isEmptyValue`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`isFormEvent`](../packages/forms/src/events.ts) | function | — | Whether `value` is a well-formed `FormEvent` of a known type. |
| [`isHttpsUrl`](../packages/forms/src/fields.ts) | function | — | Whether `url` is an `https://` link with a host and no spaces or control characters, within `OPTION_LIMITS.image`. A pattern rather than `new URL`, so it behaves the same in React Native. |
| [`isIdempotencyKey`](../packages/forms/src/submit-protocol.ts) | function | — | _(no summary)_ |
| [`isIsoDate`](../packages/forms/src/fields.ts) | function | — | `YYYY-MM-DD`, a real calendar day (no 2026-02-30), years 0001 to 9999. |
| [`isJson`](../packages/forms/src/events.ts) | function | — | Whether a value is JSON: strings, finite numbers, booleans, null, arrays and plain objects, nested to any depth. Iterative, so a deeply nested value cannot overflow the stack. |
| [`isOtherValue`](../packages/forms/src/fields.ts) | function | — | Whether a value is a typed "Other" answer: text that isn't one of the question's options. |
| [`isPhotoFormat`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`isPhotoRef`](../packages/forms/src/photo.ts) | function | — | Whether `v` has a photo reference's shape (any type and size). |
| [`isPrefillParam`](../packages/forms/src/options.ts) | function | — | A well-formed parameter name: letters, digits, `_`, `-` and `.`, at most `MAX_PREFILL_PARAM_LENGTH`. |
| [`isSearchable`](../packages/forms/src/options.ts) | function | — | Whether a choice question shows a search box over its options: `props.searchable` when it is true or false, otherwise when it has more than `SEARCHABLE_OPTION_COUNT` options. The default counts all its options (`choiceOptions(field)`, wi... |
| [`isSensitive`](../packages/forms/src/fields.ts) | function | — | Whether a block holds personal or secret data: `sensitive: true`, or the `props.sensitive: true` alias. |
| [`isSubmitResult`](../packages/forms/src/submit-protocol.ts) | function | — | Whether `value` is a `SubmitResult`, for a device reading an endpoint's JSON. |
| [`listContentTypes`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`listFieldTypes`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`listLimits`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`MAX_CALCULATED_DECIMALS`](../packages/forms/src/calculated.ts) | const | — | Most decimal places a calculated value may keep. |
| [`MAX_FORM_FORMULA_LENGTH`](../packages/forms/src/calculated.ts) | const | — | Longest the formulas of one form may be, all together (`parseForm` checks it). |
| [`MAX_FORMULA_ITEMS`](../packages/forms/src/calculated.ts) | const | — | Most items a formula reads from one answer (a list's items, a table's rows). A longer answer reads as blank, so one oversized value sent to the server can't make every formula over it slow. |
| [`MAX_FORMULA_LENGTH`](../packages/forms/src/formula.ts) | const | — | Longest formula accepted. |
| [`MAX_HIDDEN_STRING_LENGTH`](../packages/forms/src/hidden.ts) | const | — | Longest string a hidden input accepts. Longer values are dropped. |
| [`MAX_HIGHLIGHT_NOTE_LENGTH`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_HIGHLIGHT_QUOTE_LENGTH`](../packages/forms/src/structured.ts) | const | — | The longest passage one highlight may quote; also bounds a quote the server can't check against `props.text`. |
| [`MAX_PHOTO_FILES`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PHOTO_ID_LENGTH`](../packages/forms/src/photo.ts) | const | — | The longest reference id and file name a photo answer may carry. |
| [`MAX_PHOTO_NAME_LENGTH`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PHOTO_SIZE_MB`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PREFILL_PARAM_LENGTH`](../packages/forms/src/options.ts) | const | — | Characters in a link parameter's name. |
| [`MAX_SETTLE_ITEMS`](../packages/forms/src/calculated.ts) | const | — | Most list items and table rows all of a form's formulas read in one go (each list or table counted once, however many of its columns are read, in form order). A formula that reads an answer past the limit, or one over `MAX_FORMULA_ITEMS`... |
| [`MAX_TABLE_CELL_LENGTH`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_TABLE_COLUMNS`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_TIMESTAMP_SECONDS`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_UPLOAD_REQUEST_BYTES`](../packages/forms/src/upload-protocol.ts) | const | — | The longest upload request body: a few fields of JSON. |
| [`memoryStorage`](../packages/forms/src/storage.ts) | function | — | Storage that lasts as long as the page or app does: for tests, and where nothing may be kept on the device. |
| [`mergeResponses`](../packages/forms/src/merge.ts) | function | — | `base` with `patch` on top, by field id, as the answers to store. The rules, in order: |
| [`normalizeValue`](../packages/forms/src/fields.ts) | function | — | A value in its stored form (see `FieldTypeManifest.normalize`). |
| [`numberLimits`](../packages/forms/src/fields.ts) | function | — | A `number` field's limits: `min`, `max` and `step` (each optional; `step` is above 0). |
| [`OPTION_LIMITS`](../packages/forms/src/fields.ts) | const | — | Bounds on an option's extra details. A longer or malformed detail is dropped when options are read. |
| [`optionFilter`](../packages/forms/src/options.ts) | function | — | A choice field's `props.optionsFrom.filter` (`{ attribute, field }`), when it is well formed. |
| [`optionJson`](../packages/forms/src/fields.ts) | function | — | An option as JSON, with only the details it has. |
| [`optionMatches`](../packages/forms/src/options.ts) | function | — | Whether an option matches an answer on one attribute: its `attributes[attribute]` (a text or a list) shares a value with the answer (a text, or a list from a multiple choice). An option without the attribute matches nothing. |
| [`optionsSource`](../packages/forms/src/fields.ts) | function | — | A choice field's `props.optionsFrom`, when it is a well-formed `{ source: "host", key }`, with its `filter` when that is well formed too (`{ attribute, field }`, both non-empty text). |
| [`OTHER_MAX_LENGTH`](../packages/forms/src/fields.ts) | const | — | The longest answer an "Other" option takes. |
| [`otherOption`](../packages/forms/src/fields.ts) | function | — | A choice question's "Other" option (`props.other: true` or `{ label }`): the respondent types their own answer, stored as the answer's value itself (single choice, dropdown) or as one more item (multiple choice). Null when the question h... |
| [`parseForm`](../packages/forms/src/parse.ts) | function | — | Check a definition before it is stored or rendered: structure, the types of text fields, unique ids and keys, known field types, references that resolve, operators that fit the field type. Each field and content kind checks its own `prop... |
| [`parseFormula`](../packages/forms/src/formula.ts) | function | — | Parse a formula. Never throws: a mistake comes back as `{ ok: false, message, at }`, with the character offset of the problem. |
| [`parseTimestamp`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`PHOTO_FORMATS`](../packages/forms/src/photo.ts) | const | — | The MIME types each format covers. |
| [`PHOTO_TYPE`](../packages/forms/src/photo.ts) | const | — | The `photo` field type: a respondent attaches up to a few photos, such as a picture of broken equipment. The answer holds references the host's storage handed back (`PhotoRef`), never the bytes: the renderer uploads through the host (`on... |
| [`photoCountMessage`](../packages/forms/src/photo.ts) | const | — | The message for more photos than the field takes. |
| [`photoFormatList`](../packages/forms/src/photo.ts) | function | — | "JPEG, PNG or WebP". |
| [`photoLimits`](../packages/forms/src/photo.ts) | function | — | A photo field's limits; a prop that is missing or out of range uses its default. |
| [`photoRefs`](../packages/forms/src/photo.ts) | function | — | The well-formed references in a photo answer, as `{ id, name, type, size }` only. |
| [`photoSizeMessage`](../packages/forms/src/photo.ts) | const | — | The message for a file over the field's size limit. |
| [`photoTypeMessage`](../packages/forms/src/photo.ts) | const | — | The message for a file of a type the field doesn't take. |
| [`prefillFromLink`](../packages/forms/src/options.ts) | function | — | Answers a link preselects, by field id, for `createForm`'s `initialValues` (its `linkParams` option calls this). Each choice question with `props.prefill: { param }` takes the parameter's value when it is one of the options the question ... |
| [`prefillSetting`](../packages/forms/src/options.ts) | function | — | A choice field's `props.prefill` (`{ param, hideWhenPrefilled? }`), when it is well formed. |
| [`ratingDisplay`](../packages/forms/src/fields.ts) | function | — | How a rating is drawn: `"numbers"` (default) or `"stars"`. |
| [`readOption`](../packages/forms/src/fields.ts) | function | — | An option from untrusted JSON (a definition, the host's list): its string `value`, and its `label`, `description`, `image` and `attributes` when each is well formed and within `OPTION_LIMITS`; anything else is left out. Null when there i... |
| [`recall`](../packages/forms/src/recall.ts) | function | — | Replace `{{field:key|fallback}}` and `{{hidden:name|fallback}}` tokens. An unanswered value renders its fallback (default empty); the text is never dropped. |
| [`registerContentType`](../packages/forms/src/fields.ts) | function | — | Register a content kind. Throws on a malformed manifest or a built-in kind's name (unless `{ replace: true }`). |
| [`registerFieldType`](../packages/forms/src/fields.ts) | function | — | Register a field kind, or replace one a host registered before (re-registering is allowed, so hot reload works). Throws on a malformed manifest, and on a built-in kind's name unless `{ replace: true }`. Registered kinds are frozen copies. |
| [`renameFormulaKey`](../packages/forms/src/formula.ts) | function | — | The formula with every reference to the answer `from` renamed to `to`. Column names, function names and text are left alone. Returned unchanged when it has a character a formula can't hold. |
| [`replay`](../packages/forms/src/engine.ts) | function | — | Rebuild a form's state from its event log. Timestamps are ignored. |
| [`REQUIRED_MESSAGE`](../packages/forms/src/validate.ts) | const | — | _(no summary)_ |
| [`respondentPath`](../packages/forms/src/options.ts) | function | — | The blocks the respondent steps through: the path without the questions a prefill hides (`hiddenByPrefill`). |
| [`restoreDraft`](../packages/forms/src/drafts.ts) | function | — | Whether a saved draft can be put back into this definition. The same version: yes. Another version: only when every saved answer still fits (its question is there, of the same type, and the answer passes its format checks); otherwise the... |
| [`ruleVisible`](../packages/forms/src/logic.ts) | function | — | Whether a block's show/hide rules let it be shown, ignoring jumps. The rules read the answers on the path before the block, as in `computePath`. A block with any `show` rule is hidden until one matches; a matching `hide` rule always wins. |
| [`scaleLabels`](../packages/forms/src/fields.ts) | function | — | The optional words under the ends of a rating or NPS scale ("Poor", "Great"). |
| [`SEARCHABLE_OPTION_COUNT`](../packages/forms/src/options.ts) | const | — | A choice question with more options than this gets a search box, unless `props.searchable` says otherwise. |
| [`searchOptions`](../packages/forms/src/options.ts) | function | — | The options that match what the respondent typed, in their order: every word of `query` is found (ignoring case and accents) in the option's label, value or description. A blank query matches every option. |
| [`steps`](../packages/forms/src/logic.ts) | function | — | Blocks a respondent steps through: fields and content, in order. |
| [`STRUCTURED_FIELD_TYPES`](../packages/forms/src/structured.ts) | const | — | The structured field types, whose answers are lists or records rather than one value: - `list`: several short answers, e.g. goals, action items, three things that went well. - `table`: a small table each answer fills row by row, e.g. an ... |
| [`submitOutcome`](../packages/forms/src/submit-protocol.ts) | function | — | What a device does with an answer: `delivered` (stored now or before: drop it from the outbox), `retry` (keep it and try again later) or `rejected` (keep it, marked failed, for the respondent to fix or discard). Anything that isn't a `Su... |
| [`summarizeValue`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`tableColumns`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`tableLimits`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`UPLOAD_FIELD_TYPES`](../packages/forms/src/photo.ts) | const | — | Field types that need the host to store files; a builder offers them only when the host names them. |
| [`validateField`](../packages/forms/src/validate.ts) | function | — | Validate one field's value. `requireAnswers: false` (drafts) checks the format of what was answered without requiring the rest. |
| [`VALIDATOR_FAILED_MESSAGE`](../packages/forms/src/fields.ts) | const | — | The message an answer gets when its kind's validator throws. |
| [`visibleOptions`](../packages/forms/src/options.ts) | function | — | The options a choice question shows given the answers so far (`values`, keyed by field id, as in `FormState.values`): all of `choiceOptions(field)`, or, with `props.optionsFrom.filter`, only those matching the filtered-by question's answ... |
| [`webStorage`](../packages/forms/src/storage.ts) | function | — | The browser's `localStorage` (or another `Storage`, such as `sessionStorage`), looked up on each call, so creating it during server rendering is safe. Where there is none (a server, a locked-down private window) every call throws, and th... |
| [`when`](../packages/forms/src/define.ts) | function | — | Start a rule on a field: `when("overall").lessThan(4).jumpTo("improve")`. |
| [`withHostOptions`](../packages/forms/src/fields.ts) | function | — | The definition with each `optionsFrom: { source: "host" }` field's options filled in from `hostOptions`: its own `props.options` first, then the host's list for its key (a value the field already has is not added twice). A key the host d... |

### Types (95)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerSnapshot };
export type { AnswersOf };
export type { Block };
export type { CalculatedFormat };
export type { CalculatedProps };
export type { ChoiceFieldOptions };
export type { ChoiceOption };
export type { CoerceHiddenOptions };
export type { CoercedHidden };
export type { Condition };
export type { ContentBlock };
export type { ContentTypeManifest };
export type { CreateFormOptions };
export type { DraftAutosave };
export type { DraftAutosaveOptions };
export type { DraftKey };
export type { DraftOptions };
export type { DraftRestore };
export type { DraftStore };
export type { Ending };
export type { EnqueueInput };
export type { ExplainInput };
export type { ExplainOptions };
export type { Explanation };
export type { FieldBlock };
export type { FieldOptions };
export type { FieldSpec };
export type { FieldTypeManifest };
export type { FieldValidation };
export type { FieldValidator };
export type { Form };
export type { FormDefinition };
export type { FormDraft };
export type { FormEngine };
export type { FormEvent };
export type { FormInput };
export type { FormIssue };
export type { FormLayout };
export type { FormProgress };
export type { FormSettings };
export type { FormState };
export type { FormulaFunction };
export type { FormulaNode };
export type { FormulaParseResult };
export type { FormulaReader };
export type { FormulaRef };
export type { FormulaValue };
export type { HiddenInput };
export type { Highlight };
export type { HostOptions };
export type { Json };
export type { JumpTrace };
export type { KeyResolver };
export type { KeyValueStorage };
export type { LinkParams };
export type { LiteralType };
export type { LogicRule };
export type { MaybePromise };
export type { MediaNote };
export type { MergeOptions };
export type { Operand };
export type { Operator };
export type { OptionSnapshot };
export type { OptionsSource };
export type { OutboxEntry };
export type { OutboxItem };
export type { OutboxSnapshot };
export type { PageBreakBlock };
export type { ParseResult };
export type { PathResult };
export type { PhotoFormat };
export type { PhotoLimits };
export type { PhotoRef };
export type { PrefillSetting };
export type { PrefillState };
export type { PropsCheck };
export type { PropsChecker };
export type { RegisterOptions };
export type { RestoredAnswers };
export type { RuleSpec };
export type { RuleTrace };
export type { SignedUpload };
export type { StandardSchemaV1 };
export type { SubmitFailureReason };
export type { SubmitOutbox };
export type { SubmitOutboxOptions };
export type { SubmitOutcome };
export type { SubmitRequest };
export type { SubmitResult };
export type { TableColumn };
export type { UploadAdapter };
export type { UploadFile };
export type { UploadGrant };
export type { UploadRefusal };
export type { UploadRequest };
```

---

## @marktiderman/genesis-forms/server

**Barrel:** [`packages/forms/src/server.ts`](../packages/forms/src/server.ts)

### Other exports (40)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`addressPrefix`](../packages/forms/src/rate-limit.ts) | function | — | The part of an address that names one client: an IPv4 address whole, an IPv6 address by its /64. |
| [`allow`](../packages/forms/src/rate-limit.ts) | function | — | True when the request may go on. Fails open: when the store can't count (it answers null or throws) the request goes on and `log` says so with `message`. |
| [`answersFromSnapshots`](../packages/forms/src/options.ts) | function | — | The reverse of `answerSnapshots`, for an edit link: the answers to prefill from stored snapshots. A pick whose value is still an option keeps it; otherwise an option with the same label (ignoring case and accents) stands in, such as a lo... |
| [`answerSnapshots`](../packages/forms/src/options.ts) | function | — | Each answer to a choice question that takes options from the app (`props.optionsFrom`), as `{ value, label }` pairs as of now, by field id: store them beside the answers so reports group by the value (an id) while history keeps the name ... |
| [`attemptHash`](../packages/forms/src/uploads.ts) | function | — | The stored hash of a visit's attempt id: hex SHA-256 (Web Crypto). It equals The host app's `resumeTokenHash`, so uploads recorded before the move still match. |
| [`checkUploads`](../packages/forms/src/uploads.ts) | function | — | Checks every file the answers name: uploaded by this attempt (or for this edit) to this form's field, in storage, of a type and size the field takes, and no more files than it takes. The stored name, type and size replace what the browse... |
| [`clientIp`](../packages/forms/src/rate-limit.ts) | function | — | The client's address as the platform reports it, used only as a rate-limit key: the first entry of the first trusted header that is set (`DEFAULT_TRUSTED_IP_HEADERS` by default), then, only when `forwardedForHops` is set, the `x-forwarde... |
| [`createEditSecretReader`](../packages/forms/src/edit-link.ts) | function | — | A reader for the environment variable that holds the edit-link secret (such as `FEEDBACK_EDIT_SECRET`). Without one of at least `MIN_EDIT_SECRET_BYTES` bytes there are no edit links, and the first read says so through `log` (the call's, ... |
| [`createUploadHandler`](../packages/forms/src/upload-handler.ts) | function | — | The upload endpoint: `(request, params) => Response`, for a POST route. `params` is whatever the route has (a form slug, say), passed to `resolveForm`. See the README's "Uploads" for the JSON and every status. |
| [`DEFAULT_TRUSTED_IP_HEADERS`](../packages/forms/src/rate-limit.ts) | const | — | The headers a platform reports the client's address in, most trusted first: Vercel's `x-vercel-forwarded-for` and Cloudflare's `cf-connecting-ip`, which the platform sets itself. `x-forwarded-for` is not read by default: its leftmost ent... |
| [`EDIT_LINK_PARAM`](../packages/forms/src/edit-link.ts) | const | — | The query parameter an edit link's token travels in: `?edit=<token>`. |
| [`EDIT_LINK_TTL_SECONDS`](../packages/forms/src/edit-link.ts) | const | — | How long a new edit link works: 30 days. |
| [`editLinkUrl`](../packages/forms/src/edit-link.ts) | function | — | The link that reopens a response for editing: `formUrl` (the page that shows the form, with any query it needs) plus a token signed for the response's current nonce. Null when there are no edit links (no usable secret) or the id or nonce... |
| [`IDEMPOTENCY_KEY_PATTERN`](../packages/forms/src/submit-protocol.ts) | const | — | What an idempotency key matches: 16 to 128 letters, digits, `-` and `_`. |
| [`isEditLinkRequest`](../packages/forms/src/edit-link.ts) | function | — | Whether this request is a form page opened with an edit link (the parameter present, even empty). |
| [`isIdempotencyKey`](../packages/forms/src/submit-protocol.ts) | function | — | _(no summary)_ |
| [`isSubmitResult`](../packages/forms/src/submit-protocol.ts) | function | — | Whether `value` is a `SubmitResult`, for a device reading an endpoint's JSON. |
| [`isUsableEditSecret`](../packages/forms/src/edit-link.ts) | function | — | Whether `secret` can sign edit links: a string of at least `MIN_EDIT_SECRET_BYTES` bytes. |
| [`MAX_EVENTS`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxEvents`. |
| [`MAX_REPLAY_WORK`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxReplayWork`. |
| [`MAX_SUBMISSION_VALUES`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxValues`. |
| [`MAX_UPLOAD_REQUEST_BYTES`](../packages/forms/src/upload-protocol.ts) | const | — | The longest upload request body: a few fields of JSON. |
| [`mergeResponses`](../packages/forms/src/merge.ts) | function | — | `base` with `patch` on top, by field id, as the answers to store. The rules, in order: |
| [`MIN_EDIT_SECRET_BYTES`](../packages/forms/src/edit-link.ts) | const | — | The shortest secret edit links are signed with: 32 bytes (UTF-8), as long as the HMAC. |
| [`NOT_UPLOADED_MESSAGE`](../packages/forms/src/uploads.ts) | const | — | Said when a reference isn't a file this respondent finished uploading here. |
| [`publicDefinition`](../packages/forms/src/server.ts) | function | — | The definition as respondents may see it. R1 forms hold nothing secret; assessment answer keys (R4) will be stripped here. |
| [`RATE_LIMIT_DEFAULTS`](../packages/forms/src/rate-limit.ts) | const | — | How many submits, saves as they go and photo uploads one client may make per scope (an organization, an account) in a window. |
| [`rateLimitKey`](../packages/forms/src/rate-limit.ts) | function | — | The stored key, `<kind>:<scope>:<hex HMAC-SHA256 of the address prefix>`: what is counted (such as `submit`, `progress`, `upload`), whose count it is (an organization id), and the client, which is never stored as its address. `secret` is... |
| [`RAW_EVENTS_PER_EVENT`](../packages/forms/src/server.ts) | const | — | Most events sent, before compaction, as a multiple of `maxEvents`: a keystroke log compacts to far fewer, but every event sent is looked at. |
| [`signEditToken`](../packages/forms/src/edit-link.ts) | function | — | The edit token for a response and its current nonce, working for `ttlSeconds` from now; null when there is no usable secret (no edit links) or the id or nonce is malformed. |
| [`submitOutcome`](../packages/forms/src/submit-protocol.ts) | function | — | What a device does with an answer: `delivered` (stored now or before: drop it from the outbox), `retry` (keep it and try again later) or `rejected` (keep it, marked failed, for the respondent to fix or discard). Anything that isn't a `Su... |
| [`submitResponse`](../packages/forms/src/submit.ts) | function | — | _(no summary)_ |
| [`UPLOAD_MESSAGES`](../packages/forms/src/upload-handler.ts) | const | — | _(no summary)_ |
| [`uploadFields`](../packages/forms/src/uploads.ts) | function | — | The form's upload fields (`UPLOAD_FIELD_TYPES`: photo). |
| [`uploadRules`](../packages/forms/src/uploads.ts) | function | — | The rules for an upload field, or null when the field doesn't take files. |
| [`validateSubmission`](../packages/forms/src/server.ts) | function | — | Check a submission against the published definition. Never throws on a malformed submission: it returns `{ ok: false, errors: { "": … } }`. |
| [`verifyEditToken`](../packages/forms/src/edit-link.ts) | function | — | What a token says, or null when it is malformed, its signature does not match, it has expired (or claims to last longer than `ttlSeconds` from now), or there is no usable secret. Whether the nonce is still the response's is the caller's ... |
| [`withEditLinkHeaders`](../packages/forms/src/edit-link.ts) | function | — | The response, with `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store` added when the request carried an edit link; otherwise the same response, untouched. The link is a credential, so it never leaves in a Referer heade... |
| [`withEditToken`](../packages/forms/src/edit-link.ts) | function | — | A form link with the edit token added: `<formUrl>?edit=<token>` (or `&edit=` when it has a query). `param` names the parameter; `EDIT_LINK_PARAM` by default. |
| [`withHostOptions`](../packages/forms/src/fields.ts) | function | — | The definition with each `optionsFrom: { source: "host" }` field's options filled in from `hostOptions`: its own `props.options` first, then the host's list for its key (a value the field already has is not added twice). A key the host d... |

### Types (41)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerSnapshot };
export type { BeginUploadInput };
export type { CheckUploadsOptions };
export type { CheckedSubmission };
export type { CheckedUploads };
export type { ClientIpOptions };
export type { EditLinkClaims };
export type { EditLinkOptions };
export type { EditLinkRequestOptions };
export type { EditLinkUrlOptions };
export type { EditSecretLog };
export type { EditSecretReader };
export type { EditableResponse };
export type { HostOptions };
export type { MergeOptions };
export type { OptionSnapshot };
export type { RateLimitAnswer };
export type { RateLimitStore };
export type { RestoredAnswers };
export type { SignedUpload };
export type { StoredSubmissionRef };
export type { StoredUpload };
export type { SubmissionInput };
export type { SubmissionOptions };
export type { SubmissionRecord };
export type { SubmissionResult };
export type { SubmissionStore };
export type { SubmitFailureReason };
export type { SubmitOutcome };
export type { SubmitRequest };
export type { SubmitResponseOptions };
export type { SubmitResult };
export type { UploadForm };
export type { UploadGrant };
export type { UploadHandlerOptions };
export type { UploadMessages };
export type { UploadOwner };
export type { UploadRefusal };
export type { UploadRequest };
export type { UploadRules };
export type { UploadStore };
```

---

## @marktiderman/genesis-forms/destinations

**Barrel:** [`packages/forms/src/destinations.ts`](../packages/forms/src/destinations.ts)

### Other exports (76)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answerCell`](../packages/forms/src/destinations/row.ts) | function | — | One answer as a cell: numbers stay numbers (ratings, NPS), choices show their labels, a list is joined with ", ", yes/no reads "Yes"/"No", and a plugin type's `summarize` is used where it has one. |
| [`checkHookHost`](../packages/forms/src/destinations/hook-url.ts) | function | — | Checks that every address the URL's host resolves to is public. A host that resolves to nothing, or whose lookup fails, is refused too, as a retryable failure (DNS may be briefly down); a private address is final. |
| [`checkWebhookUrl`](../packages/forms/src/destinations/webhook.ts) | function | — | The URL from config, checked. Throws a `DeliveryError` naming the rule it broke (never the URL, which may hold a token). |
| [`clearGoogleOAuthTokenCache`](../packages/forms/src/destinations/google-oauth.ts) | function | — | Forgets cached OAuth access tokens (tests, or after a sheet is disconnected). |
| [`clearGoogleTokenCache`](../packages/forms/src/destinations/google-auth.ts) | function | — | Forgets cached tokens (tests, or after rotating a key). |
| [`columnLetter`](../packages/forms/src/destinations/sheets.ts) | function | — | A1 column letters: 0 → A, 25 → Z, 26 → AA. |
| [`conditionOf`](../packages/forms/src/destinations/condition.ts) | function | — | The destination's condition (`config.when`), or null when it has none. One that can't be read throws a permanent `DeliveryError` rather than meaning "send everything" or "send nothing". |
| [`createDeliveryRunner`](../packages/forms/src/destinations/runner.ts) | function | — | _(no summary)_ |
| [`createSecrets`](../packages/connect/src/secrets.ts) | function | — | Seals and opens secrets of one purpose with a keyring (see `parseKeyring` for what it takes). Derived keys are cached on the returned object. |
| [`DEDUPE_WINDOW`](../packages/forms/src/destinations/sheets.ts) | const | — | How many of the latest rows a redelivery checks for its id. |
| [`DEFAULT_BATCH_SIZE`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_ATTEMPTS`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_DEFERRALS`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_SHEET_NAME`](../packages/forms/src/destinations/sheets.ts) | const | — | _(no summary)_ |
| [`defaultBackoff`](../packages/forms/src/destinations/runner.ts) | const | — | 5 minutes, quadrupling each attempt, at most 24 hours: 5m, 20m, 80m, 5h20m, 21h20m, then 24h. Across the default 8 attempts that is about 3 days, as Standard Webhooks suggests. Each wait is jittered by up to ±20%, so deliveries that fail... |
| [`DeliveryError`](../packages/forms/src/destinations/types.ts) | class | — | A failure with a message that is safe to store. Destinations throw it internally and `deliveryFailure` turns it into a result; app-written destinations may do the same. |
| [`deliveryFailure`](../packages/forms/src/destinations/types.ts) | function | — | Any error as a failed result with a safe message. A `DeliveryError` keeps its message; anything else is reduced to its kind ("Timed out", "Network error"), because a raw message may hold a URL with a token in it. Timeouts and aborts are ... |
| [`deliveryOutcome`](../packages/forms/src/destinations/runner.ts) | function | — | Turns a destination's result into an outcome for a delivery on its `attempt`. |
| [`deriveSecretKey`](../packages/forms/src/destinations/secret-box.ts) | function | — | An AES-GCM key for one purpose, derived from the app secret with HKDF-SHA-256 (`info` naming the purpose; the salt empty unless `options.salt` is given). Use a different `info` for each kind of secret; keep it, and the salt, fixed once a... |
| [`DRIVE_FILE_SCOPE`](../packages/forms/src/destinations/google-oauth.ts) | const | — | Google's scope for files the person picked or created through the app. |
| [`emailBody`](../packages/forms/src/destinations/email.ts) | function | — | Plain text and HTML bodies from label/value lines, every value escaped. |
| [`emailDestination`](../packages/forms/src/destinations/email.ts) | function | — | _(no summary)_ |
| [`escapeFormula`](../packages/forms/src/destinations/row.ts) | function | — | A cell that a spreadsheet will never run as a formula when the text is opened elsewhere (a CSV export opened in Excel). Opt-in: use it when writing CSV, not for the sheet destination, whose RAW writes are already safe and would store the... |
| [`escapeHtml`](../packages/forms/src/destinations/email.ts) | function | — | _(no summary)_ |
| [`escapeSlack`](../packages/forms/src/destinations/slack.ts) | function | — | Text for Slack's mrkdwn: `&`, `<` and `>` escaped, which is all Slack asks. |
| [`GOOGLE_TOKEN_URL`](../packages/forms/src/destinations/google-auth.ts) | const | — | _(no summary)_ |
| [`googleAccessToken`](../packages/forms/src/destinations/google-auth.ts) | function | — | A cached or fresh access token. Throws a `DeliveryError` with a safe message on failure. |
| [`googleOAuthAccessToken`](../packages/forms/src/destinations/google-oauth.ts) | function | — | A cached or fresh access token for a refresh token, cached until a minute before it expires. |
| [`HEADER_SCAN_ROWS`](../packages/forms/src/destinations/sheets.ts) | const | — | How many rows the header read looks at to find the columns in use: the header row and the first responses under it. Bounded, so a tab with years of responses is never read whole just to learn its header. |
| [`headerSafe`](../packages/forms/src/destinations/email.ts) | function | — | A header value on one line: control characters (CR, LF, NUL…) and Unicode line separators become spaces, runs of spaces collapse, and it is cut to `max` characters. |
| [`hookHost`](../packages/forms/src/destinations/hook-url.ts) | function | — | The host as a screen may show it (never the path: a Slack or webhook path can be the secret). |
| [`HookUrlError`](../packages/forms/src/destinations/hook-url.ts) | class | — | An address that can't be used, with a reason safe to show and to store (never the address). |
| [`httpError`](../packages/forms/src/destinations/types.ts) | function | — | The error for a refused request. Retryable statuses (see `isRetryableStatus`) wait for the Retry-After header, else 60 seconds; every other status is permanent. |
| [`idempotencyKey`](../packages/forms/src/destinations/email.ts) | function | — | The idempotency key: the delivery id and the first 16 hex digits of SHA-256 of the sorted recipients, so a retried delivery never sends twice and one whose recipients changed meanwhile is a new send. |
| [`isCondition`](../packages/forms/src/destinations/condition.ts) | function | — | Whether a stored value has a `Condition`'s shape, nested at most `MAX_CONDITION_DEPTH` deep. |
| [`isPrivateHost`](../packages/forms/src/destinations/webhook.ts) | function | — | Whether a URL hostname is localhost or a private, loopback, link-local or unspecified address literal. |
| [`isPublicAddress`](../packages/forms/src/destinations/hook-url.ts) | function | — | Whether an IP address (v4 or v6) is a public one a hook may reach. Anything unparsable is not. |
| [`isRetryableStatus`](../packages/forms/src/destinations/types.ts) | function | — | Whether an HTTP status is worth retrying unchanged: 408, 425, 429 and 5xx. |
| [`isSafeAddress`](../packages/forms/src/destinations/email.ts) | function | — | A bare address that is safe as a header value: valid, one line, no display name. |
| [`isSafeFrom`](../packages/forms/src/destinations/email.ts) | function | — | A From value: a bare address, or `Name <address>` where the name has no quotes, angle brackets or line breaks. |
| [`isSecretError`](../packages/connect/src/secrets.ts) | function | — | Whether `error` is a `SecretError`, by its name and code rather than `instanceof`, so it also matches a copy bundled into another package (genesis-forms bundles one). |
| [`MAX_CONDITION_DEPTH`](../packages/forms/src/destinations/condition.ts) | const | — | How deep `all` / `any` / `not` may nest in a stored condition. |
| [`MAX_HOOK_URL_LENGTH`](../packages/forms/src/destinations/hook-url.ts) | const | — | _(no summary)_ |
| [`MAX_RECIPIENTS`](../packages/forms/src/destinations/email.ts) | const | — | Resend allows 50 recipients per email. |
| [`mergeHeader`](../packages/forms/src/destinations/sheets.ts) | function | — | The existing header plus any keys it does not have yet, in the order they arrive. A blank header cell keeps its place (dropping it would shift every later column away from the values stored under it), as do blank header cells over the `w... |
| [`MIN_WEBHOOK_SECRET_BYTES`](../packages/forms/src/destinations/webhook.ts) | const | — | The shortest signing secret, decoded: Standard Webhooks recommends 24 to 64 bytes. |
| [`newWebhookSecret`](../packages/forms/src/destinations/webhook.ts) | function | — | A new signing secret: `whsec_` and standard base64 of 32 random bytes, the form Standard Webhooks libraries read. Show it to the receiver once; keep it out of config. |
| [`openSecret`](../packages/forms/src/destinations/secret-box.ts) | function | — | Decrypts what `sealSecret` sealed with the same key and `aad`. Throws a permanent `DeliveryError` for an unknown format, a wrong key (rotated?) or a ciphertext from another row; never echoes the ciphertext. |
| [`parseHookUrl`](../packages/forms/src/destinations/hook-url.ts) | function | — | The address as it will be used (its fragment dropped), or a `HookUrlError` saying what is wrong with it. Checks the text only; `checkHookHost` checks where the name resolves. A `"slack"` address must be a Slack incoming webhook (`https:/... |
| [`parseKeyring`](../packages/connect/src/secrets.ts) | function | — | A keyring from config: an object, its JSON text (one environment variable: `{"active":"k2","keys":{"k1":"…","k2":"…"}}`), or a single bare key, which becomes `{ active: "k1", keys: { k1 } }` (how a single-key secret moves onto a keyring)... |
| [`passesCondition`](../packages/forms/src/destinations/condition.ts) | function | — | Whether a submission matches its destination's condition (true when there is none). Throws a `DeliveryError` when the condition can't be read. |
| [`refreshGoogleAccessToken`](../packages/forms/src/destinations/google-oauth.ts) | function | — | Trades a refresh token for an access token, uncached. `invalid_grant` (access revoked, or the account gone) is a permanent failure saying to connect the sheet again; 429 and 5xx are retryable. Never puts a token in an error message. |
| [`renderEmail`](../packages/forms/src/destinations/email.ts) | function | — | The default notification: subject `"<form title>: new response"` (or `config.subject`), then the meta columns, each answered field by label, the ending's title when the form has several, and the response id. |
| [`REQUEST_TIMEOUT_MS`](../packages/forms/src/destinations/types.ts) | const | — | Every outbound request gives up after this long, unless the destination is given another `timeoutMs`. |
| [`RESEND_API`](../packages/forms/src/destinations/email.ts) | const | — | _(no summary)_ |
| [`resendProvider`](../packages/forms/src/destinations/email.ts) | function | — | Resend's REST API. Sends the idempotency key, so a retry within Resend's 24-hour window never sends twice. A 409 for a concurrent request with the same key is retried; one for a key reused with a different body is not. |
| [`responseRow`](../packages/forms/src/destinations/row.ts) | function | — | The row for one submission. Columns: `id` (the response id), then `submitted_at` when given, then the app's `meta` columns in order, then one per field key in form order (blank when unanswered or hidden by logic). Content blocks get no c... |
| [`retryAfterSeconds`](../packages/forms/src/destinations/types.ts) | function | — | Seconds to wait from a Retry-After header, else the fallback. Only the two forms RFC 9110 defines are read: delta-seconds (digits only) and an IMF-fixdate (`Wed, 21 Oct 2026 07:28:00 GMT`); anything else (`-5`, `1.5`, a loose date) gets ... |
| [`rowFor`](../packages/forms/src/destinations/sheets.ts) | function | — | One cell per header column, blank where the row has no value; `escape` applies `escapeFormula` (default false). |
| [`sealSecret`](../packages/forms/src/destinations/secret-box.ts) | function | — | Encrypts `plaintext` bound to `aad` (the row it belongs to): `v1.<iv>.<ciphertext>`. |
| [`SecretError`](../packages/connect/src/secrets.ts) | class | — | A failure whose message is safe to log: never a key, a plaintext or a ciphertext. |
| [`secretKeyBytes`](../packages/forms/src/destinations/secret-box.ts) | function | — | The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32` prints), or the bytes themselves. Throws a `DeliveryError` naming the problem, never the key. |
| [`SENSITIVE_MASK`](../packages/forms/src/destinations/row.ts) | const | — | _(no summary)_ |
| [`SHEETS_API`](../packages/forms/src/destinations/sheets.ts) | const | — | _(no summary)_ |
| [`SHEETS_SCOPE`](../packages/forms/src/destinations/google-auth.ts) | const | — | _(no summary)_ |
| [`sheetsDestination`](../packages/forms/src/destinations/sheets.ts) | function | — | _(no summary)_ |
| [`signJwt`](../packages/forms/src/destinations/google-auth.ts) | function | — | A signed RS256 JWT. Throws a `DeliveryError` when the key is not a valid PKCS#8 RSA key. |
| [`signWebhook`](../packages/forms/src/destinations/webhook.ts) | function | — | The `webhook-signature` value for a message: `v1,<base64>`, or one such signature per secret, space-separated, when given several (a rotation). |
| [`SLACK_HOSTS`](../packages/forms/src/destinations/hook-url.ts) | const | — | The hosts a Slack incoming webhook lives on. |
| [`SLACK_VALUE_LIMIT`](../packages/forms/src/destinations/slack.ts) | const | — | Longest answer shown in full; longer ones are cut (the app has the rest). |
| [`slackDestination`](../packages/forms/src/destinations/slack.ts) | function | — | _(no summary)_ |
| [`slackMessage`](../packages/forms/src/destinations/slack.ts) | function | — | The message Slack gets for one submission: `{ text }` in Slack mrkdwn. |
| [`verifyWebhook`](../packages/forms/src/destinations/webhook.ts) | function | — | Checks a Standard Webhooks request: the timestamp is recent and one of the space-separated `v1` signatures matches. Compares in constant time (by WebCrypto `verify`). Never throws on a malformed request: returns false. |
| [`visibleInputs`](../packages/forms/src/destinations/row.ts) | function | — | Hidden and server inputs as recall and the webhook may show them: on an anonymous form identifying ones are left out, and sensitive ones are left out unless `sensitive` is `"include"`. |
| [`webhookDestination`](../packages/forms/src/destinations/webhook.ts) | function | — | _(no summary)_ |
| [`webhookPayload`](../packages/forms/src/destinations/webhook.ts) | function | — | The payload for one submission. Identifying answers stay out on anonymous forms. |

### Types (51)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Cell };
export type { ClaimRequest };
export type { ClaimedDelivery };
export type { DeliveryFailure };
export type { DeliveryItem };
export type { DeliveryOptions };
export type { DeliveryOutcome };
export type { DeliveryReport };
export type { DeliveryResult };
export type { DeliveryRunner };
export type { DeliveryRunnerOptions };
export type { DeliverySubmission };
export type { DeriveSecretKeyOptions };
export type { Destination };
export type { DestinationConfig };
export type { EmailConfig };
export type { EmailContent };
export type { EmailDestinationOptions };
export type { EmailMessage };
export type { EmailProvider };
export type { EmailRenderInput };
export type { GoogleOAuthClient };
export type { GoogleOAuthTokenOptions };
export type { GoogleServiceAccount };
export type { GoogleTokenOptions };
export type { HookKind };
export type { HttpDeps };
export type { Keyring };
export type { KeyringInput };
export type { OptionResolver };
export type { RefreshedGoogleToken };
export type { ResendOptions };
export type { ResolveContext };
export type { ResolveHost };
export type { ResponseRow };
export type { RowOptions };
export type { RunOptions };
export type { SecretErrorCode };
export type { Secrets };
export type { SecretsOptions };
export type { SheetConfig };
export type { SheetState };
export type { SheetsDestinationOptions };
export type { SlackDestinationOptions };
export type { SlackMessageInput };
export type { SlackMessageOptions };
export type { VerifyWebhookInput };
export type { WebCryptoKey };
export type { WebhookConfig };
export type { WebhookDestinationOptions };
export type { WebhookPayload };
```

---

## @marktiderman/genesis-forms/testing

**Barrel:** [`packages/forms/src/testing.ts`](../packages/forms/src/testing.ts)

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`compactEvents`](../packages/forms/src/events.ts) | function | — | Merge consecutive answer events to the same field, keeping the last value. Text inputs log one event per keystroke; the merged log replays to the same state, because the path is derived from values alone. |
| [`coverage`](../packages/forms/src/coverage.ts) | function | — | _(no summary)_ |
| [`recordScenario`](../packages/forms/src/scenario.ts) | function | — | Freeze a live engine as a scenario, with expectations filled from its current state. |
| [`runScenario`](../packages/forms/src/scenario.ts) | function | — | Replay a scenario's events (no clock) and compare against its expectations. |
| [`simulate`](../packages/forms/src/testing.ts) | function | — | _(no summary)_ |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CoverageOptions };
export type { CoverageReport };
export type { EndingCoverage };
export type { RecordScenarioOptions };
export type { Scenario };
export type { ScenarioExpectation };
export type { ScenarioResult };
export type { Simulation };
```

---

## @marktiderman/genesis-forms-builder

A visual builder for Genesis Forms definitions: questions, choices, show/hide and jump logic, endings, hidden inputs and settings, with live validation, path coverage, a live preview and a breaking-change diff between versions. It edits a definition and nothing else, so any app can host it. Part of the Genesis framework.

**Barrel:** [`packages/forms-builder/src/index.ts`](../packages/forms-builder/src/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FormBuilder`](../packages/forms-builder/src/FormBuilder.tsx) | `FormBuilderProps` | — | A visual editor for one form definition: questions, logic, endings, settings, with live checks and a live preview. It stores nothing; the host saves what `onChange` gives it and publishes what `actions` receive. |
| [`OptionListEditor`](../packages/forms-builder/src/OptionListEditor.tsx) | `OptionListEditorProps` | — | Edit a named option list a host keeps, such as an organization's "Locations": rename it; add, remove and reorder options; edit each one's label, description, picture and attributes; import from pasted CSV or a file with a preview of what... |

### Other exports (108)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AddBlockMenu`](../packages/forms-builder/src/questions.tsx) | function | — | The "Add" menu: every registered field type, grouped, then content blocks. |
| [`addEnding`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`addHidden`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`addRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`analyze`](../packages/forms-builder/src/analyze.ts) | function | — | Analyse a definition. Coverage only runs on a definition that parses, and stops after `maxStates` explored states so a large form stays responsive; when it stops early, its path warnings are left out (they would be guesses). Pass `parsed... |
| [`ATTRIBUTE_VALUE_SEPARATOR`](../packages/forms-builder/src/option-lists.ts) | const | — | Separates the values of a list attribute in one CSV cell: `riverside|hilltop`. |
| [`BLANK_TEMPLATE`](../packages/forms-builder/src/templates.ts) | const | — | An empty form: the one built-in starting point. |
| [`blockIdPrefix`](../packages/forms-builder/src/ops.ts) | function | — | The id prefix new blocks like `block` get. |
| [`BlockInspector`](../packages/forms-builder/src/questions.tsx) | function | — | _(no summary)_ |
| [`BuilderConfigContext`](../packages/forms-builder/src/editors.ts) | const | — | _(no summary)_ |
| [`BUILT_IN_FIELD_EDITORS`](../packages/forms-builder/src/structured-editors.tsx) | const | — | The builder's editors for the built-in structured types and the calculated type. |
| [`CALCULATED_FIELD_EDITOR`](../packages/forms-builder/src/calculated-editor.tsx) | const | — | _(no summary)_ |
| [`ChecksContext`](../packages/forms-builder/src/checks.ts) | const | — | _(no summary)_ |
| [`chosenOutputs`](../packages/forms-builder/src/outputs.ts) | function | — | The targets `field` uses, among those that apply to its type. |
| [`clearOutputs`](../packages/forms-builder/src/outputs.ts) | function | — | "Nowhere else": remove every target this field uses (props holding another value are left alone). |
| [`ConditionEditor`](../packages/forms-builder/src/logic.tsx) | function | — | _(no summary)_ |
| [`conditionFields`](../packages/forms-builder/src/ops.ts) | function | — | Every block id a condition reads. |
| [`conditionHidden`](../packages/forms-builder/src/ops.ts) | function | — | Every hidden input a condition reads. |
| [`createContent`](../packages/forms-builder/src/ops.ts) | function | — | A heading or text block. Pass `def` so its id is unused there. |
| [`createField`](../packages/forms-builder/src/ops.ts) | function | — | A new field block with a fresh id and a key unique in `def`. A matching editor in `editors` gives its label and props. Without `label` the field is titled after its type; pass `label: ""` for an untitled question (the builder's Add menu ... |
| [`createPageBreak`](../packages/forms-builder/src/ops.ts) | function | — | A page break. Pass `def` so its id is unused there. |
| [`createPresetField`](../packages/forms-builder/src/questions.tsx) | function | — | A new field from a preset: its base type's default props with the preset's `props` laid over them (top-level keys replace), then the preset's `field` settings. The label is `field.label`, else the preset's label. |
| [`DEFAULT_TABLE_COLUMNS`](../packages/forms-builder/src/ops.ts) | const | — | The columns a new `table` field starts with; authors rename and add to them. |
| [`defaultEndingId`](../packages/forms-builder/src/ops.ts) | function | — | The ending a form finishes at when no jump names one, as the engine picks it: `"default"`, else the first. |
| [`defaultPalette`](../packages/forms-builder/src/questions.tsx) | function | — | The palette when the host names none: every registered type except the opt-in ones, the structured types (`STRUCTURED_FIELD_TYPES`), the calculated type (`COMPUTED_FIELD_TYPES`) and the types that need the host to store files (`UPLOAD_FI... |
| [`defaultProps`](../packages/forms-builder/src/ops.ts) | function | — | Default props for a new field, so it is valid as soon as it is added. A matching editor in `editors` is asked first. Choice options get fresh values from `newOptionValue()`, so a field retyped to choice never brings back a value earlier ... |
| [`describeRule`](../packages/forms-builder/src/logic.tsx) | function | — | _(no summary)_ |
| [`diffDefinitions`](../packages/forms-builder/src/diff.ts) | function | — | _(no summary)_ |
| [`duplicateBlock`](../packages/forms-builder/src/ops.ts) | function | — | A copy right after the original, with a new id and key. Rules are not copied. Pass `copyId` (from `freshId(blockIdPrefix(block), def)`) to keep the edit pure; without it a new id is made here. A `copyId` already in the form changes nothing. |
| [`emptyForm`](../packages/forms-builder/src/ops.ts) | function | — | An empty, valid definition. |
| [`EndingsPanel`](../packages/forms-builder/src/settings.tsx) | function | — | The endings, as cards in a row: title, message, which rules lead there. The default one (the first) is where a form ends when no jump picks another. |
| [`FindingsList`](../packages/forms-builder/src/FormBuilder.tsx) | function | — | _(no summary)_ |
| [`flowCheck`](../packages/forms-builder/src/flow.tsx) | function | — | Sum up the path checks: every path ends, some do not, too many to check, or the form must be fixed first. |
| [`FlowMap`](../packages/forms-builder/src/flow.tsx) | const | — | The form's flow: its steps in order with arrows between them, the jumps branching off each step, and the endings. The chip sums up the path checks; "Try a path" lights up where one answer leads. |
| [`formIds`](../packages/forms-builder/src/ops.ts) | function | — | Every id in a form: blocks, rules, endings and the form's own. |
| [`formulaNames`](../packages/forms-builder/src/calculated-editor.tsx) | function | — | The answers a formula in `field` may name: every other question (a table by its columns), and calculated ones before it. |
| [`freshId`](../packages/forms-builder/src/ops.ts) | function | — | A new id not in `taken` (a form's ids, or any list). It asks the current generator again until it gets an unused one, so a host generator (a counter in tests) may restart; after 1000 repeats it falls back to random ids. `Object.prototype... |
| [`getTemplate`](../packages/forms-builder/src/templates.ts) | const | — | Find a template by id in `templates` (default: the built-ins). |
| [`HIDDEN_OPERATORS`](../packages/forms-builder/src/ops.ts) | const | — | The operators a hidden input of each type offers in logic. |
| [`historyReducer`](../packages/forms-builder/src/history.ts) | value | — | _(no summary)_ |
| [`hostListAttributes`](../packages/forms-builder/src/host-options.ts) | function | — | The attribute names a list offers for filtering: its `attributes`, else those on its sample options. |
| [`hostOptionsOf`](../packages/forms-builder/src/option-lists.ts) | function | — | The lists as `hostOptions` for `createForm`, `<Form>` and `validateSubmission`, by key. |
| [`insertBlock`](../packages/forms-builder/src/ops.ts) | function | — | Insert `block` at `index` (default: the end). |
| [`isUnchanged`](../packages/forms-builder/src/diff.ts) | const | — | True when the two definitions are the same form, byte for byte once canonicalized. |
| [`JsonPanel`](../packages/forms-builder/src/settings.tsx) | function | — | The whole definition as JSON, editable. Applied only when it parses and passes `parseForm`. |
| [`jumpTarget`](../packages/forms-builder/src/logic.tsx) | function | — | Where a new jump after block `from` goes: the next step, else the default ending; null when there is neither. Pure: it makes no ids. |
| [`LogicAndEndingsPanel`](../packages/forms-builder/src/settings.tsx) | function | — | Logic and endings in one panel: the rules, then the endings they can send people to, with the flow map beside them (under them in a narrow container). What the builder shows under "Logic and endings"; a host with its own tabs can render ... |
| [`LogicPanel`](../packages/forms-builder/src/logic.tsx) | function | — | The rules, as cards that read as sentences ("If [question] [is at most] [2] go to [What went wrong?]"), in the order they run. Drag a card by its grip or move it from the keyboard; its menu changes its kind, moves or deletes it. |
| [`MAX_HISTORY`](../packages/forms-builder/src/history.ts) | const | — | Most undo steps kept. Older ones are dropped. |
| [`mergeOptions`](../packages/forms-builder/src/option-lists.ts) | function | — | The list after an import: an imported option whose value is already in the list replaces its details in place (an empty label, description or image in the import keeps the old one; the imported attributes replace the old ones when it has... |
| [`moveBlock`](../packages/forms-builder/src/ops.ts) | function | — | Move a block to `toIndex` (clamped). Rules keep working: they point at ids. An option filter whose question now comes after it is removed. |
| [`moveRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`newId`](../packages/forms-builder/src/ops.ts) | function | — | A new id from the current generator (random by default). It may repeat one already in a form: use `freshId` there. |
| [`newOptionValue`](../packages/forms-builder/src/ops.ts) | const | — | A value for a new choice option. Random, not derived from the label, so it never repeats a value a removed option had: earlier answers that chose that option must not read as the new one. Call it outside a reducer. |
| [`OPERATOR_LABEL`](../packages/forms-builder/src/logic.tsx) | const | — | _(no summary)_ |
| [`operatorsFor`](../packages/forms-builder/src/ops.ts) | function | — | The operators a field type offers, from its manifest. |
| [`OPTION_LIST_LIMITS`](../packages/forms-builder/src/option-lists.ts) | const | — | Bounds on an imported list, beyond `OPTION_LIMITS`. |
| [`optionListCsv`](../packages/forms-builder/src/option-lists.ts) | function | — | The options as CSV, for a spreadsheet: `value,label,description,image`, then one column per attribute. |
| [`outputPropsFor`](../packages/forms-builder/src/outputs.ts) | function | — | The props of `field`'s targets that still apply to `type`, to carry over a change of type (which otherwise resets the props). |
| [`outputsFor`](../packages/forms-builder/src/outputs.ts) | function | — | The targets a field of `type` may use, in the host's order, each id once. |
| [`outputUsedBy`](../packages/forms-builder/src/outputs.ts) | function | — | Another question of the form that already uses `target`, for the "moves it here" hint. |
| [`palettePresets`](../packages/forms-builder/src/questions.tsx) | function | — | The host's presets the Add menu offers, in their order. A preset whose base type has no registered manifest and no editor is left out. It is listed in its own `category`, else in its base type's. Its base type need not be in the palette:... |
| [`paletteTypes`](../packages/forms-builder/src/questions.tsx) | function | — | The field types authors may add: `palette` in its order, else the default palette. A type needs a registered manifest or an editor. |
| [`parseCsvRows`](../packages/forms-builder/src/option-lists.ts) | function | — | Rows of CSV text (RFC 4180: quoted cells may hold commas, quotes as `""` and line breaks), or of tab-separated text, as a spreadsheet copies it: tabs are the separator when the first line has a tab and no comma. A byte order mark is drop... |
| [`parseOptionListCsv`](../packages/forms-builder/src/option-lists.ts) | function | — | Read a pasted or uploaded option list. The first row is a header naming `value`, `label`, `description` and `image` (any order, any case); any other column becomes an attribute, its cell split on `|` into a list. A file with only a `labe... |
| [`PATH_FINDINGS`](../packages/forms-builder/src/analyze.ts) | const | — | The codes of the path checks, the ones the flow map sums up. |
| [`Preview`](../packages/forms-builder/src/preview.tsx) | function | — | The real `<Form>` in a phone-sized frame. It starts over when what is asked changes (questions, logic, layout, Restart); a wording edit keeps the answers given so far and shows the new text. Submitting only shows the ending; nothing is s... |
| [`questionNumbers`](../packages/forms-builder/src/questions.tsx) | function | — | Each field's number among the questions (headings, text and page breaks are not numbered). |
| [`QuestionsPanel`](../packages/forms-builder/src/questions.tsx) | function | — | The Questions panel: an outline of every block on the left (select, drag or keyboard-reorder, add), the selected block's editor in the middle and, when `preview` is given, the live preview on the right. In a narrow container the columns ... |
| [`removeBlock`](../packages/forms-builder/src/ops.ts) | function | — | Remove a block, its recall tokens (they become their fallback text) and every rule that reads it, shows or hides it, or jumps from it. A jump *to* it goes to the next step after it instead, or the default ending. |
| [`removeEnding`](../packages/forms-builder/src/ops.ts) | function | — | Remove an ending and the jumps that go to it. The first ending is the default and stays. |
| [`removeHidden`](../packages/forms-builder/src/ops.ts) | function | — | Remove a hidden input, the rules that read it and its recall tokens. |
| [`removeRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`RESERVED_OUTPUT_PROPS`](../packages/forms-builder/src/outputs.ts) | const | — | Props the field types themselves own (a choice's `options`, a calculated field's `formula`, a table's `columns`, limits and labels). A target can't set one: `outputsFor` leaves such a target out and `setOutput` ignores it, so turning an ... |
| [`RowLayoutContext`](../packages/forms-builder/src/controls.tsx) | const | — | A host's row layout for the rows inside it (the builder sets it around its settings panel). |
| [`RuleEditor`](../packages/forms-builder/src/logic.tsx) | function | — | _(no summary)_ |
| [`RuleKindChip`](../packages/forms-builder/src/logic.tsx) | function | — | The chip naming a rule's kind: Jump (violet), Show only when / Hide when (amber). |
| [`ruleRefs`](../packages/forms-builder/src/ops.ts) | function | — | Every block id a rule depends on: what it reads, targets, or jumps from or to. |
| [`RuleSentence`](../packages/forms-builder/src/logic.tsx) | function | — | _(no summary)_ |
| [`sampleHostOptions`](../packages/forms-builder/src/host-options.ts) | function | — | The stand-in options, by key, from the host's lists: what the builder's preview fills in. |
| [`setIdGenerator`](../packages/forms-builder/src/ops.ts) | function | — | Replace the id generator (block, option, rule and form ids), for example with a counter so tests and snapshots are stable. Pass nothing to go back to random ids. It is process-wide; ids must stay unique within a form. |
| [`setOptions`](../packages/forms-builder/src/ops.ts) | function | — | Set a choice field's options. Existing values are kept (answers store values) and made unique; an option without one gets `newOptionValue()` here, so pass values in (see `withOptionValues`) to keep the edit pure. A removed value leaves t... |
| [`setOptionsFilter`](../packages/forms-builder/src/ops.ts) | function | — | Show a choice question only the app's options matching an earlier answer (`props.optionsFrom.filter: { attribute, field }`, `field` being that question's key), or, with `null`, all of them again. Does nothing to a question whose options ... |
| [`setOptionsSource`](../packages/forms-builder/src/ops.ts) | function | — | Where a choice field's options come from. `{ key }`: the app's list with that key (`props.optionsFrom: { source: "host", key }`); the field's typed options go, with the rules that compared them. `{ options }`: typed here, these options (... |
| [`setOutput`](../packages/forms-builder/src/outputs.ts) | function | — | Turn a target on or off for one field. On sets `props[prop] = value`, replacing another target with the same prop; unless the target is `multiple`, it is also turned off on every other question that uses it. Off removes the prop when it ... |
| [`setPrefill`](../packages/forms-builder/src/ops.ts) | function | — | Preselect a choice question from a link's query parameter (`props.prefill: { param, hideWhenPrefilled? }`), or, with `null`, stop. A parameter that isn't a well-formed name (`isPrefillParam`) changes nothing. |
| [`SettingsPanel`](../packages/forms-builder/src/settings.tsx) | function | — | _(no summary)_ |
| [`slugKey`](../packages/forms-builder/src/ops.ts) | function | — | `"How was class?"` → `"how_was_class"`. Always a valid, non-empty key. |
| [`slugOptionValue`](../packages/forms-builder/src/option-lists.ts) | function | — | A value made from a label: lower case, accents dropped, anything but letters and digits as one `-`, at most `OPTION_LIST_LIMITS.value` characters. "Zoë's Gym" becomes "zoes-gym". |
| [`STARTER_TEMPLATES`](../packages/forms-builder/src/templates.ts) | const | — | Ready-made examples, each showing which field suits which question: a rating or NPS for a score, long text for "why", a table for an action plan, a list for short items, notes at moments for a video and highlights for a reading. Opt-in, ... |
| [`starterCondition`](../packages/forms-builder/src/ops.ts) | function | — | A starter rule for a field: the first operator its type offers, compared with a sensible first value. Callers edit it from there. |
| [`starterRule`](../packages/forms-builder/src/logic.tsx) | function | — | A new show rule: show the last field when the first one is answered a certain way. A jump goes to the next step, else the default ending; null when there is nothing to jump to. |
| [`starterValue`](../packages/forms-builder/src/ops.ts) | function | — | A first value to compare `field` with. A matching editor in `editors` is asked first. |
| [`TEMPLATES`](../packages/forms-builder/src/templates.ts) | const | — | The built-in templates: just `BLANK_TEMPLATE`. Spread it into your own list: `[...TEMPLATES, ...mine]`. |
| [`UNARY_OPERATORS`](../packages/forms-builder/src/ops.ts) | const | — | Operators that take no right-hand value. |
| [`uniqueName`](../packages/forms-builder/src/ops.ts) | function | — | `base`, or `base_2`, `base_3`… whichever is not in `taken` (nor an `Object.prototype` name). |
| [`updateBlock`](../packages/forms-builder/src/ops.ts) | function | — | Change a block. `undefined` in the patch removes that property, so an optional flag goes away instead of being stored as `false` or `undefined`. A key is made unique if it clashes; a changed field type gets that type's default props and ... |
| [`updateEnding`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateForm`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateHidden`](../packages/forms-builder/src/ops.ts) | function | — | Change a hidden input. Renaming it updates the conditions and the recall placeholders (`{{hidden:name}}`) that use it; a new type removes the rules whose operator or value no longer fits it. |
| [`updateRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateSettings`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`useBuilderHistory`](../packages/forms-builder/src/history.ts) | function | — | Undoable editing state for a definition. |
| [`useChecks`](../packages/forms-builder/src/checks.ts) | function | — | The checks state of the builder around a panel; null when a panel is used on its own (every check shows). |
| [`usesOutput`](../packages/forms-builder/src/outputs.ts) | function | — | Whether `field` uses `target`: its prop holds the target's value. |
| [`valueForOperator`](../packages/forms-builder/src/logic.tsx) | function | — | The value a comparison keeps when its operator changes to `op`. Built-in types switch between a list ("is one of") and a single value. A type whose field editor defines `starterValue` owns its value shape and gets that for the new operat... |
| [`visibleFindings`](../packages/forms-builder/src/checks.ts) | function | — | The findings to show the author: a fresh question's missing title is held back, and the empty form's "Add at least one question" reads as a hint (`info`), not an error. `Analysis.canPublish` still counts every error. |
| [`withOptionValues`](../packages/forms-builder/src/ops.ts) | function | — | `options` with a new value, unused among them, for each one that has none. Call it outside a reducer. |

### Types (37)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Analysis };
export type { Apply };
export type { BlockKinds };
export type { BlockPatch };
export type { BuilderActionsState };
export type { BuilderConfig };
export type { BuilderHistory };
export type { BuilderHistoryOptions };
export type { BuilderHistoryState };
export type { BuilderTab };
export type { Change };
export type { ChangeKind };
export type { ChecksState };
export type { ConditionValueProps };
export type { FieldPanelProps };
export type { FieldPreset };
export type { FieldTypeDefaults };
export type { FieldTypeEditor };
export type { Finding };
export type { FindingCode };
export type { FindingLevel };
export type { FlowCheck };
export type { FormBuilderHandle };
export type { FormSettingKey };
export type { FormTemplate };
export type { HiddenSpec };
export type { History };
export type { HostOptionList };
export type { IdGenerator };
export type { ImportRow };
export type { NewField };
export type { OptionList };
export type { OptionListImport };
export type { OutputTarget };
export type { PaletteEntry };
export type { PresetEntry };
export type { SettingsRowSlotProps };
```

---

## @marktiderman/genesis-forms-builder/ops

**Barrel:** [`packages/forms-builder/src/ops.ts`](../packages/forms-builder/src/ops.ts)

### Other exports (61)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`addEnding`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`addHidden`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`addRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`ATTRIBUTE_VALUE_SEPARATOR`](../packages/forms-builder/src/option-lists.ts) | const | — | Separates the values of a list attribute in one CSV cell: `riverside|hilltop`. |
| [`blockIdPrefix`](../packages/forms-builder/src/ops.ts) | function | — | The id prefix new blocks like `block` get. |
| [`chosenOutputs`](../packages/forms-builder/src/outputs.ts) | function | — | The targets `field` uses, among those that apply to its type. |
| [`clearOutputs`](../packages/forms-builder/src/outputs.ts) | function | — | "Nowhere else": remove every target this field uses (props holding another value are left alone). |
| [`conditionFields`](../packages/forms-builder/src/ops.ts) | function | — | Every block id a condition reads. |
| [`conditionHidden`](../packages/forms-builder/src/ops.ts) | function | — | Every hidden input a condition reads. |
| [`createContent`](../packages/forms-builder/src/ops.ts) | function | — | A heading or text block. Pass `def` so its id is unused there. |
| [`createField`](../packages/forms-builder/src/ops.ts) | function | — | A new field block with a fresh id and a key unique in `def`. A matching editor in `editors` gives its label and props. Without `label` the field is titled after its type; pass `label: ""` for an untitled question (the builder's Add menu ... |
| [`createPageBreak`](../packages/forms-builder/src/ops.ts) | function | — | A page break. Pass `def` so its id is unused there. |
| [`DEFAULT_TABLE_COLUMNS`](../packages/forms-builder/src/ops.ts) | const | — | The columns a new `table` field starts with; authors rename and add to them. |
| [`defaultEndingId`](../packages/forms-builder/src/ops.ts) | function | — | The ending a form finishes at when no jump names one, as the engine picks it: `"default"`, else the first. |
| [`defaultProps`](../packages/forms-builder/src/ops.ts) | function | — | Default props for a new field, so it is valid as soon as it is added. A matching editor in `editors` is asked first. Choice options get fresh values from `newOptionValue()`, so a field retyped to choice never brings back a value earlier ... |
| [`duplicateBlock`](../packages/forms-builder/src/ops.ts) | function | — | A copy right after the original, with a new id and key. Rules are not copied. Pass `copyId` (from `freshId(blockIdPrefix(block), def)`) to keep the edit pure; without it a new id is made here. A `copyId` already in the form changes nothing. |
| [`emptyForm`](../packages/forms-builder/src/ops.ts) | function | — | An empty, valid definition. |
| [`formIds`](../packages/forms-builder/src/ops.ts) | function | — | Every id in a form: blocks, rules, endings and the form's own. |
| [`freshId`](../packages/forms-builder/src/ops.ts) | function | — | A new id not in `taken` (a form's ids, or any list). It asks the current generator again until it gets an unused one, so a host generator (a counter in tests) may restart; after 1000 repeats it falls back to random ids. `Object.prototype... |
| [`HIDDEN_OPERATORS`](../packages/forms-builder/src/ops.ts) | const | — | The operators a hidden input of each type offers in logic. |
| [`hostOptionsOf`](../packages/forms-builder/src/option-lists.ts) | function | — | The lists as `hostOptions` for `createForm`, `<Form>` and `validateSubmission`, by key. |
| [`insertBlock`](../packages/forms-builder/src/ops.ts) | function | — | Insert `block` at `index` (default: the end). |
| [`mergeOptions`](../packages/forms-builder/src/option-lists.ts) | function | — | The list after an import: an imported option whose value is already in the list replaces its details in place (an empty label, description or image in the import keeps the old one; the imported attributes replace the old ones when it has... |
| [`moveBlock`](../packages/forms-builder/src/ops.ts) | function | — | Move a block to `toIndex` (clamped). Rules keep working: they point at ids. An option filter whose question now comes after it is removed. |
| [`moveRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`newId`](../packages/forms-builder/src/ops.ts) | function | — | A new id from the current generator (random by default). It may repeat one already in a form: use `freshId` there. |
| [`newOptionValue`](../packages/forms-builder/src/ops.ts) | const | — | A value for a new choice option. Random, not derived from the label, so it never repeats a value a removed option had: earlier answers that chose that option must not read as the new one. Call it outside a reducer. |
| [`operatorsFor`](../packages/forms-builder/src/ops.ts) | function | — | The operators a field type offers, from its manifest. |
| [`OPTION_LIST_LIMITS`](../packages/forms-builder/src/option-lists.ts) | const | — | Bounds on an imported list, beyond `OPTION_LIMITS`. |
| [`optionListCsv`](../packages/forms-builder/src/option-lists.ts) | function | — | The options as CSV, for a spreadsheet: `value,label,description,image`, then one column per attribute. |
| [`outputPropsFor`](../packages/forms-builder/src/outputs.ts) | function | — | The props of `field`'s targets that still apply to `type`, to carry over a change of type (which otherwise resets the props). |
| [`outputsFor`](../packages/forms-builder/src/outputs.ts) | function | — | The targets a field of `type` may use, in the host's order, each id once. |
| [`outputUsedBy`](../packages/forms-builder/src/outputs.ts) | function | — | Another question of the form that already uses `target`, for the "moves it here" hint. |
| [`parseCsvRows`](../packages/forms-builder/src/option-lists.ts) | function | — | Rows of CSV text (RFC 4180: quoted cells may hold commas, quotes as `""` and line breaks), or of tab-separated text, as a spreadsheet copies it: tabs are the separator when the first line has a tab and no comma. A byte order mark is drop... |
| [`parseOptionListCsv`](../packages/forms-builder/src/option-lists.ts) | function | — | Read a pasted or uploaded option list. The first row is a header naming `value`, `label`, `description` and `image` (any order, any case); any other column becomes an attribute, its cell split on `|` into a list. A file with only a `labe... |
| [`removeBlock`](../packages/forms-builder/src/ops.ts) | function | — | Remove a block, its recall tokens (they become their fallback text) and every rule that reads it, shows or hides it, or jumps from it. A jump *to* it goes to the next step after it instead, or the default ending. |
| [`removeEnding`](../packages/forms-builder/src/ops.ts) | function | — | Remove an ending and the jumps that go to it. The first ending is the default and stays. |
| [`removeHidden`](../packages/forms-builder/src/ops.ts) | function | — | Remove a hidden input, the rules that read it and its recall tokens. |
| [`removeRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`RESERVED_OUTPUT_PROPS`](../packages/forms-builder/src/outputs.ts) | const | — | Props the field types themselves own (a choice's `options`, a calculated field's `formula`, a table's `columns`, limits and labels). A target can't set one: `outputsFor` leaves such a target out and `setOutput` ignores it, so turning an ... |
| [`ruleRefs`](../packages/forms-builder/src/ops.ts) | function | — | Every block id a rule depends on: what it reads, targets, or jumps from or to. |
| [`setIdGenerator`](../packages/forms-builder/src/ops.ts) | function | — | Replace the id generator (block, option, rule and form ids), for example with a counter so tests and snapshots are stable. Pass nothing to go back to random ids. It is process-wide; ids must stay unique within a form. |
| [`setOptions`](../packages/forms-builder/src/ops.ts) | function | — | Set a choice field's options. Existing values are kept (answers store values) and made unique; an option without one gets `newOptionValue()` here, so pass values in (see `withOptionValues`) to keep the edit pure. A removed value leaves t... |
| [`setOptionsFilter`](../packages/forms-builder/src/ops.ts) | function | — | Show a choice question only the app's options matching an earlier answer (`props.optionsFrom.filter: { attribute, field }`, `field` being that question's key), or, with `null`, all of them again. Does nothing to a question whose options ... |
| [`setOptionsSource`](../packages/forms-builder/src/ops.ts) | function | — | Where a choice field's options come from. `{ key }`: the app's list with that key (`props.optionsFrom: { source: "host", key }`); the field's typed options go, with the rules that compared them. `{ options }`: typed here, these options (... |
| [`setOutput`](../packages/forms-builder/src/outputs.ts) | function | — | Turn a target on or off for one field. On sets `props[prop] = value`, replacing another target with the same prop; unless the target is `multiple`, it is also turned off on every other question that uses it. Off removes the prop when it ... |
| [`setPrefill`](../packages/forms-builder/src/ops.ts) | function | — | Preselect a choice question from a link's query parameter (`props.prefill: { param, hideWhenPrefilled? }`), or, with `null`, stop. A parameter that isn't a well-formed name (`isPrefillParam`) changes nothing. |
| [`slugKey`](../packages/forms-builder/src/ops.ts) | function | — | `"How was class?"` → `"how_was_class"`. Always a valid, non-empty key. |
| [`slugOptionValue`](../packages/forms-builder/src/option-lists.ts) | function | — | A value made from a label: lower case, accents dropped, anything but letters and digits as one `-`, at most `OPTION_LIST_LIMITS.value` characters. "Zoë's Gym" becomes "zoes-gym". |
| [`starterCondition`](../packages/forms-builder/src/ops.ts) | function | — | A starter rule for a field: the first operator its type offers, compared with a sensible first value. Callers edit it from there. |
| [`starterValue`](../packages/forms-builder/src/ops.ts) | function | — | A first value to compare `field` with. A matching editor in `editors` is asked first. |
| [`UNARY_OPERATORS`](../packages/forms-builder/src/ops.ts) | const | — | Operators that take no right-hand value. |
| [`uniqueName`](../packages/forms-builder/src/ops.ts) | function | — | `base`, or `base_2`, `base_3`… whichever is not in `taken` (nor an `Object.prototype` name). |
| [`updateBlock`](../packages/forms-builder/src/ops.ts) | function | — | Change a block. `undefined` in the patch removes that property, so an optional flag goes away instead of being stored as `false` or `undefined`. A key is made unique if it clashes; a changed field type gets that type's default props and ... |
| [`updateEnding`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateForm`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateHidden`](../packages/forms-builder/src/ops.ts) | function | — | Change a hidden input. Renaming it updates the conditions and the recall placeholders (`{{hidden:name}}`) that use it; a new type removes the rules whose operator or value no longer fits it. |
| [`updateRule`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`updateSettings`](../packages/forms-builder/src/ops.ts) | function | — | _(no summary)_ |
| [`usesOutput`](../packages/forms-builder/src/outputs.ts) | function | — | Whether `field` uses `target`: its prop holds the target's value. |
| [`withOptionValues`](../packages/forms-builder/src/ops.ts) | function | — | `options` with a new value, unused among them, for each one that has none. Call it outside a reducer. |

### Types (9)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BlockPatch };
export type { FieldTypeDefaults };
export type { HiddenSpec };
export type { IdGenerator };
export type { ImportRow };
export type { NewField };
export type { OptionList };
export type { OptionListImport };
export type { OutputTarget };
```

---

## @marktiderman/genesis-forms-devtools

Developer tools for Genesis Forms: an inspector with live state, a time-travel event timeline and a server-check panel with tamper mode, a flow map, a logic trace and path coverage. Mount it in a playground or in an app during development. Part of the Genesis framework.

**Barrel:** [`packages/forms-devtools/src/index.ts`](../packages/forms-devtools/src/index.ts)

### Components (3)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`CoveragePanel`](../packages/forms-devtools/src/coverage-panel.tsx) | `CoveragePanelProps` | — | Symbolic path coverage of the definition: unreachable blocks, rules that never fire, and for each ending whether a response can reach it, with a witness to load into the playground. |
| [`ErrorBoundary`](../packages/forms-devtools/src/ErrorBoundary.tsx) | `ErrorBoundaryProps` | — | Catches a render error below it and shows a readable message instead of unmounting the whole page. React 19 still needs a class for this. |
| [`Inspector`](../packages/forms-devtools/src/Inspector.tsx) | `InspectorProps` | — | The Genesis Forms inspector: state, event timeline with time travel, and the server check. Answers to sensitive and identifying fields are masked until "Reveal sensitive values" is switched on. Each tab renders inside an error boundary, ... |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`buildFlowGraph`](../packages/forms-devtools/src/flow.tsx) | function | — | The form as a graph: one node per step and ending, an edge to the next block in order and one per jump rule. With `state`, nodes and edges carry the respondent's path, the same way `computePath` walks it. |
| [`ContextEditor`](../packages/forms-devtools/src/panels.tsx) | function | — | Edit the server-resolved context (JSON). Calls `onChange` only with valid JSON objects, once typing pauses for `debounceMs` (default 400). |
| [`decodeShare`](../packages/forms-devtools/src/share.ts) | function | — | Decode a share hash. Returns null for anything malformed, oversized or not a valid form, or whose event values or context nest deeper than 32 levels. |
| [`encodeShare`](../packages/forms-devtools/src/share.ts) | function | — | Encode a payload for a URL hash (deflate-raw + base64url). Keystroke-level answers are compacted (consecutive answers to one field keep the last), answers to sensitive and identifying fields are blanked, and `at` timestamps, the server c... |
| [`endingNodeId`](../packages/forms-devtools/src/flow.tsx) | const | — | Node id of an ending; `end` when the form defines no endings. |
| [`FLOW_NODE_HEIGHT`](../packages/forms-devtools/src/flow.tsx) | const | — | _(no summary)_ |
| [`FLOW_NODE_WIDTH`](../packages/forms-devtools/src/flow.tsx) | const | — | _(no summary)_ |
| [`FlowMapPanel`](../packages/forms-devtools/src/flow.tsx) | function | — | The form's blocks as a graph, laid out with dagre and drawn with React Flow. The respondent's path and the block on screen are highlighted live; blocks hidden by rules are dimmed. Needs `@xyflow/react/dist/base.css` (the devtools stylesh... |
| [`JsonView`](../packages/forms-devtools/src/panels.tsx) | function | — | _(no summary)_ |
| [`layoutFlowGraph`](../packages/forms-devtools/src/flow.tsx) | function | — | Top-to-bottom dagre layout. Positions are node centers. Depends only on the graph's shape. |
| [`LogicTracePanel`](../packages/forms-devtools/src/trace.tsx) | function | — | "Why is this hidden?" Pick a block (by default, the one on screen) and read `explain()` in plain English: visibility, the jump that skipped it, each show/hide rule with its result, and validation. |
| [`MAX_SHARE_BYTES`](../packages/forms-devtools/src/share.ts) | const | — | The largest payload, as JSON bytes, a share link may carry. `encodeShare` throws above it and `decodeShare` rejects anything that inflates past it (a decompression bomb guard). |
| [`pretty`](../packages/forms-devtools/src/panels.tsx) | const | — | JSON for display. Deep, wide, circular or huge values are cut with a note instead of throwing or freezing the page (a share link can carry anything). |
| [`ServerPanel`](../packages/forms-devtools/src/panels.tsx) | function | — | What the server would accept: the event log replayed against the definition with server-resolved context. Tamper mode adds what a hostile client might send (a forged server input, an unknown field, a value for a hidden field) so you can ... |
| [`StatePanel`](../packages/forms-devtools/src/panels.tsx) | function | — | Live path, visibility, values and errors. Values are shown by field key; sensitive values are masked unless `reveal` is set. |
| [`TimelinePanel`](../packages/forms-devtools/src/panels.tsx) | function | — | The event log with time travel. Scrubbing replays the first N events into a separate engine, so the live form is untouched; "Continue from here" hands the prefix back to the host to restart the form at that point. The cursor resets when ... |
| [`witnessEvents`](../packages/forms-devtools/src/coverage-panel.tsx) | function | — | The events that replay a coverage witness: its answers in path order, then submit. |

### Types (10)

Type-only exports not consumed as a component's `Props`.

```ts
export type { EncodeShareOptions };
export type { FlowEdge };
export type { FlowGraph };
export type { FlowGraphState };
export type { FlowLayout };
export type { FlowNode };
export type { FlowNodeStatus };
export type { InspectorTab };
export type { PrettyOptions };
export type { SharePayload };
```

---

## @marktiderman/genesis-forms-native

The React Native renderer for Genesis Forms: <FormFocus>, one question or content step per screen, with keyboard-aware scrolling, accessibility focus and announcements, Dynamic Type, reduced motion, a theme seam for system or Genesis colors, and seams for drafts, an offline outbox and photo uploads. The same definitions run on web, native and the server. Part of the Genesis framework.

**Barrel:** [`packages/forms-native/src/index.ts`](../packages/forms-native/src/index.ts)

### Components (4)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Button`](../packages/forms-native/src/parts.tsx) | `ButtonProps` | — | A button drawn from the theme: at least 48 points tall, and it grows with the text size. |
| [`ChoiceRow`](../packages/forms-native/src/chrome.tsx) | `ChoiceRowProps` | — | One option: the whole row is the target (at least 52 points tall), a real radio or checkbox. |
| [`FieldChrome`](../packages/forms-native/src/chrome.tsx) | `FieldChromeProps` | — | _(no summary)_ |
| [`FormFocus`](../packages/forms-native/src/FormFocus.tsx) | `FormFocusProps` | — | _(no summary)_ |

### Other exports (45)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`accessibilityFocus`](../packages/forms-native/src/context.tsx) | function | — | Move a screen reader to a host view. Quietly does nothing where it can't. |
| [`accessibilityHint`](../packages/forms-native/src/chrome.tsx) | function | — | What a screen reader hears after a control's name: the description, then the error. |
| [`ANSWER_PLACEHOLDER`](../packages/forms-native/src/renderers/text.tsx) | const | — | The placeholder a focus-layout answer line shows. |
| [`AnswerInput`](../packages/forms-native/src/renderers/text.tsx) | function | — | A one-line or multi-line answer, wired to the form's focus and return key. |
| [`builtInContentRenderers`](../packages/forms-native/src/content.tsx) | const | — | _(no summary)_ |
| [`builtInRenderers`](../packages/forms-native/src/renderers/index.tsx) | const | — | _(no summary)_ |
| [`CalculatedField`](../packages/forms-native/src/renderers/scale.tsx) | function | — | The value the engine worked out, read-only; read again as the answers it uses change. |
| [`ConsentField`](../packages/forms-native/src/renderers/scale.tsx) | function | — | One checkbox to agree to something: the question is the header, `props.text` the box's words. |
| [`ContentStep`](../packages/forms-native/src/content.tsx) | function | — | One content step, drawn by the registry (or as plain text when its kind has no renderer). |
| [`createContentRegistry`](../packages/forms-native/src/content.tsx) | function | — | _(no summary)_ |
| [`DateField`](../packages/forms-native/src/renderers/text.tsx) | function | — | A calendar day, typed: digits become `YYYY-MM-DD` (the stored form) as they are typed, and a whole date is read back in words. Text that isn't a date yet is kept as text, so validation says what's wrong. Register a renderer for `date` wi... |
| [`DefaultBrand`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`defaultContentRegistry`](../packages/forms-native/src/content.tsx) | const | — | The built-in content renderers. `extend()` returns a new registry; `register()` changes this one for every form. |
| [`DefaultEnding`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`DefaultErrorSummary`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`DefaultHeader`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`DefaultNavigation`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`DefaultNotice`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`DefaultProgress`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`defaultRegistry`](../packages/forms-native/src/renderers/index.tsx) | const | — | The built-in renderers. `extend()` returns a new registry; `register()` changes this one for every form. |
| [`DefaultStatus`](../packages/forms-native/src/slots.tsx) | function | — | _(no summary)_ |
| [`failedMessage`](../packages/forms-native/src/FormFocus.tsx) | function | — | Said when a send (or storing it on the device) failed. |
| [`formStyles`](../packages/forms-native/src/styles.ts) | function | — | _(no summary)_ |
| [`FormThemeProvider`](../packages/forms-native/src/theme.tsx) | function | — | Resolve the roles once for a form (the device's colors, then the host's). |
| [`Indicator`](../packages/forms-native/src/chrome.tsx) | function | — | The radio dot or check box drawn beside an option. Decorative: the row carries the state. |
| [`keyboardHints`](../packages/forms-native/src/renderers/text.tsx) | function | — | Keyboard and autofill hints from the field type's manifest (`a11y.inputMode`, `autocomplete`). |
| [`MIN_TARGET`](../packages/forms-native/src/styles.ts) | const | — | The smallest tap target, in points (Apple's 44, above WCAG 2.5.8's 24). |
| [`MultiChoiceField`](../packages/forms-native/src/renderers/choice.tsx) | function | — | Several picks. The typed "Other" answer is one more item while it is ticked and not blank. |
| [`NativeFieldRenderer`](../packages/forms-native/src/renderers/index.tsx) | function | — | One field, drawn by whatever the registry resolves (or a note, logged once, when nothing does). |
| [`NumberField`](../packages/forms-native/src/renderers/text.tsx) | function | — | A number, typed as text: what was typed is kept while it isn't a number yet ("-", "1."), and stored as a number once it is. Text that never becomes one is kept as text, so validation says so. A comma works as the decimal point. |
| [`OptionImage`](../packages/forms-native/src/chrome.tsx) | function | — | A small decorative picture beside an option's label: the label says what it is. |
| [`PhotoField`](../packages/forms-native/src/renderers/photo.tsx) | function | — | _(no summary)_ |
| [`photoProblem`](../packages/forms-native/src/renderers/photo.tsx) | function | — | Why a picked file can't be added, or null when it can. |
| [`questionLabel`](../packages/forms-native/src/chrome.tsx) | function | — | The question as a screen reader reads it: the label, and "required" when it is. |
| [`randomKey`](../packages/forms-native/src/FormFocus.tsx) | function | — | An idempotency key: `crypto.randomUUID` where there is one, else a random v4-shaped id (Hermes has no `crypto` without a polyfill). Never none, so a retry always queues the same submission. |
| [`ScaleField`](../packages/forms-native/src/renderers/scale.tsx) | function | — | _(no summary)_ |
| [`shapeDate`](../packages/forms-native/src/renderers/text.tsx) | function | — | Digits typed into a date, shaped as `YYYY-MM-DD` as they come (the dashes are added). |
| [`SingleChoiceField`](../packages/forms-native/src/renderers/choice.tsx) | function | — | One pick: a single choice or a dropdown. |
| [`submissionStatus`](../packages/forms-native/src/seams.ts) | function | — | Where the submission `id` stands in an outbox snapshot. An item that left the outbox was delivered, unless the last status seen (`previous`) was `failed`: a failed submission only leaves by being discarded (a retry first makes it pending... |
| [`TextField`](../packages/forms-native/src/renderers/text.tsx) | function | — | _(no summary)_ |
| [`UPLOAD_WAIT_MESSAGE`](../packages/forms-native/src/FormFocus.tsx) | const | — | Said when the respondent tries to move on or send while a photo is still uploading. |
| [`useFormNative`](../packages/forms-native/src/context.tsx) | function | — | The form's native context. Throws outside `<FormFocus>`. |
| [`useFormStyles`](../packages/forms-native/src/styles.ts) | function | — | The styles for the current theme, made once per theme. |
| [`useFormTheme`](../packages/forms-native/src/theme.tsx) | function | — | The theme a form part draws with. |
| [`YesNoField`](../packages/forms-native/src/renderers/scale.tsx) | function | — | _(no summary)_ |

### Types (31)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandSlotProps };
export type { ContentRendererEntry };
export type { ContentRendererProps };
export type { ContentRendererRegistry };
export type { EndingSlotProps };
export type { ErrorSummaryItem };
export type { ErrorSummarySlotProps };
export type { FormDraftLike };
export type { FormHaptics };
export type { FormNativeContextValue };
export type { FormSlotMap };
export type { FormSlotProps };
export type { FormSlots };
export type { FormStyles };
export type { FormTheme };
export type { FormThemeInput };
export type { HeaderScreen };
export type { HeaderSlotProps };
export type { NativePhotoFile };
export type { NavigationSlotProps };
export type { NoticeSlotProps };
export type { OutboxEnqueueLike };
export type { OutboxItemLike };
export type { OutboxLike };
export type { OutboxSnapshotLike };
export type { PendingUploads };
export type { PhotoHost };
export type { ProgressSlotProps };
export type { SlotOverride };
export type { StatusSlotProps };
export type { SubmissionStatus };
```

---

## @marktiderman/genesis-forms-react

React bindings for Genesis Forms: useForm, useField with one-field re-renders, a ranked renderer registry and a headless FormRuntime. Works in React DOM and React Native. Part of the Genesis framework.

**Barrel:** [`packages/forms-react/src/index.tsx`](../packages/forms-react/src/index.tsx)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FieldRenderer`](../packages/forms-react/src/index.tsx) | `FieldRendererProps` | — | Render one block with whatever the registry resolves. |
| [`FormRuntime`](../packages/forms-react/src/index.tsx) | `FormRuntimeProps` | — | Headless: provides the engine, the renderer registry and an id prefix to everything below. |

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ADVANCE_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long a single pick waits before moving on, so the respondent sees it picked. |
| [`CLASSIC_PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | In classic layout, how long after the last answer changed. |
| [`createRendererRegistry`](../packages/forms-react/src/index.tsx) | function | — | _(no summary)_ |
| [`formEngineOptions`](../packages/forms-react/src/controller.ts) | function | — | The engine options for a form that takes `hostOptions` and `linkParams` beside its other options, as `<Form>` does: `options` itself when neither is given. |
| [`outboxSubmit`](../packages/forms-react/src/outbox.ts) | function | — | An `onSubmit` for `useFormController` that queues the engine's event log in the outbox, then clears the draft. It resolves once the submission is in storage, so the controller shows the ending even while offline (the outbox sends it late... |
| [`PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long after a step forward `onProgress` waits, so quick steps save once. |
| [`useChoiceOptions`](../packages/forms-react/src/index.tsx) | function | — | The options a choice question shows now (`visibleOptions` over `answersOnPath`): all of them, or, when its list is filtered by another answer (`props.optionsFrom.filter`), the ones matching that answer. It re-renders only when that list ... |
| [`useField`](../packages/forms-react/src/index.tsx) | function | — | Everything one field renderer needs. Typing in one field re-renders that field only. |
| [`useForm`](../packages/forms-react/src/engine-hooks.ts) | function | — | Create a form engine for a definition. The engine lives as long as the definition's identity: pass a different definition object and you get a fresh engine (and a fresh response). Keep the definition stable (module scope, `useMemo`) so a... |
| [`useFormContext`](../packages/forms-react/src/index.tsx) | function | — | _(no summary)_ |
| [`useFormController`](../packages/forms-react/src/controller.ts) | function | — | The headless controller behind a form renderer: the step on screen and the path, errors, Next and Back, sending with retry, auto-advance, saving progress, what to announce and where focus goes. A renderer (web, native) draws what it retu... |
| [`useFormDraft`](../packages/forms-react/src/drafts.ts) | function | — | `useForm` with a draft on the device: the saved answers are put back when the form opens (where the respondent got to, too), saved again `delayMs` after each change, and flushed when the page is hidden or the component unmounts. With a s... |
| [`useFormSelector`](../packages/forms-react/src/engine-hooks.ts) | function | — | Subscribe to one slice of the form state. The component re-renders only when the selected value changes (`Object.is`), so return primitives or references the engine keeps stable (a field's value, an error string). |
| [`useRespondentPath`](../packages/forms-react/src/index.tsx) | function | — | The blocks the respondent steps through (`respondentPath`): the path without questions a prefill answered and hides (`props.prefill.hideWhenPrefilled`). Render these, not `state.path`, so a hidden question is neither shown nor counted. |
| [`useSubmitOutbox`](../packages/forms-react/src/outbox.ts) | function | — | The outbox's state (what's waiting, what failed, online or not), re-rendered as it changes. Starts the outbox (its timers) on mount; it keeps running after unmount, because one outbox serves the whole app: make it once, at module scope o... |

### Types (14)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FieldBinding };
export type { FocusTarget };
export type { FormController };
export type { FormControllerOptions };
export type { FormDraftState };
export type { FormErrorItem };
export type { FormLayoutMode };
export type { OutboxSubmitOptions };
export type { RendererEntry };
export type { RendererRegistry };
export type { SendPhase };
export type { SubmitOutboxState };
export type { UseFormDraftOptions };
export type { UseSubmitOutboxOptions };
```

---

## @marktiderman/genesis-forms-studio

The form management screens around a Genesis Forms builder: the page header, the Responses tab (filters, headline numbers, question summaries, a follow-up list), the Settings page layout and the Share dialog, plus the pure summary, answer, share and availability rules behind them. Data-agnostic: the host passes rows and actions. Part of the Genesis framework.

**Barrel:** [`packages/forms-studio/src/index.ts`](../packages/forms-studio/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ResourceHeader`](../packages/forms-studio/src/moved.tsx) | `ResourceHeaderProps` | — | _(no summary)_ |

### Other exports (68)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answerCell`](../packages/forms-studio/src/answers.ts) | function | — | One answer as a cell: option labels for choices, Yes/No, lists joined with commas. |
| [`answerColumns`](../packages/forms-studio/src/answers.ts) | function | — | One column per field key across the given definitions, in the order the newest definition asks them, then keys only older versions had (in their order). Labels come from the newest definition that has the key. |
| [`answersByKey`](../packages/forms-studio/src/answers.ts) | function | — | A response's answers by field key, as cells (answers are stored by field id). |
| [`carryAnswers`](../packages/forms/src/carry.ts) | function | — | Answers given to one version of a form, as answers to another (by field id), matched by field key: what an edit link prefills when the form has a newer version. Answers to fields the other version doesn't have are dropped; `extra` (by ke... |
| [`Chip`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`comparisonFilter`](../packages/forms-studio/src/headline.ts) | function | — | The period before the one the filter bar picks, with the bar's other filters kept, and what to call it ("last week"). "This week" compares with the same weekdays last week, "This month" with last month up to the same day, any other range... |
| [`copyTitle`](../packages/forms-studio/src/slug.ts) | function | — | A duplicate's name: "Copy of …", within the 120 characters a form name may have. |
| [`dayLabel`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`dropOffByQuestion`](../packages/forms-studio/src/dropoff.ts) | function | — | Each question's views and drop-off, in the newest definition's order (`definitions` newest first, as `summarizeResponses` takes them), matched across versions by field key. Each response counts once (by `id`). |
| [`DropOffByQuestion`](../packages/forms-studio/src/DropOffByQuestion.tsx) | function | — | Drop-off by question (`dropOffSummary`): how many people started, then for each question in order how many reached it, how many stopped there, and that as a share, with the share as a bar (the question most people left on in the warning ... |
| [`dropOffSummary`](../packages/forms-studio/src/dropoff.ts) | function | — | What `<DropOffByQuestion>` shows: how many people started and each question's drop-off. Pass every response under the host's filters except status (in-progress ones count as started, never per question). |
| [`embedSnippet`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`filterResponses`](../packages/forms-studio/src/summary.ts) | function | — | The items a filter keeps, in their order. |
| [`FollowUpList`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`followUpOf`](../packages/forms-studio/src/followups.ts) | function | — | One item's follow-up, or null when none of its answers is low. |
| [`FORM_NAV_ICONS`](../packages/forms-studio/src/navIcons.ts) | const | — | The form page's four places' icons, for `formNavItems(path, counts, FORM_NAV_ICONS)`. |
| [`FORM_READINESS_LABELS`](../packages/forms-studio/src/moved-rules.ts) | const | — | A form's readiness words: an empty form says "Add a question". |
| [`FORM_READINESS_OPTIONS`](../packages/forms-studio/src/moved-rules.ts) | const | — | A form's readiness rule: the builder's `no-questions` finding means "nothing to publish yet". |
| [`FORM_SHARE_LABELS`](../packages/forms-studio/src/moved.tsx) | const | — | A form's Share dialog words: "Share your form", "Anyone with the link can answer." |
| [`formAvailability`](../packages/forms-studio/src/availability.ts) | function | — | Where a form stands at `at`. Archived and draft first, then paused (staff chose it, whatever the clock says), then the opening window (a time that can't be read, or has no offset, counts as closed), then the cap. Only "live" takes respon... |
| [`formCounts`](../packages/forms-studio/src/status.ts) | function | — | How many questions a definition asks, and how many rules plus endings it has. |
| [`formNavItems`](../packages/forms-studio/src/status.ts) | function | — | The form page's child navigation items (Questions, Logic and endings, Responses, Settings) with their counts as badges, for the app shell's sub-navigation: `useAppShellSubNav(formNavItems("/forms/f1", counts))`. `at` is the form page's p... |
| [`formStatusChip`](../packages/forms-studio/src/status.ts) | function | — | A form's status chip: "Live · version 3", "Draft", "Paused · version 3"… `availability` is formAvailability's answer; `version` the live version, when there is one. |
| [`freeSlug`](../packages/forms-studio/src/slug.ts) | function | — | The first of `slug`, `slug-2`, `slug-3`… that isn't in `taken`, within 60 characters. |
| [`hasLowRating`](../packages/forms-studio/src/summary.ts) | function | — | Whether any rating or NPS answer in an item is low on its own question's scale. |
| [`hasLowRatingExcept`](../packages/forms-studio/src/summary.ts) | function | — | hasLowRating, leaving out the answers to keys in `skip` (as summaries and needsFollowUp do). |
| [`headlineCards`](../packages/forms-studio/src/headline.ts) | function | — | The cards for `headlineNumbers`' answer: Responses (with the change against `period`, e.g. "last week"), Average rating, Low ratings, and the consent or yes/no rate. A card the form has no question for is left out. |
| [`headlineNumbers`](../packages/forms-studio/src/headline.ts) | function | — | The headline numbers for `items` (already filtered), with `previous` (the same filters over the period before, from `comparisonFilter`) for the changes. `definitions` are newest first, as `summarizeResponses` takes them; `skip` leaves ke... |
| [`HeadlineNumbers`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`highestRating`](../packages/forms-studio/src/summary.ts) | function | — | The highest score any rating question in `definitions` asks for (NPS left out); null when none. |
| [`isFiltered`](../packages/forms-studio/src/summary.ts) | function | — | Whether a filter leaves anything out beyond the default (in-progress responses). |
| [`isFull`](../packages/forms-studio/src/availability.ts) | function | — | Whether the form has its response cap: from `full` when given, else from the cap and count. |
| [`lowestRating`](../packages/forms-studio/src/summary.ts) | function | — | The lowest rating-question answer in an item (NPS left out), or null when it has none. |
| [`lowRatingAtMost`](../packages/forms-studio/src/summary.ts) | function | — | The highest answer that counts as low on a rating or NPS question: the bottom 40% of a rating's scale (at least 1), or 0–6 (detractors) on NPS. Null for other questions. |
| [`lowRatingLabel`](../packages/forms-studio/src/summary.ts) | function | — | What "low" means across `definitions`, in words: "2 or below" for one 1–5 scale, "2 or below out of 5, 4 or below out of 10" for two, "0–6 on NPS" beside them ("0–6" alone). Null when no question has a rating or NPS answer. |
| [`lowScaleAtMost`](../packages/forms-studio/src/summary.ts) | function | — | lowRatingAtMost for a scale known only by its type and top score (a ScaleSummary's). |
| [`lowThisWeek`](../packages/forms-studio/src/summary.ts) | const | — | The one-click "Low ratings this week": this week, and low on each question's own scale (lowRatingAtMost: the bottom 40% of a rating, NPS detractors), other filters kept. |
| [`matchesStatus`](../packages/forms-studio/src/summary.ts) | function | — | Whether `item` passes a status filter (no status is `completed`). |
| [`needsFollowUp`](../packages/forms-studio/src/followups.ts) | function | — | The items that need a follow-up, newest day first: a low answer on a rating or NPS question (lowRatingAtMost), and not handled yet. `skip` leaves keys out (contact details). |
| [`NO_FILTERS`](../packages/forms-studio/src/summary.ts) | const | — | _(no summary)_ |
| [`offersSubmitAnother`](../packages/forms-studio/src/respondent.ts) | function | — | Whether the thank-you page offers "Send another response" (on unless `submitAnother` is false). Never on a form that takes one response per person: a second response would be refused. Anonymous forms don't know who answered, so one per p... |
| [`parseInstant`](../packages/forms-studio/src/availability.ts) | function | — | An ISO time with `Z` or an offset, as epoch milliseconds; NaN for anything else. |
| [`PhotoAnswer`](../packages/forms-studio/src/PhotoAnswer.tsx) | function | — | A response's photos as thumbnails, each opening full size in a new tab. Data-agnostic: the host resolves each reference to an address it may show (a short-lived signed link, say), or null when it can't. A photo most browsers can't draw (... |
| [`plainLabel`](../packages/forms-studio/src/answers.ts) | const | — | A label with recall tokens replaced by their fallback. |
| [`prefilledUrl`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`presetRange`](../packages/forms-studio/src/summary.ts) | function | — | A preset's first and last day, given today (YYYY-MM-DD, on the clock the items' days use). "week" starts on Monday; "7d" and "30d" include today. |
| [`QuestionSummaryCard`](../packages/forms-studio/src/QuestionSummaryCards.tsx) | function | — | One question's card: its type icon, title and answer count, then its spread. |
| [`QuestionSummaryCards`](../packages/forms-studio/src/QuestionSummaryCards.tsx) | function | — | A form's responses question by question (summarizeResponses): each rating or NPS question's spread with low scores marked, counts for each choice, consent and yes/no as one split bar, and the latest written answers. |
| [`readinessChip`](../packages/forms-studio/src/moved-rules.ts) | function | — | The readiness chip's label and tone, in a form's words. |
| [`ReadinessChip`](../packages/forms-studio/src/moved.tsx) | function | — | "Ready to publish", or how many problems to fix, in a form's words ("Add a question"). |
| [`readinessOf`](../packages/forms-studio/src/moved-rules.ts) | function | — | Readiness from a form builder's findings (`no-questions` is "empty"). |
| [`ResourceSettingsPage`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`RESPONSE_STATUS_LABEL`](../packages/forms-studio/src/summary.ts) | const | — | A response status's word, as a table or a detail panel shows it. |
| [`ResponsesFilters`](../packages/forms-studio/src/ResponsesFilters.tsx) | function | — | Filters for a form's responses: when, the status (with `statuses`: Sent and partial, Sent, Partial, In progress), any number of choice filters, a rating floor, and the low-ratings chip ("Low ratings this week" until it's on; then a chip ... |
| [`ResponsesToolbar`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`SAVE_STATE_LABEL`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`SettingsSection`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`ShareDialog`](../packages/forms-studio/src/moved.tsx) | function | — | Sharing a published form: "Share your form", "Anyone with the link can answer." |
| [`SLUG_PATTERN`](../packages/forms-studio/src/slug.ts) | const | — | A form link: lowercase letters and numbers, in words joined by single hyphens. |
| [`slugFromTitle`](../packages/forms-studio/src/slug.ts) | function | — | "How was class?" → "how-was-class": the public link's last part (lowercase words and hyphens, at most 60). `fallback` is used when the title has no letters or numbers. |
| [`STATUS_FILTER_LABEL`](../packages/forms-studio/src/summary.ts) | const | — | The status filter's words, in the menu's order. |
| [`summarizeResponses`](../packages/forms-studio/src/summary.ts) | function | — | One summary per question across `definitions` (newest first: it sets the order, labels, type and options), counting each item's answers by field key. Keys in `skip` are left out. |
| [`SummaryCard`](../packages/forms-studio/src/moved.tsx) | const | — | _(no summary)_ |
| [`takesResponses`](../packages/forms-studio/src/availability.ts) | function | — | Whether the form takes responses at `at`. |
| [`toCsv`](../packages/forms-studio/src/answers.ts) | function | — | CSV text (RFC 4180, CRLF) with a header row; every cell is quoted when it needs to be. Text that a spreadsheet would run as a formula (starting with = + - @, tab or CR) gets a leading apostrophe, so a respondent's answer can't run in Exc... |
| [`toResponseFilter`](../packages/forms-studio/src/summary.ts) | function | — | The filter for `value`, given today's date on the clock the responses' days use. |
| [`validateSlug`](../packages/forms-studio/src/slug.ts) | function | — | Why a form link can't be used, or nothing when it fits SLUG_PATTERN. |
| [`valuesByKey`](../packages/forms-studio/src/answers.ts) | function | — | A response's raw answers by field key, with the field each was given to (answers are stored by field id). |

### Types (30)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerColumn };
export type { AvailabilityInput };
export type { Cell };
export type { ChipTone };
export type { ChoiceFilter };
export type { ChoiceSummary };
export type { DatePreset };
export type { DropOffSummary };
export type { FiltersValue };
export type { FollowUp };
export type { FollowUpEntry };
export type { FormAvailability };
export type { FormNavItem };
export type { FormTab };
export type { Headline };
export type { HeadlineNumber };
export type { NavItemShape };
export type { PrefillChoice };
export type { QuestionDropOff };
export type { QuestionSummary };
export type { Readiness };
export type { ResponseFilter };
export type { ResponseStatus };
export type { ResponsesView };
export type { SaveState };
export type { ScaleSummary };
export type { SettingsPageSection };
export type { StatusFilter };
export type { SummaryItem };
export type { TextSummary };
```

---

## @marktiderman/genesis-forms-studio/rules

**Barrel:** [`packages/forms-studio/src/rules.ts`](../packages/forms-studio/src/rules.ts)

### Other exports (52)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answerCell`](../packages/forms-studio/src/answers.ts) | function | — | One answer as a cell: option labels for choices, Yes/No, lists joined with commas. |
| [`answerColumns`](../packages/forms-studio/src/answers.ts) | function | — | One column per field key across the given definitions, in the order the newest definition asks them, then keys only older versions had (in their order). Labels come from the newest definition that has the key. |
| [`answersByKey`](../packages/forms-studio/src/answers.ts) | function | — | A response's answers by field key, as cells (answers are stored by field id). |
| [`carryAnswers`](../packages/forms/src/carry.ts) | function | — | Answers given to one version of a form, as answers to another (by field id), matched by field key: what an edit link prefills when the form has a newer version. Answers to fields the other version doesn't have are dropped; `extra` (by ke... |
| [`comparisonFilter`](../packages/forms-studio/src/headline.ts) | function | — | The period before the one the filter bar picks, with the bar's other filters kept, and what to call it ("last week"). "This week" compares with the same weekdays last week, "This month" with last month up to the same day, any other range... |
| [`copyTitle`](../packages/forms-studio/src/slug.ts) | function | — | A duplicate's name: "Copy of …", within the 120 characters a form name may have. |
| [`dayLabel`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`dropOffByQuestion`](../packages/forms-studio/src/dropoff.ts) | function | — | Each question's views and drop-off, in the newest definition's order (`definitions` newest first, as `summarizeResponses` takes them), matched across versions by field key. Each response counts once (by `id`). |
| [`dropOffSummary`](../packages/forms-studio/src/dropoff.ts) | function | — | What `<DropOffByQuestion>` shows: how many people started and each question's drop-off. Pass every response under the host's filters except status (in-progress ones count as started, never per question). |
| [`embedSnippet`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`filterResponses`](../packages/forms-studio/src/summary.ts) | function | — | The items a filter keeps, in their order. |
| [`followUpOf`](../packages/forms-studio/src/followups.ts) | function | — | One item's follow-up, or null when none of its answers is low. |
| [`FORM_READINESS_LABELS`](../packages/forms-studio/src/moved-rules.ts) | const | — | A form's readiness words: an empty form says "Add a question". |
| [`FORM_READINESS_OPTIONS`](../packages/forms-studio/src/moved-rules.ts) | const | — | A form's readiness rule: the builder's `no-questions` finding means "nothing to publish yet". |
| [`formAvailability`](../packages/forms-studio/src/availability.ts) | function | — | Where a form stands at `at`. Archived and draft first, then paused (staff chose it, whatever the clock says), then the opening window (a time that can't be read, or has no offset, counts as closed), then the cap. Only "live" takes respon... |
| [`formCounts`](../packages/forms-studio/src/status.ts) | function | — | How many questions a definition asks, and how many rules plus endings it has. |
| [`formNavItems`](../packages/forms-studio/src/status.ts) | function | — | The form page's child navigation items (Questions, Logic and endings, Responses, Settings) with their counts as badges, for the app shell's sub-navigation: `useAppShellSubNav(formNavItems("/forms/f1", counts))`. `at` is the form page's p... |
| [`formStatusChip`](../packages/forms-studio/src/status.ts) | function | — | A form's status chip: "Live · version 3", "Draft", "Paused · version 3"… `availability` is formAvailability's answer; `version` the live version, when there is one. |
| [`freeSlug`](../packages/forms-studio/src/slug.ts) | function | — | The first of `slug`, `slug-2`, `slug-3`… that isn't in `taken`, within 60 characters. |
| [`hasLowRating`](../packages/forms-studio/src/summary.ts) | function | — | Whether any rating or NPS answer in an item is low on its own question's scale. |
| [`hasLowRatingExcept`](../packages/forms-studio/src/summary.ts) | function | — | hasLowRating, leaving out the answers to keys in `skip` (as summaries and needsFollowUp do). |
| [`headlineCards`](../packages/forms-studio/src/headline.ts) | function | — | The cards for `headlineNumbers`' answer: Responses (with the change against `period`, e.g. "last week"), Average rating, Low ratings, and the consent or yes/no rate. A card the form has no question for is left out. |
| [`headlineNumbers`](../packages/forms-studio/src/headline.ts) | function | — | The headline numbers for `items` (already filtered), with `previous` (the same filters over the period before, from `comparisonFilter`) for the changes. `definitions` are newest first, as `summarizeResponses` takes them; `skip` leaves ke... |
| [`highestRating`](../packages/forms-studio/src/summary.ts) | function | — | The highest score any rating question in `definitions` asks for (NPS left out); null when none. |
| [`isFiltered`](../packages/forms-studio/src/summary.ts) | function | — | Whether a filter leaves anything out beyond the default (in-progress responses). |
| [`isFull`](../packages/forms-studio/src/availability.ts) | function | — | Whether the form has its response cap: from `full` when given, else from the cap and count. |
| [`lowestRating`](../packages/forms-studio/src/summary.ts) | function | — | The lowest rating-question answer in an item (NPS left out), or null when it has none. |
| [`lowRatingAtMost`](../packages/forms-studio/src/summary.ts) | function | — | The highest answer that counts as low on a rating or NPS question: the bottom 40% of a rating's scale (at least 1), or 0–6 (detractors) on NPS. Null for other questions. |
| [`lowRatingLabel`](../packages/forms-studio/src/summary.ts) | function | — | What "low" means across `definitions`, in words: "2 or below" for one 1–5 scale, "2 or below out of 5, 4 or below out of 10" for two, "0–6 on NPS" beside them ("0–6" alone). Null when no question has a rating or NPS answer. |
| [`lowScaleAtMost`](../packages/forms-studio/src/summary.ts) | function | — | lowRatingAtMost for a scale known only by its type and top score (a ScaleSummary's). |
| [`lowThisWeek`](../packages/forms-studio/src/summary.ts) | const | — | The one-click "Low ratings this week": this week, and low on each question's own scale (lowRatingAtMost: the bottom 40% of a rating, NPS detractors), other filters kept. |
| [`matchesStatus`](../packages/forms-studio/src/summary.ts) | function | — | Whether `item` passes a status filter (no status is `completed`). |
| [`needsFollowUp`](../packages/forms-studio/src/followups.ts) | function | — | The items that need a follow-up, newest day first: a low answer on a rating or NPS question (lowRatingAtMost), and not handled yet. `skip` leaves keys out (contact details). |
| [`NO_FILTERS`](../packages/forms-studio/src/summary.ts) | const | — | _(no summary)_ |
| [`offersSubmitAnother`](../packages/forms-studio/src/respondent.ts) | function | — | Whether the thank-you page offers "Send another response" (on unless `submitAnother` is false). Never on a form that takes one response per person: a second response would be refused. Anonymous forms don't know who answered, so one per p... |
| [`parseInstant`](../packages/forms-studio/src/availability.ts) | function | — | An ISO time with `Z` or an offset, as epoch milliseconds; NaN for anything else. |
| [`plainLabel`](../packages/forms-studio/src/answers.ts) | const | — | A label with recall tokens replaced by their fallback. |
| [`prefilledUrl`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`presetRange`](../packages/forms-studio/src/summary.ts) | function | — | A preset's first and last day, given today (YYYY-MM-DD, on the clock the items' days use). "week" starts on Monday; "7d" and "30d" include today. |
| [`readinessChip`](../packages/forms-studio/src/moved-rules.ts) | function | — | The readiness chip's label and tone, in a form's words. |
| [`readinessOf`](../packages/forms-studio/src/moved-rules.ts) | function | — | Readiness from a form builder's findings (`no-questions` is "empty"). |
| [`RESPONSE_STATUS_LABEL`](../packages/forms-studio/src/summary.ts) | const | — | A response status's word, as a table or a detail panel shows it. |
| [`SAVE_STATE_LABEL`](../packages/forms-studio/src/moved-rules.ts) | const | — | _(no summary)_ |
| [`SLUG_PATTERN`](../packages/forms-studio/src/slug.ts) | const | — | A form link: lowercase letters and numbers, in words joined by single hyphens. |
| [`slugFromTitle`](../packages/forms-studio/src/slug.ts) | function | — | "How was class?" → "how-was-class": the public link's last part (lowercase words and hyphens, at most 60). `fallback` is used when the title has no letters or numbers. |
| [`STATUS_FILTER_LABEL`](../packages/forms-studio/src/summary.ts) | const | — | The status filter's words, in the menu's order. |
| [`summarizeResponses`](../packages/forms-studio/src/summary.ts) | function | — | One summary per question across `definitions` (newest first: it sets the order, labels, type and options), counting each item's answers by field key. Keys in `skip` are left out. |
| [`takesResponses`](../packages/forms-studio/src/availability.ts) | function | — | Whether the form takes responses at `at`. |
| [`toCsv`](../packages/forms-studio/src/answers.ts) | function | — | CSV text (RFC 4180, CRLF) with a header row; every cell is quoted when it needs to be. Text that a spreadsheet would run as a formula (starting with = + - @, tab or CR) gets a leading apostrophe, so a respondent's answer can't run in Exc... |
| [`toResponseFilter`](../packages/forms-studio/src/summary.ts) | function | — | The filter for `value`, given today's date on the clock the responses' days use. |
| [`validateSlug`](../packages/forms-studio/src/slug.ts) | function | — | Why a form link can't be used, or nothing when it fits SLUG_PATTERN. |
| [`valuesByKey`](../packages/forms-studio/src/answers.ts) | function | — | A response's raw answers by field key, with the field each was given to (answers are stored by field id). |

### Types (25)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerColumn };
export type { AvailabilityInput };
export type { Cell };
export type { ChipTone };
export type { ChoiceSummary };
export type { DatePreset };
export type { DropOffSummary };
export type { FiltersValue };
export type { FollowUp };
export type { FormAvailability };
export type { FormNavItem };
export type { FormTab };
export type { Headline };
export type { NavItemShape };
export type { PrefillChoice };
export type { QuestionDropOff };
export type { QuestionSummary };
export type { Readiness };
export type { ResponseFilter };
export type { ResponseStatus };
export type { SaveState };
export type { ScaleSummary };
export type { StatusFilter };
export type { SummaryItem };
export type { TextSummary };
```

---

## @marktiderman/genesis-forms-web

The web renderer for Genesis Forms: <Form> with one-question-at-a-time and classic layouts, built on Genesis UI components and tokens, accessible by default. Part of the Genesis framework.

**Barrel:** [`packages/forms-web/src/index.ts`](../packages/forms-web/src/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FieldChrome`](../packages/forms-web/src/chrome.tsx) | `FieldChromeProps` | — | Label, description and error around a control. Group types (radio, checkbox list, rating, scale) get a real `fieldset`/`legend`, so a screen reader announces the question with every option; the fieldset carries the field's `inputId` (an ... |
| [`Form`](../packages/forms-web/src/Form.tsx) | `FormProps` | — | _(no summary)_ |

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`builtInRenderers`](../packages/forms-web/src/renderers.tsx) | const | — | _(no summary)_ |
| [`CLASSIC_PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | In classic layout, how long after the last answer changed. |
| [`DefaultEnding`](../packages/forms-web/src/Form.tsx) | function | — | The built-in ending (a check, the title and description, then any `actions`). Exported so a custom ending slot can wrap it rather than copy it. |
| [`defaultRegistry`](../packages/forms-web/src/renderers.tsx) | const | — | The built-in web renderers, shared by every `<Form>` that gets no `registry`. `extend()` returns a new registry and leaves this one alone; `register()` changes this one in place, for every form in the app. |
| [`describedBy`](../packages/forms-web/src/chrome.tsx) | function | — | _(no summary)_ |
| [`HIDDEN_QUERY_KEEP_MS`](../packages/forms-web/src/clean-url.ts) | const | — | How long a reload brings the query back: 30 minutes. |
| [`hideQueryOnLoad`](../packages/forms-web/src/clean-url.ts) | function | — | Run once when the page has read its query. Returns "hidden" when it took the query out of the address bar, "restoring" when a reload is bringing a hidden query back (the page is about to load again), else "none". |
| [`MediaTimeContext`](../packages/forms-web/src/source.ts) | const | — | Provide it around `<Form>` to link `media-notes` fields to a media player. |
| [`photoAccept`](../packages/forms-web/src/photo.tsx) | function | — | The `accept` attribute for a field: its MIME types, plus HEIC's file names for browsers that give it no type. |
| [`photoFileProblem`](../packages/forms-web/src/photo.tsx) | function | — | Why a picked file can't be added, or null when it can. |
| [`photoFileType`](../packages/forms-web/src/photo.tsx) | function | — | The file's type as the field judges it: some browsers give a HEIC photo no type, so its name decides. |
| [`PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long after a step forward `onProgress` waits, so quick steps save once. |
| [`signedUploadHost`](../packages/forms-web/src/signed-upload.ts) | function | — | The browser half of the upload handshake (genesis-forms/server's `createUploadHandler`): for each file it asks `endpoint` for a signed upload (`UploadRequest` as JSON), sends the bytes with `send`, and resolves to the reference the serve... |
| [`SourceTextContext`](../packages/forms-web/src/source.ts) | const | — | The text a form is about (an article, a policy, a contract). `text-highlights` fields highlight passages of it; a field's own `props.text` is used when no host provides one. Offsets are UTF-16 indices into this exact string. |
| [`themeColors`](../packages/forms-web/src/theme.ts) | function | — | The accent as Genesis primary colours for a light and a dark page, each adjusted only as far as contrast needs. Null when `accent` is not a colour this understands. |
| [`themeCss`](../packages/forms-web/src/theme.ts) | function | — | The CSS that applies `theme` to the elements matching `selector`, or "" when it changes no colour. |
| [`UPLOAD_WAIT_MESSAGE`](../packages/forms-web/src/upload.ts) | const | — | Said when the respondent tries to move on or send while a photo is still uploading. |
| [`UploadContext`](../packages/forms-web/src/upload.ts) | const | — | Provide it around `<Form>` (or pass `onUpload`) so `photo` fields can store files. |
| [`useFormPresentation`](../packages/forms-web/src/presentation.ts) | function | — | The presentation and layout of the enclosing `<Form>`, so a custom slot or renderer can match the built-in ones (larger type and tap targets in page mode, for example). Outside a `<Form>` it reads embedded and classic. |
| [`useMediaTime`](../packages/forms-web/src/source.ts) | function | — | The enclosing `MediaTimeContext` value, or null. |
| [`useSourceText`](../packages/forms-web/src/source.ts) | function | — | The enclosing `SourceTextContext` value, or null. |
| [`useUpload`](../packages/forms-web/src/upload.ts) | function | — | The enclosing `UploadContext` value, or null when no host stores files. |
| [`wasReload`](../packages/forms-web/src/clean-url.ts) | const | — | Whether this page load was a reload (Navigation Timing), in the browser; false elsewhere. |

### Types (19)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandSlotProps };
export type { EndingSlotProps };
export type { ErrorSummaryItem };
export type { ErrorSummarySlotProps };
export type { FormBrand };
export type { FormPresentation };
export type { FormPresentationValue };
export type { FormSlotMap };
export type { FormTheme };
export type { HeaderSlotProps };
export type { HiddenQueryWindow };
export type { MediaTime };
export type { NavigationSlotProps };
export type { ProgressSlotProps };
export type { SignedUploadHost };
export type { SignedUploadHostOptions };
export type { ThemeColors };
export type { UploadClaim };
export type { UploadHost };
```

---

## @marktiderman/genesis/core

**Barrel:** [`packages/genesis/src/core.ts`](../packages/genesis/src/core.ts)

### Components (4)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataProviderRoot`](../packages/core/src/provider/context.tsx) | `DataProviderRootProps` | — | _(no summary)_ |
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | Convenience root: a `QueryClientProvider`, storage, and a data provider (yours, or a mock built from datasets). It creates its own `QueryClient` unless you pass `queryClient`; an app that already has one should pass it, or mount `DataPro... |
| [`ViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | `ViewerScopeProps` | — | Keeps one viewer's cached data from ever showing to the next. Children render only once the viewer is known, under a key of that viewer, so a sign-out or a new person signing in unmounts every screen and its queries before the cache is e... |
| [`WorkspaceScope`](../packages/core/src/hooks/workspace-scope.tsx) | `WorkspaceScopeProps` | Beta | `ViewerScope` for an app with workspaces: use it in place of `ViewerScope`. It reads the current workspace from the URL and scopes everything under it to that workspace (its `scope`, `roles` and `timeZone`), so every view with `scope: ["... |

### Other exports (69)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`blankValues`](../packages/core/src/hooks/use-resource-form.ts) | function | — | What a save sends for an input left empty: `""`, or `undefined` (a cleared number input). Only a field whose column the form knows about (`nullable` set, as ResourceView sets it from a generated contract) is changed: a create leaves it o... |
| [`buildArrayItemDefaults`](../packages/core/src/hooks/use-resource-form.ts) | function | — | Build default values for a single array item from its sub-field definitions |
| [`callRpc`](../packages/core/src/provider/write-helpers.ts) | function | — | Calls a database function and returns its result. A failure throws a DataWriteError with the usual outcome and code, and words a person can read: yours for the code, a guard's own message (P0001), the defaults above, or a generic sentenc... |
| [`classifyError`](../packages/core/src/errors.ts) | function | — | What kind of error this is, a sentence that is safe to show, and whether it is worth reporting. Understands the provider's `DataWriteError` and `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's auth and fetch error... |
| [`clearViewerCache`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Empties the query cache for a new viewer: sends the old viewer's waiting undoable writes (the session is still theirs), cancels reads in flight, then removes every query. Call it in the sign-in and sign-out actions, before the session ch... |
| [`createLocalStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | localStorage adapter with SSR safety. |
| [`createMemoryStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | In-memory adapter for testing and SSR. |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createNoopStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | No-op adapter — all operations silently do nothing. |
| [`createOrAdopt`](../packages/core/src/provider/write-helpers.ts) | function | — | "One live row per key": creates the row, or, when one with the same key is already there (a `duplicate`), adopts it, optionally merging changes in. `adopted` says which, and `final` that the row already there is finished. Key fields that... |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | The Supabase data provider. Reads and writes go through the client you pass, under that client's session and RLS. |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`decodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | The inverse of {@link encodeRecordKey}: field name → value. |
| [`DEFAULT_DRAFT_DELAY_MS`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DEFAULT_LIVE_DEBOUNCE_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How long a burst of change events is gathered into one refetch. |
| [`DEFAULT_LIVE_RESYNC_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How often a live read refetches anyway while the page is visible. Realtime checks each change against the row's new state, so a row the viewer stops being allowed to see (binned, made a draft, moved to another practice) sends them nothin... |
| [`DEFAULT_RPC_MESSAGES`](../packages/core/src/provider/write-helpers.ts) | const | — | The words shown for a code when the caller gives none. A guard's own `raise exception` (P0001) keeps its words. |
| [`DEFAULT_UNDO_DELAY_MS`](../packages/core/src/hooks/mutation-mode.ts) | const | — | How long an `undoable` write waits for an undo before it is sent. |
| [`DEFAULT_UNSAVED_CHANGES_MESSAGE`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | const | — | _(no summary)_ |
| [`defaultErrorReporter`](../packages/core/src/errors.ts) | const | — | The reporter used when the app registered none: `console.warn` in development, nothing in production. |
| [`defineQueryKeys`](../packages/core/src/query-keys.ts) | function | — | The keys of one domain. Each query maps its arguments to the fields that make it distinct (sort arrays so order never makes two keys): |
| [`defineResource`](../packages/core/src/schema/types.ts) | function | — | Declares a resource contract for a row type, keeping the literal contract (field names, key, labelField) and attaching the row type so views can read it with `RowOf`. `labelField` must be one of the row's fields. |
| [`DRAFT_NOT_SAVED`](../packages/core/src/hooks/draft-controller.ts) | const | — | _(no summary)_ |
| [`DraftController`](../packages/core/src/hooks/draft-controller.ts) | class | — | The rules of a draft, without React: one write at a time, add then change, no write when nothing changed or for an empty value, merge into a row another tab started, start again on a new revision, retry network failures, and a final writ... |
| [`dropPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Drops every write on this client not yet sent, without reporting them: the viewer who made them is gone, so they must never be sent (or re-applied) under the next one. Writes already sending finish under the old session. |
| [`encodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | One `Identifier` for a row. |
| [`errorMessages`](../packages/core/src/errors.ts) | const | — | The English catalogue. Plain words, never the store's text. |
| [`fieldErrorsFromPostgrest`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Reads which columns a Postgres constraint error is about, from PostgREST's `message` / `details`, and gives safe messages for them. Only plain column names are taken from the store's text; the values it echoes are never used. A unique vi... |
| [`flushPendingWrites`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Sends every optimistic or undoable write still waiting on this client now, and resolves once all have settled. Call it while the session that made them still holds (a sign-out action, before signing out). |
| [`getErrorReporter`](../packages/core/src/errors.ts) | function | — | The reporter `reportError` uses now. |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isNetworkFailure`](../packages/core/src/hooks/draft-controller.ts) | function | — | The default `isRetryable`: a request that never reached the store. A refusal never is. |
| [`isSafeUrl`](../packages/core/src/urls.ts) | function | — | True when `url` is safe to put in an `href`: an absolute http(s), mailto or tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`). |
| [`keyFields`](../packages/core/src/schema/keys.ts) | function | — | The key of a contract as a list, whichever form `key` was declared in. |
| [`loadRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | The words for one linked id, batched with every other id asked for in the same tick: one `getList(resource, { filters: [{ field, operator: "in" }] })` per linked resource and naming field. Resolves null when the row has no words or isn't... |
| [`NO_VIEWER`](../packages/core/src/viewer.ts) | const | — | The viewer outside any ViewerScope: no one, nowhere, no roles. |
| [`normalizeLinkUrl`](../packages/core/src/urls.ts) | function | — | Turn what a person typed into the link field into a safe href, or `null`. `example.com/page` becomes `https://example.com/page`; an email address becomes a `mailto:` link. |
| [`pendingWriteCount`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Optimistic or undoable writes on `resource` not yet settled. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |
| [`readOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a store error code to the read outcome it means: the write mapping, with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116, `42703` unknown column, `42P01` unknown table) read as `invalid`. |
| [`rememberedWorkspaceId`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The workspace this viewer was last in on this device, for the app's front door (`defaultWorkspace(workspaces, rememberedWorkspaceId(viewer))`). Null when unknown. |
| [`reportError`](../packages/core/src/errors.ts) | function | — | Report an error a package caught and handled. Never throws: a failing reporter must not take the caller (an event handler, a render) down. `context` may be just the source. |
| [`resourceKeys`](../packages/core/src/query-keys.ts) | function | — | The keys Genesis's own hooks cache a resource under, for writing into or invalidating them by hand: `[resource]` covers them all. |
| [`RPC_FAILED`](../packages/core/src/provider/write-helpers.ts) | const | — | _(no summary)_ |
| [`scopeClock`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The scope's clock: `scopeTimeZone` when the runtime knows it, else the viewer's. A zone it doesn't know is never a quiet fallback: it throws in development, and in production it is reported (`reportError`, once per zone) before the viewe... |
| [`setErrorReporter`](../packages/core/src/errors.ts) | function | — | Send every `reportError` to `reporter` (`null` puts the default back). Returns a function that restores the reporter that was there before. The native observability block calls it when it is created. |
| [`stableJson`](../packages/core/src/hooks/draft-controller.ts) | function | — | JSON with object keys sorted, so values compare equal whatever order a store keeps keys in. |
| [`titleCase`](../packages/core/src/utils.ts) | function | — | Convert a key string to title case. "created_at" -> "Created At" "firstName" -> "First Name" |
| [`toDataWriteError`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Turns anything a write threw, or the `{ message, code }` error a Supabase client returned, into a `DataWriteError`. A `DataWriteError` passes through unchanged; anything else keeps its message and `code`, and is kept as the `cause`. |
| [`useCapabilities`](../packages/core/src/hooks/use-capabilities.ts) | function | — | What the data provider can do for `resource` (`provider.capabilities`), cached per provider and resource. `data` stays undefined for a provider that doesn't report capabilities, so a UI keeps its defaults. |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useDraft`](../packages/core/src/hooks/use-draft.ts) | function | — | Autosave one draft row: saved a moment after each change, one write at a time, added on the first save that has something in it, merged into a row another tab started (`adopt`), and started again when the server's copy wins (`revision`).... |
| [`useInfiniteResource`](../packages/core/src/hooks/use-infinite-resource.ts) | function | — | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useOptionalViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | Like useViewerScope, or null outside a ViewerScope. |
| [`useRelationLabel`](../packages/core/src/hooks/use-relation-label.ts) | function | — | A linked row's words for a `relation` cell: `undefined` while they load, `null` when there are none (the row is hidden from this viewer, gone, unnamed, or the read failed), so a screen shows its own words then, never the raw id. Cached p... |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useUnsavedChangesGuard`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | function | — | Warns before unsaved changes are lost, without depending on a router. |
| [`useViewer`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer for guards: `{ id, scope, roles }` from the nearest ViewerScope, or {@link NO_VIEWER} without one. The object is stable while those are equal by value, so it can sit in a memo's dependencies. |
| [`useViewerScope`](../packages/core/src/hooks/viewer-scope.tsx) | function | — | The viewer and scope from the nearest `ViewerScope`. Throws without one: screens that cache per viewer need it. |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |
| [`useWorkspace`](../packages/core/src/hooks/workspace-scope.tsx) | function | Beta | The nearest `WorkspaceScope`'s workspaces, or null outside one. |
| [`useWrite`](../packages/core/src/hooks/use-write.ts) | function | — | A one-off write that isn't a resource page's create, update or remove: a database function, `createOrAdopt`, several writes in a row. It invalidates what it made stale and reports failures in plain words. |
| [`WRITE_FAILED`](../packages/core/src/hooks/use-write.ts) | const | — | _(no summary)_ |
| [`writeOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it means. Anything not listed is `error`: a code is only read as a refusal or a bad value when it says so. |

### Types (112)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { AuditEntry };
export type { BaseRecord };
export type { BulkChange };
export type { BulkResult };
export type { CallRpcOptions };
export type { ClassifiedError };
export type { ClassifyErrorOptions };
export type { CountMode };
export type { CreateOrAdoptOptions };
export type { CreateOrAdoptResult };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DataReadErrorOptions };
export type { DataRow };
export type { DataWriteErrorOptions };
export type { DeleteParams };
export type { DeleteResult };
export type { DraftAdoption };
export type { DraftOptions };
export type { DraftSeed };
export type { DraftState };
export type { DraftStatus };
export type { DraftValue };
export type { ErrorKind };
export type { ErrorMessages };
export type { ErrorReportContext };
export type { ErrorReporter };
export type { FieldPermissions };
export type { FieldReference };
export type { FieldSchema };
export type { FieldType };
export type { FilterOperator };
export type { FilterParam };
export type { GenesisViewerRoles };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { HistoryParams };
export type { Identifier };
export type { ImportParams };
export type { InfinitePageParam };
export type { InvalidationKey };
export type { KeyFilter };
export type { KeyScope };
export type { ListParams };
export type { ListResult };
export type { LiveOptions };
export type { MockProviderOptions };
export type { MutationMode };
export type { MutationModeOptions };
export type { NullFilter };
export type { PaginationParam };
export type { PostgrestFieldErrors };
export type { ProviderCapabilities };
export type { QueryKeys };
export type { RangeFilter };
export type { ReadOutcome };
export type { RecordComment };
export type { ResourceAccess };
export type { ResourceChangeEvent };
export type { ResourceContract };
export type { ResourceFormFieldDef };
export type { ResourceRelation };
export type { ResourceSchema };
export type { ResourceScope };
export type { ResourceSummary };
export type { RowAction };
export type { RowFailure };
export type { RowOf };
export type { RpcClient };
export type { ScalarFilter };
export type { ScopedKey };
export type { SelectOption };
export type { SortParam };
export type { StorageAdapter };
export type { StorageType };
export type { SubscribeParams };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { SupabaseProviderOptions };
export type { SupabaseRealtimeChannel };
export type { SupabaseRealtimePayload };
export type { SupabaseResourceConfig };
export type { SupabaseWriteContext };
export type { UndoableWrite };
export type { UpdateParams };
export type { UpdateResult };
export type { UseDraftReturn };
export type { UseInfiniteResourceOptions };
export type { UseInfiniteResourceReturn };
export type { UseOneOptions };
export type { UseRelationLabelOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourceReturn };
export type { UseUnsavedChangesGuardOptions };
export type { UseUnsavedChangesGuardReturn };
export type { UseWizardReturn };
export type { UseWriteOptions };
export type { UseWriteReturn };
export type { VersionField };
export type { Viewer };
export type { ViewerContext };
export type { WidgetHint };
export type { WizardStep };
export type { WorkspaceContext };
export type { WriteEvent };
export type { WriteOutcome };
```

---

## @marktiderman/genesis/ui

**Barrel:** [`packages/genesis/src/ui.ts`](../packages/genesis/src/ui.ts)

### Components (43)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AccessibleIcon`](../packages/ui/src/components/ui/accessible-icon.tsx) | `AccessibleIconProps` | Beta | AccessibleIcon — gives a decorative icon an accessible name. |
| [`Badge`](../packages/ui/src/components/ui/badge.tsx) | `BadgeProps` | — | _(no summary)_ |
| [`Band`](../packages/ui/src/components/layout/band.tsx) | `BandProps` | Beta | Band: a full-bleed, full-width marketing section. The background runs edge to edge; the content sits in a centered column with the page gutter. It is what a landing page is made of: a hero, a features band, a call to action, a footer. |
| [`BandLead`](../packages/ui/src/components/layout/band.tsx) | `BandLeadProps` | Beta | _(no summary)_ |
| [`BuilderLayout`](../packages/ui/src/components/layout/builder-layout.tsx) | `BuilderLayoutProps` | Beta | BuilderLayout — the three columns of a builder: an outline of the parts on the left, the editor for the selected part in the centre, a live preview on the right. |
| [`Button`](../packages/ui/src/components/ui/button.tsx) | `ButtonProps` | Stable | Button — primary interactive control. Variants: default, secondary, outline, ghost, destructive, link. |
| [`ButtonGroup`](../packages/ui/src/components/ui/button-group.tsx) | `ButtonGroupProps` | — | _(no summary)_ |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |
| [`Container`](../packages/ui/src/components/layout/container.tsx) | `ContainerProps` | Beta | Container — the page gutter: a centered column with a named maximum width and responsive side padding. |
| [`DashboardPage`](../packages/ui/src/components/layout/dashboard-page.tsx) | `DashboardPageProps` | Beta | DashboardPage — a stat row over a flexible region of charts, tables and sections. |
| [`DatePicker`](../packages/ui/src/components/ui/date-picker.tsx) | `DatePickerProps` | — | _(no summary)_ |
| [`DetailPage`](../packages/ui/src/components/layout/detail-page.tsx) | `DetailPageProps` | Beta | DetailPage — one record's full view: a title row with actions, a primary content region, and a metadata sidebar that drops below the content on small screens. |
| [`Display`](../packages/ui/src/components/layout/band.tsx) | `DisplayProps` | Beta | Display: a heading in the marketing type scale (`displayVariants`). |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | `EmptyStateProps` | Beta | EmptyState — what to show when a list, page, or panel has no data. |
| [`FormPage`](../packages/ui/src/components/layout/form-page.tsx) | `FormPageProps` | Beta | FormPage — a titled form: header, validation summary, a body of sections, and a sticky action bar. |
| [`Grid`](../packages/ui/src/components/layout/grid.tsx) | `GridProps` | Beta | Grid — two-dimensional flow for card and tile collections. |
| [`InputGroup`](../packages/ui/src/components/ui/input-group.tsx) | `InputGroupProps` | — | _(no summary)_ |
| [`Kbd`](../packages/ui/src/components/ui/kbd.tsx) | `KbdProps` | — | _(no summary)_ |
| [`PageLoading`](../packages/ui/src/components/patterns/page-loading.tsx) | `PageLoadingProps` | Beta | PageLoading — full-page or in-section loading state: a centered `Spinner` with an optional message. The loading-state counterpart to `EmptyState`. Reach for `Skeleton` instead when the placeholder should mimic the shape of the content th... |
| [`PasswordToggleField`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldProps` | Experimental | PasswordToggleField — a password input with a show/hide control that keeps focus and caret position across the toggle. |
| [`PasswordToggleFieldIcon`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldIconProps` | Experimental | PasswordToggleFieldIcon — the SVG-level variant of `PasswordToggleFieldSlot`. |
| [`PasswordToggleFieldInput`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldInputProps` | Experimental | PasswordToggleFieldInput — the field itself. |
| [`PasswordToggleFieldSlot`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldSlotProps` | Experimental | PasswordToggleFieldSlot — renders one of two nodes depending on visibility. |
| [`PasswordToggleFieldToggle`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldToggleProps` | Experimental | PasswordToggleFieldToggle — the show/hide button. |
| [`ResourceHeader`](../packages/ui/src/components/resource/ResourceHeader.tsx) | `ResourceHeaderProps` | — | The header of a page that edits one publishable thing (a form, a course, a lesson, a worksheet): the breadcrumb ("Courses › name"), the title once, its status and save-state chips, and on the right undo and redo, Preview, Share and Publi... |
| [`Section`](../packages/ui/src/components/layout/section.tsx) | `SectionProps` | Beta | Section — a titled region of a page: heading, optional description, optional trailing actions, and the content itself. |
| [`SettingsPage`](../packages/ui/src/components/layout/settings-page.tsx) | `SettingsPageProps` | Beta | SettingsPage — a sectioned settings surface with a nav rail for jumping between sections. |
| [`SettingsRow`](../packages/ui/src/components/patterns/settings-row.tsx) | `SettingsRowProps` | Beta | SettingsRow — label + description on one side, an arbitrary trailing control (Switch, Select, Button, Badge, ...) on the other. This is the shared layout behind every settings/preferences list row; see `ToggleRow` for the common label+de... |
| [`SortableList`](../packages/ui/src/components/patterns/sortable-list.tsx) | `SortableListProps` | Beta | A vertical list the user can rearrange: course steps, lesson blocks, form fields. |
| [`Spinner`](../packages/ui/src/components/ui/spinner.tsx) | `SpinnerProps` | — | _(no summary)_ |
| [`Split`](../packages/ui/src/components/layout/split.tsx) | `SplitProps` | Beta | Split — the master-detail layout: two panes side by side above a breakpoint, stacked below it. |
| [`Stack`](../packages/ui/src/components/layout/stack.tsx) | `StackProps` | Beta | Stack — one-dimensional flow. The single most-repeated shape in any application: a run of things in a line, evenly spaced. |
| [`StatusBadge`](../packages/ui/src/components/patterns/status-badge.tsx) | `StatusBadgeProps` | Beta | Status-specific badge for progress/health states — the OKR-style "on track / at risk / off track" goal vocabulary plus common task-lifecycle states ("done", "blocked", "in progress"). |
| [`Table`](../packages/ui/src/components/ui/table.tsx) | `TableProps` | — | _(no summary)_ |
| [`ToggleRow`](../packages/ui/src/components/patterns/toggle-row.tsx) | `ToggleRowProps` | Beta | ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common label+description+on/off row for settings and preferences UI. |
| [`Toolbar`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarProps` | Beta | Toolbar — a grouped set of controls that behaves as ONE tab stop. |
| [`ToolbarButton`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarButtonProps` | Beta | ToolbarButton — a button that participates in the toolbar's roving tabindex. |
| [`ToolbarLink`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarLinkProps` | Beta | ToolbarLink — an anchor inside the toolbar's roving tabindex. |
| [`ToolbarSeparator`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarSeparatorProps` | Beta | ToolbarSeparator — a decorative divider between toolbar groups. |
| [`ToolbarToggleItem`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarToggleItemProps` | Beta | ToolbarToggleItem — one member of a `ToolbarToggleGroup`. |
| [`Tooltip`](../packages/ui/src/components/ui/tooltip.tsx) | `TooltipProps` | Stable | Tooltip — hover/focus hint anchored to its trigger child. |
| [`UserAvatar`](../packages/ui/src/components/patterns/user-avatar.tsx) | `UserAvatarProps` | Beta | UserAvatar — canonical user-identity avatar. Shows the person's photo when `src` is set and loads successfully; otherwise (including a failed image load — Radix's Avatar swaps to the fallback automatically) it falls back to initials comp... |
| [`VisuallyHidden`](../packages/ui/src/components/ui/visually-hidden.tsx) | `VisuallyHiddenProps` | Beta | VisuallyHidden — content removed from the visual layout but kept in the accessibility tree. |

### Other exports (264)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`Accordion`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionContent`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionItem`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionTrigger`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`Alert`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDescription`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDialog`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogAction`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogCancel`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogContent`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogDescription`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogFooter`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogHeader`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogOverlay`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogPortal`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTitle`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTrigger`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertTitle`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`alertVariants`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AspectRatio`](../packages/ui/src/components/ui/aspect-ratio.tsx) | value | — | _(no summary)_ |
| [`Avatar`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarFallback`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarImage`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`bandVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Breadcrumb`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbEllipsis`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbItem`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbLink`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbList`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbPage`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbSeparator`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`Calendar`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`CalendarDayButton`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`Card`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardContent`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardDescription`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardFooter`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardHeader`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardTitle`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`Carousel`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselContent`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselItem`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselNext`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselPrevious`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`ChartContainer`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegend`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegendContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartStyle`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltip`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltipContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`Checkbox`](../packages/ui/src/components/ui/checkbox.tsx) | value | — | _(no summary)_ |
| [`Chip`](../packages/ui/src/components/resource/chip.tsx) | function | — | A small status chip in one of the resource workspace's tones (tinted, AA-safe Genesis badges). |
| [`cn`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`Collapsible`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleContent`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleTrigger`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`Command`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandDialog`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandEmpty`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandGroup`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandInput`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandItem`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandList`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandSeparator`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandShortcut`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`containerVariants`](../packages/ui/src/components/layout/container.tsx) | value | — | _(no summary)_ |
| [`ContextMenu`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuCheckboxItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuLabel`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuPortal`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSeparator`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuShortcut`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSub`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`dayLabel`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`DefaultLink`](../packages/ui/src/navigation.tsx) | const | Beta | Default link — a plain `<a>`. No router required. |
| [`defaultNavigate`](../packages/ui/src/navigation.tsx) | const | Beta | Default navigate — a full-page navigation. No router required. |
| [`Dialog`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogClose`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogContent`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogDescription`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogFooter`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogHeader`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogOverlay`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogPortal`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTitle`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTrigger`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`displayVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Drawer`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerClose`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerContent`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerDescription`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerFooter`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerHeader`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerOverlay`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerPortal`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTitle`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTrigger`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DropdownMenu`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuCheckboxItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuLabel`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuPortal`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSeparator`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuShortcut`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSub`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`embedSnippet`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`fillMessage`](../packages/ui/src/messages.tsx) | function | — | Fills `{name}` placeholders; an unknown placeholder is left as written. |
| [`FollowUpList`](../packages/ui/src/components/resource/FollowUpList.tsx) | function | — | Responses that need a follow-up (the host decides which; forms-studio's needsFollowUp is one rule), each with who answered, a tag, the day and context, their comment, its low score and the host's actions (Reply, Mark handled). Handled it... |
| [`FormDescription`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormError`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormField`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormLabel`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`GAP_CLASSES`](../packages/ui/src/components/layout/spacing.ts) | const | — | `SpaceToken` → Tailwind gap utility. `satisfies` keeps the table exhaustive against the scale, so adding a step to `spaceScale` without a class here is a type error rather than a silently missing gap. |
| [`gridVariants`](../packages/ui/src/components/layout/grid.tsx) | value | — | _(no summary)_ |
| [`H1`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H2`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H3`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H4`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`HeadlineNumbers`](../packages/ui/src/components/resource/HeadlineNumbers.tsx) | function | — | A row of headline numbers (KPI cards): two across on a phone, up to four on a wide screen. |
| [`HoverCard`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardContent`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardTrigger`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`Input`](../packages/ui/src/components/ui/input.tsx) | value | — | _(no summary)_ |
| [`InputGroupInput`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupPrefix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupSuffix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputOTP`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPGroup`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSeparator`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSlot`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`isPathActive`](../packages/core/src/navigation.ts) | function | Beta | Default active-path matcher, mirroring React Router's `NavLink` (prefix match, with `/` treated as exact). Consumers can override via an `isActive` prop where components accept one. |
| [`Label`](../packages/ui/src/components/ui/label.tsx) | value | — | _(no summary)_ |
| [`Large`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`Lead`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`leadVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Menubar`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarCheckboxItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarLabel`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarMenu`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarPortal`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSeparator`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarShortcut`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSub`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`Muted`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`NavigationMenu`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuContent`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuIndicator`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuItem`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuLink`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuList`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuTrigger`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`navigationMenuTriggerStyle`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuViewport`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NoFeaturesFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for an empty roadmap / feature list. |
| [`NoFeedbackFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a feedback inbox with nothing in it yet. |
| [`NoSearchResults`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a search or filter that matched nothing. |
| [`P`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`pageLoadingVariants`](../packages/ui/src/components/patterns/page-loading.tsx) | value | — | _(no summary)_ |
| [`Pagination`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationContent`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationEllipsis`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationItem`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationLink`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationNext`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationPrevious`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`Popover`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverContent`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverTrigger`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`prefilledUrl`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`Progress`](../packages/ui/src/components/ui/progress.tsx) | value | — | _(no summary)_ |
| [`RadioGroup`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`RadioGroupItem`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`readinessChip`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`ReadinessChip`](../packages/ui/src/components/resource/ReadinessChip.tsx) | function | — | "Ready to publish", or how many problems to fix: for the trailing slot of a resource page's row of tabs (genesis-ui's `<AppShellSubNavEnd>`). With `onClick` it is a button (open the checks). |
| [`readinessOf`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`renderSlot`](../packages/core/src/slots.tsx) | function | — | Renders one slot: the override if given, the default otherwise, nothing if ejected with `null`. |
| [`ResizableHandle`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanel`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanelGroup`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`resolveNavigation`](../packages/core/src/navigation.ts) | function | Beta | Resolve where `pathname` sits in a logical navigation tree. Pure: it never reads browser history or `window`. |
| [`resolveUiMessages`](../packages/ui/src/messages.tsx) | function | — | The catalogue with overrides merged over the English. |
| [`ResourceSettingsPage`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | Every setting of one thing (a form, a course, a worksheet) on one page: jump links on the left ("On this page", the one in view marked), the sections as cards on the right. On a phone the links sit above the sections as a row that scroll... |
| [`ResponsesToolbar`](../packages/ui/src/components/resource/ResponsesToolbar.tsx) | function | — | The Responses tab's toolbar: a Summary / Each response switch, the host's filters (forms-studio's ResponsesFilters, or its own) and, on the right, its export actions (open a Sheet, Download CSV). `labels` renames the switch, e.g. "Each s... |
| [`SAVE_STATE_LABEL`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`ScrollArea`](../packages/ui/src/components/ui/scroll-area.tsx) | value | — | _(no summary)_ |
| [`sectionHeadingVariants`](../packages/ui/src/components/layout/section.tsx) | value | — | _(no summary)_ |
| [`Select`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectContent`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectGroup`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectItem`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollDownButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollUpButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectTrigger`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectValue`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`Separator`](../packages/ui/src/components/ui/separator.tsx) | value | — | _(no summary)_ |
| [`SettingsSection`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | One group of settings as a card: an icon, a title and a sentence, then its rows (genesis-ui `SettingsRow` and `ToggleRow`: a label, a one-sentence description and the control), divided by lines. On a phone a row whose control isn't a swi... |
| [`ShareDialog`](../packages/ui/src/components/resource/ShareDialog.tsx) | function | — | Sharing one published page (a form, a course, a worksheet), as Google Forms' Send step: its link with Copy, a QR code (and a printable poster when the host has one), an `<iframe>` to embed it on a website, and a builder for prefilled lin... |
| [`Sheet`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetClose`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetContent`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetDescription`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetFooter`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetHeader`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetOverlay`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetPortal`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTitle`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTrigger`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`Skeleton`](../packages/ui/src/components/ui/skeleton.tsx) | value | — | _(no summary)_ |
| [`Slider`](../packages/ui/src/components/ui/slider.tsx) | value | — | _(no summary)_ |
| [`Small`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`spaceScale`](../packages/ui/src/components/layout/spacing.ts) | const | — | Semantic spacing steps, in pixels, on the 4px design grid. |
| [`splitVariants`](../packages/ui/src/components/layout/split.tsx) | value | — | _(no summary)_ |
| [`stackVariants`](../packages/ui/src/components/layout/stack.tsx) | value | — | _(no summary)_ |
| [`statusBadgeVariants`](../packages/ui/src/components/patterns/status-badge.tsx) | const | — | _(no summary)_ |
| [`SummaryCard`](../packages/ui/src/components/resource/SummaryCard.tsx) | function | — | One card of a summary column: an icon and a title, a short line on the right ("24 responses · average 4.1"), then whatever summarises it (bars, quotes, a split bar). |
| [`Switch`](../packages/ui/src/components/ui/switch.tsx) | value | — | _(no summary)_ |
| [`TableBody`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCaption`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCell`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableFooter`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHead`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHeader`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableRow`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`Tabs`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsContent`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsList`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsTrigger`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`Textarea`](../packages/ui/src/components/ui/textarea.tsx) | value | — | _(no summary)_ |
| [`toast`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toaster`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toggle`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToggleGroup`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`ToggleGroupItem`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToolbarToggleGroup`](../packages/ui/src/components/ui/toolbar.tsx) | const | Beta | ToolbarToggleGroup — a set of pressed/unpressed controls inside a toolbar (the classic bold / italic / underline cluster). |
| [`toolbarVariants`](../packages/ui/src/components/ui/toolbar.tsx) | const | — | _(no summary)_ |
| [`UiMessagesProvider`](../packages/ui/src/messages.tsx) | function | — | Rewords or translates Genesis UI's components below it. Nested providers build on the one above, so a section can change a few words. |
| [`useBrowserSearchParams`](../packages/ui/src/navigation.tsx) | function | Beta | Browser-native {@link SearchParamsAdapter} built on the History API. Reads the current query string and writes updates via `pushState`/`replaceState`, staying reactive to `popstate` events. No router required. |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`userAvatarVariants`](../packages/ui/src/components/patterns/user-avatar.tsx) | value | — | _(no summary)_ |
| [`useUiMessages`](../packages/ui/src/messages.tsx) | function | — | The catalogue in effect: English unless a `UiMessagesProvider` says otherwise. |

### Types (34)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BuilderLayoutSlotProps };
export type { ButtonAsChildProps };
export type { CarouselApi };
export type { ChartConfig };
export type { ChipTone };
export type { CommandPaletteItem };
export type { FollowUpEntry };
export type { GenesisLinkProps };
export type { HeadlineNumber };
export type { IsPathActiveOptions };
export type { LinkComponent };
export type { NavigateFn };
export type { NavigationNode };
export type { PrefillChoice };
export type { Readiness };
export type { ReadinessFinding };
export type { ReadinessLabels };
export type { ReadinessOptions };
export type { ResolvedNavigation };
export type { ResourceSettingsSection };
export type { ResponsesView };
export type { SaveState };
export type { SearchParamsAdapter };
export type { SettingsPageSection };
export type { SlotOverride };
export type { SlotPropsFor };
export type { Slots };
export type { SortableListItemContext };
export type { SortableListReorder };
export type { SpaceToken };
export type { SplitBreakpoint };
export type { SplitRatio };
export type { StatusBadgeStatus };
export type { UiMessagesOverrides };
```

---

## @marktiderman/genesis/ui/utils

**Barrel:** [`packages/genesis/src/ui-utils.ts`](../packages/genesis/src/ui-utils.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cn`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`formatDate`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`formatRelativeTime`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |

---

## @marktiderman/genesis/ui/status-colors

**Barrel:** [`packages/genesis/src/ui-status-colors.ts`](../packages/genesis/src/ui-status-colors.ts)

### Other exports (11)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`allStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Combined lookup — useful when you don't know the entity type |
| [`changelogTypeColors`](../packages/ui/src/status-colors.ts) | const | — | Changelog entry types |
| [`feedbackStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Feedback statuses |
| [`getCoverageColor`](../packages/ui/src/status-colors.ts) | function | — | Coverage color helpers |
| [`getCoverageTextColor`](../packages/ui/src/status-colors.ts) | function | — | _(no summary)_ |
| [`ideaStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Idea statuses |
| [`prdStatusColors`](../packages/ui/src/status-colors.ts) | const | — | PRD statuses |
| [`productStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Product statuses |
| [`researchActionColors`](../packages/ui/src/status-colors.ts) | const | — | Research recommended actions |
| [`syncStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Sync statuses |
| [`taskStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Task statuses |

---

## @marktiderman/genesis/ui/hooks

**Barrel:** [`packages/genesis/src/ui-hooks.ts`](../packages/genesis/src/ui-hooks.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createPrefetch`](../packages/ui/src/hooks/use-prefetch.ts) | function | — | Factory: create prefetch + prefetchHandlers bound to a given route map. |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`useDataFilters`](../packages/ui/src/hooks/use-data-filters.ts) | function | — | _(no summary)_ |
| [`useIsMobile`](../packages/ui/src/hooks/use-mobile.ts) | function | — | Whether the viewport is narrower than the mobile breakpoint (768px). |
| [`useKeyboardNavigation`](../packages/ui/src/hooks/use-keyboard-navigation.ts) | function | Beta | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useResourcePage`](../packages/ui/src/hooks/use-resource-page.ts) | function | — | _(no summary)_ |
| [`useResourceTable`](../packages/ui/src/components/data/use-resource-table.ts) | function | Beta | The list behind {@link ResourcePage}, without any markup: where the rows come from (a `resource` through the data provider, or `data` you pass), search, sort, status filter and paging, selection, the open record (and its URL state), the ... |
| [`useResourceUrlState`](../packages/ui/src/hooks/use-resource-url-state.ts) | function | Beta | A list's peek, page, sort and search, kept in the URL through any {@link SearchParamsAdapter} (the browser's, React Router's or TanStack Router's). The URL is the source of truth: a copied link reopens the same record on the same page, a... |
| [`useSavedViews`](../packages/ui/src/hooks/use-saved-views.ts) | function | — | Persist `DataFilters` saved-view shape in localStorage. |
| [`useViewPreference`](../packages/ui/src/hooks/use-view-preference.ts) | function | — | _(no summary)_ |
| [`useViewSettings`](../packages/ui/src/hooks/use-view-settings.ts) | function | — | _(no summary)_ |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |

### Types (29)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CommandPaletteItem };
export type { Density };
export type { FilterDef };
export type { FilterDefs };
export type { FilterValues };
export type { KeyboardNavOptions };
export type { KeyboardNavResult };
export type { ResourceActions };
export type { ResourceColumnDef };
export type { ResourcePageTreeState };
export type { ResourceTableState };
export type { ResourceUrlParams };
export type { ResourceUrlState };
export type { ResourceUrlStateOptions };
export type { ResponsiveViewMode };
export type { RouteMap };
export type { UseDataFiltersOptions };
export type { UseOneOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourcePageProps };
export type { UseResourcePageReturn };
export type { UseResourceReturn };
export type { UseSavedViewsReturn };
export type { UseWizardReturn };
export type { ViewModeDefault };
export type { ViewSettings };
export type { WizardStep };
```

---

## @marktiderman/genesis/design-system

**Barrel:** [`packages/genesis/src/design-system.ts`](../packages/genesis/src/design-system.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/index.ts) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (73)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`borderRadius`](../packages/design-system/src/tokens/spacing.ts) | const | — | Shared spacing and layout tokens for all Genesis projects. |
| [`brandRoleVariables`](../packages/design-system/src/factories/brand-roles.ts) | function | Beta | The theme role variables for `brand`, per mode, as `{ "--primary": "243 75% 59%", … }` maps: the same names and format as `themes/genesis.css`. |
| [`clampBounds`](../packages/design-system/src/schema/brand.ts) | function | — | A clamp's min and max, in rem; undefined for a plain length. |
| [`classicDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Today's look, unchanged: it emits no tokens, so every component keeps the stylesheet's own sizes, spacing and colours. The default for a brand that names no design system. |
| [`composite`](../packages/design-system/src/design-systems/color.ts) | function | — | `top` over `bottom` at `alpha` (0–1), blended in sRGB as browsers do: a hex. |
| [`contrast`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 contrast ratio (1–21) of two hex colours. |
| [`CORNER_RADII`](../packages/design-system/src/design-systems/tokens.ts) | const | — | Radius per corners set, in px: chips and inputs, cards, feature images, buttons, photos. |
| [`CORNERS`](../packages/design-system/src/design-systems/define.ts) | const | — | Corner radius sets, from square to friendly. |
| [`crispDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Cool and exact: a cool ground, hairlines, crisp corners, no shadows, calm motion. |
| [`debugBrandPreset`](../packages/design-system/src/factories/from-brand.ts) | function | — | Debug utility — dumps the resolved Tailwind preset and NativeWind theme side-by-side so brand authors can introspect token mis-resolution without reading factory source. |
| [`DEFAULT_DESIGN_SYSTEM_ID`](../packages/design-system/src/design-systems/built-in.ts) | const | — | The design system a brand that names none gets. |
| [`DEFAULT_EYEBROW`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_FONT_CLASS_RULES`](../packages/design-system/src/design-systems/define.ts) | const | — | How each font class is set at display sizes, when a design system says nothing else. |
| [`DEFAULT_LEADING`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`DEFAULT_RAMP`](../packages/design-system/src/design-systems/define.ts) | const | — | A ramp that suits most brands: 16 → 18px body, 48 → 112px display. |
| [`defineDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | Beta | Define a design system: checks it and returns it frozen, with its id (`name@version`). Throws with every problem when it isn't sound. |
| [`DENSITIES`](../packages/design-system/src/design-systems/define.ts) | const | — | Section padding. |
| [`designSystemTheme`](../packages/design-system/src/design-systems/tokens.ts) | function | Beta | The CSS variables for one design system and one brand, per mode, and the colour pairs they promise. |
| [`fluid`](../packages/design-system/src/design-systems/tokens.ts) | function | — | `{ min: 3, max: 7 }` → `clamp(3rem, 1.6667rem + 5.9259vw, 7rem)`: `min` at a 360px viewport, `max` at 1440px, linear between. |
| [`FONT_CHOICES`](../packages/design-system/src/fonts.ts) | const | — | The fonts a brand may choose. Every one but `system` is self-hosted. |
| [`FONT_CLASSES`](../packages/design-system/src/fonts.ts) | const | — | How a family is drawn at display sizes: design systems set weight, tracking and case per class. |
| [`FONT_IDS`](../packages/design-system/src/fonts.ts) | const | — | Every font choice id, `system` first. |
| [`fontFamily`](../packages/design-system/src/tokens/typography.ts) | const | — | Shared typography tokens for all Genesis projects. |
| [`fontFileKey`](../packages/design-system/src/fonts.ts) | const | — | The key of one font file (`inter-700`): what the asset table and the renderer name it by. |
| [`fontForStack`](../packages/design-system/src/fonts.ts) | function | — | The font choice a font stack starts with (`["Bebas Neue", "Impact", …]` or `"\"Bebas Neue\", Impact"`), when it is one of `FONT_CHOICES`. |
| [`fontSize`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`fontWeight`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`generateDarkTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for dark mode. |
| [`generateLightTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for light mode. |
| [`GENESIS_THEME_V2`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`genesisBrand`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis OOTB brand — the single source of truth for the full brand palette. |
| [`genesisColors`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | _(no summary)_ |
| [`genesisTheme`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis brand — indigo (distinct from the emerald `success`). |
| [`getDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | A design system by id (`crisp@1`): a built-in one or a registered one. |
| [`GROUNDS`](../packages/design-system/src/design-systems/color.ts) | const | — | The page's ground: warm, cool, the brand's own hue barely tinted, or dark. |
| [`hexToHslTriplet`](../packages/design-system/src/design-systems/color.ts) | function | — | `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's role variables hold (`hsl(var(--primary))`). |
| [`hexToOklch`](../packages/design-system/src/design-systems/color.ts) | function | — | sRGB hex → OKLCH. |
| [`IMAGE_FILTERS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`isColorScale`](../packages/design-system/src/schema/brand.ts) | function | — | Type guard: returns true when `value` looks like a `ColorScale`. |
| [`LATIN_UNICODE_RANGE`](../packages/design-system/src/fonts.ts) | const | — | The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. |
| [`listDesignSystems`](../packages/design-system/src/design-systems/registry.ts) | function | — | Every design system available: the built-in ones, then the registered ones. |
| [`maxChroma`](../packages/design-system/src/design-systems/color.ts) | function | — | The most chroma sRGB can show at this lightness and hue, up to `c`. |
| [`MOTION_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | How much things move. CSS only; reduced motion always means `none`. |
| [`neutral`](../packages/design-system/src/tokens/colors.ts) | const | — | Shared semantic colors used across all Genesis projects. Brand-specific primary colors belong in presets, not here. |
| [`NEUTRAL_DESIGN_SYSTEMS`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Every neutral design system, by id. |
| [`oklchToHex`](../packages/design-system/src/design-systems/color.ts) | function | — | OKLCH → sRGB hex, reducing chroma (never lightness or hue) until it fits the gamut. |
| [`palette`](../packages/design-system/src/design-systems/color.ts) | function | Beta | The palette for a brand: colour roles for light and dark, and the ramps. |
| [`ramp`](../packages/design-system/src/design-systems/color.ts) | function | — | An 11-step ramp from one colour, with the colour itself at its nearest step. |
| [`RAMP_STEPS`](../packages/design-system/src/design-systems/color.ts) | const | — | The ramp's steps and their OKLCH lightness. |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`registerDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | Beta | Make a design system available by its id, so a brand that names it (`brand.designSystem.id`) resolves to it. Registering an id again with a different definition throws: a changed look is a new version. |
| [`relativeLuminance`](../packages/design-system/src/design-systems/color.ts) | function | — | WCAG 2 relative luminance of a hex colour. |
| [`resolveChoices`](../packages/design-system/src/design-systems/define.ts) | function | — | The design system's choices for a brand: the brand's, else the design system's defaults. |
| [`resolveThemeRoles`](../packages/design-system/src/tokens/roles.ts) | function | Beta | Every role's color for one platform and scheme. |
| [`resolveTokens`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`rolePairs`](../packages/design-system/src/design-systems/color.ts) | function | — | Every pair the roles promise, for a contrast check or a test. |
| [`SCRIMS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`SELF_HOSTED_FONTS`](../packages/design-system/src/fonts.ts) | const | — | Every self-hosted family, by its font choice id. |
| [`semantic`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`SHADOW_LEVELS`](../packages/design-system/src/design-systems/define.ts) | const | — | _(no summary)_ |
| [`softDesignSystem`](../packages/design-system/src/design-systems/built-in.ts) | const | — | Warm and open: a warm ground, generous space, soft corners and shadows. |
| [`spacing`](../packages/design-system/src/tokens/spacing.ts) | const | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`tailwindFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a Tailwind v4 preset from a {@link CanonicalBrand} config. |
| [`THEME_ROLES`](../packages/design-system/src/tokens/roles.ts) | const | Beta | _(no summary)_ |
| [`themeFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a NativeWind v5 theme from a {@link CanonicalBrand} config. |
| [`themeToCss`](../packages/design-system/src/tokens/themes.ts) | function | — | Convert a theme variable map to a CSS string block. |
| [`TYPE_STEPS`](../packages/design-system/src/design-systems/define.ts) | const | — | The type ramp's steps, smallest first. |
| [`unregisterDesignSystem`](../packages/design-system/src/design-systems/registry.ts) | function | — | Remove a registered design system (for tests). Built-in ones stay. |
| [`useTheme`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`validateBrand`](../packages/design-system/src/schema/brand.ts) | function | — | Validate a candidate brand object against the canonical schema. |
| [`validateDesignSystem`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a design system input; empty when it is sound. |
| [`validateDesignSystemChoice`](../packages/design-system/src/design-systems/define.ts) | function | — | Every problem with a brand's design system choice; empty when it is sound. |

### Types (48)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandExtensions };
export type { BrandFactoryOptions };
export type { BrandRoleVariables };
export type { BrandRoleVariablesOptions };
export type { BrandValidationResult };
export type { CanonicalBrand };
export type { ColorRoles };
export type { ColorScale };
export type { ContrastPair };
export type { Corners };
export type { Density };
export type { DesignSystem };
export type { DesignSystemChoice };
export type { DesignSystemInput };
export type { DesignSystemPair };
export type { DesignSystemTheme };
export type { DesignSystemTokenInput };
export type { EyebrowRule };
export type { FluidSize };
export type { FontClass };
export type { FontClassRule };
export type { FontId };
export type { FontInfo };
export type { GradientToken };
export type { Ground };
export type { ImageFilter };
export type { MotionLevel };
export type { NativeBrandOutput };
export type { Oklch };
export type { Palette };
export type { PaletteInput };
export type { PlatformOverridable };
export type { RampStep };
export type { ResolveThemeRolesOptions };
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { Scrim };
export type { SelfHostedFont };
export type { ShadowLevel };
export type { ShadowToken };
export type { TailwindBrandOutput };
export type { ThemeConfig };
export type { ThemeMode };
export type { ThemeRole };
export type { TypeStep };
export type { TypographyTokens };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis/design-system/tokens

**Barrel:** [`packages/genesis/src/design-system-tokens.ts`](../packages/genesis/src/design-system-tokens.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`borderRadius`](../packages/design-system/src/tokens/spacing.ts) | const | — | Shared spacing and layout tokens for all Genesis projects. |
| [`fontFamily`](../packages/design-system/src/tokens/typography.ts) | const | — | Shared typography tokens for all Genesis projects. |
| [`fontSize`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`fontWeight`](../packages/design-system/src/tokens/typography.ts) | const | — | _(no summary)_ |
| [`generateDarkTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for dark mode. |
| [`generateLightTheme`](../packages/design-system/src/tokens/themes.ts) | function | — | Generate a full set of Shadcn-compatible CSS variables for light mode. |
| [`neutral`](../packages/design-system/src/tokens/colors.ts) | const | — | Shared semantic colors used across all Genesis projects. Brand-specific primary colors belong in presets, not here. |
| [`resolveThemeRoles`](../packages/design-system/src/tokens/roles.ts) | function | Beta | Every role's color for one platform and scheme. |
| [`semantic`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`spacing`](../packages/design-system/src/tokens/spacing.ts) | const | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/colors.ts) | const | — | _(no summary)_ |
| [`THEME_ROLES`](../packages/design-system/src/tokens/roles.ts) | const | Beta | _(no summary)_ |
| [`themeToCss`](../packages/design-system/src/tokens/themes.ts) | function | — | Convert a theme variable map to a CSS string block. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ResolveThemeRolesOptions };
export type { ThemeConfig };
export type { ThemeRole };
```

---

## @marktiderman/genesis/design-system/theme

**Barrel:** [`packages/genesis/src/design-system-theme.ts`](../packages/genesis/src/design-system-theme.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/provider.web.tsx) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`GENESIS_THEME_V2`](../packages/design-system/src/theme/flag.ts) | const | — | Resolved flag value at module-load time. Most consumer code should read this instead of calling {@link readGenesisThemeV2Flag} repeatedly. |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/flag.ts) | function | — | Read the GENESIS_THEME_V2 flag in a platform-agnostic way. |
| [`resolveTokens`](../packages/design-system/src/theme/theme.ts) | function | — | Resolves the brand's tokens for a given mode. Pure function; same implementation on web + native (consumed by both providers). |
| [`useTheme`](../packages/design-system/src/theme/use-theme.ts) | function | — | Read the active theme from the nearest `<GenesisThemeProvider>`. |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { ThemeMode };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis/switchboard

**Barrel:** [`packages/genesis/src/switchboard.ts`](../packages/genesis/src/switchboard.ts)

### Other exports (30)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AIRTABLE_BASE_ID`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`AirtableAdapter`](../packages/switchboard/src/adapters/airtable.ts) | class | — | _(no summary)_ |
| [`asWritable`](../packages/switchboard/src/adapters/adapter.ts) | function | — | Narrow an adapter to its writable surface (or throw a typed error). |
| [`CodeAdapter`](../packages/switchboard/src/adapters/code.ts) | class | — | _(no summary)_ |
| [`driftReport`](../packages/switchboard/src/reconcile.ts) | function | — | Compare a resource across two Levels using the two adapters that back those Levels. The `from`/`to` adapters are passed in explicitly by the caller; the Registry is used only to look up the resource contract (`getContract`). |
| [`featuresAirtableMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresContract`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresSupabaseMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`gitdataMdContract`](../packages/switchboard/src/gitdata-names.ts) | function | — | Default markdown contract: identity + common columns; extras still round-trip. |
| [`gitdataResourceName`](../packages/switchboard/src/gitdata-names.ts) | function | — | Stable resource name for a gitdata table — minimum wiring for new tables. |
| [`inferFieldType`](../packages/switchboard/src/introspect.ts) | function | — | Infer the canonical StorageType (+ array-ness) of a single value. |
| [`introspectFields`](../packages/switchboard/src/introspect.ts) | function | — | Derive a resource's live field schema from its actual DATA. Fields = the union of keys across `rows`; types are inferred from values; `optional`/`array` come from the data. The optional `contract` ENRICHES (description + a more-specific ... |
| [`isMergeBinding`](../packages/switchboard/src/types.ts) | function | — | Narrow a binding to the Tier-B MERGE (multi-source) variant. |
| [`LEVEL_LABEL`](../packages/switchboard/src/types.ts) | const | — | Human-facing label for a Level (docs / drift reports). |
| [`LEVELS`](../packages/switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`markStale`](../packages/switchboard/src/staleness.ts) | function | — | Stamp a row array as a degraded (stale) read. Returns the SAME array for chaining. The marker is non-enumerable so it never serializes into data. |
| [`NotionAdapter`](../packages/switchboard/src/adapters/notion.ts) | class | — | _(no summary)_ |
| [`promote`](../packages/switchboard/src/reconcile.ts) | function | — | Generate a reviewable Supabase migration that promotes a proven L2 shape to L3. Emits: CREATE TABLE (from the contract field schema) + a user_id column + RLS (user_id = auth.uid()) + updated_at trigger + optional backfill. Returns SQL TE... |
| [`propagateStale`](../packages/switchboard/src/staleness.ts) | function | — | Copy a staleness marker from `source` onto `target` (used after a defensive `{ ...row }` clone drops the array-level symbol). No-op when `source` is fresh. Returns `target` for chaining. |
| [`PROVIDER_LEVEL`](../packages/switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`ReadOnlyAdapterError`](../packages/switchboard/src/adapters/adapter.ts) | class | — | Thrown by a read-only adapter when a write op is attempted. |
| [`reconcileModel`](../packages/switchboard/src/reconcile.ts) | function | — | Reconcile the whole MODEL across two Levels: run `driftReport` for every registered resource backed by BOTH adapters, record the rest as MISSING, and roll up a model verdict. The `from`/`to` adapters are passed explicitly (the Registry s... |
| [`Registry`](../packages/switchboard/src/registry.ts) | class | — | _(no summary)_ |
| [`staleInfo`](../packages/switchboard/src/staleness.ts) | function | — | Read the staleness marker off a row array (or any value), if present. |
| [`SupabaseAdapter`](../packages/switchboard/src/adapters/supabase.ts) | class | — | _(no summary)_ |
| [`Switchboard`](../packages/switchboard/src/resolver.ts) | class | — | _(no summary)_ |
| [`ticketsAirtableMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsContract`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsSupabaseMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`UnknownResourceError`](../packages/switchboard/src/adapters/adapter.ts) | class | — | Thrown when an adapter is asked for a resource it has no mapping for. |

### Types (43)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Adapter };
export type { AirtableAdapterConfig };
export type { AirtableResourceMap };
export type { Binding };
export type { CodeAdapterOptions };
export type { DataRow };
export type { DescribeResult };
export type { DriftReport };
export type { EnvironmentBinding };
export type { FeatureRow };
export type { FetchLike };
export type { FieldBinding };
export type { FieldDrift };
export type { FieldSchema };
export type { FieldType };
export type { Level };
export type { MergeBinding };
export type { ModelReconcileReport };
export type { ModelReconcileSummary };
export type { NotionAdapterConfig };
export type { NotionPropertyMap };
export type { NotionPropertyType };
export type { NotionResourceMap };
export type { PromoteOptions };
export type { PromoteResult };
export type { ProviderKind };
export type { QueryOptions };
export type { ReconcileModelOptions };
export type { ResolvedPlan };
export type { ResourceBinding };
export type { ResourceClient };
export type { ResourceContract };
export type { ResourceReconcile };
export type { RowDrift };
export type { StaleReadInfo };
export type { SupabaseAdapterConfig };
export type { SupabaseClientLike };
export type { SupabaseQueryBuilder };
export type { SupabaseResourceMap };
export type { SwitchboardContract };
export type { TicketRow };
export type { Tier };
export type { ValueDrift };
```

---

## @marktiderman/genesis/switchboard/gitdata

**Barrel:** [`packages/genesis/src/switchboard-gitdata.ts`](../packages/genesis/src/switchboard-gitdata.ts)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`attachGitdata`](../packages/switchboard/src/gitdata.ts) | function | — | _(no summary)_ |
| [`GitdataAdapter`](../packages/switchboard/src/adapters/gitdata.ts) | class | — | _(no summary)_ |
| [`gitdataMdContract`](../packages/switchboard/src/gitdata-names.ts) | function | — | Default markdown contract: identity + common columns; extras still round-trip. |
| [`gitdataResourceName`](../packages/switchboard/src/gitdata-names.ts) | function | — | Stable resource name for a gitdata table — minimum wiring for new tables. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AttachGitdataOptions };
export type { GitdataAdapterConfig };
export type { GitdataResourceMap };
```

---

## @marktiderman/genesis/switchboard/data-provider

**Barrel:** [`packages/genesis/src/switchboard-data-provider.ts`](../packages/genesis/src/switchboard-data-provider.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSwitchboardProvider`](../packages/switchboard/src/data-provider.ts) | function | — | Build a `DataProvider` backed by a `Switchboard`. Reads route to the resolved backing (Supabase live, Code mock); a Genesis-core consumer needs no change — only the data plane beneath `useResource` is swapped. |

---

## @marktiderman/genesis/native

**Barrel:** [`packages/genesis/src/native.ts`](../packages/genesis/src/native.ts)

### Components (96)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppleSignInButton`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | `AppleSignInButtonProps` | — | Apple's branded button, full width. Renders nothing off iOS. |
| [`AuthBranding`](../packages/ui-native/src/layouts/auth.tsx) | `AuthBrandingProps` | — | _(no summary)_ |
| [`AuthForm`](../packages/ui-native/src/layouts/auth.tsx) | `AuthFormProps` | — | _(no summary)_ |
| [`AuthScreen`](../packages/ui-native/src/layouts/auth-screen.tsx) | `AuthScreenProps` | — | _(no summary)_ |
| [`Box`](../packages/ui-native/src/components/layout/index.ts) | `BoxProps` | — | _(no summary)_ |
| [`BrandExtensionsProvider`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | `BrandExtensionsProviderProps` | — | _(no summary)_ |
| [`GenesisModulesProvider`](../packages/ui-native/src/native-modules.tsx) | `GenesisModulesProviderProps` | — | Pass the optional native modules the app has installed. Nested providers merge: an inner one adds to or replaces what an outer one gave. Define the `modules` object once at module scope (as the starter's `src/lib/native-modules.ts` does)... |
| [`Grid`](../packages/ui-native/src/components/layout/index.ts) | `GridProps` | — | _(no summary)_ |
| [`InboxPage`](../packages/ui-native/src/layouts/inbox-page.tsx) | `InboxPageProps` | — | _(no summary)_ |
| [`Inline`](../packages/ui-native/src/components/layout/index.ts) | `InlineProps` | — | _(no summary)_ |
| [`NativeAccordion`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionProps` | — | _(no summary)_ |
| [`NativeAccordionContent`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionContentProps` | — | _(no summary)_ |
| [`NativeAccordionItem`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionItemProps` | — | _(no summary)_ |
| [`NativeAccordionTrigger`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionTriggerProps` | — | _(no summary)_ |
| [`NativeAlert`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertProps` | — | _(no summary)_ |
| [`NativeAlertDescription`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertDescriptionProps` | — | _(no summary)_ |
| [`NativeAlertTitle`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertTitleProps` | — | _(no summary)_ |
| [`NativeAvatar`](../packages/ui-native/src/components/avatar.tsx) | `NativeAvatarProps` | — | _(no summary)_ |
| [`NativeBadge`](../packages/ui-native/src/components/badge.tsx) | `NativeBadgeProps` | — | _(no summary)_ |
| [`NativeBanner`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeBannerProps` | — | _(no summary)_ |
| [`NativeButton`](../packages/ui-native/src/components/button.tsx) | `NativeButtonProps` | — | _(no summary)_ |
| [`NativeCard`](../packages/ui-native/src/components/card.tsx) | `NativeCardProps` | — | _(no summary)_ |
| [`NativeCardTitle`](../packages/ui-native/src/components/card.tsx) | `NativeCardTitleProps` | — | _(no summary)_ |
| [`NativeCheckbox`](../packages/ui-native/src/components/checkbox.tsx) | `NativeCheckboxProps` | — | _(no summary)_ |
| [`NativeChip`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipProps` | — | _(no summary)_ |
| [`NativeChipGroup`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipGroupProps` | — | _(no summary)_ |
| [`NativeCombobox`](../packages/ui-native/src/components/combobox.tsx) | `NativeComboboxProps` | — | _(no summary)_ |
| [`NativeDatePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeDatePickerProps` | — | _(no summary)_ |
| [`NativeDialog`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogProps` | — | _(no summary)_ |
| [`NativeDialogContent`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogContentProps` | — | _(no summary)_ |
| [`NativeDialogDescription`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogDescriptionProps` | — | _(no summary)_ |
| [`NativeDialogFooter`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogFooterProps` | — | _(no summary)_ |
| [`NativeDialogHeader`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogHeaderProps` | — | _(no summary)_ |
| [`NativeDialogTitle`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogTitleProps` | — | _(no summary)_ |
| [`NativeDrawer`](../packages/ui-native/src/components/drawer.tsx) | `NativeDrawerProps` | — | _(no summary)_ |
| [`NativeDropdownMenu`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuProps` | — | _(no summary)_ |
| [`NativeDropdownMenuContent`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuContentProps` | — | _(no summary)_ |
| [`NativeDropdownMenuItem`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuItemProps` | — | _(no summary)_ |
| [`NativeDropdownMenuTrigger`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuTriggerProps` | — | _(no summary)_ |
| [`NativeEmptyState`](../packages/ui-native/src/components/empty-state.tsx) | `NativeEmptyStateProps` | — | _(no summary)_ |
| [`NativeFullScreenModal`](../packages/ui-native/src/components/full-screen-modal.tsx) | `NativeFullScreenModalProps` | Beta | _(no summary)_ |
| [`NativeGlassSurface`](../packages/ui-native/src/components/glass-surface.tsx) | `NativeGlassSurfaceProps` | — | _(no summary)_ |
| [`NativeHeaderCard`](../packages/ui-native/src/components/header-card.tsx) | `NativeHeaderCardProps` | — | _(no summary)_ |
| [`NativeIcon`](../packages/ui-native/src/components/icon.tsx) | `NativeIconProps` | — | _(no summary)_ |
| [`NativeImage`](../packages/ui-native/src/components/image.tsx) | `NativeImageProps` | — | _(no summary)_ |
| [`NativeInlineAlert`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeInlineAlertProps` | — | _(no summary)_ |
| [`NativeInput`](../packages/ui-native/src/components/input.tsx) | `NativeInputProps` | — | _(no summary)_ |
| [`NativeLabel`](../packages/ui-native/src/components/label.tsx) | `NativeLabelProps` | — | _(no summary)_ |
| [`NativeListItem`](../packages/ui-native/src/components/list-item.tsx) | `NativeListItemProps` | — | _(no summary)_ |
| [`NativeLoadingState`](../packages/ui-native/src/components/loading-state.tsx) | `NativeLoadingStateProps` | — | _(no summary)_ |
| [`NativeNumberInput`](../packages/ui-native/src/components/number-input.tsx) | `NativeNumberInputProps` | — | _(no summary)_ |
| [`NativePagination`](../packages/ui-native/src/components/pagination.tsx) | `NativePaginationProps` | — | _(no summary)_ |
| [`NativePopover`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverProps` | — | _(no summary)_ |
| [`NativePopoverContent`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverContentProps` | — | _(no summary)_ |
| [`NativePopoverTrigger`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverTriggerProps` | — | _(no summary)_ |
| [`NativeProgress`](../packages/ui-native/src/components/progress.tsx) | `NativeProgressProps` | — | _(no summary)_ |
| [`NativeRadioGroup`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupProps` | — | _(no summary)_ |
| [`NativeRadioGroupItem`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupItemProps` | — | _(no summary)_ |
| [`NativeRangeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeRangeSliderProps` | — | _(no summary)_ |
| [`NativeRefreshControl`](../packages/ui-native/src/components/refresh-control.tsx) | `NativeRefreshControlProps` | — | _(no summary)_ |
| [`NativeSearchBar`](../packages/ui-native/src/components/search-bar.tsx) | `NativeSearchBarProps` | — | _(no summary)_ |
| [`NativeSectionListHeader`](../packages/ui-native/src/components/section-list.tsx) | `NativeSectionListHeaderProps` | — | _(no summary)_ |
| [`NativeSegmentedControl`](../packages/ui-native/src/components/segmented-control.tsx) | `NativeSegmentedControlProps` | — | _(no summary)_ |
| [`NativeSelect`](../packages/ui-native/src/components/select.tsx) | `NativeSelectProps` | — | _(no summary)_ |
| [`NativeSelectContent`](../packages/ui-native/src/components/select.tsx) | `NativeSelectContentProps` | — | _(no summary)_ |
| [`NativeSelectItem`](../packages/ui-native/src/components/select.tsx) | `NativeSelectItemProps` | — | _(no summary)_ |
| [`NativeSelectTrigger`](../packages/ui-native/src/components/select.tsx) | `NativeSelectTriggerProps` | — | _(no summary)_ |
| [`NativeSeparator`](../packages/ui-native/src/components/separator.tsx) | `NativeSeparatorProps` | — | _(no summary)_ |
| [`NativeSheet`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProps` | Beta | _(no summary)_ |
| [`NativeSheetProvider`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProviderProps` | Beta | Opts every `NativeSheet` below it into `@gorhom/bottom-sheet` and mounts the library's `BottomSheetModalProvider`. A module missing any export the sheet needs is reported with `console.error` and ignored, so sheets fall back to the nativ... |
| [`NativeSkeleton`](../packages/ui-native/src/components/skeleton.tsx) | `NativeSkeletonProps` | — | _(no summary)_ |
| [`NativeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeSliderProps` | — | _(no summary)_ |
| [`NativeStepper`](../packages/ui-native/src/components/stepper.tsx) | `NativeStepperProps` | — | _(no summary)_ |
| [`NativeSwitch`](../packages/ui-native/src/components/switch.tsx) | `NativeSwitchProps` | — | _(no summary)_ |
| [`NativeTabs`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsProps` | — | _(no summary)_ |
| [`NativeTabsContent`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsContentProps` | — | _(no summary)_ |
| [`NativeTabsList`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsListProps` | — | _(no summary)_ |
| [`NativeTabsTrigger`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsTriggerProps` | — | _(no summary)_ |
| [`NativeText`](../packages/ui-native/src/components/text.tsx) | `NativeTextProps` | — | _(no summary)_ |
| [`NativeTextarea`](../packages/ui-native/src/components/textarea.tsx) | `NativeTextareaProps` | — | _(no summary)_ |
| [`NativeTimePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeTimePickerProps` | — | _(no summary)_ |
| [`NativeToastProvider`](../packages/ui-native/src/components/toast.tsx) | `NativeToastProviderProps` | — | _(no summary)_ |
| [`NativeToggle`](../packages/ui-native/src/components/toggle.tsx) | `NativeToggleProps` | — | _(no summary)_ |
| [`NativeTooltip`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipProps` | — | _(no summary)_ |
| [`NativeTooltipContent`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipContentProps` | — | _(no summary)_ |
| [`NativeTooltipTrigger`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipTriggerProps` | — | _(no summary)_ |
| [`NavBarSaveButton`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSaveButtonProps` | — | _(no summary)_ |
| [`NavBarSearchBar`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSearchBarProps` | — | Inline search input meant to occupy the title slot on a search results screen. For a sticky search-below-the-header pattern, prefer the standalone <NativeSearchBar> primitive. |
| [`NavBarTitle`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarTitleProps` | — | _(no summary)_ |
| [`NotificationsPage`](../packages/ui-native/src/layouts/notifications-page.tsx) | `NotificationsPageProps` | — | _(no summary)_ |
| [`ScreenContainer`](../packages/ui-native/src/layouts/screen-container.tsx) | `ScreenContainerProps` | — | _(no summary)_ |
| [`SettingsPage`](../packages/ui-native/src/layouts/settings-page.tsx) | `SettingsPageProps` | — | _(no summary)_ |
| [`SettingsSubPage`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | `SettingsSubPageProps` | — | _(no summary)_ |
| [`SocialAuthRow`](../packages/ui-native/src/layouts/auth.tsx) | `SocialAuthRowProps` | — | _(no summary)_ |
| [`Stack`](../packages/ui-native/src/components/layout/index.ts) | `StackProps` | — | _(no summary)_ |
| [`ThreadPage`](../packages/ui-native/src/layouts/thread-page.tsx) | `ThreadPageProps` | — | _(no summary)_ |

### Other exports (46)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`alertVariants`](../packages/ui-native/src/components/alert.tsx) | value | — | _(no summary)_ |
| [`appleProvider`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"apple"`) that draws Apple's button, for `AuthScreen`'s `providers`. `null` off iOS or without the module. |
| [`badgeTextVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`badgeVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`buttonTextVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`buttonVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`cn`](../packages/ui-native/src/utils.ts) | function | — | _(no summary)_ |
| [`composeHeaderOptions`](../packages/ui-native/src/layouts/screen-container.tsx) | function | — | Compose a `<Stack.Screen options={...}>` object from Layer-3 named props + a direct `headerOptions` passthrough. Layouts call this and pass the result to `<Stack.Screen>` so the host's expo-router stack renders a platform-native large ti... |
| [`confirmDiscardChanges`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Default leave-guard helper. Pops a native Alert with Discard / Keep Editing buttons; calls `proceed()` only if the user opts to discard. |
| [`defaultStickyHeaderOffset`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Where a list's section headers stick by default: on iOS, the bottom of the collapsed navigation bar (the safe area's top plus the compact bar), since the list runs under the header; elsewhere 0 (the header sits above the list). |
| [`ForgotPasswordLink`](../packages/ui-native/src/layouts/auth.tsx) | function | — | _(no summary)_ |
| [`formatInboxTime`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | The default row time: `9:41`, `Yesterday`, `Monday`, then a short date. |
| [`FULL_SCREEN_DARK`](../packages/ui-native/src/components/full-screen-modal.tsx) | const | — | The dark tone's backdrop: media reads best on true black in light and dark mode alike. |
| [`getInboxPageStackOptions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | `<Stack.Screen options>` for an InboxPage: a large title that collapses on scroll. |
| [`getNotificationsPageStackOptions`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires a "Mark all read" action via `headerRight` when `onMarkAllRead` is passed. |
| [`getSettingsPageStackOptions`](../packages/ui-native/src/layouts/settings-page.tsx) | function | — | Convenience helper for callers that want to wire `<Stack.Screen options={...}>` without re-importing composeHeaderOptions. Defaults `large: true` and `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings pattern out o... |
| [`getSettingsSubPageStackOptions`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires the nav-bar Save button via `headerRight` automatically when `onSave` is passed. |
| [`getThreadPageStackOptions`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | `<Stack.Screen options>` for a ThreadPage: a standard (not large) title, like Messages. |
| [`googleProvider`](../packages/ui-native/src/layouts/google-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"google"`) for `AuthScreen`'s `providers`, or `null` when `enabled` is false. |
| [`iosCompactNavigationBarHeight`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | The height of iOS's compact navigation bar, below the status bar: 44 pt up to iOS 18, 54 pt from iOS 26 (measured on an iOS 26 simulator, the collapsed large-title bar of a native stack). |
| [`KEYBOARD_TOOLBAR_HEIGHT`](../packages/ui-native/src/layouts/keyboard.tsx) | const | — | Height of react-native-keyboard-controller's `KeyboardToolbar`, kept clear above the focused input. Mirrors `KEYBOARD_TOOLBAR_HEIGHT` in the library's `src/components/KeyboardToolbar/constants.ts` (1.22): move them together. |
| [`KeyboardScrollProvider`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | _(no summary)_ |
| [`NATIVE_ICON_NAMES`](../packages/ui-native/src/icon-names.ts) | const | — | Every semantic icon name. |
| [`NativeCardContent`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardDescription`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardFooter`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardHeader`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeListItemDivider`](../packages/ui-native/src/components/list-item.tsx) | function | — | _(no summary)_ |
| [`NativeSheetScrollView`](../packages/ui-native/src/components/sheet.tsx) | function | Beta | A `ScrollView` for sheet content: the library's `BottomSheetScrollView` under `NativeSheetProvider` (so scrolling and dragging the sheet don't fight), React Native's otherwise. Sized to its content until it reaches the sheet's height. |
| [`readReceiptFor`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | The newest of my messages the other side has read, or null. |
| [`SF_SYMBOLS`](../packages/ui-native/src/icon-names.ts) | const | Beta | The semantic icon names Genesis components ask for, and the SF Symbol each one draws on iOS. Components say "settings" or "bell", never a library's own name; `lucideIcons` (`/icons/lucide`) maps the same names for Android, web and the SF... |
| [`showInboxActions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | Opens a row's actions as a menu (long press). |
| [`spaceScale`](../packages/ui-native/src/components/layout/spacing.ts) | const | — | Layout spacing scale — the single source of truth for gap / padding / margin across the Genesis layout primitives (Stack / Inline / Box / Grid). |
| [`spacingClass`](../packages/ui-native/src/components/layout/spacing.ts) | function | — | Resolve a semantic spacing token to its NativeWind utility class for a given prefix — e.g. `spacingClass("gap", "md") === "gap-3"` (12px / 4). |
| [`textVariants`](../packages/ui-native/src/components/text.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui-native/src/components/toggle.tsx) | value | — | _(no summary)_ |
| [`useGenesisExtension`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | function | — | Read an extension scale by key. Returns `undefined` when the provider isn't mounted OR when the key isn't declared on the brand. The return type follows the consumer's augmented `BrandExtensions[K]`. |
| [`useGenesisModules`](../packages/ui-native/src/native-modules.tsx) | function | — | The modules given to the nearest `GenesisModulesProvider`; `{}` without one. |
| [`useKeyboardScroll`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard-aware scroll view, or null when none was provided. |
| [`useKeyboardToolbar`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard toolbar, or null when none was provided (or no scroll view to go with it). |
| [`useLiquidGlass`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | expo-glass-effect's `GlassView` when Liquid Glass can be drawn here, else `null`. |
| [`useReducedMotion`](../packages/ui-native/src/hooks/use-reduced-motion.ts) | function | — | _(no summary)_ |
| [`useReduceTransparency`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | True while the user has Reduce Transparency on (iOS), `null` until the first answer. Always false elsewhere, and on a runtime that can't say. |
| [`useThemeMode`](../packages/ui-native/src/hooks/use-theme-mode.ts) | function | — | _(no summary)_ |
| [`useThemeRoles`](../packages/ui-native/src/hooks/use-theme-roles.ts) | function | — | _(no summary)_ |
| [`useToast`](../packages/ui-native/src/components/toast.tsx) | function | — | _(no summary)_ |

### Types (62)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppleButtonModuleLike };
export type { AppleProviderOptions };
export type { AuthFormValues };
export type { AuthScreenSlotMap };
export type { BoxBackground };
export type { BrandExtensionsValue };
export type { FlexAlign };
export type { FlexJustify };
export type { GenesisDatePickerComponent };
export type { GenesisDatePickerProps };
export type { GenesisGlassModule };
export type { GenesisIconComponent };
export type { GenesisIconSet };
export type { GenesisImageComponent };
export type { GenesisImageProps };
export type { GenesisListComponent };
export type { GenesisListProps };
export type { GenesisModules };
export type { GenesisNavigationModule };
export type { GenesisNavigationTheme };
export type { GenesisReanimatedModule };
export type { GenesisSymbolComponent };
export type { GenesisSymbolProps };
export type { GoogleProviderOptions };
export type { InboxItem };
export type { InboxPageSlotMap };
export type { InboxSwipeAction };
export type { KeyboardScrollProps };
export type { KeyboardToolbarProps };
export type { NativeAccordionType };
export type { NativeChipGroupMode };
export type { NativeComboboxOption };
export type { NativeEmptyStateVariant };
export type { NativeIconName };
export type { NativeInlineAlertVariant };
export type { NativeLoadingStateEdge };
export type { NativeSegmentedControlOption };
export type { NativeSheetLibrary };
export type { NativeStepperStep };
export type { NativeToastOptions };
export type { NativeToastVariant };
export type { NotificationItem };
export type { NotificationsPageSlotMap };
export type { SafeAreaEdge };
export type { ScreenHeaderProps };
export type { ScrollEdgeBehavior };
export type { SettingsPageDangerousAction };
export type { SettingsPageRow };
export type { SettingsPageSection };
export type { SettingsPageSlotMap };
export type { SocialAuthProvider };
export type { SpaceToken };
export type { SpacingPrefix };
export type { TextPreset };
export type { ThemeMode };
export type { ThemeRoleColors };
export type { ThreadAttachment };
export type { ThreadComposer };
export type { ThreadLabels };
export type { ThreadMessage };
export type { ThreadPageSlotMap };
export type { UseThemeRolesOptions };
```

---

## @marktiderman/genesis/native-app

**Barrel:** [`packages/genesis/src/native-app.ts`](../packages/genesis/src/native-app.ts)

### Components (6)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AuthGate`](../packages/native/src/auth.tsx) | `AuthGateProps` | — | Render one tree for a signed-in user and another for everyone else. |
| [`BootScreen`](../packages/native/src/app.tsx) | `BootScreenProps` | — | The default boot slot: a plain loading view (the splash covers it at launch). |
| [`FatalScreen`](../packages/native/src/errors.tsx) | `FatalScreenProps` | — | The default fatal screen: what went wrong and "Try again". |
| [`GenesisErrorBoundary`](../packages/native/src/errors.tsx) | `GenesisErrorBoundaryProps` | — | An error boundary whose fallback gets `{ error, retry }`. |
| [`GenesisNativeApp`](../packages/native/src/app.tsx) | `GenesisNativeAppProps` | Beta | The root of an Expo app: theme, keyboard, data, boot behind the splash, errors, session and held links. |
| [`ScreenErrorBoundary`](../packages/native/src/screen-boundary.tsx) | `ScreenErrorBoundaryProps` | Beta | A boundary around part of a screen tree, for apps without Expo Router's per-route boundaries: non-fatal, reported, with "Try again". |

### Other exports (33)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BEFORE_RELOAD_TIMEOUT_MS`](../packages/native/src/reload.ts) | const | — | The default deadline for every hook together. |
| [`BootProvider`](../packages/native/src/boot.tsx) | function | — | Makes a boot readable with `useBoot()`. |
| [`BootTimeoutError`](../packages/native/src/boot.tsx) | class | — | Thrown when a step takes longer than its timeout. |
| [`classifyError`](../packages/core/src/errors.ts) | function | — | What kind of error this is, a sentence that is safe to show, and whether it is worth reporting. Understands the provider's `DataWriteError` and `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's auth and fetch error... |
| [`connectQueryLifecycle`](../packages/native/src/query.ts) | function | — | Tell TanStack Query when the app comes to the front (refetch stale queries) and when the network comes and goes. Returns the cleanup. |
| [`createBoot`](../packages/native/src/boot.tsx) | function | — | The boot controller: runs `steps` once each, in order, with a timeout per step. |
| [`createHydrationGate`](../packages/native/src/hydration-gate.ts) | function | — | A gate that holds writes until a persisted store has hydrated. |
| [`createLinkHold`](../packages/native/src/held-link.ts) | function | — | A place to hold one deep link until sign-in completes; lives outside React. |
| [`createNativeQueryClient`](../packages/native/src/query.ts) | function | — | A QueryClient for a phone. `networkMode: "offlineFirst"` runs a query or mutation once whatever the network says, then pauses its retries while the device is offline (`onlineManager`, which `connectQueryLifecycle` feeds from NetInfo), co... |
| [`createScreenErrorBoundary`](../packages/native/src/screen-boundary.tsx) | function | Beta | An Expo Router `ErrorBoundary`: reports each error once (non-fatal, source `screen`) and shows `fallback`. Build it once, at module scope. |
| [`createSessionStore`](../packages/native/src/auth.tsx) | function | — | The Supabase session as a store: `load` reads it once, `start` follows auth events. |
| [`DAY_MS`](../packages/native/src/query.ts) | const | — | One day in milliseconds: the default max age of the saved query cache. |
| [`defaultErrorUtils`](../packages/native/src/errors.tsx) | function | — | `globalThis.ErrorUtils` in a React Native runtime, undefined elsewhere. |
| [`defaultRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Hermes's rejection tracker, when the app runs on Hermes. React Native sends unhandled rejections to `ExceptionsManager` (LogBox in development), never to `ErrorUtils`' global handler, so without this they never reach `onError`. |
| [`errorDetails`](../packages/native/src/errors.tsx) | function | — | What a fatal or screen error says under its title: the safe sentence for its kind (offline, signed out…), or nothing for a plain bug. The error's own text can hold an email, an id or a store's internals, so it is shown only in developmen... |
| [`errorMessages`](../packages/core/src/errors.ts) | const | — | The English catalogue. Plain words, never the store's text. |
| [`installGlobalErrorHandler`](../packages/native/src/errors.tsx) | function | — | Route global errors to `onError`. A fatal one goes to `onFatal` instead of React Native's default handler, which would close the app; a non-fatal one still reaches the previous handler (LogBox in development). Returns a function that put... |
| [`installRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Report unhandled promise rejections to `onError`: non-fatal, and unhandled (`handled: false`), so release health counts them. This replaces React Native's own tracker, so each rejection is also written with `console.warn`, which LogBox s... |
| [`mergeBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The merge `useBlockSettings` does, without hooks (subtitles already read). @stability Beta |
| [`normalizeLink`](../packages/native/src/links.ts) | function | — | The app path for `url`, `"/"` when it is unknown, or `null` when it is ignored. |
| [`onBeforeReload`](../packages/native/src/reload.ts) | function | Beta | Run `hook` before every reload the updates block starts. Returns the unregister. @stability Beta |
| [`PlainFatalScreen`](../packages/native/src/errors.tsx) | function | — | The last-resort fatal screen: React Native primitives only, no theme, no context, nothing that can itself fail. Shown when the providers could not start, or when the `fatal` slot threw. |
| [`queryKeyName`](../packages/native/src/query.ts) | function | — | The first segment of a query or mutation key, when it is a name; never the ids after it. |
| [`reportError`](../packages/core/src/errors.ts) | function | — | Report an error a package caught and handled. Never throws: a failing reporter must not take the caller (an event handler, a render) down. `context` may be just the source. |
| [`reportQueryErrors`](../packages/native/src/query.ts) | function | Beta | Hand every query and mutation that failed for good (after its retries) to `report`, as a non-fatal `query` or `mutation` error tagged with the key's first segment (`query.key: "tasks"`), never the ids after it. |
| [`runBeforeReload`](../packages/native/src/reload.ts) | function | Beta | Run every registered hook, in parallel, and resolve when they have all settled or `timeoutMs` has passed, whichever is first. Never rejects. |
| [`ScreenErrorScreen`](../packages/native/src/screen-boundary.tsx) | function | Beta | The default screen fallback: the screen hit a problem, and "Try again". @stability Beta |
| [`SessionProvider`](../packages/native/src/auth.tsx) | function | — | Makes a session store readable with `useSession()`. |
| [`useBlocks`](../packages/native/src/blocks.tsx) | function | Beta | The resolved blocks: their ids, nav entries, Settings rows, routes and the rest, each tagged with its FeatureId. Throws outside `GenesisNativeApp`. |
| [`useBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The app's Settings sections with every block's rows added: each row goes at the end of the section its `section` names (by `order`, then block order), and a section no one has yet is added after the rest. |
| [`useBoot`](../packages/native/src/boot.tsx) | function | — | The boot's status, and `retry` after a failure. Inside `GenesisNativeApp` or a `BootProvider`. |
| [`useHeldLink`](../packages/native/src/held-link.ts) | function | — | Follow the held link after a sign-in, drop it otherwise; returns the link still held. |
| [`useSession`](../packages/native/src/auth.tsx) | function | — | The session and whether it is known yet. Inside `GenesisNativeApp` or a `SessionProvider`. |

### Types (47)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppStateLike };
export type { AsyncStorageLike };
export type { AuthClientLike };
export type { BeforeReloadHook };
export type { BlockSettingsSection };
export type { BootController };
export type { BootOptions };
export type { BootState };
export type { BootStatus };
export type { BootStep };
export type { BootStepContext };
export type { ClassifiedError };
export type { ClassifyErrorOptions };
export type { EnableRejectionTracker };
export type { ErrorKind };
export type { ErrorMessages };
export type { ErrorReport };
export type { ErrorUtilsLike };
export type { GlobalErrorHandlerOptions };
export type { HeldLinkAuth };
export type { HydrationGate };
export type { HydrationGateOptions };
export type { LinkHold };
export type { LinkOptions };
export type { LinkTarget };
export type { NativeAppSlots };
export type { NativeBlock };
export type { NativeBlockRootProps };
export type { NativeQueryClientOptions };
export type { NetInfoLike };
export type { OnError };
export type { QueryErrorReporter };
export type { QueryLifecycleOptions };
export type { QueryPersistence };
export type { ReportQueryErrorsOptions };
export type { ScreenErrorBoundaryOptions };
export type { ScreenErrorProps };
export type { SessionState };
export type { SessionStatus };
export type { SessionStore };
export type { SessionStoreOptions };
export type { SettingsRowLike };
export type { SignedOutProps };
export type { SplashModule };
export type { UseBlockSettingsOptions };
export type { UseBootReturn };
export type { UseHeldLinkOptions };
```

---

## @marktiderman/genesis/native-app/persist

**Barrel:** [`packages/genesis/src/native-app-persist.ts`](../packages/genesis/src/native-app-persist.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createQueryPersistence`](../packages/native/src/persist.ts) | function | — | Save the allowlisted queries to async storage and restore them, with a max age, an app-version buster and a user scope. |
| [`persistQueries`](../packages/native/src/persist.ts) | function | — | `createQueryPersistence` for `GenesisNativeApp`'s `persist` prop, which supplies the client. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { PersistQueriesOptions };
export type { QueryPersistence };
export type { QueryPersistenceOptions };
```

---

## @marktiderman/genesis/forms

**Barrel:** [`packages/genesis/src/forms.ts`](../packages/genesis/src/forms.ts)

### Other exports (135)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answersFromSnapshots`](../packages/forms/src/options.ts) | function | — | The reverse of `answerSnapshots`, for an edit link: the answers to prefill from stored snapshots. A pick whose value is still an option keeps it; otherwise an option with the same label (ignoring case and accents) stands in, such as a lo... |
| [`answerSnapshots`](../packages/forms/src/options.ts) | function | — | Each answer to a choice question that takes options from the app (`props.optionsFrom`), as `{ value, label }` pairs as of now, by field id: store them beside the answers so reports group by the value (an id) while history keeps the name ... |
| [`answersOnPath`](../packages/forms/src/options.ts) | function | — | The answers on the respondent's path, by field id: what a filter reads. An answer to a question off the path (hidden by logic, jumped over) counts as none, as it does for logic. Pass these to `visibleOptions` from a renderer, so it shows... |
| [`CALCULATED_TYPE`](../packages/forms/src/calculated.ts) | const | — | The calculated field type's registry key. |
| [`calculatedProps`](../packages/forms/src/calculated.ts) | function | — | A calculated field's settings, with anything malformed left out. |
| [`calculatedValue`](../packages/forms/src/calculated.ts) | function | — | What a formula's result is stored as. `number` and `percent` keep a number (`0.25` for 25%), rounded to `decimals`; `text` keeps text. Without a format, numbers, text and true / false are kept as they are. A list, and anything the format... |
| [`canonicalJson`](../packages/forms/src/hash.ts) | function | — | JSON with object keys sorted, so equal definitions serialize identically. |
| [`carryAnswers`](../packages/forms/src/carry.ts) | function | — | Answers given to one version of a form, as answers to another (by field id), matched by field key: what an edit link prefills when the form has a newer version. Answers to fields the other version doesn't have are dropped; `extra` (by ke... |
| [`CHOICE_FIELD_TYPES`](../packages/forms/src/options.ts) | const | — | The built-in field types whose answer is one or more of their options. A host's own choice kinds (`FieldTypeManifest.choice`) aren't in it: ask `isChoiceField` or `choiceKind`. |
| [`choiceKind`](../packages/forms/src/fields.ts) | function | — | A choice kind's answer shape (`FieldTypeManifest.choice`), or undefined for any other kind. |
| [`choiceOptions`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`clearFilteredAnswers`](../packages/forms/src/options.ts) | function | — | `values` after the answer to `changedId` changed, with every choice its filter no longer shows taken out: a single choice or dropdown is cleared, a multiple choice keeps the options that still show (and a typed "Other" answer). It follow... |
| [`coerceHidden`](../packages/forms/src/hidden.ts) | function | — | Type raw hidden inputs (from a query string, the host app or the server) by the definition's declarations. `undefined` values are skipped silently. |
| [`coerceHiddenValue`](../packages/forms/src/hidden.ts) | function | — | Convert one raw value to a hidden input's declared type, or `undefined` when it cannot be. Only string, number and boolean primitives are accepted. - `string`: a string (at most 1000 characters), or a number or boolean as text. - `number... |
| [`COMPUTED_FIELD_TYPES`](../packages/forms/src/calculated.ts) | const | — | Field types the builder offers only to a host that names them in its palette, like `STRUCTURED_FIELD_TYPES`: `calculated` shows a value worked out from other answers, so it is opt-in for hosts that want formulas. |
| [`computePath`](../packages/forms/src/logic.ts) | function | — | The respondent's path, derived from the answers on the path, so the client, the server and a replay always agree. It is built in one forward pass: a block's show/hide rules, and the jumps from it, see only the fields already on the path ... |
| [`contentText`](../packages/forms/src/fields.ts) | function | — | A content block's display text: its kind's `text` (when it gives a string without throwing), or `block.text`. |
| [`createDraftAutosave`](../packages/forms/src/drafts.ts) | function | — | Save the engine's answers to `store` as they change, `delayMs` after the last change, one write at a time and in order. Answers cleared to nothing remove the draft (one this autosave wrote, or the one restored: `stored`), so an emptied f... |
| [`createDraftStore`](../packages/forms/src/drafts.ts) | function | — | A `DraftStore` over key-value storage, one entry per form and respondent (the version is inside it, so a new version finds the old draft and `restoreDraft` decides whether it still fits). A stored entry that doesn't read as a draft is an... |
| [`createForm`](../packages/forms/src/engine.ts) | function | — | _(no summary)_ |
| [`createSubmitOutbox`](../packages/forms/src/outbox.ts) | function | — | Each submission is stored under its own key, with an index of keys beside it. The index is read again and merged on every change, so two outboxes on one storage (two tabs) don't write each other's submissions out; both may send one, and ... |
| [`dateLimits`](../packages/forms/src/fields.ts) | function | — | A `date` field's earliest and latest days (`YYYY-MM-DD`), when set. |
| [`DEFAULT_PHOTO_FILES`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`DEFAULT_PHOTO_SIZE_MB`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`defineForm`](../packages/forms/src/define.ts) | function | — | Define a form in code. The result's `definition` is the same canonical JSON a builder or `parseForm` produces; answer types are inferred from the blocks. |
| [`describeCondition`](../packages/forms/src/explain.ts) | function | — | A condition as a plain-English clause: `contact_me is not Yes`. |
| [`DRAFT_KEY_PREFIX`](../packages/forms/src/drafts.ts) | const | — | _(no summary)_ |
| [`DRAFT_MAX_AGE_MS`](../packages/forms/src/drafts.ts) | const | — | 30 days: the default for how long a draft is kept. |
| [`draftOf`](../packages/forms/src/drafts.ts) | function | — | The engine's answers so far as a draft (null when nothing is answered). |
| [`evaluate`](../packages/forms/src/logic.ts) | function | — | Evaluate a condition. Never throws. An empty value (unanswered, `null`, blank text, an empty list: see `isEmptyValue`) is unanswered: it fails every comparison, including `eq`, `in` and `contains`, and passes `neq`. |
| [`evaluateFormula`](../packages/forms/src/formula.ts) | function | — | Evaluate a parsed formula. Never throws; a value it can't work out is `null`. |
| [`explain`](../packages/forms/src/explain.ts) | function | — | Explain a block's visibility. `blockId` may also be a field key. |
| [`f`](../packages/forms/src/define.ts) | const | — | _(no summary)_ |
| [`filteredChoiceError`](../packages/forms/src/options.ts) | function | — | Null, or the error for a (non-empty) choice answer that is one of the question's options but not one it shows now because of its filter (`visibleOptions`). A typed "Other" answer is left to the field type's own check. The engine and `val... |
| [`fingerprint`](../packages/forms/src/hash.ts) | function | — | A short content fingerprint (cyrb53, 14 hex characters). It detects drift between a definition and its published version; it is not a security hash. |
| [`formatCalculated`](../packages/forms/src/calculated.ts) | function | — | A calculated value as shown: `12.5`, `25%`, the text, Yes / No. Empty when there is none. |
| [`formatTimestamp`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`formProgress`](../packages/forms/src/progress.ts) | function | — | Where the respondent is: the furthest step and the furthest question reached. What genesis-forms-web's `onProgress` passes; `engine.answers()` has the answers so far. |
| [`FORMULA_FUNCTIONS`](../packages/forms/src/formula.ts) | const | — | _(no summary)_ |
| [`formulaInput`](../packages/forms/src/calculated.ts) | function | — | The value a formula reads for an answer: numbers and text as they are, a list's items, one table column's cells. A list or table of more than `MAX_FORMULA_ITEMS` reads as blank. Each call builds a new list. |
| [`formulaNumber`](../packages/forms/src/formula.ts) | function | — | A value as a number: numbers, numeric text ("1,200" too), yes / no as 1 / 0. Anything else is blank (`null`). |
| [`formulaRefs`](../packages/forms/src/formula.ts) | function | — | The answers a formula names, each once (none when it doesn't parse). |
| [`furthestReached`](../packages/forms/src/progress.ts) | function | — | The furthest block on the path the respondent has reached: the one on screen, one they went back from, or (in classic layout, where every question shows at once) the last one they answered. Null when the path is empty. |
| [`getContentType`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`getFieldType`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`hasOptionFilters`](../packages/forms/src/options.ts) | function | — | Whether any choice question in the definition filters its options by another answer. |
| [`hiddenByPrefill`](../packages/forms/src/options.ts) | function | — | Questions on the path the respondent skips because a prefill answered them: those with `props.prefill.hideWhenPrefilled` whose answer is still the prefilled one (the last answer event for them came from `initialValues` or a link) and has... |
| [`HIGHLIGHT_NOTE_MESSAGE`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`IDEMPOTENCY_KEY_PATTERN`](../packages/forms/src/submit-protocol.ts) | const | — | What an idempotency key matches: 16 to 128 letters, digits, `-` and `_`. |
| [`isBuiltInFieldType`](../packages/forms/src/fields.ts) | function | — | Whether `type` is one of the field kinds the package ships. |
| [`isChoiceField`](../packages/forms/src/fields.ts) | function | — | Whether a block is a field of a choice kind: its answer is one or more of its options. |
| [`isEmptyValue`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`isFormEvent`](../packages/forms/src/events.ts) | function | — | Whether `value` is a well-formed `FormEvent` of a known type. |
| [`isHttpsUrl`](../packages/forms/src/fields.ts) | function | — | Whether `url` is an `https://` link with a host and no spaces or control characters, within `OPTION_LIMITS.image`. A pattern rather than `new URL`, so it behaves the same in React Native. |
| [`isIdempotencyKey`](../packages/forms/src/submit-protocol.ts) | function | — | _(no summary)_ |
| [`isIsoDate`](../packages/forms/src/fields.ts) | function | — | `YYYY-MM-DD`, a real calendar day (no 2026-02-30), years 0001 to 9999. |
| [`isJson`](../packages/forms/src/events.ts) | function | — | Whether a value is JSON: strings, finite numbers, booleans, null, arrays and plain objects, nested to any depth. Iterative, so a deeply nested value cannot overflow the stack. |
| [`isOtherValue`](../packages/forms/src/fields.ts) | function | — | Whether a value is a typed "Other" answer: text that isn't one of the question's options. |
| [`isPhotoFormat`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`isPhotoRef`](../packages/forms/src/photo.ts) | function | — | Whether `v` has a photo reference's shape (any type and size). |
| [`isPrefillParam`](../packages/forms/src/options.ts) | function | — | A well-formed parameter name: letters, digits, `_`, `-` and `.`, at most `MAX_PREFILL_PARAM_LENGTH`. |
| [`isSearchable`](../packages/forms/src/options.ts) | function | — | Whether a choice question shows a search box over its options: `props.searchable` when it is true or false, otherwise when it has more than `SEARCHABLE_OPTION_COUNT` options. The default counts all its options (`choiceOptions(field)`, wi... |
| [`isSensitive`](../packages/forms/src/fields.ts) | function | — | Whether a block holds personal or secret data: `sensitive: true`, or the `props.sensitive: true` alias. |
| [`isSubmitResult`](../packages/forms/src/submit-protocol.ts) | function | — | Whether `value` is a `SubmitResult`, for a device reading an endpoint's JSON. |
| [`listContentTypes`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`listFieldTypes`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`listLimits`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`MAX_CALCULATED_DECIMALS`](../packages/forms/src/calculated.ts) | const | — | Most decimal places a calculated value may keep. |
| [`MAX_FORM_FORMULA_LENGTH`](../packages/forms/src/calculated.ts) | const | — | Longest the formulas of one form may be, all together (`parseForm` checks it). |
| [`MAX_FORMULA_ITEMS`](../packages/forms/src/calculated.ts) | const | — | Most items a formula reads from one answer (a list's items, a table's rows). A longer answer reads as blank, so one oversized value sent to the server can't make every formula over it slow. |
| [`MAX_FORMULA_LENGTH`](../packages/forms/src/formula.ts) | const | — | Longest formula accepted. |
| [`MAX_HIDDEN_STRING_LENGTH`](../packages/forms/src/hidden.ts) | const | — | Longest string a hidden input accepts. Longer values are dropped. |
| [`MAX_HIGHLIGHT_NOTE_LENGTH`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_HIGHLIGHT_QUOTE_LENGTH`](../packages/forms/src/structured.ts) | const | — | The longest passage one highlight may quote; also bounds a quote the server can't check against `props.text`. |
| [`MAX_PHOTO_FILES`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PHOTO_ID_LENGTH`](../packages/forms/src/photo.ts) | const | — | The longest reference id and file name a photo answer may carry. |
| [`MAX_PHOTO_NAME_LENGTH`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PHOTO_SIZE_MB`](../packages/forms/src/photo.ts) | const | — | _(no summary)_ |
| [`MAX_PREFILL_PARAM_LENGTH`](../packages/forms/src/options.ts) | const | — | Characters in a link parameter's name. |
| [`MAX_SETTLE_ITEMS`](../packages/forms/src/calculated.ts) | const | — | Most list items and table rows all of a form's formulas read in one go (each list or table counted once, however many of its columns are read, in form order). A formula that reads an answer past the limit, or one over `MAX_FORMULA_ITEMS`... |
| [`MAX_TABLE_CELL_LENGTH`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_TABLE_COLUMNS`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_TIMESTAMP_SECONDS`](../packages/forms/src/structured.ts) | const | — | _(no summary)_ |
| [`MAX_UPLOAD_REQUEST_BYTES`](../packages/forms/src/upload-protocol.ts) | const | — | The longest upload request body: a few fields of JSON. |
| [`memoryStorage`](../packages/forms/src/storage.ts) | function | — | Storage that lasts as long as the page or app does: for tests, and where nothing may be kept on the device. |
| [`mergeResponses`](../packages/forms/src/merge.ts) | function | — | `base` with `patch` on top, by field id, as the answers to store. The rules, in order: |
| [`normalizeValue`](../packages/forms/src/fields.ts) | function | — | A value in its stored form (see `FieldTypeManifest.normalize`). |
| [`numberLimits`](../packages/forms/src/fields.ts) | function | — | A `number` field's limits: `min`, `max` and `step` (each optional; `step` is above 0). |
| [`OPTION_LIMITS`](../packages/forms/src/fields.ts) | const | — | Bounds on an option's extra details. A longer or malformed detail is dropped when options are read. |
| [`optionFilter`](../packages/forms/src/options.ts) | function | — | A choice field's `props.optionsFrom.filter` (`{ attribute, field }`), when it is well formed. |
| [`optionJson`](../packages/forms/src/fields.ts) | function | — | An option as JSON, with only the details it has. |
| [`optionMatches`](../packages/forms/src/options.ts) | function | — | Whether an option matches an answer on one attribute: its `attributes[attribute]` (a text or a list) shares a value with the answer (a text, or a list from a multiple choice). An option without the attribute matches nothing. |
| [`optionsSource`](../packages/forms/src/fields.ts) | function | — | A choice field's `props.optionsFrom`, when it is a well-formed `{ source: "host", key }`, with its `filter` when that is well formed too (`{ attribute, field }`, both non-empty text). |
| [`OTHER_MAX_LENGTH`](../packages/forms/src/fields.ts) | const | — | The longest answer an "Other" option takes. |
| [`otherOption`](../packages/forms/src/fields.ts) | function | — | A choice question's "Other" option (`props.other: true` or `{ label }`): the respondent types their own answer, stored as the answer's value itself (single choice, dropdown) or as one more item (multiple choice). Null when the question h... |
| [`parseForm`](../packages/forms/src/parse.ts) | function | — | Check a definition before it is stored or rendered: structure, the types of text fields, unique ids and keys, known field types, references that resolve, operators that fit the field type. Each field and content kind checks its own `prop... |
| [`parseFormula`](../packages/forms/src/formula.ts) | function | — | Parse a formula. Never throws: a mistake comes back as `{ ok: false, message, at }`, with the character offset of the problem. |
| [`parseTimestamp`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`PHOTO_FORMATS`](../packages/forms/src/photo.ts) | const | — | The MIME types each format covers. |
| [`PHOTO_TYPE`](../packages/forms/src/photo.ts) | const | — | The `photo` field type: a respondent attaches up to a few photos, such as a picture of broken equipment. The answer holds references the host's storage handed back (`PhotoRef`), never the bytes: the renderer uploads through the host (`on... |
| [`photoCountMessage`](../packages/forms/src/photo.ts) | const | — | The message for more photos than the field takes. |
| [`photoFormatList`](../packages/forms/src/photo.ts) | function | — | "JPEG, PNG or WebP". |
| [`photoLimits`](../packages/forms/src/photo.ts) | function | — | A photo field's limits; a prop that is missing or out of range uses its default. |
| [`photoRefs`](../packages/forms/src/photo.ts) | function | — | The well-formed references in a photo answer, as `{ id, name, type, size }` only. |
| [`photoSizeMessage`](../packages/forms/src/photo.ts) | const | — | The message for a file over the field's size limit. |
| [`photoTypeMessage`](../packages/forms/src/photo.ts) | const | — | The message for a file of a type the field doesn't take. |
| [`prefillFromLink`](../packages/forms/src/options.ts) | function | — | Answers a link preselects, by field id, for `createForm`'s `initialValues` (its `linkParams` option calls this). Each choice question with `props.prefill: { param }` takes the parameter's value when it is one of the options the question ... |
| [`prefillSetting`](../packages/forms/src/options.ts) | function | — | A choice field's `props.prefill` (`{ param, hideWhenPrefilled? }`), when it is well formed. |
| [`ratingDisplay`](../packages/forms/src/fields.ts) | function | — | How a rating is drawn: `"numbers"` (default) or `"stars"`. |
| [`readOption`](../packages/forms/src/fields.ts) | function | — | An option from untrusted JSON (a definition, the host's list): its string `value`, and its `label`, `description`, `image` and `attributes` when each is well formed and within `OPTION_LIMITS`; anything else is left out. Null when there i... |
| [`recall`](../packages/forms/src/recall.ts) | function | — | Replace `{{field:key|fallback}}` and `{{hidden:name|fallback}}` tokens. An unanswered value renders its fallback (default empty); the text is never dropped. |
| [`registerContentType`](../packages/forms/src/fields.ts) | function | — | Register a content kind. Throws on a malformed manifest or a built-in kind's name (unless `{ replace: true }`). |
| [`registerFieldType`](../packages/forms/src/fields.ts) | function | — | Register a field kind, or replace one a host registered before (re-registering is allowed, so hot reload works). Throws on a malformed manifest, and on a built-in kind's name unless `{ replace: true }`. Registered kinds are frozen copies. |
| [`renameFormulaKey`](../packages/forms/src/formula.ts) | function | — | The formula with every reference to the answer `from` renamed to `to`. Column names, function names and text are left alone. Returned unchanged when it has a character a formula can't hold. |
| [`replay`](../packages/forms/src/engine.ts) | function | — | Rebuild a form's state from its event log. Timestamps are ignored. |
| [`REQUIRED_MESSAGE`](../packages/forms/src/validate.ts) | const | — | _(no summary)_ |
| [`respondentPath`](../packages/forms/src/options.ts) | function | — | The blocks the respondent steps through: the path without the questions a prefill hides (`hiddenByPrefill`). |
| [`restoreDraft`](../packages/forms/src/drafts.ts) | function | — | Whether a saved draft can be put back into this definition. The same version: yes. Another version: only when every saved answer still fits (its question is there, of the same type, and the answer passes its format checks); otherwise the... |
| [`ruleVisible`](../packages/forms/src/logic.ts) | function | — | Whether a block's show/hide rules let it be shown, ignoring jumps. The rules read the answers on the path before the block, as in `computePath`. A block with any `show` rule is hidden until one matches; a matching `hide` rule always wins. |
| [`scaleLabels`](../packages/forms/src/fields.ts) | function | — | The optional words under the ends of a rating or NPS scale ("Poor", "Great"). |
| [`SEARCHABLE_OPTION_COUNT`](../packages/forms/src/options.ts) | const | — | A choice question with more options than this gets a search box, unless `props.searchable` says otherwise. |
| [`searchOptions`](../packages/forms/src/options.ts) | function | — | The options that match what the respondent typed, in their order: every word of `query` is found (ignoring case and accents) in the option's label, value or description. A blank query matches every option. |
| [`steps`](../packages/forms/src/logic.ts) | function | — | Blocks a respondent steps through: fields and content, in order. |
| [`STRUCTURED_FIELD_TYPES`](../packages/forms/src/structured.ts) | const | — | The structured field types, whose answers are lists or records rather than one value: - `list`: several short answers, e.g. goals, action items, three things that went well. - `table`: a small table each answer fills row by row, e.g. an ... |
| [`submitOutcome`](../packages/forms/src/submit-protocol.ts) | function | — | What a device does with an answer: `delivered` (stored now or before: drop it from the outbox), `retry` (keep it and try again later) or `rejected` (keep it, marked failed, for the respondent to fix or discard). Anything that isn't a `Su... |
| [`summarizeValue`](../packages/forms/src/fields.ts) | function | — | _(no summary)_ |
| [`tableColumns`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`tableLimits`](../packages/forms/src/structured.ts) | function | — | _(no summary)_ |
| [`UPLOAD_FIELD_TYPES`](../packages/forms/src/photo.ts) | const | — | Field types that need the host to store files; a builder offers them only when the host names them. |
| [`validateField`](../packages/forms/src/validate.ts) | function | — | Validate one field's value. `requireAnswers: false` (drafts) checks the format of what was answered without requiring the rest. |
| [`VALIDATOR_FAILED_MESSAGE`](../packages/forms/src/fields.ts) | const | — | The message an answer gets when its kind's validator throws. |
| [`visibleOptions`](../packages/forms/src/options.ts) | function | — | The options a choice question shows given the answers so far (`values`, keyed by field id, as in `FormState.values`): all of `choiceOptions(field)`, or, with `props.optionsFrom.filter`, only those matching the filtered-by question's answ... |
| [`webStorage`](../packages/forms/src/storage.ts) | function | — | The browser's `localStorage` (or another `Storage`, such as `sessionStorage`), looked up on each call, so creating it during server rendering is safe. Where there is none (a server, a locked-down private window) every call throws, and th... |
| [`when`](../packages/forms/src/define.ts) | function | — | Start a rule on a field: `when("overall").lessThan(4).jumpTo("improve")`. |
| [`withHostOptions`](../packages/forms/src/fields.ts) | function | — | The definition with each `optionsFrom: { source: "host" }` field's options filled in from `hostOptions`: its own `props.options` first, then the host's list for its key (a value the field already has is not added twice). A key the host d... |

### Types (95)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerSnapshot };
export type { AnswersOf };
export type { Block };
export type { CalculatedFormat };
export type { CalculatedProps };
export type { ChoiceFieldOptions };
export type { ChoiceOption };
export type { CoerceHiddenOptions };
export type { CoercedHidden };
export type { Condition };
export type { ContentBlock };
export type { ContentTypeManifest };
export type { CreateFormOptions };
export type { DraftAutosave };
export type { DraftAutosaveOptions };
export type { DraftKey };
export type { DraftOptions };
export type { DraftRestore };
export type { DraftStore };
export type { Ending };
export type { EnqueueInput };
export type { ExplainInput };
export type { ExplainOptions };
export type { Explanation };
export type { FieldBlock };
export type { FieldOptions };
export type { FieldSpec };
export type { FieldTypeManifest };
export type { FieldValidation };
export type { FieldValidator };
export type { Form };
export type { FormDefinition };
export type { FormDraft };
export type { FormEngine };
export type { FormEvent };
export type { FormInput };
export type { FormIssue };
export type { FormLayout };
export type { FormProgress };
export type { FormSettings };
export type { FormState };
export type { FormulaFunction };
export type { FormulaNode };
export type { FormulaParseResult };
export type { FormulaReader };
export type { FormulaRef };
export type { FormulaValue };
export type { HiddenInput };
export type { Highlight };
export type { HostOptions };
export type { Json };
export type { JumpTrace };
export type { KeyResolver };
export type { KeyValueStorage };
export type { LinkParams };
export type { LiteralType };
export type { LogicRule };
export type { MaybePromise };
export type { MediaNote };
export type { MergeOptions };
export type { Operand };
export type { Operator };
export type { OptionSnapshot };
export type { OptionsSource };
export type { OutboxEntry };
export type { OutboxItem };
export type { OutboxSnapshot };
export type { PageBreakBlock };
export type { ParseResult };
export type { PathResult };
export type { PhotoFormat };
export type { PhotoLimits };
export type { PhotoRef };
export type { PrefillSetting };
export type { PrefillState };
export type { PropsCheck };
export type { PropsChecker };
export type { RegisterOptions };
export type { RestoredAnswers };
export type { RuleSpec };
export type { RuleTrace };
export type { SignedUpload };
export type { StandardSchemaV1 };
export type { SubmitFailureReason };
export type { SubmitOutbox };
export type { SubmitOutboxOptions };
export type { SubmitOutcome };
export type { SubmitRequest };
export type { SubmitResult };
export type { TableColumn };
export type { UploadAdapter };
export type { UploadFile };
export type { UploadGrant };
export type { UploadRefusal };
export type { UploadRequest };
```

---

## @marktiderman/genesis/forms/server

**Barrel:** [`packages/genesis/src/forms-server.ts`](../packages/genesis/src/forms-server.ts)

### Other exports (40)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`addressPrefix`](../packages/forms/src/rate-limit.ts) | function | — | The part of an address that names one client: an IPv4 address whole, an IPv6 address by its /64. |
| [`allow`](../packages/forms/src/rate-limit.ts) | function | — | True when the request may go on. Fails open: when the store can't count (it answers null or throws) the request goes on and `log` says so with `message`. |
| [`answersFromSnapshots`](../packages/forms/src/options.ts) | function | — | The reverse of `answerSnapshots`, for an edit link: the answers to prefill from stored snapshots. A pick whose value is still an option keeps it; otherwise an option with the same label (ignoring case and accents) stands in, such as a lo... |
| [`answerSnapshots`](../packages/forms/src/options.ts) | function | — | Each answer to a choice question that takes options from the app (`props.optionsFrom`), as `{ value, label }` pairs as of now, by field id: store them beside the answers so reports group by the value (an id) while history keeps the name ... |
| [`attemptHash`](../packages/forms/src/uploads.ts) | function | — | The stored hash of a visit's attempt id: hex SHA-256 (Web Crypto). It equals The host app's `resumeTokenHash`, so uploads recorded before the move still match. |
| [`checkUploads`](../packages/forms/src/uploads.ts) | function | — | Checks every file the answers name: uploaded by this attempt (or for this edit) to this form's field, in storage, of a type and size the field takes, and no more files than it takes. The stored name, type and size replace what the browse... |
| [`clientIp`](../packages/forms/src/rate-limit.ts) | function | — | The client's address as the platform reports it, used only as a rate-limit key: the first entry of the first trusted header that is set (`DEFAULT_TRUSTED_IP_HEADERS` by default), then, only when `forwardedForHops` is set, the `x-forwarde... |
| [`createEditSecretReader`](../packages/forms/src/edit-link.ts) | function | — | A reader for the environment variable that holds the edit-link secret (such as `FEEDBACK_EDIT_SECRET`). Without one of at least `MIN_EDIT_SECRET_BYTES` bytes there are no edit links, and the first read says so through `log` (the call's, ... |
| [`createUploadHandler`](../packages/forms/src/upload-handler.ts) | function | — | The upload endpoint: `(request, params) => Response`, for a POST route. `params` is whatever the route has (a form slug, say), passed to `resolveForm`. See the README's "Uploads" for the JSON and every status. |
| [`DEFAULT_TRUSTED_IP_HEADERS`](../packages/forms/src/rate-limit.ts) | const | — | The headers a platform reports the client's address in, most trusted first: Vercel's `x-vercel-forwarded-for` and Cloudflare's `cf-connecting-ip`, which the platform sets itself. `x-forwarded-for` is not read by default: its leftmost ent... |
| [`EDIT_LINK_PARAM`](../packages/forms/src/edit-link.ts) | const | — | The query parameter an edit link's token travels in: `?edit=<token>`. |
| [`EDIT_LINK_TTL_SECONDS`](../packages/forms/src/edit-link.ts) | const | — | How long a new edit link works: 30 days. |
| [`editLinkUrl`](../packages/forms/src/edit-link.ts) | function | — | The link that reopens a response for editing: `formUrl` (the page that shows the form, with any query it needs) plus a token signed for the response's current nonce. Null when there are no edit links (no usable secret) or the id or nonce... |
| [`IDEMPOTENCY_KEY_PATTERN`](../packages/forms/src/submit-protocol.ts) | const | — | What an idempotency key matches: 16 to 128 letters, digits, `-` and `_`. |
| [`isEditLinkRequest`](../packages/forms/src/edit-link.ts) | function | — | Whether this request is a form page opened with an edit link (the parameter present, even empty). |
| [`isIdempotencyKey`](../packages/forms/src/submit-protocol.ts) | function | — | _(no summary)_ |
| [`isSubmitResult`](../packages/forms/src/submit-protocol.ts) | function | — | Whether `value` is a `SubmitResult`, for a device reading an endpoint's JSON. |
| [`isUsableEditSecret`](../packages/forms/src/edit-link.ts) | function | — | Whether `secret` can sign edit links: a string of at least `MIN_EDIT_SECRET_BYTES` bytes. |
| [`MAX_EVENTS`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxEvents`. |
| [`MAX_REPLAY_WORK`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxReplayWork`. |
| [`MAX_SUBMISSION_VALUES`](../packages/forms/src/server.ts) | const | — | Default for `SubmissionOptions.maxValues`. |
| [`MAX_UPLOAD_REQUEST_BYTES`](../packages/forms/src/upload-protocol.ts) | const | — | The longest upload request body: a few fields of JSON. |
| [`mergeResponses`](../packages/forms/src/merge.ts) | function | — | `base` with `patch` on top, by field id, as the answers to store. The rules, in order: |
| [`MIN_EDIT_SECRET_BYTES`](../packages/forms/src/edit-link.ts) | const | — | The shortest secret edit links are signed with: 32 bytes (UTF-8), as long as the HMAC. |
| [`NOT_UPLOADED_MESSAGE`](../packages/forms/src/uploads.ts) | const | — | Said when a reference isn't a file this respondent finished uploading here. |
| [`publicDefinition`](../packages/forms/src/server.ts) | function | — | The definition as respondents may see it. R1 forms hold nothing secret; assessment answer keys (R4) will be stripped here. |
| [`RATE_LIMIT_DEFAULTS`](../packages/forms/src/rate-limit.ts) | const | — | How many submits, saves as they go and photo uploads one client may make per scope (an organization, an account) in a window. |
| [`rateLimitKey`](../packages/forms/src/rate-limit.ts) | function | — | The stored key, `<kind>:<scope>:<hex HMAC-SHA256 of the address prefix>`: what is counted (such as `submit`, `progress`, `upload`), whose count it is (an organization id), and the client, which is never stored as its address. `secret` is... |
| [`RAW_EVENTS_PER_EVENT`](../packages/forms/src/server.ts) | const | — | Most events sent, before compaction, as a multiple of `maxEvents`: a keystroke log compacts to far fewer, but every event sent is looked at. |
| [`signEditToken`](../packages/forms/src/edit-link.ts) | function | — | The edit token for a response and its current nonce, working for `ttlSeconds` from now; null when there is no usable secret (no edit links) or the id or nonce is malformed. |
| [`submitOutcome`](../packages/forms/src/submit-protocol.ts) | function | — | What a device does with an answer: `delivered` (stored now or before: drop it from the outbox), `retry` (keep it and try again later) or `rejected` (keep it, marked failed, for the respondent to fix or discard). Anything that isn't a `Su... |
| [`submitResponse`](../packages/forms/src/submit.ts) | function | — | _(no summary)_ |
| [`UPLOAD_MESSAGES`](../packages/forms/src/upload-handler.ts) | const | — | _(no summary)_ |
| [`uploadFields`](../packages/forms/src/uploads.ts) | function | — | The form's upload fields (`UPLOAD_FIELD_TYPES`: photo). |
| [`uploadRules`](../packages/forms/src/uploads.ts) | function | — | The rules for an upload field, or null when the field doesn't take files. |
| [`validateSubmission`](../packages/forms/src/server.ts) | function | — | Check a submission against the published definition. Never throws on a malformed submission: it returns `{ ok: false, errors: { "": … } }`. |
| [`verifyEditToken`](../packages/forms/src/edit-link.ts) | function | — | What a token says, or null when it is malformed, its signature does not match, it has expired (or claims to last longer than `ttlSeconds` from now), or there is no usable secret. Whether the nonce is still the response's is the caller's ... |
| [`withEditLinkHeaders`](../packages/forms/src/edit-link.ts) | function | — | The response, with `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store` added when the request carried an edit link; otherwise the same response, untouched. The link is a credential, so it never leaves in a Referer heade... |
| [`withEditToken`](../packages/forms/src/edit-link.ts) | function | — | A form link with the edit token added: `<formUrl>?edit=<token>` (or `&edit=` when it has a query). `param` names the parameter; `EDIT_LINK_PARAM` by default. |
| [`withHostOptions`](../packages/forms/src/fields.ts) | function | — | The definition with each `optionsFrom: { source: "host" }` field's options filled in from `hostOptions`: its own `props.options` first, then the host's list for its key (a value the field already has is not added twice). A key the host d... |

### Types (41)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnswerSnapshot };
export type { BeginUploadInput };
export type { CheckUploadsOptions };
export type { CheckedSubmission };
export type { CheckedUploads };
export type { ClientIpOptions };
export type { EditLinkClaims };
export type { EditLinkOptions };
export type { EditLinkRequestOptions };
export type { EditLinkUrlOptions };
export type { EditSecretLog };
export type { EditSecretReader };
export type { EditableResponse };
export type { HostOptions };
export type { MergeOptions };
export type { OptionSnapshot };
export type { RateLimitAnswer };
export type { RateLimitStore };
export type { RestoredAnswers };
export type { SignedUpload };
export type { StoredSubmissionRef };
export type { StoredUpload };
export type { SubmissionInput };
export type { SubmissionOptions };
export type { SubmissionRecord };
export type { SubmissionResult };
export type { SubmissionStore };
export type { SubmitFailureReason };
export type { SubmitOutcome };
export type { SubmitRequest };
export type { SubmitResponseOptions };
export type { SubmitResult };
export type { UploadForm };
export type { UploadGrant };
export type { UploadHandlerOptions };
export type { UploadMessages };
export type { UploadOwner };
export type { UploadRefusal };
export type { UploadRequest };
export type { UploadRules };
export type { UploadStore };
```

---

## @marktiderman/genesis/forms/destinations

**Barrel:** [`packages/genesis/src/forms-destinations.ts`](../packages/genesis/src/forms-destinations.ts)

### Other exports (76)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answerCell`](../packages/forms/src/destinations/row.ts) | function | — | One answer as a cell: numbers stay numbers (ratings, NPS), choices show their labels, a list is joined with ", ", yes/no reads "Yes"/"No", and a plugin type's `summarize` is used where it has one. |
| [`checkHookHost`](../packages/forms/src/destinations/hook-url.ts) | function | — | Checks that every address the URL's host resolves to is public. A host that resolves to nothing, or whose lookup fails, is refused too, as a retryable failure (DNS may be briefly down); a private address is final. |
| [`checkWebhookUrl`](../packages/forms/src/destinations/webhook.ts) | function | — | The URL from config, checked. Throws a `DeliveryError` naming the rule it broke (never the URL, which may hold a token). |
| [`clearGoogleOAuthTokenCache`](../packages/forms/src/destinations/google-oauth.ts) | function | — | Forgets cached OAuth access tokens (tests, or after a sheet is disconnected). |
| [`clearGoogleTokenCache`](../packages/forms/src/destinations/google-auth.ts) | function | — | Forgets cached tokens (tests, or after rotating a key). |
| [`columnLetter`](../packages/forms/src/destinations/sheets.ts) | function | — | A1 column letters: 0 → A, 25 → Z, 26 → AA. |
| [`conditionOf`](../packages/forms/src/destinations/condition.ts) | function | — | The destination's condition (`config.when`), or null when it has none. One that can't be read throws a permanent `DeliveryError` rather than meaning "send everything" or "send nothing". |
| [`createDeliveryRunner`](../packages/forms/src/destinations/runner.ts) | function | — | _(no summary)_ |
| [`createSecrets`](../packages/connect/src/secrets.ts) | function | — | Seals and opens secrets of one purpose with a keyring (see `parseKeyring` for what it takes). Derived keys are cached on the returned object. |
| [`DEDUPE_WINDOW`](../packages/forms/src/destinations/sheets.ts) | const | — | How many of the latest rows a redelivery checks for its id. |
| [`DEFAULT_BATCH_SIZE`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_ATTEMPTS`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_DEFERRALS`](../packages/forms/src/destinations/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_SHEET_NAME`](../packages/forms/src/destinations/sheets.ts) | const | — | _(no summary)_ |
| [`defaultBackoff`](../packages/forms/src/destinations/runner.ts) | const | — | 5 minutes, quadrupling each attempt, at most 24 hours: 5m, 20m, 80m, 5h20m, 21h20m, then 24h. Across the default 8 attempts that is about 3 days, as Standard Webhooks suggests. Each wait is jittered by up to ±20%, so deliveries that fail... |
| [`DeliveryError`](../packages/forms/src/destinations/types.ts) | class | — | A failure with a message that is safe to store. Destinations throw it internally and `deliveryFailure` turns it into a result; app-written destinations may do the same. |
| [`deliveryFailure`](../packages/forms/src/destinations/types.ts) | function | — | Any error as a failed result with a safe message. A `DeliveryError` keeps its message; anything else is reduced to its kind ("Timed out", "Network error"), because a raw message may hold a URL with a token in it. Timeouts and aborts are ... |
| [`deliveryOutcome`](../packages/forms/src/destinations/runner.ts) | function | — | Turns a destination's result into an outcome for a delivery on its `attempt`. |
| [`deriveSecretKey`](../packages/forms/src/destinations/secret-box.ts) | function | — | An AES-GCM key for one purpose, derived from the app secret with HKDF-SHA-256 (`info` naming the purpose; the salt empty unless `options.salt` is given). Use a different `info` for each kind of secret; keep it, and the salt, fixed once a... |
| [`DRIVE_FILE_SCOPE`](../packages/forms/src/destinations/google-oauth.ts) | const | — | Google's scope for files the person picked or created through the app. |
| [`emailBody`](../packages/forms/src/destinations/email.ts) | function | — | Plain text and HTML bodies from label/value lines, every value escaped. |
| [`emailDestination`](../packages/forms/src/destinations/email.ts) | function | — | _(no summary)_ |
| [`escapeFormula`](../packages/forms/src/destinations/row.ts) | function | — | A cell that a spreadsheet will never run as a formula when the text is opened elsewhere (a CSV export opened in Excel). Opt-in: use it when writing CSV, not for the sheet destination, whose RAW writes are already safe and would store the... |
| [`escapeHtml`](../packages/forms/src/destinations/email.ts) | function | — | _(no summary)_ |
| [`escapeSlack`](../packages/forms/src/destinations/slack.ts) | function | — | Text for Slack's mrkdwn: `&`, `<` and `>` escaped, which is all Slack asks. |
| [`GOOGLE_TOKEN_URL`](../packages/forms/src/destinations/google-auth.ts) | const | — | _(no summary)_ |
| [`googleAccessToken`](../packages/forms/src/destinations/google-auth.ts) | function | — | A cached or fresh access token. Throws a `DeliveryError` with a safe message on failure. |
| [`googleOAuthAccessToken`](../packages/forms/src/destinations/google-oauth.ts) | function | — | A cached or fresh access token for a refresh token, cached until a minute before it expires. |
| [`HEADER_SCAN_ROWS`](../packages/forms/src/destinations/sheets.ts) | const | — | How many rows the header read looks at to find the columns in use: the header row and the first responses under it. Bounded, so a tab with years of responses is never read whole just to learn its header. |
| [`headerSafe`](../packages/forms/src/destinations/email.ts) | function | — | A header value on one line: control characters (CR, LF, NUL…) and Unicode line separators become spaces, runs of spaces collapse, and it is cut to `max` characters. |
| [`hookHost`](../packages/forms/src/destinations/hook-url.ts) | function | — | The host as a screen may show it (never the path: a Slack or webhook path can be the secret). |
| [`HookUrlError`](../packages/forms/src/destinations/hook-url.ts) | class | — | An address that can't be used, with a reason safe to show and to store (never the address). |
| [`httpError`](../packages/forms/src/destinations/types.ts) | function | — | The error for a refused request. Retryable statuses (see `isRetryableStatus`) wait for the Retry-After header, else 60 seconds; every other status is permanent. |
| [`idempotencyKey`](../packages/forms/src/destinations/email.ts) | function | — | The idempotency key: the delivery id and the first 16 hex digits of SHA-256 of the sorted recipients, so a retried delivery never sends twice and one whose recipients changed meanwhile is a new send. |
| [`isCondition`](../packages/forms/src/destinations/condition.ts) | function | — | Whether a stored value has a `Condition`'s shape, nested at most `MAX_CONDITION_DEPTH` deep. |
| [`isPrivateHost`](../packages/forms/src/destinations/webhook.ts) | function | — | Whether a URL hostname is localhost or a private, loopback, link-local or unspecified address literal. |
| [`isPublicAddress`](../packages/forms/src/destinations/hook-url.ts) | function | — | Whether an IP address (v4 or v6) is a public one a hook may reach. Anything unparsable is not. |
| [`isRetryableStatus`](../packages/forms/src/destinations/types.ts) | function | — | Whether an HTTP status is worth retrying unchanged: 408, 425, 429 and 5xx. |
| [`isSafeAddress`](../packages/forms/src/destinations/email.ts) | function | — | A bare address that is safe as a header value: valid, one line, no display name. |
| [`isSafeFrom`](../packages/forms/src/destinations/email.ts) | function | — | A From value: a bare address, or `Name <address>` where the name has no quotes, angle brackets or line breaks. |
| [`isSecretError`](../packages/connect/src/secrets.ts) | function | — | Whether `error` is a `SecretError`, by its name and code rather than `instanceof`, so it also matches a copy bundled into another package (genesis-forms bundles one). |
| [`MAX_CONDITION_DEPTH`](../packages/forms/src/destinations/condition.ts) | const | — | How deep `all` / `any` / `not` may nest in a stored condition. |
| [`MAX_HOOK_URL_LENGTH`](../packages/forms/src/destinations/hook-url.ts) | const | — | _(no summary)_ |
| [`MAX_RECIPIENTS`](../packages/forms/src/destinations/email.ts) | const | — | Resend allows 50 recipients per email. |
| [`mergeHeader`](../packages/forms/src/destinations/sheets.ts) | function | — | The existing header plus any keys it does not have yet, in the order they arrive. A blank header cell keeps its place (dropping it would shift every later column away from the values stored under it), as do blank header cells over the `w... |
| [`MIN_WEBHOOK_SECRET_BYTES`](../packages/forms/src/destinations/webhook.ts) | const | — | The shortest signing secret, decoded: Standard Webhooks recommends 24 to 64 bytes. |
| [`newWebhookSecret`](../packages/forms/src/destinations/webhook.ts) | function | — | A new signing secret: `whsec_` and standard base64 of 32 random bytes, the form Standard Webhooks libraries read. Show it to the receiver once; keep it out of config. |
| [`openSecret`](../packages/forms/src/destinations/secret-box.ts) | function | — | Decrypts what `sealSecret` sealed with the same key and `aad`. Throws a permanent `DeliveryError` for an unknown format, a wrong key (rotated?) or a ciphertext from another row; never echoes the ciphertext. |
| [`parseHookUrl`](../packages/forms/src/destinations/hook-url.ts) | function | — | The address as it will be used (its fragment dropped), or a `HookUrlError` saying what is wrong with it. Checks the text only; `checkHookHost` checks where the name resolves. A `"slack"` address must be a Slack incoming webhook (`https:/... |
| [`parseKeyring`](../packages/connect/src/secrets.ts) | function | — | A keyring from config: an object, its JSON text (one environment variable: `{"active":"k2","keys":{"k1":"…","k2":"…"}}`), or a single bare key, which becomes `{ active: "k1", keys: { k1 } }` (how a single-key secret moves onto a keyring)... |
| [`passesCondition`](../packages/forms/src/destinations/condition.ts) | function | — | Whether a submission matches its destination's condition (true when there is none). Throws a `DeliveryError` when the condition can't be read. |
| [`refreshGoogleAccessToken`](../packages/forms/src/destinations/google-oauth.ts) | function | — | Trades a refresh token for an access token, uncached. `invalid_grant` (access revoked, or the account gone) is a permanent failure saying to connect the sheet again; 429 and 5xx are retryable. Never puts a token in an error message. |
| [`renderEmail`](../packages/forms/src/destinations/email.ts) | function | — | The default notification: subject `"<form title>: new response"` (or `config.subject`), then the meta columns, each answered field by label, the ending's title when the form has several, and the response id. |
| [`REQUEST_TIMEOUT_MS`](../packages/forms/src/destinations/types.ts) | const | — | Every outbound request gives up after this long, unless the destination is given another `timeoutMs`. |
| [`RESEND_API`](../packages/forms/src/destinations/email.ts) | const | — | _(no summary)_ |
| [`resendProvider`](../packages/forms/src/destinations/email.ts) | function | — | Resend's REST API. Sends the idempotency key, so a retry within Resend's 24-hour window never sends twice. A 409 for a concurrent request with the same key is retried; one for a key reused with a different body is not. |
| [`responseRow`](../packages/forms/src/destinations/row.ts) | function | — | The row for one submission. Columns: `id` (the response id), then `submitted_at` when given, then the app's `meta` columns in order, then one per field key in form order (blank when unanswered or hidden by logic). Content blocks get no c... |
| [`retryAfterSeconds`](../packages/forms/src/destinations/types.ts) | function | — | Seconds to wait from a Retry-After header, else the fallback. Only the two forms RFC 9110 defines are read: delta-seconds (digits only) and an IMF-fixdate (`Wed, 21 Oct 2026 07:28:00 GMT`); anything else (`-5`, `1.5`, a loose date) gets ... |
| [`rowFor`](../packages/forms/src/destinations/sheets.ts) | function | — | One cell per header column, blank where the row has no value; `escape` applies `escapeFormula` (default false). |
| [`sealSecret`](../packages/forms/src/destinations/secret-box.ts) | function | — | Encrypts `plaintext` bound to `aad` (the row it belongs to): `v1.<iv>.<ciphertext>`. |
| [`SecretError`](../packages/connect/src/secrets.ts) | class | — | A failure whose message is safe to log: never a key, a plaintext or a ciphertext. |
| [`secretKeyBytes`](../packages/forms/src/destinations/secret-box.ts) | function | — | The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32` prints), or the bytes themselves. Throws a `DeliveryError` naming the problem, never the key. |
| [`SENSITIVE_MASK`](../packages/forms/src/destinations/row.ts) | const | — | _(no summary)_ |
| [`SHEETS_API`](../packages/forms/src/destinations/sheets.ts) | const | — | _(no summary)_ |
| [`SHEETS_SCOPE`](../packages/forms/src/destinations/google-auth.ts) | const | — | _(no summary)_ |
| [`sheetsDestination`](../packages/forms/src/destinations/sheets.ts) | function | — | _(no summary)_ |
| [`signJwt`](../packages/forms/src/destinations/google-auth.ts) | function | — | A signed RS256 JWT. Throws a `DeliveryError` when the key is not a valid PKCS#8 RSA key. |
| [`signWebhook`](../packages/forms/src/destinations/webhook.ts) | function | — | The `webhook-signature` value for a message: `v1,<base64>`, or one such signature per secret, space-separated, when given several (a rotation). |
| [`SLACK_HOSTS`](../packages/forms/src/destinations/hook-url.ts) | const | — | The hosts a Slack incoming webhook lives on. |
| [`SLACK_VALUE_LIMIT`](../packages/forms/src/destinations/slack.ts) | const | — | Longest answer shown in full; longer ones are cut (the app has the rest). |
| [`slackDestination`](../packages/forms/src/destinations/slack.ts) | function | — | _(no summary)_ |
| [`slackMessage`](../packages/forms/src/destinations/slack.ts) | function | — | The message Slack gets for one submission: `{ text }` in Slack mrkdwn. |
| [`verifyWebhook`](../packages/forms/src/destinations/webhook.ts) | function | — | Checks a Standard Webhooks request: the timestamp is recent and one of the space-separated `v1` signatures matches. Compares in constant time (by WebCrypto `verify`). Never throws on a malformed request: returns false. |
| [`visibleInputs`](../packages/forms/src/destinations/row.ts) | function | — | Hidden and server inputs as recall and the webhook may show them: on an anonymous form identifying ones are left out, and sensitive ones are left out unless `sensitive` is `"include"`. |
| [`webhookDestination`](../packages/forms/src/destinations/webhook.ts) | function | — | _(no summary)_ |
| [`webhookPayload`](../packages/forms/src/destinations/webhook.ts) | function | — | The payload for one submission. Identifying answers stay out on anonymous forms. |

### Types (51)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Cell };
export type { ClaimRequest };
export type { ClaimedDelivery };
export type { DeliveryFailure };
export type { DeliveryItem };
export type { DeliveryOptions };
export type { DeliveryOutcome };
export type { DeliveryReport };
export type { DeliveryResult };
export type { DeliveryRunner };
export type { DeliveryRunnerOptions };
export type { DeliverySubmission };
export type { DeriveSecretKeyOptions };
export type { Destination };
export type { DestinationConfig };
export type { EmailConfig };
export type { EmailContent };
export type { EmailDestinationOptions };
export type { EmailMessage };
export type { EmailProvider };
export type { EmailRenderInput };
export type { GoogleOAuthClient };
export type { GoogleOAuthTokenOptions };
export type { GoogleServiceAccount };
export type { GoogleTokenOptions };
export type { HookKind };
export type { HttpDeps };
export type { Keyring };
export type { KeyringInput };
export type { OptionResolver };
export type { RefreshedGoogleToken };
export type { ResendOptions };
export type { ResolveContext };
export type { ResolveHost };
export type { ResponseRow };
export type { RowOptions };
export type { RunOptions };
export type { SecretErrorCode };
export type { Secrets };
export type { SecretsOptions };
export type { SheetConfig };
export type { SheetState };
export type { SheetsDestinationOptions };
export type { SlackDestinationOptions };
export type { SlackMessageInput };
export type { SlackMessageOptions };
export type { VerifyWebhookInput };
export type { WebCryptoKey };
export type { WebhookConfig };
export type { WebhookDestinationOptions };
export type { WebhookPayload };
```

---

## @marktiderman/genesis/forms/react

**Barrel:** [`packages/genesis/src/forms-react.ts`](../packages/genesis/src/forms-react.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FieldRenderer`](../packages/forms-react/src/index.tsx) | `FieldRendererProps` | — | Render one block with whatever the registry resolves. |
| [`FormRuntime`](../packages/forms-react/src/index.tsx) | `FormRuntimeProps` | — | Headless: provides the engine, the renderer registry and an id prefix to everything below. |

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ADVANCE_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long a single pick waits before moving on, so the respondent sees it picked. |
| [`CLASSIC_PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | In classic layout, how long after the last answer changed. |
| [`createRendererRegistry`](../packages/forms-react/src/index.tsx) | function | — | _(no summary)_ |
| [`formEngineOptions`](../packages/forms-react/src/controller.ts) | function | — | The engine options for a form that takes `hostOptions` and `linkParams` beside its other options, as `<Form>` does: `options` itself when neither is given. |
| [`outboxSubmit`](../packages/forms-react/src/outbox.ts) | function | — | An `onSubmit` for `useFormController` that queues the engine's event log in the outbox, then clears the draft. It resolves once the submission is in storage, so the controller shows the ending even while offline (the outbox sends it late... |
| [`PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long after a step forward `onProgress` waits, so quick steps save once. |
| [`useChoiceOptions`](../packages/forms-react/src/index.tsx) | function | — | The options a choice question shows now (`visibleOptions` over `answersOnPath`): all of them, or, when its list is filtered by another answer (`props.optionsFrom.filter`), the ones matching that answer. It re-renders only when that list ... |
| [`useField`](../packages/forms-react/src/index.tsx) | function | — | Everything one field renderer needs. Typing in one field re-renders that field only. |
| [`useForm`](../packages/forms-react/src/engine-hooks.ts) | function | — | Create a form engine for a definition. The engine lives as long as the definition's identity: pass a different definition object and you get a fresh engine (and a fresh response). Keep the definition stable (module scope, `useMemo`) so a... |
| [`useFormContext`](../packages/forms-react/src/index.tsx) | function | — | _(no summary)_ |
| [`useFormController`](../packages/forms-react/src/controller.ts) | function | — | The headless controller behind a form renderer: the step on screen and the path, errors, Next and Back, sending with retry, auto-advance, saving progress, what to announce and where focus goes. A renderer (web, native) draws what it retu... |
| [`useFormDraft`](../packages/forms-react/src/drafts.ts) | function | — | `useForm` with a draft on the device: the saved answers are put back when the form opens (where the respondent got to, too), saved again `delayMs` after each change, and flushed when the page is hidden or the component unmounts. With a s... |
| [`useFormSelector`](../packages/forms-react/src/engine-hooks.ts) | function | — | Subscribe to one slice of the form state. The component re-renders only when the selected value changes (`Object.is`), so return primitives or references the engine keeps stable (a field's value, an error string). |
| [`useRespondentPath`](../packages/forms-react/src/index.tsx) | function | — | The blocks the respondent steps through (`respondentPath`): the path without questions a prefill answered and hides (`props.prefill.hideWhenPrefilled`). Render these, not `state.path`, so a hidden question is neither shown nor counted. |
| [`useSubmitOutbox`](../packages/forms-react/src/outbox.ts) | function | — | The outbox's state (what's waiting, what failed, online or not), re-rendered as it changes. Starts the outbox (its timers) on mount; it keeps running after unmount, because one outbox serves the whole app: make it once, at module scope o... |

### Types (14)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FieldBinding };
export type { FocusTarget };
export type { FormController };
export type { FormControllerOptions };
export type { FormDraftState };
export type { FormErrorItem };
export type { FormLayoutMode };
export type { OutboxSubmitOptions };
export type { RendererEntry };
export type { RendererRegistry };
export type { SendPhase };
export type { SubmitOutboxState };
export type { UseFormDraftOptions };
export type { UseSubmitOutboxOptions };
```

---

## @marktiderman/genesis/forms/web

**Barrel:** [`packages/genesis/src/forms-web.ts`](../packages/genesis/src/forms-web.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FieldChrome`](../packages/forms-web/src/chrome.tsx) | `FieldChromeProps` | — | Label, description and error around a control. Group types (radio, checkbox list, rating, scale) get a real `fieldset`/`legend`, so a screen reader announces the question with every option; the fieldset carries the field's `inputId` (an ... |
| [`Form`](../packages/forms-web/src/Form.tsx) | `FormProps` | — | _(no summary)_ |

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`builtInRenderers`](../packages/forms-web/src/renderers.tsx) | const | — | _(no summary)_ |
| [`CLASSIC_PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | In classic layout, how long after the last answer changed. |
| [`DefaultEnding`](../packages/forms-web/src/Form.tsx) | function | — | The built-in ending (a check, the title and description, then any `actions`). Exported so a custom ending slot can wrap it rather than copy it. |
| [`defaultRegistry`](../packages/forms-web/src/renderers.tsx) | const | — | The built-in web renderers, shared by every `<Form>` that gets no `registry`. `extend()` returns a new registry and leaves this one alone; `register()` changes this one in place, for every form in the app. |
| [`describedBy`](../packages/forms-web/src/chrome.tsx) | function | — | _(no summary)_ |
| [`HIDDEN_QUERY_KEEP_MS`](../packages/forms-web/src/clean-url.ts) | const | — | How long a reload brings the query back: 30 minutes. |
| [`hideQueryOnLoad`](../packages/forms-web/src/clean-url.ts) | function | — | Run once when the page has read its query. Returns "hidden" when it took the query out of the address bar, "restoring" when a reload is bringing a hidden query back (the page is about to load again), else "none". |
| [`MediaTimeContext`](../packages/forms-web/src/source.ts) | const | — | Provide it around `<Form>` to link `media-notes` fields to a media player. |
| [`photoAccept`](../packages/forms-web/src/photo.tsx) | function | — | The `accept` attribute for a field: its MIME types, plus HEIC's file names for browsers that give it no type. |
| [`photoFileProblem`](../packages/forms-web/src/photo.tsx) | function | — | Why a picked file can't be added, or null when it can. |
| [`photoFileType`](../packages/forms-web/src/photo.tsx) | function | — | The file's type as the field judges it: some browsers give a HEIC photo no type, so its name decides. |
| [`PROGRESS_DELAY_MS`](../packages/forms-react/src/controller.ts) | const | — | How long after a step forward `onProgress` waits, so quick steps save once. |
| [`signedUploadHost`](../packages/forms-web/src/signed-upload.ts) | function | — | The browser half of the upload handshake (genesis-forms/server's `createUploadHandler`): for each file it asks `endpoint` for a signed upload (`UploadRequest` as JSON), sends the bytes with `send`, and resolves to the reference the serve... |
| [`SourceTextContext`](../packages/forms-web/src/source.ts) | const | — | The text a form is about (an article, a policy, a contract). `text-highlights` fields highlight passages of it; a field's own `props.text` is used when no host provides one. Offsets are UTF-16 indices into this exact string. |
| [`themeColors`](../packages/forms-web/src/theme.ts) | function | — | The accent as Genesis primary colours for a light and a dark page, each adjusted only as far as contrast needs. Null when `accent` is not a colour this understands. |
| [`themeCss`](../packages/forms-web/src/theme.ts) | function | — | The CSS that applies `theme` to the elements matching `selector`, or "" when it changes no colour. |
| [`UPLOAD_WAIT_MESSAGE`](../packages/forms-web/src/upload.ts) | const | — | Said when the respondent tries to move on or send while a photo is still uploading. |
| [`UploadContext`](../packages/forms-web/src/upload.ts) | const | — | Provide it around `<Form>` (or pass `onUpload`) so `photo` fields can store files. |
| [`useFormPresentation`](../packages/forms-web/src/presentation.ts) | function | — | The presentation and layout of the enclosing `<Form>`, so a custom slot or renderer can match the built-in ones (larger type and tap targets in page mode, for example). Outside a `<Form>` it reads embedded and classic. |
| [`useMediaTime`](../packages/forms-web/src/source.ts) | function | — | The enclosing `MediaTimeContext` value, or null. |
| [`useSourceText`](../packages/forms-web/src/source.ts) | function | — | The enclosing `SourceTextContext` value, or null. |
| [`useUpload`](../packages/forms-web/src/upload.ts) | function | — | The enclosing `UploadContext` value, or null when no host stores files. |
| [`wasReload`](../packages/forms-web/src/clean-url.ts) | const | — | Whether this page load was a reload (Navigation Timing), in the browser; false elsewhere. |

### Types (19)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandSlotProps };
export type { EndingSlotProps };
export type { ErrorSummaryItem };
export type { ErrorSummarySlotProps };
export type { FormBrand };
export type { FormPresentation };
export type { FormPresentationValue };
export type { FormSlotMap };
export type { FormTheme };
export type { HeaderSlotProps };
export type { HiddenQueryWindow };
export type { MediaTime };
export type { NavigationSlotProps };
export type { ProgressSlotProps };
export type { SignedUploadHost };
export type { SignedUploadHostOptions };
export type { ThemeColors };
export type { UploadClaim };
export type { UploadHost };
```

---

## @marktiderman/genesis/features

**Barrel:** [`packages/genesis/src/features.ts`](../packages/genesis/src/features.ts)

### Other exports (58)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AGENTS_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated block in AGENTS.md. |
| [`AGENTS_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated block in AGENTS.md. |
| [`BlockError`](../packages/features/src/blocks.ts) | class | Beta | Thrown by {@link defineBlock} and {@link resolveBlocks}; lists every problem at once. @stability Beta |
| [`BrokenBlockError`](../packages/features/src/generate.ts) | class | — | Thrown when a generated block's markers are broken: one is missing, repeated or out of order. |
| [`CONTENT_PACK_FIELD_TARGETS`](../packages/features/src/content-packs-legacy.ts) | const | Beta | Where a custom field lives, and the block that owns that table. |
| [`contentPackBlocks`](../packages/features/src/content-packs.ts) | function | Beta | The block ids a pack's sections need, whatever it declares. @stability Beta |
| [`ContentPackError`](../packages/features/src/content-packs.ts) | class | Beta | Thrown by {@link defineContentPack}; lists every problem at once. @stability Beta |
| [`contentPackProblems`](../packages/features/src/content-packs.ts) | function | Beta | Every problem with a pack: its shape, each section's items (through the validator its block registers, when given) and, given the installed blocks, any block it fills that isn't installed. An empty list means it can be installed. The sec... |
| [`cycleProblems`](../packages/features/src/graph.ts) | function | Beta | Cycles through `requires`, each reported once, from where the depth-first search found it. @stability Beta |
| [`defineBlock`](../packages/features/src/blocks.ts) | function | Beta | Declare a block. Validates it (id, requirements, platforms, contribution keys and duplicate ids within the block) and returns it frozen, so a typo fails where the block is written rather than where it is used: |
| [`defineContentPack`](../packages/features/src/content-packs.ts) | function | Beta | Declare a content pack: returns it unchanged, typed, after checking its shape (throws a {@link ContentPackError} listing every problem). Give the blocks it fills, or validators by block id, to check each section's items too. Whether its ... |
| [`defineFeatures`](../packages/features/src/model.ts) | function | Beta | The one source of truth for a repo's features. Validates every entry and returns the same object, so running code reads it directly and the key type becomes the repo's `FeatureId`: |
| [`defineFlags`](../packages/features/src/model.ts) | function | Beta | Flags, each tied to a feature of `features`. An unknown `feature` is a type error, and at runtime: - every flag needs an `owner`, a `kind`, a `default` and its `scopes`; - `release` and `experiment` flags need an `expires` date, `ops` fl... |
| [`dependencyOrder`](../packages/features/src/graph.ts) | function | — | The ids in dependency order (what a node requires comes first), ties kept in the given order. Requirements outside `nodes` are ignored. Assumes no cycles ({@link requiresProblems} reports them). |
| [`expiredFlags`](../packages/features/src/model.ts) | function | Beta | Flags whose `expires` date is before `today` (`YYYY-MM-DD`, default today in UTC): remove the code path, then the flag. |
| [`FEATURE_HORIZONS`](../packages/features/src/model.ts) | const | Beta | When a planned or building feature is due, without dates: the roadmap's three columns. |
| [`FEATURE_KINDS`](../packages/features/src/model.ts) | const | Beta | What kind of thing a feature is, from smallest to largest, so an agent looking for a building block can tell an element from a whole block: `token`, `element` (one component), `pattern` (a composed component with slots), `layout` (a page... |
| [`FEATURE_LAYERS`](../packages/features/src/model.ts) | const | — | _(no summary)_ |
| [`FEATURE_PLATFORMS`](../packages/features/src/platforms.ts) | const | Beta | Where a feature runs. `server` covers Node, edge functions and the database. |
| [`FEATURE_STATUSES`](../packages/features/src/types.ts) | const | Beta | Where a feature is in its life. The order is the board's column order. `idea` is captured but not agreed: it is in the list so `find` turns it up before someone builds the same thing twice. |
| [`featureKind`](../packages/features/src/model.ts) | function | Beta | A feature's kind: `kind`, or else the deprecated `layer` field (read until the next major). |
| [`featureLayer`](../packages/features/src/model.ts) | function | Beta | A kind written in the deprecated `layer` field, with its old name `"primitive"` mapped to `"element"`. |
| [`FeatureOff`](../packages/features/src/gate.ts) | class | Beta | Thrown by {@link requireFeature} when a feature is off. Servers map it to a refusal that carries the reason (HTTP 403, or 402 for `entitlement`). |
| [`featureOn`](../packages/features/src/gate.ts) | function | Beta | Is feature `id` on for this context? Returns the first check that said no as `reason`, and for a paid feature the plan that unlocks it. An unknown id is off with reason `unknown`; it never throws for one. |
| [`featurePackageLayer`](../packages/features/src/model.ts) | function | Beta | A feature's layer, derived from the package that owns it: the first `entry` import whose package is known, else the first `links.code` path inside a known package folder. Undefined when no package owns it (an app's own feature, a tool in... |
| [`FeatureRegistryError`](../packages/features/src/model.ts) | class | — | Thrown by {@link defineFeatures} and {@link defineFlags}; lists every problem at once. |
| [`featureSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FeatureDef}, field by field. Cross-field rules live in {@link featureProblems}. |
| [`findFeatures`](../packages/features/src/model.ts) | function | Beta | Features matching `term` in their id, aliases, name, keywords, summary, tagline, category, import paths, slots, contributions or code paths, best matches (id, name and keywords) first. With `options` and an empty `term`, every feature th... |
| [`FLAG_KINDS`](../packages/features/src/types.ts) | const | Beta | Why a flag exists. `release` and `experiment` flags need `expires`, `ops` flags need a `runbook`, and `permission` flags fail `check`: paid access belongs in entitlements (`access`), not flags. |
| [`flagSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FlagDef}. Cross-flag rules live in {@link defineFlags}. |
| [`flagsForFeature`](../packages/features/src/model.ts) | function | Beta | The names of the flags that belong to a feature, in declaration order. |
| [`fromSnapshot`](../packages/features/src/gate.ts) | function | Beta | One feature's answer from a snapshot. An id missing from it is off, as an unknown feature. @stability Beta |
| [`gateSnapshot`](../packages/features/src/gate.ts) | function | Beta | _(no summary)_ |
| [`isSnapshotStale`](../packages/features/src/gate.ts) | function | Beta | Whether a snapshot is older than `maxAgeMs`: refresh it then. A client (an extension worker, a tab left open) keeps a snapshot, replaces it when it is stale, after sign-in or a tenant switch, and right after a refusal. |
| [`MARKETING_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated marketing block. |
| [`MARKETING_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated marketing block (e.g. in README.md). |
| [`marketingRecords`](../packages/features/src/generate.ts) | function | — | The public, shipped features a marketing page shows: visibility public, a tagline, live or beta. |
| [`OPENFEATURE_MANIFEST_SCHEMA`](../packages/features/src/generate.ts) | const | — | The schema an OpenFeature CLI flag manifest points at. |
| [`overlayUpstream`](../packages/features/src/overlay.ts) | function | Beta | The upstream package name and version of a marker: `{ name, version }`. |
| [`PACKAGE_GROUPS`](../packages/features/src/packages.ts) | const | Beta | Where a package appears on the site and in Storybook. `modules` holds every module. |
| [`PACKAGE_LAYERS`](../packages/features/src/packages.ts) | const | Beta | The package layers, bottom to top, with tooling beside them. |
| [`packageLayerProblems`](../packages/features/src/packages.ts) | function | Beta | Every layering problem across a set of packages, as strings: |
| [`readAgentsBlock`](../packages/features/src/generate.ts) | const | — | The generated AGENTS.md block inside `doc`, or null. |
| [`readOverlayMarker`](../packages/features/src/overlay.ts) | function | Beta | A package's `genesis.overlay` marker, or null when it doesn't validate. Problems go in `problems`, each prefixed with the package name. |
| [`readPackageMeta`](../packages/features/src/packages.ts) | function | Beta | A package's layer metadata, or null when it has none valid. Problems go in `problems`, each prefixed with the package name. |
| [`replaceAgentsBlock`](../packages/features/src/generate.ts) | const | Beta | `doc` with its generated AGENTS.md block replaced by `block`, or with `block` appended when it has none yet. |
| [`requireFeature`](../packages/features/src/gate.ts) | function | Beta | Refuse unless the feature is on: call it at the top of every server function and route that belongs to a feature. |
| [`requirementProblem`](../packages/features/src/graph.ts) | function | Beta | One requirement's problem (itself, or an unknown id), or undefined when it is fine. @stability Beta |
| [`requiresProblems`](../packages/features/src/graph.ts) | function | Beta | Self-requirements, unknown requirements and cycles through `requires`, as problem strings (`a.requires: …`). Each cycle is reported once, from where the depth-first search found it: `a.requires: a cycle: a → b → a`. |
| [`resolveBlocks`](../packages/features/src/blocks.ts) | function | Beta | The blocks that are on, checked and merged: |
| [`SHIPPED_STATUSES`](../packages/features/src/gate.ts) | const | Beta | The statuses in which a feature is on. A deprecated feature still works until it is retired. @stability Beta |
| [`statusOn`](../packages/features/src/status.ts) | function | Beta | A feature's status on one platform, or undefined when it isn't there. Zod-free so the gate can use it on phones and in browsers. |
| [`toAgentsMarkdown`](../packages/features/src/generate.ts) | function | Beta | The marker-delimited block for AGENTS.md: deliberately short. It points agents at `find` and the skill and gives counts, never the whole list, so AGENTS.md stays small however many features there are. |
| [`toJson`](../packages/features/src/generate.ts) | function | Beta | The registry as JSON, for tools that can't import TypeScript. Stable: no timestamps, features in declaration order, so `check` can compare it. It is also the record of every id ever used, which keeps ids permanent. |
| [`toMarketingMarkdown`](../packages/features/src/generate.ts) | function | Beta | A benefit-led feature list for a README or a marketing page: public, shipped features with a tagline, highlights first, grouped by category. |
| [`toOpenFeatureManifest`](../packages/features/src/generate.ts) | function | Beta | The flags as an OpenFeature CLI flag manifest (`flags.json`), so `openfeature generate` can make typed accessors from the same registry. |
| [`toRecords`](../packages/features/src/model.ts) | function | Beta | Features as records, in declaration order, each with its flags attached. |
| [`toSkillMarkdown`](../packages/features/src/generate.ts) | function | Beta | The agent skill for working with the registry, written to `.claude/skills/features/SKILL.md` by `genesis features build`. `outputs` names what the build writes in this repo, so the skill never claims a file the repo turned off. |

### Types (60)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BlockContributions };
export type { BlockDataUse };
export type { BlockDef };
export type { BlockMigration };
export type { BlockNavItem };
export type { BlockPrivacy };
export type { BlockRoute };
export type { BlockSettingsRow };
export type { ContentPackCheckOptions };
export type { ContentPackDef };
export type { ContentPackFieldDefinition };
export type { ContentPackFieldTarget };
export type { ContentPackForm };
export type { ContentPackMetricTemplate };
export type { ContentPackRoadmapTemplate };
export type { ContentPackSectionValidator };
export type { ContentPackSections };
export type { ContentPackSessionType };
export type { Contributed };
export type { DeprecatedFeatureLayer };
export type { EnabledBlocks };
export type { FeatureAccess };
export type { FeatureDef };
export type { FeatureHorizon };
export type { FeatureIdOf };
export type { FeatureKind };
export type { FeatureLayer };
export type { FeatureLinks };
export type { FeatureMedia };
export type { FeaturePackage };
export type { FeaturePlatform };
export type { FeatureRecord };
export type { FeatureStatus };
export type { FeatureVisibility };
export type { Features };
export type { FindOptions };
export type { FlagDef };
export type { FlagKind };
export type { FlagValue };
export type { Flags };
export type { GateAnswer };
export type { GateContext };
export type { GateFeature };
export type { GateFlag };
export type { GateReason };
export type { GateRegistry };
export type { GateSnapshot };
export type { GateSnapshotOptions };
export type { GenerateOptions };
export type { IdSet };
export type { LayerPackage };
export type { ModuleMeta };
export type { OverlayMarker };
export type { PackageGroup };
export type { PackageLayer };
export type { PackageMeta };
export type { RequiresNode };
export type { RequiresProblemsOptions };
export type { ResolveBlocksOptions };
export type { ResolvedBlocks };
```

---

## @marktiderman/genesis-cli

Genesis CLI — `genesis init` scaffolds a Genesis app (`--template native`: a new Expo app from the RN starter); `genesis add <block>` adds a block from what its package declares; `genesis migrate` copies new package migrations in and never rewrites an applied one; `genesis upgrade` moves every Genesis package to one release and refreshes the files Genesis owns; `genesis doctor` checks an app against the installed Genesis; `genesis studio init` turns the Data Studio on; `genesis introspect` writes a checked-in contract; `genesis features build|check` keeps generated feature docs in step with features.ts; `withGenesis()` (`app.plugin.js`, `/expo`) is the Expo config plugin.

**Barrel:** [`packages/genesis-cli/src/index.ts`](../packages/genesis-cli/src/index.ts)

### Other exports (19)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| `CommentSettingsError` | value | — | _(no summary)_ |
| `defineDoctorPlugin` | value | — | _(no summary)_ |
| `detectHost` | value | — | _(no summary)_ |
| `DoctorConfigError` | value | — | _(no summary)_ |
| `emitContracts` | value | — | _(no summary)_ |
| `EmitError` | value | — | _(no summary)_ |
| `formatReport` | value | — | _(no summary)_ |
| `GenesisConfigError` | value | — | _(no summary)_ |
| `introspectOpenApi` | value | — | _(no summary)_ |
| `introspectPostgres` | value | — | _(no summary)_ |
| `parseColumnComment` | value | — | _(no summary)_ |
| `parseTableComment` | value | — | _(no summary)_ |
| `planScaffold` | value | — | _(no summary)_ |
| `planStudioInit` | value | — | _(no summary)_ |
| `readGenesisConfig` | value | — | _(no summary)_ |
| `runDoctor` | value | — | _(no summary)_ |
| `runScaffold` | value | — | _(no summary)_ |
| `validateConsumerName` | value | — | _(no summary)_ |
| `validateLinks` | value | — | _(no summary)_ |

### Types (24)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DoctorConfig };
export type { DoctorContext };
export type { DoctorPlugin };
export type { DoctorResult };
export type { EmitOptions };
export type { FieldSettings };
export type { FileSystem };
export type { Finding };
export type { GenesisConfigFile };
export type { GenesisLinks };
export type { InitOptions };
export type { InitPlan };
export type { IntrospectedColumn };
export type { IntrospectedTable };
export type { OpenApiDocument };
export type { PlannedFile };
export type { ProjectFacts };
export type { RunDoctorOptions };
export type { ScaffoldLogger };
export type { ScaffoldOptions };
export type { ScaffoldResult };
export type { StorageType };
export type { StudioHost };
export type { TableSettings };
```

---

## @marktiderman/genesis-cli/scaffolder

**Barrel:** [`packages/genesis-cli/src/scaffolder.ts`](../packages/genesis-cli/src/scaffolder.ts)

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| `brand` | value | — | _(no summary)_ |
| [`brand`](../packages/genesis-cli/src/scaffolder.ts) | const | — | _(no summary)_ |
| [`planScaffold`](../packages/genesis-cli/src/scaffolder.ts) | function | — | Compute which files the scaffolder would write for a given plan. Pure function — no I/O. Tests use this directly. |
| [`runScaffold`](../packages/genesis-cli/src/scaffolder.ts) | function | — | Run the scaffolder against a FileSystem implementation. Returns a record of what it did so the CLI / test harness can summarize. |
| [`validateConsumerName`](../packages/genesis-cli/src/scaffolder.ts) | function | — | Validate a consumer slug. Throws if invalid. |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Brand };
export type { BrandColorScale };
export type { BrandColors };
export type { FileSystem };
export type { ScaffoldLogger };
export type { ScaffoldOptions };
export type { ScaffoldResult };
```

---

## @marktiderman/genesis-cli/doctor

**Barrel:** [`packages/genesis-cli/src/doctor/index.ts`](../packages/genesis-cli/src/doctor/index.ts)

### Other exports (44)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| `agentGuideState` | value | — | _(no summary)_ |
| `BUILTIN_RULES` | value | — | _(no summary)_ |
| [`builtinChecks`](../packages/genesis-cli/src/doctor/index.ts) | function | — | The built-in checks, in the order they run. A new built-in rule is a check here plus its ids in BUILTIN_RULES (rules.ts); a pack's checks run only when `packs` lists it. |
| `catalogTable` | value | — | _(no summary)_ |
| `changedSince` | value | — | _(no summary)_ |
| `clearPackageRulesCache` | value | — | _(no summary)_ |
| `defineDoctorPlugin` | value | — | _(no summary)_ |
| `discoverPackages` | value | — | _(no summary)_ |
| `DoctorConfigError` | value | — | _(no summary)_ |
| `findPackageDir` | value | — | _(no summary)_ |
| `formatPrimitives` | value | — | _(no summary)_ |
| [`formatReport`](../packages/genesis-cli/src/doctor/index.ts) | function | — | The human-readable report. |
| `GenesisConfigError` | value | — | _(no summary)_ |
| `genesisInstalls` | value | — | _(no summary)_ |
| [`genesisSummary`](../packages/genesis-cli/src/doctor/index.ts) | function | — | What `--print-genesis` shows: the facts every rule is derived from. |
| `globToRegExp` | value | — | _(no summary)_ |
| `loadConfig` | value | — | _(no summary)_ |
| `loadGenesis` | value | — | _(no summary)_ |
| `nativeLayouts` | value | — | _(no summary)_ |
| `PackageDeclarationError` | value | — | _(no summary)_ |
| `parseExportNames` | value | — | _(no summary)_ |
| `parseRulesMarkdown` | value | — | _(no summary)_ |
| `postgresContract` | value | — | _(no summary)_ |
| `postgresSource` | value | — | _(no summary)_ |
| `preferRules` | value | — | _(no summary)_ |
| `primitivesCatalog` | value | — | _(no summary)_ |
| `primitivesSummary` | value | — | _(no summary)_ |
| `readGenesisConfig` | value | — | _(no summary)_ |
| `readPackageExports` | value | — | _(no summary)_ |
| `readReleaseManifest` | value | — | _(no summary)_ |
| `renderAgentsBlock` | value | — | _(no summary)_ |
| `renderSkill` | value | — | _(no summary)_ |
| `routesDir` | value | — | _(no summary)_ |
| `ruleNamespace` | value | — | _(no summary)_ |
| [`runDoctor`](../packages/genesis-cli/src/doctor/index.ts) | function | — | _(no summary)_ |
| `satisfies` | value | — | _(no summary)_ |
| `SKILL_PATH` | value | — | _(no summary)_ |
| `sqlStatements` | value | — | _(no summary)_ |
| [`toJson`](../packages/genesis-cli/src/doctor/index.ts) | function | — | The `--json` report: plain data, sets turned into sorted lists. |
| `validateConfig` | value | — | _(no summary)_ |
| `validateDeclaration` | value | — | _(no summary)_ |
| `validateLinks` | value | — | _(no summary)_ |
| `webRoutes` | value | — | _(no summary)_ |
| `writeAgentGuide` | value | — | _(no summary)_ |

### Types (12)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DeclaringPackage };
export type { GenesisConfigFile };
export type { GenesisInstall };
export type { GenesisLinks };
export type { PackageDeclaration };
export type { PreferRule };
export type { PrimitiveEntry };
export type { PrimitiveRow };
export type { ReleaseManifest };
export type { ResolvedPreferRule };
export type { RouteFile };
export type { RunDoctorOptions };
```

---

## @marktiderman/genesis-cli/vite

**Barrel:** [`packages/genesis-cli/src/vite.ts`](../packages/genesis-cli/src/vite.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`genesisDoctor`](../packages/genesis-cli/src/vite.ts) | function | — | _(no summary)_ |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { GenesisDoctorOptions };
```

---

## @marktiderman/genesis-cli/expo

**Barrel:** [`packages/genesis-cli/src/expo.ts`](../packages/genesis-cli/src/expo.ts)

### Other exports (22)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`APP_VARIANTS`](../packages/genesis-cli/src/expo.ts) | const | — | _(no summary)_ |
| [`applyExportCompliance`](../packages/genesis-cli/src/expo.ts) | function | — | _(no summary)_ |
| [`applyFingerprint`](../packages/genesis-cli/src/expo.ts) | function | — | _(no summary)_ |
| [`applyLinks`](../packages/genesis-cli/src/expo.ts) | function | — | _(no summary)_ |
| [`applyPrivacyApis`](../packages/genesis-cli/src/expo.ts) | function | — | Merge required-reason APIs into `ios.privacyManifests`, keeping every entry and reason the app declares. |
| [`applyPrivacyData`](../packages/genesis-cli/src/expo.ts) | function | — | Write the collected data types and `NSPrivacyTracking` into `ios.privacyManifests`. The app's own entries win: a type it already lists is left as it wrote it, and an `NSPrivacyTracking` it set stays. Tracking defaults to whether any entr... |
| [`applyVariant`](../packages/genesis-cli/src/expo.ts) | function | — | _(no summary)_ |
| [`collectedDataFor`](../packages/genesis-cli/src/expo.ts) | function | — | The data the app collects: `privacy.collects` when given, else the union of the blocks' (`privacy.blocks`, else those found in `dependencies`). A type two blocks collect appears once, with every purpose either gives, linked or tracking i... |
| [`DEFAULT_VARIANT_SUFFIXES`](../packages/genesis-cli/src/expo.ts) | const | — | _(no summary)_ |
| `GenesisConfigError` | value | — | _(no summary)_ |
| [`PRIVACY_APIS`](../packages/genesis-cli/src/expo.ts) | const | — | The required-reason APIs each package needs the app to declare, copied from the package's own PrivacyInfo.xcprivacy (read from the SDK 58 versions the starter installs). A package is matched when the app's package.json lists it in `depen... |
| [`PRIVACY_BLOCKS`](../packages/genesis-cli/src/expo.ts) | const | — | What each Genesis block collects, mirroring its `defineBlock` `privacy.collects` (the blocks themselves are React Native code, which a config plugin can't load). "Collected" is Apple's sense: sent off the phone, to the app's own backend ... |
| `PRIVACY_DATA_TYPES` | value | — | _(no summary)_ |
| `PRIVACY_PURPOSES` | value | — | _(no summary)_ |
| [`privacyApisFor`](../packages/genesis-cli/src/expo.ts) | function | — | The required-reason APIs for the packages listed in package.json `dependencies`. |
| [`privacyBlocksFor`](../packages/genesis-cli/src/expo.ts) | function | — | The Genesis blocks whose packages are all in `dependencies`. |
| `privacyDataType` | value | — | _(no summary)_ |
| `readGenesisConfig` | value | — | _(no summary)_ |
| [`resolveVariant`](../packages/genesis-cli/src/expo.ts) | function | — | The variant from options, else `APP_VARIANT`, else production. An unknown value throws. |
| `validateLinks` | value | — | _(no summary)_ |
| `validatePrivacy` | value | — | _(no summary)_ |
| [`withGenesis`](../packages/genesis-cli/src/expo.ts) | const | — | The Genesis config plugin. Use it in `plugins` or call it directly in app.config.ts. |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppVariant };
export type { GenesisDataUse };
export type { GenesisLinks };
export type { GenesisPrivacy };
export type { PrivacyApi };
export type { PrivacyBlock };
export type { VariantSuffix };
export type { WithGenesisOptions };
```

---

## @marktiderman/genesis-media

Images, files and uploads for Genesis apps: one image value (alt or decorative, size, focal point, phone crop, blur placeholder), responsive images through a host's image URL builder, byte sniffing, a server-side fetch guarded against request forgery, signed links to private media with streaming ZIP bundles, and resumable, checksummed uploads (owner-bound sessions, skip-if-identical on the whole object's SHA-256, storage targets for R2 and S3 with Object Lock, fan-out with read-back verification, browser and native clients). On fetch and WebCrypto for Node and Workers. An optional upgrade: forms takes its uploads through its own port. Part of the Genesis framework.

**Barrel:** [`packages/media/src/index.ts`](../packages/media/src/index.ts)

### Other exports (10)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`DEFAULT_WIDTHS`](../packages/media/src/image.ts) | const | — | The widths a `srcset` offers by default: phone to large desktop, high-density screens included. |
| [`focalPosition`](../packages/media/src/image.ts) | function | — | `object-position` for a focal point, clamped to 0 to 100. |
| [`isSafePlaceholder`](../packages/media/src/image.ts) | function | — | A placeholder that is safe to put in a style: a small base64 PNG, JPEG, WebP or GIF, nothing else. |
| [`MAX_PLACEHOLDER`](../packages/media/src/image.ts) | const | — | The longest placeholder accepted: a blur preview is a few hundred bytes. |
| [`passThroughImageUrl`](../packages/media/src/image.ts) | const | — | Serves every image at its own URL, with no `srcset`. The default. |
| [`PHONE_MEDIA`](../packages/media/src/image.ts) | const | — | The media query under which a `phone` crop replaces the image. |
| [`responsiveImage`](../packages/media/src/image.ts) | function | Beta | An image's attributes, sized for the layout it shows in. `value.src` and `value.phone.src` are used as given: check them (and put a site path under its base path) before calling. |
| [`sniff`](../packages/media/src/sniff.ts) | function | — | The file's type and size, or null when it isn't one of those types. |
| [`srcsetWidths`](../packages/media/src/image.ts) | function | — | The widths to offer for a file `width` wide: none past it, and the file's own width when a larger one was dropped. With `fixed` (the widths are fixed files, not resizes) the file's own width is never added: the builder would serve the ne... |
| [`supabaseImageUrl`](../packages/media/src/image.ts) | function | Beta | Supabase Storage image transformations for public buckets: an image at `<url>/storage/v1/object/public/<bucket>/<path>` is served from `<url>/storage/v1/render/image/public/<bucket>/<path>?width=&quality=`. Supabase picks WebP for browse... |

### Types (11)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FocalPoint };
export type { ImageFormat };
export type { ImageUrlBuilder };
export type { ImageUrlOptions };
export type { ImageValue };
export type { PhoneCrop };
export type { ResponsiveImage };
export type { ResponsiveImageOptions };
export type { ResponsiveSource };
export type { Sniffed };
export type { SupabaseImageUrlOptions };
```

---

## @marktiderman/genesis-media/server

**Barrel:** [`packages/media/src/server/index.ts`](../packages/media/src/server/index.ts)

### Other exports (10)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BlockedAddressError`](../packages/media/src/server/guard.ts) | class | — | _(no summary)_ |
| [`createGuardedTransport`](../packages/media/src/server/fetch.ts) | function | Beta | A transport on Node's http(s) with `guardedLookup` as the socket's DNS lookup and a fresh agent (no pooled sockets, no proxy from the environment), so the address connected to is the address checked. |
| [`fetchGuarded`](../packages/media/src/server/fetch.ts) | function | Beta | GET one URL through the guard, following at most `maxRedirects` checked redirects, and read its body under the size cap. Throws `FetchRefusedError` for anything the guard or the limits refuse; a network failure throws as it came. |
| [`FetchRefusedError`](../packages/media/src/server/fetch.ts) | class | — | A fetch the guard refused, or a response that wasn't the file (a redirect too many, a non-200, too big). Its message is the reason, worded to follow "not fetched because" ("it redirects from https to http (cdn.example)."). It is safe to ... |
| [`guardedLookup`](../packages/media/src/server/guard.ts) | function | — | A DNS lookup for sockets (`http.request({ lookup })`) that refuses a name if any address it resolves to isn't public. It runs when the connection is made, so the address checked is the address connected to. |
| [`guardedTransport`](../packages/media/src/server/fetch.ts) | const | — | The default guarded transport. |
| [`isPublicAddress`](../packages/media/src/server/guard.ts) | function | — | May a server connect to this address on an editor's say-so? True only for a public unicast IPv4 or IPv6 address; false for anything else, including text that isn't an address. |
| [`readCapped`](../packages/media/src/server/fetch.ts) | function | — | A body read to the end, refused once it passes `maxBytes`. |
| [`sniff`](../packages/media/src/sniff.ts) | function | — | The file's type and size, or null when it isn't one of those types. |
| [`urlProblems`](../packages/media/src/server/guard.ts) | function | — | Problems with a URL a server is asked to fetch, before any connection: empty when it may try. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FetchedResponse };
export type { GuardedFetchOptions };
export type { GuardedFetchResult };
export type { GuardedTransportOptions };
export type { Sniffed };
export type { Transport };
```

---

## @marktiderman/genesis-media/signed

**Barrel:** [`packages/media/src/signed/index.ts`](../packages/media/src/signed/index.ts)

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createBundleHandler`](../packages/media/src/signed/bundle.ts) | function | Experimental | A request handler that streams a bundle as a ZIP. The manifest id is the `id` argument, or else the path's last segment; the link must be signed for `mediaScope.bundle(id)` (403 otherwise, a malformed id included), and the manifest must ... |
| [`createMediaSigner`](../packages/media/src/signed/signer.ts) | function | Experimental | The signer for media links. **Server-side only** (Node 20+ and Workers): the secret both signs and verifies, so it must never reach a browser, which only ever receives finished signed URLs. It never decides who may see what: the app chec... |
| [`createMemoryStorage`](../packages/media/src/signed/storage.ts) | function | Experimental | A `MediaStorage` held in memory, for tests and examples. `reads` lists every key read with `get`, in order. |
| [`createSignedImageUrls`](../packages/media/src/signed/images.ts) | function | Experimental | Signs every declared derivative of `items` and returns the `ImageUrlBuilder` that serves them, for `responsiveImage`: |
| [`createSignedMediaHandler`](../packages/media/src/signed/handler.ts) | function | Experimental | A request handler that serves files behind signed links. It checks the link before it touches storage (so an unsigned request can't learn what exists), then streams the file: `GET` and `HEAD`, one byte range (206, or 416 when it can't be... |
| [`createZipManifest`](../packages/media/src/signed/bundle.ts) | function | Experimental | A new bundle manifest with a random id. Store it as JSON where `readManifest` finds it, then sign `mediaScope.bundle(manifest.id)`. Throws a TypeError for an unsafe or duplicate entry path, or more than `MAX_ZIP_ENTRIES` entries. |
| [`DEFAULT_MAX_SIGNED_ITEMS`](../packages/media/src/signed/images.ts) | const | — | The most items `createSignedImageUrls` signs in one call by default. |
| [`DEFAULT_MEDIA_TTL`](../packages/media/src/signed/signer.ts) | const | — | How long a link of each scope lasts when `sign` isn't told: two hours for every kind. |
| [`finishSizes`](../packages/media/src/signed/images.ts) | function | — | `finish × size` derivatives: `finishSizes("bw", [800, 2400])` is `bw/800` 800 wide and `bw/2400` 2400 wide. |
| [`ifRangeMatches`](../packages/media/src/signed/handler.ts) | function | — | Whether an `If-Range` value still names the stored file (RFC 9110 §13.1.5): a strong ETag equal to the stored one, or an HTTP date equal to its last-modified second. A weak ETag never matches. |
| [`MAX_MEDIA_TTL`](../packages/media/src/signed/signer.ts) | const | — | The longest link, in seconds: 30 days (a lab or video provider fetching over days). |
| [`MAX_ZIP_ENTRIES`](../packages/media/src/signed/bundle.ts) | const | — | The most files a bundle holds. `client-zip` 2.5.1 writes the entry count into 16 bits without a ZIP64 count, so more would make a broken ZIP. |
| [`mediaScope`](../packages/media/src/signed/scope.ts) | const | Experimental | The scopes a link can be signed for. |
| [`mediaSrc`](../packages/media/src/signed/images.ts) | function | — | The `src` an app stores for a private item: `<collection>/<id>`. Neither part may be empty, `.` or `..`, or hold a slash, a backslash, NUL or a percent-escape (`%2e`): the media handler refuses those paths, so their links would only ever... |
| [`MIN_MEDIA_TTL`](../packages/media/src/signed/signer.ts) | const | — | The shortest link, in seconds: one minute. |
| [`parseRange`](../packages/media/src/signed/handler.ts) | function | — | The byte range a `Range` header asks for. `undefined`: serve the whole file (no header, a header this doesn't read, or several ranges); `"unsatisfiable"`: answer 416. |
| [`parseSignedImagePath`](../packages/media/src/signed/images.ts) | function | — | The item and derivative a default derivative path names (`photos/a1/color/800`), or undefined. Use it in the handler's `route`, and check the derivative is one you declared: |

### Types (25)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BundleHandlerOptions };
export type { CreateZipManifestInput };
export type { ImageDerivative };
export type { MediaItemRef };
export type { MediaObject };
export type { MediaObjectInfo };
export type { MediaRange };
export type { MediaRoute };
export type { MediaRouteContext };
export type { MediaScope };
export type { MediaScopeKind };
export type { MediaSecret };
export type { MediaSignOptions };
export type { MediaSigner };
export type { MediaSignerOptions };
export type { MediaStorage };
export type { MediaToken };
export type { MediaTokenInput };
export type { MediaTtl };
export type { MemoryObject };
export type { SignedImageUrls };
export type { SignedImageUrlsOptions };
export type { SignedMediaHandlerOptions };
export type { ZipManifest };
export type { ZipManifestEntry };
```

---

## @marktiderman/genesis-media/uploads

**Barrel:** [`packages/media/src/uploads/index.ts`](../packages/media/src/uploads/index.ts)

### Other exports (12)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`choosePartSize`](../packages/media/src/uploads/protocol.ts) | function | — | The part size for a file: at least `min`, large enough to keep the count at or under `MAX_PARTS`, rounded up to a whole MiB once it passes `min`, and never more than `max` (then the file is too big: undefined). |
| [`createNobleSha256`](../packages/media/src/uploads/hash.ts) | const | — | The default: `@noble/hashes`. |
| [`createSha256`](../packages/media/src/uploads/hash.ts) | const | — | The fastest incremental SHA-256 on this runtime: Node's, else `@noble/hashes`. |
| [`formatContentDigest`](../packages/media/src/uploads/protocol.ts) | function | — | A `content-digest` value for a SHA-256 (RFC 9530): `sha-256=:<base64>:`. |
| [`MAX_PARTS`](../packages/media/src/uploads/protocol.ts) | const | — | S3's limit, and every part protocol's: at most 10,000 parts. |
| [`parseContentDigest`](../packages/media/src/uploads/protocol.ts) | function | — | The SHA-256 a `content-digest` header carries, as base64, or undefined (no sha-256 member, or malformed). |
| [`partPlan`](../packages/media/src/uploads/protocol.ts) | function | — | How many parts a file of `size` has at `partSize`, and each one's size. |
| [`SHA256_HEX`](../packages/media/src/uploads/protocol.ts) | const | — | _(no summary)_ |
| [`sha256Bytes`](../packages/media/src/uploads/hash.ts) | function | — | A digest of bytes already in memory (one part): WebCrypto where there is one, else `@noble/hashes` (Hermes has no `crypto.subtle`). |
| [`sha256Stream`](../packages/media/src/uploads/hash.ts) | function | — | Reads a stream to its end and returns its SHA-256 (hex) and its length: a Worker's `DigestStream` when there is one, else `createHash` (default the fastest here). Memory stays at one chunk. |
| [`toBase64`](../packages/media/src/uploads/protocol.ts) | function | — | Bytes as standard base64. Written out rather than `btoa`, which not every Hermes build has. |
| [`toHex`](../packages/media/src/uploads/protocol.ts) | function | — | Bytes as lowercase hex. |

### Types (13)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CreateSha256 };
export type { CreateUploadBody };
export type { FailedTarget };
export type { FinalizeBody };
export type { Sha256 };
export type { UploadCopy };
export type { UploadError };
export type { UploadErrorCode };
export type { UploadOwner };
export type { UploadPart };
export type { UploadSkipped };
export type { UploadState };
export type { UploadStatus };
```

---

## @marktiderman/genesis-media/uploads/server

**Barrel:** [`packages/media/src/uploads/server/index.ts`](../packages/media/src/uploads/server/index.ts)

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createMemorySessionStore`](../packages/media/src/uploads/server/store.ts) | function | Experimental | Sessions in memory, for tests and a single process. @stability Experimental |
| [`createSupabaseSessionStore`](../packages/media/src/uploads/server/supabase-store.ts) | function | Experimental | _(no summary)_ |
| [`createUploadHandler`](../packages/media/src/uploads/server/handler.ts) | function | Experimental | The upload route: `(request) => Promise<Response>`. Every operation is bound to the owner that created the upload and asked of `authorize` again; another owner's upload, an unknown id and a lapsed session are the same 404. |
| [`createUploadVerifyJob`](../packages/media/src/uploads/server/verify.ts) | function | Experimental | The `media.verify` job's handler, for genesis-supabase's `runJobs({ handlers: { [UPLOAD_VERIFY_JOB]: createUploadVerifyJob({ store, targets }) } })`. When another run holds the lease it asks to run again once the lease could have lapsed,... |
| [`discardUnverified`](../packages/media/src/uploads/server/verify.ts) | function | — | Removes what an abandoned session left in its targets: its open multipart upload (or one marked verifying and never assembled), copies under way, and the objects it assembled that never verified (verified copies are media, kept under the... |
| [`isSafeKey`](../packages/media/src/uploads/server/handler.ts) | function | — | A storage key every store keeps as it is: no empty, `.` or `..` segment, no control character. |
| [`isStuckVerifying`](../packages/media/src/uploads/server/verify.ts) | function | — | Whether a `verifying` session is stuck: no live lease, and verifying for longer than `staleVerifyingSeconds`. |
| [`safeName`](../packages/media/src/uploads/server/handler.ts) | function | — | A file name made safe for a storage key: one segment, no path, no control characters. For `keyFor`. |
| [`SessionConflictError`](../packages/media/src/uploads/server/store.ts) | class | — | Another session already holds this key, or this owner's open session for this identity. |
| [`SessionNotOpenError`](../packages/media/src/uploads/server/store.ts) | class | — | The session isn't open any more (it was finalized or aborted meanwhile). |
| [`SessionStoreError`](../packages/media/src/uploads/server/supabase-store.ts) | class | — | A store failure (not a refusal): the handler answers 503 and its `onError` sees it. |
| [`sweepExpiredUploads`](../packages/media/src/uploads/server/verify.ts) | function | Experimental | Clears sessions nobody will finish: open ones that lapsed (no part before `expiresAt`), and verifying ones that are stuck (no live lease, verifying for longer than `staleVerifyingSeconds`). Each is removed only while it is still in the s... |
| [`UPLOAD_SWEEP_JOB`](../packages/media/src/uploads/server/verify.ts) | const | — | The job kind that aborts lapsed sessions in their targets. |
| [`UPLOAD_VERIFY_JOB`](../packages/media/src/uploads/server/verify.ts) | const | — | The job kind that reads an upload's copies back. Payload `{ uploadId }`. |
| [`verifyUpload`](../packages/media/src/uploads/server/verify.ts) | function | — | Assembles (when finalize hasn't yet), copies, reads back and locks an upload in `verifying`, and records what it found: `done`, `partial` (some targets failed; finalize again retries them) or `identity_mismatch` (the assembled object isn... |

### Types (13)

Type-only exports not consumed as a component's `Props`.

```ts
export type { PartReservation };
export type { ReadableObject };
export type { SessionStoreClient };
export type { StoredPart };
export type { UploadAuthorizeContext };
export type { UploadDecision };
export type { UploadHandlerOptions };
export type { UploadOperation };
export type { UploadSession };
export type { UploadSessionPatch };
export type { UploadSessionStore };
export type { UploadVerifyOptions };
export type { VerifyRun };
```

---

## @marktiderman/genesis-media/uploads/targets

**Barrel:** [`packages/media/src/uploads/targets/index.ts`](../packages/media/src/uploads/targets/index.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`copyBetweenTargets`](../packages/media/src/uploads/targets/target.ts) | function | — | Copies `key` (that version of it) from one target to another, a part at a time (one part in memory), as the multipart upload `uploadId` in `to` (started by the caller, who records it so a dead run can be aborted). How fan-out writes ever... |
| [`createMemoryTarget`](../packages/media/src/uploads/targets/memory.ts) | function | Experimental | _(no summary)_ |
| [`createR2Target`](../packages/media/src/uploads/targets/r2.ts) | function | Experimental | _(no summary)_ |
| [`createS3Target`](../packages/media/src/uploads/targets/s3.ts) | function | Experimental | _(no summary)_ |
| [`S3Error`](../packages/media/src/uploads/targets/s3.ts) | class | — | A store's refusal: its HTTP status and S3 error code. |
| [`signS3Request`](../packages/media/src/uploads/targets/s3.ts) | function | — | The headers for one SigV4-signed request: the given ones plus `host`, `x-amz-date`, `x-amz-content-sha256` and `authorization`. The URL's path must already be encoded (each segment with RFC 3986 rules). |

### Types (9)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AssembledObject };
export type { MemoryTarget };
export type { MemoryTargetOptions };
export type { ObjectLock };
export type { PartReceipt };
export type { R2BucketLike };
export type { S3RequestToSign };
export type { S3TargetOptions };
export type { UploadTarget };
```

---

## @marktiderman/genesis-media/uploads/client

**Barrel:** [`packages/media/src/uploads/client/index.ts`](../packages/media/src/uploads/client/index.ts)

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`base64Utf8`](../packages/media/src/uploads/client/supabase-tus.ts) | function | — | Base64 of a UTF-8 string, for TUS's Upload-Metadata (no `btoa`, which isn't on every Hermes build). |
| [`createIndexedDbResumeStore`](../packages/media/src/uploads/client/config.ts) | function | — | In the browser's IndexedDB: survives a reload, so closing the tab and coming back resumes the upload (the server's Resume says which parts it has). Entries lapse with their session; `clear()` forgets them all, for sign-out. Falls back to... |
| [`createMemoryResumeStore`](../packages/media/src/uploads/client/config.ts) | function | — | In memory: survives a retry, not a reload. The default. |
| [`createSpeedLimiter`](../packages/media/src/uploads/client/config.ts) | function | — | A speed cap shared by every part of every upload on one uploader, paced by bytes: each send takes its bytes from a bucket filling at `rate()` bytes a second (0 is no cap), and waits off any debt, so a part bigger than the bucket still av... |
| [`createSupabaseTusTransport`](../packages/media/src/uploads/client/supabase-tus.ts) | function | Experimental | _(no summary)_ |
| [`createUploader`](../packages/media/src/uploads/client/uploader.ts) | function | Experimental | _(no summary)_ |
| [`createWorkerFileHasher`](../packages/media/src/uploads/client/worker-hasher.ts) | function | — | A `hashFile` for `createUploader` that hashes blobs in a Web Worker (one worker for every file, started on first use by `createWorker`). After the worker fails or goes silent once, its jobs and every later one are hashed in this thread. ... |
| [`fromBlob`](../packages/media/src/uploads/client/sources.ts) | function | — | A browser `File` or `Blob`. |
| [`fromBytes`](../packages/media/src/uploads/client/sources.ts) | function | — | Bytes already in memory. |
| [`fromFileHandle`](../packages/media/src/uploads/client/sources.ts) | function | — | An open file. A read shorter than asked (anywhere but the end) means the file changed or can't be read: it throws rather than send a hole. |
| [`hashBlob`](../packages/media/src/uploads/client/hash-core.ts) | function | — | Hashes a blob a slice at a time, telling `post` how far it got. |
| [`isBrowserPage`](../packages/media/src/uploads/client/worker-hasher.ts) | const | — | Whether this is a browser page (a document and module workers): where hashing goes to a worker by default. |
| [`TUS_CHUNK_BYTES`](../packages/media/src/uploads/client/supabase-tus.ts) | const | — | Supabase requires 6 MiB chunks for TUS (every chunk but the last). |
| [`TusError`](../packages/media/src/uploads/client/supabase-tus.ts) | class | — | A TUS failure: `failure` says whether it is worth trying again. |
| [`UploadClientError`](../packages/media/src/uploads/client/uploader.ts) | class | — | A refusal or failure the client won't retry on its own. |

### Types (21)

Type-only exports not consumed as a component's `Props`.

```ts
export type { HashFile };
export type { HashReply };
export type { HashRequest };
export type { IdbFactoryLike };
export type { ReadableFileHandle };
export type { RememberedUpload };
export type { ResumeStore };
export type { SupabaseTusOptions };
export type { TusFailure };
export type { TusRecord };
export type { TusSource };
export type { UploadHandle };
export type { UploadOptions };
export type { UploadPriority };
export type { UploadProgress };
export type { UploadResult };
export type { UploadSource };
export type { Uploader };
export type { UploaderOptions };
export type { WorkerFileHasherOptions };
export type { WorkerLike };
```

---

## @marktiderman/genesis-media/forms

**Barrel:** [`packages/media/src/forms/index.ts`](../packages/media/src/forms/index.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createFormsUploadAdapter`](../packages/media/src/forms/index.ts) | function | Experimental | _(no summary)_ |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FormsFileRef };
export type { FormsUploadAdapter };
export type { FormsUploadAdapterOptions };
export type { FormsUploadField };
```

---

## @marktiderman/genesis-native

The native app shell: `GenesisNativeApp` (boot behind the splash, fatal screen, persisted query client, auth gate, held deep links; each part a slot and exported on its own). See packages/native/README.md.

**Barrel:** [`packages/native/src/index.ts`](../packages/native/src/index.ts)

### Components (6)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AuthGate`](../packages/native/src/auth.tsx) | `AuthGateProps` | — | Render one tree for a signed-in user and another for everyone else. |
| [`BootScreen`](../packages/native/src/app.tsx) | `BootScreenProps` | — | The default boot slot: a plain loading view (the splash covers it at launch). |
| [`FatalScreen`](../packages/native/src/errors.tsx) | `FatalScreenProps` | — | The default fatal screen: what went wrong and "Try again". |
| [`GenesisErrorBoundary`](../packages/native/src/errors.tsx) | `GenesisErrorBoundaryProps` | — | An error boundary whose fallback gets `{ error, retry }`. |
| [`GenesisNativeApp`](../packages/native/src/app.tsx) | `GenesisNativeAppProps` | Beta | The root of an Expo app: theme, keyboard, data, boot behind the splash, errors, session and held links. |
| [`ScreenErrorBoundary`](../packages/native/src/screen-boundary.tsx) | `ScreenErrorBoundaryProps` | Beta | A boundary around part of a screen tree, for apps without Expo Router's per-route boundaries: non-fatal, reported, with "Try again". |

### Other exports (33)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BEFORE_RELOAD_TIMEOUT_MS`](../packages/native/src/reload.ts) | const | — | The default deadline for every hook together. |
| [`BootProvider`](../packages/native/src/boot.tsx) | function | — | Makes a boot readable with `useBoot()`. |
| [`BootTimeoutError`](../packages/native/src/boot.tsx) | class | — | Thrown when a step takes longer than its timeout. |
| [`classifyError`](../packages/core/src/errors.ts) | function | — | What kind of error this is, a sentence that is safe to show, and whether it is worth reporting. Understands the provider's `DataWriteError` and `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's auth and fetch error... |
| [`connectQueryLifecycle`](../packages/native/src/query.ts) | function | — | Tell TanStack Query when the app comes to the front (refetch stale queries) and when the network comes and goes. Returns the cleanup. |
| [`createBoot`](../packages/native/src/boot.tsx) | function | — | The boot controller: runs `steps` once each, in order, with a timeout per step. |
| [`createHydrationGate`](../packages/native/src/hydration-gate.ts) | function | — | A gate that holds writes until a persisted store has hydrated. |
| [`createLinkHold`](../packages/native/src/held-link.ts) | function | — | A place to hold one deep link until sign-in completes; lives outside React. |
| [`createNativeQueryClient`](../packages/native/src/query.ts) | function | — | A QueryClient for a phone. `networkMode: "offlineFirst"` runs a query or mutation once whatever the network says, then pauses its retries while the device is offline (`onlineManager`, which `connectQueryLifecycle` feeds from NetInfo), co... |
| [`createScreenErrorBoundary`](../packages/native/src/screen-boundary.tsx) | function | Beta | An Expo Router `ErrorBoundary`: reports each error once (non-fatal, source `screen`) and shows `fallback`. Build it once, at module scope. |
| [`createSessionStore`](../packages/native/src/auth.tsx) | function | — | The Supabase session as a store: `load` reads it once, `start` follows auth events. |
| [`DAY_MS`](../packages/native/src/query.ts) | const | — | One day in milliseconds: the default max age of the saved query cache. |
| [`defaultErrorUtils`](../packages/native/src/errors.tsx) | function | — | `globalThis.ErrorUtils` in a React Native runtime, undefined elsewhere. |
| [`defaultRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Hermes's rejection tracker, when the app runs on Hermes. React Native sends unhandled rejections to `ExceptionsManager` (LogBox in development), never to `ErrorUtils`' global handler, so without this they never reach `onError`. |
| [`errorDetails`](../packages/native/src/errors.tsx) | function | — | What a fatal or screen error says under its title: the safe sentence for its kind (offline, signed out…), or nothing for a plain bug. The error's own text can hold an email, an id or a store's internals, so it is shown only in developmen... |
| [`errorMessages`](../packages/core/src/errors.ts) | const | — | The English catalogue. Plain words, never the store's text. |
| [`installGlobalErrorHandler`](../packages/native/src/errors.tsx) | function | — | Route global errors to `onError`. A fatal one goes to `onFatal` instead of React Native's default handler, which would close the app; a non-fatal one still reaches the previous handler (LogBox in development). Returns a function that put... |
| [`installRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Report unhandled promise rejections to `onError`: non-fatal, and unhandled (`handled: false`), so release health counts them. This replaces React Native's own tracker, so each rejection is also written with `console.warn`, which LogBox s... |
| [`mergeBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The merge `useBlockSettings` does, without hooks (subtitles already read). @stability Beta |
| [`normalizeLink`](../packages/native/src/links.ts) | function | — | The app path for `url`, `"/"` when it is unknown, or `null` when it is ignored. |
| [`onBeforeReload`](../packages/native/src/reload.ts) | function | Beta | Run `hook` before every reload the updates block starts. Returns the unregister. @stability Beta |
| [`PlainFatalScreen`](../packages/native/src/errors.tsx) | function | — | The last-resort fatal screen: React Native primitives only, no theme, no context, nothing that can itself fail. Shown when the providers could not start, or when the `fatal` slot threw. |
| [`queryKeyName`](../packages/native/src/query.ts) | function | — | The first segment of a query or mutation key, when it is a name; never the ids after it. |
| [`reportError`](../packages/core/src/errors.ts) | function | — | Report an error a package caught and handled. Never throws: a failing reporter must not take the caller (an event handler, a render) down. `context` may be just the source. |
| [`reportQueryErrors`](../packages/native/src/query.ts) | function | Beta | Hand every query and mutation that failed for good (after its retries) to `report`, as a non-fatal `query` or `mutation` error tagged with the key's first segment (`query.key: "tasks"`), never the ids after it. |
| [`runBeforeReload`](../packages/native/src/reload.ts) | function | Beta | Run every registered hook, in parallel, and resolve when they have all settled or `timeoutMs` has passed, whichever is first. Never rejects. |
| [`ScreenErrorScreen`](../packages/native/src/screen-boundary.tsx) | function | Beta | The default screen fallback: the screen hit a problem, and "Try again". @stability Beta |
| [`SessionProvider`](../packages/native/src/auth.tsx) | function | — | Makes a session store readable with `useSession()`. |
| [`useBlocks`](../packages/native/src/blocks.tsx) | function | Beta | The resolved blocks: their ids, nav entries, Settings rows, routes and the rest, each tagged with its FeatureId. Throws outside `GenesisNativeApp`. |
| [`useBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The app's Settings sections with every block's rows added: each row goes at the end of the section its `section` names (by `order`, then block order), and a section no one has yet is added after the rest. |
| [`useBoot`](../packages/native/src/boot.tsx) | function | — | The boot's status, and `retry` after a failure. Inside `GenesisNativeApp` or a `BootProvider`. |
| [`useHeldLink`](../packages/native/src/held-link.ts) | function | — | Follow the held link after a sign-in, drop it otherwise; returns the link still held. |
| [`useSession`](../packages/native/src/auth.tsx) | function | — | The session and whether it is known yet. Inside `GenesisNativeApp` or a `SessionProvider`. |

### Types (47)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppStateLike };
export type { AsyncStorageLike };
export type { AuthClientLike };
export type { BeforeReloadHook };
export type { BlockSettingsSection };
export type { BootController };
export type { BootOptions };
export type { BootState };
export type { BootStatus };
export type { BootStep };
export type { BootStepContext };
export type { ClassifiedError };
export type { ClassifyErrorOptions };
export type { EnableRejectionTracker };
export type { ErrorKind };
export type { ErrorMessages };
export type { ErrorReport };
export type { ErrorUtilsLike };
export type { GlobalErrorHandlerOptions };
export type { HeldLinkAuth };
export type { HydrationGate };
export type { HydrationGateOptions };
export type { LinkHold };
export type { LinkOptions };
export type { LinkTarget };
export type { NativeAppSlots };
export type { NativeBlock };
export type { NativeBlockRootProps };
export type { NativeQueryClientOptions };
export type { NetInfoLike };
export type { OnError };
export type { QueryErrorReporter };
export type { QueryLifecycleOptions };
export type { QueryPersistence };
export type { ReportQueryErrorsOptions };
export type { ScreenErrorBoundaryOptions };
export type { ScreenErrorProps };
export type { SessionState };
export type { SessionStatus };
export type { SessionStore };
export type { SessionStoreOptions };
export type { SettingsRowLike };
export type { SignedOutProps };
export type { SplashModule };
export type { UseBlockSettingsOptions };
export type { UseBootReturn };
export type { UseHeldLinkOptions };
```

---

## @marktiderman/genesis-native/persist

**Barrel:** [`packages/native/src/persist.ts`](../packages/native/src/persist.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createQueryPersistence`](../packages/native/src/persist.ts) | function | — | Save the allowlisted queries to async storage and restore them, with a max age, an app-version buster and a user scope. |
| [`persistQueries`](../packages/native/src/persist.ts) | function | — | `createQueryPersistence` for `GenesisNativeApp`'s `persist` prop, which supplies the client. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { PersistQueriesOptions };
export type { QueryPersistence };
export type { QueryPersistenceOptions };
```

---

## @marktiderman/genesis-native/updates

**Barrel:** [`packages/native/src/updates/index.ts`](../packages/native/src/updates/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`UpdateBanner`](../packages/native/src/updates/screens.tsx) | `UpdateBannerProps` | — | Non-blocking: floats over the top of the screens while an update is downloaded. Liquid Glass on iOS 26 when the app passed expo-glass-effect (`modules.glass`); the solid secondary surface otherwise. |
| [`UpdatesRoot`](../packages/native/src/updates/block.tsx) | `UpdatesRootProps` | — | The block's parts around your screens. |

### Other exports (33)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`CLOCK_SKEW_MS`](../packages/native/src/updates/policy.ts) | const | — | How far in the future a cache's time may be (clocks drift) before it isn't trusted. |
| [`compareVersions`](../packages/native/src/updates/version.ts) | function | — | -1, 0 or 1 as `a` is older than, the same as or newer than `b`; `null` when either doesn't parse. |
| [`createChannelSwitcher`](../packages/native/src/updates/channels.ts) | function | — | _(no summary)_ |
| [`createPolicyStore`](../packages/native/src/updates/policy.ts) | function | — | _(no summary)_ |
| [`createReloadGuard`](../packages/native/src/updates/checker.ts) | function | — | _(no summary)_ |
| [`createUpdateChecker`](../packages/native/src/updates/checker.ts) | function | — | _(no summary)_ |
| [`createUpdates`](../packages/native/src/updates/block.tsx) | function | — | Build the block once, at module scope, next to your Supabase client. |
| [`createWhatsNewStore`](../packages/native/src/updates/whats-new.ts) | function | — | _(no summary)_ |
| [`evaluatePolicy`](../packages/native/src/updates/policy.ts) | function | — | Force upgrade first (the store is the way out), then maintenance, else ok. Fails open. |
| [`ForceUpgradeScreen`](../packages/native/src/updates/screens.tsx) | function | — | Blocking: this version is below the minimum. "Update" opens the store. |
| [`isBelowMinimum`](../packages/native/src/updates/version.ts) | function | — | True only when both parse and `installed` is older than `minimum`. Fails open. |
| [`MaintenanceScreen`](../packages/native/src/updates/screens.tsx) | function | — | Blocking: the policy says maintenance is on. "Try again" asks again. |
| [`notesSince`](../packages/native/src/updates/whats-new.ts) | function | — | The notes after `seen`, up to `version`, newest first. |
| [`parseVersion`](../packages/native/src/updates/version.ts) | function | — | `"1.10"` → `[1, 10, 0, 0]`; `null` when it isn't a plain dotted version. |
| [`sanitizePolicy`](../packages/native/src/updates/policy.ts) | function | — | Keeps only well-formed fields; throws when `raw` isn't an object at all (so the cache answers instead). |
| [`staticPolicySource`](../packages/native/src/updates/policy.ts) | function | — | A policy written in the app (or a test). |
| [`supabasePolicySource`](../packages/native/src/updates/policy.ts) | function | — | Reads one row of `public.app_release_policy` (readable by anon and authenticated, written only with the service role). No row is no policy. |
| [`UPDATES_BLOCK_ID`](../packages/native/src/updates/block.tsx) | const | — | The FeatureId of the updates block. |
| [`UpdatesProvider`](../packages/native/src/updates/block.tsx) | function | — | Provides the block to the hooks, without rendering any of its parts (rung 4). |
| [`useBlockReload`](../packages/native/src/updates/block.tsx) | function | — | Hold reloads off while `active` (a form with unsaved changes): `useBlockReload(form.formState.isDirty)`. Does nothing without an updates block, so a screen can call it whether or not the block is on. |
| [`useCanReload`](../packages/native/src/updates/block.tsx) | function | — | True when a reload would be allowed now. |
| [`useForceUpgrade`](../packages/native/src/updates/block.tsx) | function | — | The force-upgrade screen's props, or `null` when this version is supported. |
| [`useMaintenance`](../packages/native/src/updates/block.tsx) | function | — | The maintenance screen's props, or `null` when maintenance is off (or not known live). |
| [`useUpdateBanner`](../packages/native/src/updates/block.tsx) | function | — | The banner's props, or `null` when there is nothing to show. |
| [`useUpdateCheck`](../packages/native/src/updates/block.tsx) | function | — | _(no summary)_ |
| [`useUpdatePolicy`](../packages/native/src/updates/block.tsx) | function | — | _(no summary)_ |
| [`useUpdates`](../packages/native/src/updates/block.tsx) | function | — | The block from `UpdatesProvider` / `UpdatesRoot` / `GenesisNativeApp`. Throws outside one. |
| [`useUpdateVerdict`](../packages/native/src/updates/block.tsx) | function | — | What the policy says now: `ok`, `forceUpgrade` or `maintenance`. |
| [`useVersionSignature`](../packages/native/src/updates/block.tsx) | function | — | The version signature, with the channel picked on this device once it has been read. |
| [`useWhatsNew`](../packages/native/src/updates/block.tsx) | function | — | The notes to show now, or `null`. |
| [`versionSignature`](../packages/native/src/updates/signature.ts) | function | — | _(no summary)_ |
| [`WEEK_MS`](../packages/native/src/updates/policy.ts) | const | — | _(no summary)_ |
| [`WhatsNewSheet`](../packages/native/src/updates/screens.tsx) | function | — | The release notes for this version, once, in a sheet. |

### Types (37)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ApplicationLike };
export type { ChannelSwitchResult };
export type { ChannelSwitcher };
export type { ChannelSwitcherOptions };
export type { EvaluatePolicyOptions };
export type { ForceUpgradeProps };
export type { MaintenanceProps };
export type { PolicyClientLike };
export type { PolicyOrigin };
export type { PolicyState };
export type { PolicyStore };
export type { PolicyStoreOptions };
export type { ReleaseNote };
export type { ReloadGuard };
export type { SupabasePolicySourceOptions };
export type { UpdateCheckState };
export type { UpdateCheckStatus };
export type { UpdateChecker };
export type { UpdateCheckerOptions };
export type { UpdatePlatform };
export type { UpdatePolicy };
export type { UpdatePolicySource };
export type { UpdateVerdict };
export type { UpdatesAppStateLike };
export type { UpdatesBlock };
export type { UpdatesErrorSource };
export type { UpdatesModuleLike };
export type { UpdatesOnError };
export type { UpdatesOptions };
export type { UpdatesSlots };
export type { UpdatesStorageLike };
export type { VersionSignature };
export type { VersionSignatureInput };
export type { WhatsNewOptions };
export type { WhatsNewProps };
export type { WhatsNewState };
export type { WhatsNewStore };
```

---

## @marktiderman/genesis-native/push

**Barrel:** [`packages/native/src/push/index.ts`](../packages/native/src/push/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`NotificationSettings`](../packages/native/src/push/settings.tsx) | `NotificationSettingsProps` | — | The notification preferences screen. Needs the push block (in GenesisNativeApp's `blocks`, or a `PushProvider`). |
| [`PushRoot`](../packages/native/src/push/block.tsx) | `PushRootProps` | — | The block's parts around your screens. Must be inside GenesisNativeApp's session (or a `SessionProvider`). |

### Other exports (43)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`canPush`](../packages/native/src/push/permission.ts) | const | — | _(no summary)_ |
| [`categoryRows`](../packages/native/src/push/settings.tsx) | function | — | The categories part's default rows. |
| [`clockOf`](../packages/native/src/push/quiet-hours.ts) | function | — | `"HH:MM"` for a `Date`'s local time (what a time picker hands back). |
| [`createPermissionStore`](../packages/native/src/push/permission.ts) | function | — | _(no summary)_ |
| [`createPreferencesStore`](../packages/native/src/push/preferences.ts) | function | — | _(no summary)_ |
| [`createPromptStore`](../packages/native/src/push/permission.ts) | function | — | _(no summary)_ |
| [`createPush`](../packages/native/src/push/block.tsx) | function | — | Build the block once, at module scope, next to your Supabase client. |
| [`createRegistration`](../packages/native/src/push/registration.ts) | function | — | _(no summary)_ |
| [`dateAt`](../packages/native/src/push/quiet-hours.ts) | function | — | Today at `"HH:MM"` local, for a time picker's value. |
| [`DEFAULT_PREFERENCES`](../packages/native/src/push/backend.ts) | const | — | _(no summary)_ |
| [`deviceTimeZone`](../packages/native/src/push/quiet-hours.ts) | function | — | This phone's IANA time zone, or null when the JavaScript engine can't say. |
| [`formatClock`](../packages/native/src/push/quiet-hours.ts) | function | — | `"HH:MM"` for minutes since midnight (wrapping a day). |
| [`isQuietAt`](../packages/native/src/push/quiet-hours.ts) | function | — | Are quiet hours on at `at`? The same rule as the server: the start is inclusive, the end exclusive, a start after the end runs past midnight, a start equal to the end is no quiet hours, and an unknown zone is never quiet. |
| [`isRichPushUrl`](../packages/native/src/push/payload.ts) | function | — | The extension downloads only https URLs (no credentials, at most 1024 characters: APNs takes 4 KB in all); this is the same check. The plugin's `imageHosts`, when set, narrows it on the phone. |
| [`minutesIn`](../packages/native/src/push/quiet-hours.ts) | function | — | Minutes since midnight at `at` in `timeZone`, or null for a zone the engine doesn't know. |
| [`notificationAction`](../packages/native/src/push/routing.ts) | function | — | The action in a response, or null for a plain tap (`defaultActionId`, expo-notifications' `DEFAULT_ACTION_IDENTIFIER`) or a dismissal. |
| [`notificationData`](../packages/native/src/push/routing.ts) | function | — | The data a notification carries (`content.data`), or `{}`. |
| [`notificationSettingsCopy`](../packages/native/src/push/settings.tsx) | const | — | _(no summary)_ |
| [`parseClock`](../packages/native/src/push/quiet-hours.ts) | function | — | Minutes since midnight for `"HH:MM"`, or null. |
| [`pathForResponse`](../packages/native/src/push/routing.ts) | function | — | The app path a tap should open, or null. |
| [`permissionRows`](../packages/native/src/push/settings.tsx) | function | — | The permission part's default rows. |
| [`privacyRows`](../packages/native/src/push/settings.tsx) | function | — | The privacy part's default rows. |
| [`PushBackendError`](../packages/native/src/push/backend.ts) | class | — | A database refusal, with its SQLSTATE; the message is the database's own, never a token. |
| [`PushPromptSheet`](../packages/native/src/push/screens.tsx) | function | — | _(no summary)_ |
| [`PushProvider`](../packages/native/src/push/block.tsx) | function | — | Provides the block to the hooks, without rendering any of its parts (rung 4). |
| [`quietHoursRows`](../packages/native/src/push/settings.tsx) | function | — | The quiet-hours part's default rows. |
| [`RICH_PUSH_IMAGE_FIELDS`](../packages/native/src/push/payload.ts) | const | — | _(no summary)_ |
| [`richPushMessage`](../packages/native/src/push/payload.ts) | function | — | The message with `mutableContent: true` and the image fields in its `data`. A field given in `rich` replaces the one in `data`; one that isn't an https URL is left out (the extension would ignore it). `data`'s other fields are kept as th... |
| [`statusOf`](../packages/native/src/push/permission.ts) | function | — | Expo's answer as one status. Android "denied but can ask again" is still askable. |
| [`supabasePushBackend`](../packages/native/src/push/backend.ts) | function | — | Migration 0005's functions and tables, under the signed-in person's row level security. |
| [`useBadge`](../packages/native/src/push/block.tsx) | function | — | The badge: `set(unread)`, `clear()`. |
| [`useNotificationCategories`](../packages/native/src/push/settings.tsx) | function | — | The categories part (rung 4). |
| [`useNotificationPreferences`](../packages/native/src/push/block.tsx) | function | — | _(no summary)_ |
| [`useOptionalPush`](../packages/native/src/push/block.tsx) | function | — | The block, or null when push is off: for a screen that works either way. |
| [`usePrivacyPreviews`](../packages/native/src/push/settings.tsx) | function | — | The privacy part (rung 4). |
| [`usePush`](../packages/native/src/push/block.tsx) | function | — | The block from `PushProvider` / `PushRoot` / `GenesisNativeApp`. Throws outside one. |
| [`usePushPermission`](../packages/native/src/push/settings.tsx) | function | — | The permission part (rung 4). |
| [`usePushPermissionState`](../packages/native/src/push/block.tsx) | function | — | _(no summary)_ |
| [`usePushPrompt`](../packages/native/src/push/block.tsx) | function | — | The soft prompt: `offer("to hear when someone replies")` at the right moment. |
| [`usePushRegistration`](../packages/native/src/push/block.tsx) | function | — | _(no summary)_ |
| [`useQuietHours`](../packages/native/src/push/settings.tsx) | function | — | The quiet-hours part (rung 4). |
| [`useSuppressNotifications`](../packages/native/src/push/block.tsx) | function | — | Hide notifications that match while this screen is open (`data` is the notification's `data`): a chat screen hides pushes for its own thread. Does nothing without a push block. |
| [`validPreferences`](../packages/native/src/push/preferences.ts) | function | — | Checks a change before it is shown or saved, so the server never has to refuse it. |

### Types (47)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CategoriesPartProps };
export type { CategoryRow };
export type { ChannelImportance };
export type { ChannelInputLike };
export type { NotificationAction };
export type { NotificationActionLike };
export type { NotificationBehaviorLike };
export type { NotificationCategory };
export type { NotificationLike };
export type { NotificationPreferences };
export type { NotificationResponseLike };
export type { NotificationSettingsCopy };
export type { NotificationSettingsSlots };
export type { NotificationsModuleLike };
export type { PermissionPartProps };
export type { PermissionRequestLike };
export type { PermissionState };
export type { PermissionStatusLike };
export type { PermissionStore };
export type { PreferencesState };
export type { PreferencesStatus };
export type { PreferencesStore };
export type { PrivacyPartProps };
export type { PromptOptions };
export type { PromptState };
export type { PromptStore };
export type { PushAppStateLike };
export type { PushBackend };
export type { PushBlock };
export type { PushChannel };
export type { PushDeviceCategory };
export type { PushErrorSource };
export type { PushOnError };
export type { PushOptions };
export type { PushPermissionStatus };
export type { PushPromptProps };
export type { PushSlots };
export type { PushStorageLike };
export type { PushSupabaseLike };
export type { QuietHours };
export type { QuietHoursPartProps };
export type { Registration };
export type { RegistrationState };
export type { RegistrationStatus };
export type { RichPushData };
export type { RichPushMessageLike };
export type { SubscriptionLike };
```

---

## @marktiderman/genesis-native/observability

**Barrel:** [`packages/native/src/observability/index.ts`](../packages/native/src/observability/index.ts)

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`checkEvent`](../packages/native/src/observability/events.ts) | function | — | Check one call against the schema: the props to send, or why nothing is sent. |
| [`consoleSink`](../packages/native/src/observability/sink.ts) | function | Beta | Logs what would be sent, for development: fatal errors with `console.error`, others with `console.warn`, events and timings with `console.log`. Already scrubbed, so what you read is what a vendor sink would get. |
| [`createObservability`](../packages/native/src/observability/block.tsx) | function | Beta | Build the block once, at module scope, before the root layout renders. @stability Beta |
| [`createScreenErrorBoundary`](../packages/native/src/screen-boundary.tsx) | function | Beta | An Expo Router `ErrorBoundary`: reports each error once (non-fatal, source `screen`) and shows `fallback`. Build it once, at module scope. |
| [`defineEvents`](../packages/native/src/observability/events.ts) | function | Beta | Declare the app's events. Checks names (lower-case, dot-separated), prop names, and that each list has at least one short value, and throws listing every problem, so a bad schema fails where it is written. |
| [`FILTERED`](../packages/native/src/observability/scrub.ts) | const | — | What replaces a value under a secret-looking key. |
| [`isSecretKey`](../packages/native/src/observability/scrub.ts) | function | — | True when a value under `key` is a secret (or contact detail) whatever it looks like. |
| [`OBSERVABILITY_BLOCK_ID`](../packages/native/src/observability/block.tsx) | const | — | The FeatureId of the observability block. |
| [`ObservabilityProvider`](../packages/native/src/observability/block.tsx) | function | Beta | Provides a block to the hooks without its root (rung 4). @stability Beta |
| [`observeSink`](../packages/native/src/observability/sink.ts) | function | Beta | EAS Observe. It measures launch (cold, warm, bundle load, first render), time to interactive and, with its Expo Router integration, per-route render times on its own; it has no API for a custom timing metric, so `timing` is logged as an ... |
| [`ScreenErrorScreen`](../packages/native/src/screen-boundary.tsx) | function | Beta | The default screen fallback: the screen hit a problem, and "Try again". @stability Beta |
| [`scrubbedError`](../packages/native/src/observability/sink.ts) | function | — | A copy of `error` whose message and stack have been scrubbed (for sinks that don't scrub themselves). |
| [`scrubBreadcrumb`](../packages/native/src/observability/sink.ts) | function | — | Breadcrumb data scrubbed and made plain (for sinks and the devtools overlay). |
| [`scrubEvent`](../packages/native/src/observability/scrub.ts) | function | — | The event with the user reduced to its id, the request reduced to its method, URL (cut at `?`) and scrubbed headers, and every other value scrubbed. `null` when scrubbing threw: fail closed, send nothing rather than PII. |
| [`scrubRecord`](../packages/native/src/observability/scrub.ts) | function | — | A breadcrumb, span or any record, scrubbed by value. `null` when scrubbing threw (fail closed). |
| [`scrubString`](../packages/native/src/observability/scrub.ts) | function | — | A string with every URL query, email, phone number, JWT, Supabase key, bearer token and query-string token replaced. |
| [`scrubUrl`](../packages/native/src/observability/scrub.ts) | function | — | A URL without its query string and fragment, then scrubbed (an email in a path). |
| [`scrubValue`](../packages/native/src/observability/scrub.ts) | function | — | A deep copy of `value` with every string scrubbed and every value under a secret key replaced. Cycles become `"[Circular]"`; past 8 levels, `"[Truncated]"`. Errors become `{ name, message }`. Header lists (`[["authorization", "…"]]`) are... |
| [`sentryRelease`](../packages/native/src/observability/sentry.ts) | function | — | Sentry's release format: `<applicationId>@<version>+<build>`, with `dist` the build; `undefined` parts when unknown. |
| [`sentrySink`](../packages/native/src/observability/sentry.ts) | function | Beta | Start Sentry and return a sink for it. Without a DSN it starts nothing and returns a sink that does nothing (a warning outside development says so). |
| [`signatureTags`](../packages/native/src/observability/sentry.ts) | function | — | The tags each event carries from the signature. Unknown values are written `unknown`, never left out. |
| [`useObservability`](../packages/native/src/observability/block.tsx) | function | Beta | The block, or `null` when it is off (so a screen can call it whether or not the block is on). @stability Beta |
| [`useRecentActivity`](../packages/native/src/observability/block.tsx) | function | Beta | The last breadcrumbs and errors, scrubbed; empty when the block is off. @stability Beta |

### Types (23)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Breadcrumb };
export type { BreadcrumbLevel };
export type { ConsoleSinkOptions };
export type { ErrorContext };
export type { EventCheck };
export type { EventPropSpec };
export type { EventProps };
export type { EventSchema };
export type { EventValues };
export type { ObservabilityBlock };
export type { ObservabilityOptions };
export type { ObservabilitySink };
export type { ObserveLike };
export type { ObserveSinkOptions };
export type { RecentActivity };
export type { RecentError };
export type { RecentStore };
export type { RouteErrorBoundaryProps };
export type { ScreenErrorProps };
export type { ScrubbableEvent };
export type { SentryLike };
export type { SentrySinkOptions };
export type { TimingTags };
```

---

## @marktiderman/genesis-native/devtools

**Barrel:** [`packages/native/src/devtools/index.ts`](../packages/native/src/devtools/index.ts)

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`buildDebugInfo`](../packages/native/src/devtools/info.ts) | function | — | Several lines a person can paste into a bug report. Unknown values are written `unknown`, never left out. |
| [`createDevtools`](../packages/native/src/devtools/block.tsx) | function | Beta | Build the overlay once, at module scope. @stability Beta |
| [`createHoldDetector`](../packages/native/src/devtools/gestures.ts) | function | — | _(no summary)_ |
| [`createShakeDetector`](../packages/native/src/devtools/gestures.ts) | function | — | _(no summary)_ |
| [`DEVTOOLS_BLOCK_ID`](../packages/native/src/devtools/block.tsx) | const | — | The FeatureId of the devtools overlay. |

### Types (12)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AccelerometerLike };
export type { DebugInfoInput };
export type { DevSettingsLike };
export type { DevtoolsBlock };
export type { DevtoolsFeedbackProps };
export type { DevtoolsOptions };
export type { DevtoolsSlots };
export type { DevtoolsState };
export type { HoldDetector };
export type { HoldDetectorOptions };
export type { ShakeDetector };
export type { ShakeDetectorOptions };
```

---

## @marktiderman/genesis-native/web-handoff

**Barrel:** [`packages/native/src/web-handoff.ts`](../packages/native/src/web-handoff.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`openOnWeb`](../packages/native/src/web-handoff.ts) | function | Beta | Open `path` on the web app, signed in as the app's person. Throws for a path that isn't the web app's own (`https://…`, `//host`); the server checks again. When a signed-in link can't be had, opens the page signed out instead of failing ... |
| [`signOutOnWeb`](../packages/native/src/web-handoff.ts) | function | Beta | End the web sessions this app session handed off with {@link openOnWeb} (and only those; never the person's other devices). Call it just before the app's own sign-out, while the access token still works. It never throws, so it can't bloc... |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { OpenOnWebOptions };
export type { OpenOnWebResult };
export type { SignOutOnWebOptions };
export type { WebBrowserLike };
```

---

## @marktiderman/genesis-native/dev-warnings

**Barrel:** [`packages/native/src/dev-warnings.ts`](../packages/native/src/dev-warnings.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ignoreKnownDependencyWarnings`](../packages/native/src/dev-warnings.ts) | function | — | Keep the known dependency warnings out of LogBox (development only). Returns whether it did. |
| [`KNOWN_DEPENDENCY_WARNINGS`](../packages/native/src/dev-warnings.ts) | const | — | The warnings, matched on their text. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { LogBoxLike };
```

---

## @marktiderman/genesis-notifications

One notifier for Genesis apps: a domain (chat, forms, sites, support) says who and what; this decides how and when. defineNotifications registers types (category, channels, critical, transactional, device action categories, Android channels); notify() queues them through a security-definer SQL function; the in-app feed is also the outbox; one runner (claim with SKIP LOCKED, retries with jittered backoff, deferrals) sends Expo push (batches of 100, receipts, dead tokens pruned, private previews) and Resend email (rendered once for byte-identical retries, tenant sender identities, RFC 8058 one-click unsubscribe, bounce and complaint suppression); preferences by category and channel with tenant defaults and quiet hours across daylight saving; secret links built at send time; erasure. Hooks for React and React Native, a web bell, feed, preferences matrix and admin views on genesis-ui, a native feed on genesis-ui-native. Part of the Genesis framework.

**Barrel:** [`packages/notifications/src/index.ts`](../packages/notifications/src/index.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`assertNoSecrets`](../packages/notifications/src/core/validate.ts) | function | — | Throws a `SecretInDataError` naming the first key (or link) that looks like a secret. |
| [`CHANNELS`](../packages/notifications/src/core/registry.ts) | const | — | Where a notification can go. `in_app` is the feed. |
| [`defineNotifications`](../packages/notifications/src/core/registry.ts) | function | Beta | The notification registry. |
| [`DELIVERY_STATUSES`](../packages/notifications/src/core/types.ts) | const | — | Delivery states. |
| [`GENESIS_TEST_CATEGORY`](../packages/notifications/src/core/registry.ts) | const | — | The category and type of Admin -> Send a test (`genesis.test`, which the migration creates). Spread them into your registry. |
| [`GENESIS_TEST_TYPE`](../packages/notifications/src/core/registry.ts) | const | — | _(no summary)_ |
| [`IOS_ID_PATTERN`](../packages/notifications/src/core/registry.ts) | const | — | Device category and action ids: Expo asks for no ":" or "-". |
| [`KEY_PATTERN`](../packages/notifications/src/core/registry.ts) | const | — | Lower case letters, digits, ".", "_" or "-", up to 64 characters: type keys, category ids. |
| [`MAX_EMAIL_DELAY_SECONDS`](../packages/notifications/src/core/registry.ts) | const | — | The longest email delay: a week. |
| [`MESSAGE_ACTIONS`](../packages/notifications/src/core/registry.ts) | const | — | The actions a message notification shows: Reply (a text field) and Mark as read. Put it in `actions` under the id `messages` and name that id in the message type's `actions`: genesis-chat's push handler and genesis-native's notification ... |
| [`NotificationRegistryError`](../packages/notifications/src/core/registry.ts) | class | — | Thrown by `defineNotifications`; lists every problem at once. |
| [`recipientsToJson`](../packages/notifications/src/core/validate.ts) | function | — | The recipients as `genesis_notify` takes them; throws on a malformed one. |
| [`SecretInDataError`](../packages/notifications/src/core/validate.ts) | class | — | `data` held something that looks like a secret: build such links at send time instead. |

### Types (21)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Channel };
export type { ChannelChoices };
export type { ChannelImportance };
export type { DeliveryStatus };
export type { EmailRecipient };
export type { MatrixRow };
export type { NotificationActionDef };
export type { NotificationActionSetDef };
export type { NotificationBrand };
export type { NotificationCategoryDef };
export type { NotificationData };
export type { NotificationRegistry };
export type { NotificationRow };
export type { NotificationTypeDef };
export type { NotificationTypeRow };
export type { NotificationsInput };
export type { NotifyInput };
export type { NotifyResult };
export type { Recipient };
export type { RenderedText };
export type { UserRecipient };
```

---

## @marktiderman/genesis-notifications/core

**Barrel:** [`packages/notifications/src/index.ts`](../packages/notifications/src/index.ts)

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`assertNoSecrets`](../packages/notifications/src/core/validate.ts) | function | — | Throws a `SecretInDataError` naming the first key (or link) that looks like a secret. |
| [`CHANNELS`](../packages/notifications/src/core/registry.ts) | const | — | Where a notification can go. `in_app` is the feed. |
| [`defineNotifications`](../packages/notifications/src/core/registry.ts) | function | Beta | The notification registry. |
| [`DELIVERY_STATUSES`](../packages/notifications/src/core/types.ts) | const | — | Delivery states. |
| [`GENESIS_TEST_CATEGORY`](../packages/notifications/src/core/registry.ts) | const | — | The category and type of Admin -> Send a test (`genesis.test`, which the migration creates). Spread them into your registry. |
| [`GENESIS_TEST_TYPE`](../packages/notifications/src/core/registry.ts) | const | — | _(no summary)_ |
| [`IOS_ID_PATTERN`](../packages/notifications/src/core/registry.ts) | const | — | Device category and action ids: Expo asks for no ":" or "-". |
| [`KEY_PATTERN`](../packages/notifications/src/core/registry.ts) | const | — | Lower case letters, digits, ".", "_" or "-", up to 64 characters: type keys, category ids. |
| [`MAX_EMAIL_DELAY_SECONDS`](../packages/notifications/src/core/registry.ts) | const | — | The longest email delay: a week. |
| [`MESSAGE_ACTIONS`](../packages/notifications/src/core/registry.ts) | const | — | The actions a message notification shows: Reply (a text field) and Mark as read. Put it in `actions` under the id `messages` and name that id in the message type's `actions`: genesis-chat's push handler and genesis-native's notification ... |
| [`NotificationRegistryError`](../packages/notifications/src/core/registry.ts) | class | — | Thrown by `defineNotifications`; lists every problem at once. |
| [`recipientsToJson`](../packages/notifications/src/core/validate.ts) | function | — | The recipients as `genesis_notify` takes them; throws on a malformed one. |
| [`SecretInDataError`](../packages/notifications/src/core/validate.ts) | class | — | `data` held something that looks like a secret: build such links at send time instead. |

### Types (21)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Channel };
export type { ChannelChoices };
export type { ChannelImportance };
export type { DeliveryStatus };
export type { EmailRecipient };
export type { MatrixRow };
export type { NotificationActionDef };
export type { NotificationActionSetDef };
export type { NotificationBrand };
export type { NotificationCategoryDef };
export type { NotificationData };
export type { NotificationRegistry };
export type { NotificationRow };
export type { NotificationTypeDef };
export type { NotificationTypeRow };
export type { NotificationsInput };
export type { NotifyInput };
export type { NotifyResult };
export type { Recipient };
export type { RenderedText };
export type { UserRecipient };
```

---

## @marktiderman/genesis-notifications/runner

**Barrel:** [`packages/notifications/src/runner/index.ts`](../packages/notifications/src/runner/index.ts)

### Other exports (7)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createRunner`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`DEFAULT_BATCH_SIZE`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_ATTEMPTS`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_DEFERRALS`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`defaultBackoff`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`failureOf`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |
| [`jobOutcome`](../packages/notifications/src/runner/index.ts) | const | — | _(no summary)_ |

### Types (10)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ClaimRequest };
export type { JobFailure };
export type { JobOutcome };
export type { JobResult };
export type { RunOptions };
export type { RunReport };
export type { Runner };
export type { RunnerJob };
export type { RunnerOptions };
export type { SendContext };
```

---

## @marktiderman/genesis-notifications/server

**Barrel:** [`packages/notifications/src/server/index.ts`](../packages/notifications/src/server/index.ts)

### Other exports (46)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cancelNotification`](../packages/notifications/src/server/notify.ts) | function | Beta | Stop what hasn't gone out for a type, tenant and idempotency key (a release rolled back, an event undone): every pending send job is marked cancelled and never claimed. A job already sent is left alone; one being sent right now ends canc... |
| [`canonicalJson`](../packages/notifications/src/server/email-render.ts) | function | — | JSON with sorted keys: the same bytes however a database reordered them. |
| [`checkSenderDomain`](../packages/notifications/src/server/dns.ts) | function | Beta | Checks ownership, SPF, DKIM and DMARC for `domain`. Record the result with `genesis_notifications_set_sender_dns(tenant, domain, token, ok ? 'verified' : 'failed', result)` with the same token, so a check made before the tenant changed i... |
| [`createInboundEmailHandler`](../packages/notifications/src/server/inbound.ts) | function | Beta | The receiving webhook as a web-standard handler: 401 for an unsigned or stale request, 200 for anything handled or ignored, 502 when the message couldn't be fetched or a route threw (Resend retries). |
| [`createNotificationRunner`](../packages/notifications/src/server/runner.ts) | function | Beta | The runner. |
| [`createNotificationsHandler`](../packages/notifications/src/server/handler.ts) | function | Beta | The handler. |
| [`createRateLimiter`](../packages/notifications/src/server/rate.ts) | function | Beta | _(no summary)_ |
| [`createUnsubscribeToken`](../packages/notifications/src/server/unsubscribe.ts) | function | — | A signed, URL-safe token for `claims`. |
| [`defaultEmailTemplate`](../packages/notifications/src/server/email-render.ts) | const | — | The default email when a type has no template: its title, body and a button, every value escaped. |
| [`displayName`](../packages/notifications/src/server/email-render.ts) | function | — | A display name with nothing that could break out of the From header (or need quoting): no quotes, brackets, ":", ";", "@", "," or "\\". |
| [`emailEventOf`](../packages/notifications/src/server/webhook.ts) | function | — | What the notifier does with an email event; null for the events it doesn't use. |
| [`emailHash`](../packages/notifications/src/server/unsubscribe.ts) | function | — | What the suppression list keys an address by: SHA-256 of it lower-cased and trimmed (as `genesis_notifications_email_hash`). |
| [`escapeHtml`](../packages/notifications/src/server/email-render.ts) | function | — | _(no summary)_ |
| [`EXPO_RECEIPTS_BATCH`](../packages/notifications/src/server/expo.ts) | const | — | And up to 1000 ticket ids per receipts request. |
| [`EXPO_RECEIPTS_URL`](../packages/notifications/src/server/expo.ts) | const | — | _(no summary)_ |
| [`EXPO_SEND_BATCH`](../packages/notifications/src/server/expo.ts) | const | — | Expo takes up to 100 messages per send. |
| [`EXPO_SEND_URL`](../packages/notifications/src/server/expo.ts) | const | — | _(no summary)_ |
| [`expoErrorCode`](../packages/notifications/src/server/expo.ts) | function | — | An Expo error code (`DeviceNotRegistered`), safe to store; anything else is `Unknown`. |
| [`expoPushProvider`](../packages/notifications/src/server/expo.ts) | function | Beta | Expo's push service as a `PushProvider`. |
| [`headerSafe`](../packages/notifications/src/server/email-render.ts) | function | — | A header value on one line: control characters and line separators become spaces; cut to `max`. |
| [`inboundEmailOf`](../packages/notifications/src/server/inbound.ts) | function | — | Resend's received-email object as an `InboundEmail`; null when it has no usable sender. |
| [`isReservedDomain`](../packages/notifications/src/server/dns.ts) | function | — | Whether `domain` is one of `reserved`, or under one. |
| [`isRetryableStatus`](../packages/notifications/src/server/errors.ts) | function | — | Whether an HTTP status is worth retrying unchanged: 408, 425, 429 and 5xx. |
| [`isSafeAddress`](../packages/notifications/src/server/email-render.ts) | function | — | A bare address safe as a header value. |
| [`NotificationStoreError`](../packages/notifications/src/server/store.ts) | class | — | A database refusal, with its SQLSTATE; never the row it refused. |
| [`notify`](../packages/notifications/src/server/notify.ts) | function | Beta | Queue a notification for each recipient. Resolves one result per recipient that exists (a deleted login is left out); the same idempotency key again (for the same type and tenant) resolves `created: false` and sends nothing more. |
| [`parseAddress`](../packages/notifications/src/server/inbound.ts) | function | — | "Pat <Pat@Example.test>" → { email: "pat@example.test", name: "Pat" }. |
| [`refusedOutright`](../packages/notifications/src/server/expo.ts) | function | — | Expo refused the request itself (a 4xx other than 429): resend its messages one by one. |
| [`REQUEST_TIMEOUT_MS`](../packages/notifications/src/server/errors.ts) | const | — | Every request gives up after this long. |
| [`RESEND_API`](../packages/notifications/src/server/resend.ts) | const | — | _(no summary)_ |
| [`RESEND_DEFAULT_PER_SECOND`](../packages/notifications/src/server/resend.ts) | const | — | Requests a second the provider starts by default: half Resend's default team limit (10). |
| [`RESEND_RECEIVING_API`](../packages/notifications/src/server/inbound.ts) | const | — | _(no summary)_ |
| [`resendProvider`](../packages/notifications/src/server/resend.ts) | function | Beta | Resend as an `EmailProvider`. |
| [`resolveSecretLink`](../packages/notifications/src/server/secret-links.ts) | function | Beta | The secret link for one notification, built server-side at send time. Throws a `SecretLinkError` when there is no builder for `type` or it gives something other than an `https:` URL (`http:` only for localhost). |
| [`retryAfterSeconds`](../packages/notifications/src/server/errors.ts) | function | — | Seconds from a Retry-After header (delta-seconds or an HTTP date), else `fallback`. 1 s to a day. |
| [`SECRET_LINK_PLACEHOLDER`](../packages/notifications/src/server/secret-links.ts) | const | — | What a template puts where the secret link goes; the runner swaps it in at send time, so the stored render never holds it. |
| [`SecretLinkError`](../packages/notifications/src/server/secret-links.ts) | class | — | No builder for a type whose emails need one, or a builder that gave back something that isn't an https link. |
| [`SENDER_OWNERSHIP_HOST`](../packages/notifications/src/server/dns.ts) | const | — | The ownership record's host. |
| [`senderOwnershipRecord`](../packages/notifications/src/server/dns.ts) | function | Beta | The TXT record a tenant adds to prove `domain` is theirs: show it beside Resend's SPF and DKIM records in your sender settings. |
| [`SendError`](../packages/notifications/src/server/errors.ts) | class | — | A send failure with a message that is safe to store and log (a status and a provider's error code, never content, an address or a secret). The runner turns it into a retry or a failure. |
| [`supabaseNotificationStore`](../packages/notifications/src/server/store.ts) | function | Beta | The store over migration 0001's functions. |
| [`syncNotificationTypes`](../packages/notifications/src/server/notify.ts) | function | Beta | Mirror the registry into `notification_types` (run it on deploy, or the server's first request): types left out are retired, never deleted. |
| [`unsubscribeHeaders`](../packages/notifications/src/server/unsubscribe.ts) | function | — | The RFC 8058 headers for one email. `url` is your unsubscribe endpoint; the token goes in its query. |
| [`verifyResendWebhook`](../packages/notifications/src/server/webhook.ts) | function | — | Whether `body` was signed with `secret`; false for anything stale, unsigned or malformed. |
| [`verifyUnsubscribeToken`](../packages/notifications/src/server/unsubscribe.ts) | function | — | The claims of a token this secret signed, or null for anything else. |
| [`WEBHOOK_TOLERANCE_SECONDS`](../packages/notifications/src/server/webhook.ts) | const | — | How far a webhook's timestamp may be from now: five minutes, as Svix checks. |

### Types (37)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CancelInput };
export type { ClaimedDevice };
export type { ClaimedJob };
export type { DomainCheck };
export type { DomainCheckOptions };
export type { EmailContent };
export type { EmailMessage };
export type { EmailOptions };
export type { EmailProvider };
export type { EmailSendResult };
export type { EmailTemplate };
export type { EmailTemplateContext };
export type { ExpoOptions };
export type { HttpDeps };
export type { InboundEmail };
export type { InboundEmailHandlerOptions };
export type { InboundEmailRoute };
export type { NotificationRunner };
export type { NotificationRunnerOptions };
export type { NotificationStore };
export type { NotificationsHandlerOptions };
export type { NotifyOptions };
export type { PushMessage };
export type { PushProvider };
export type { PushReceipt };
export type { PushTicket };
export type { PushTicketRow };
export type { RateLimiter };
export type { RateLimiterOptions };
export type { RenderedEmail };
export type { ResendOptions };
export type { RpcClient };
export type { SecretLinkRef };
export type { SecretLinks };
export type { SenderIdentity };
export type { SettleOutcome };
export type { UnsubscribeClaims };
```

---

## @marktiderman/genesis-notifications/email

**Barrel:** [`packages/notifications/src/email/index.tsx`](../packages/notifications/src/email/index.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`BrandLayout`](../packages/notifications/src/email/index.tsx) | `BrandLayoutProps` | Beta | The brand frame every notification email shares. |

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`brandedDefaultTemplate`](../packages/notifications/src/email/index.tsx) | const | — | The default template, on the brand layout: the registry's title and body, and a button to the link. |
| [`EmailButton`](../packages/notifications/src/email/index.tsx) | function | — | A button in the brand's accent. |
| [`EmailText`](../packages/notifications/src/email/index.tsx) | function | — | A paragraph in the brand's type. |
| [`reactEmailTemplate`](../packages/notifications/src/email/index.tsx) | function | Beta | Turn a React Email component into the runner's `EmailTemplate`: HTML and a plain-text part from the same element. |

---

## @marktiderman/genesis-notifications/supabase

**Barrel:** [`packages/notifications/src/supabase/index.ts`](../packages/notifications/src/supabase/index.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`choicesOf`](../packages/notifications/src/supabase/index.ts) | function | — | A preferences row as category → channel → on: `channels`, with the push and email of a category switched off as a whole (migration 0005's `categories`) filled in where no channel was chosen, as the server reads it. |
| [`FEED_COLUMNS`](../packages/notifications/src/supabase/index.ts) | const | — | _(no summary)_ |
| [`NOTIFICATIONS_MIGRATIONS`](../packages/notifications/src/supabase/index.ts) | const | — | The migrations to copy, in order, with their tests. |
| [`NOTIFICATIONS_PACKAGE`](../packages/notifications/src/supabase/index.ts) | const | — | _(no summary)_ |
| [`notificationsClient`](../packages/notifications/src/supabase/index.ts) | function | Beta | The browser and phone side of the notifier, under the signed-in person's row level security. |
| [`NotificationsClientError`](../packages/notifications/src/supabase/index.ts) | class | — | A database refusal, with its SQLSTATE. |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DeliveryLogRow };
export type { FeedFilter };
export type { NotificationsClient };
export type { NotificationsSupabaseLike };
export type { SuppressionRow };
```

---

## @marktiderman/genesis-notifications/react

**Barrel:** [`packages/notifications/src/react/index.tsx`](../packages/notifications/src/react/index.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`NotificationsProvider`](../packages/notifications/src/react/index.tsx) | `NotificationsProviderProps` | Beta | Provides the notifier to the hooks. |

### Other exports (7)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`notificationKeys`](../packages/notifications/src/react/index.tsx) | const | — | The query keys, for an app that invalidates them itself. |
| [`notificationsClient`](../packages/notifications/src/supabase/index.ts) | function | Beta | The browser and phone side of the notifier, under the signed-in person's row level security. |
| [`preferenceRows`](../packages/notifications/src/react/index.tsx) | function | — | The matrix with the person's choices applied. Exported for tests and custom screens. |
| [`useNotifications`](../packages/notifications/src/react/index.tsx) | function | Beta | The person's feed. |
| [`useNotificationsContext`](../packages/notifications/src/react/index.tsx) | function | — | The provider's client, registry and user. Throws outside one. |
| [`usePreferences`](../packages/notifications/src/react/index.tsx) | function | Beta | The person's preferences by category and channel. A tenant's default isn't shown here (the server applies it); what shows for a channel the person never chose is the type's default. |
| [`useUnreadCount`](../packages/notifications/src/react/index.tsx) | function | Beta | The unread count (0 while signed out). |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FeedItem };
export type { NotificationsClient };
export type { PreferenceRow };
export type { UseNotificationsResult };
export type { UsePreferencesResult };
```

---

## @marktiderman/genesis-notifications/web

**Barrel:** [`packages/notifications/src/web/index.tsx`](../packages/notifications/src/web/index.tsx)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`NotificationBell`](../packages/notifications/src/web/index.tsx) | `NotificationBellProps` | Beta | The bell. Opening it marks what it shows as seen; opening a row marks it read. |
| [`NotificationFeed`](../packages/notifications/src/web/index.tsx) | `NotificationFeedProps` | Beta | The whole feed, in a card: mark read on open, archive, mark all read. |

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`CHANNEL_LABELS`](../packages/notifications/src/web/index.tsx) | const | — | _(no summary)_ |
| [`DeliveryLog`](../packages/notifications/src/web/index.tsx) | function | Beta | Admin: the delivery log, newest first. Row level security shows an admin their tenants' rows only; content and full addresses are never here. |
| [`NotificationRowView`](../packages/notifications/src/web/index.tsx) | function | — | One feed row: unread dot, title, body, age. |
| [`PreferencesMatrix`](../packages/notifications/src/web/index.tsx) | function | Beta | Categories × channels, a switch each. Critical categories are locked on. Saves each change at once and puts it back if the save fails. |
| [`SendTestNotification`](../packages/notifications/src/web/index.tsx) | function | Beta | Admin: send yourself a test notification (in the app, push and email). |
| [`SuppressionList`](../packages/notifications/src/web/index.tsx) | function | Beta | Admin: addresses the app won't email (by a masked address; the list keeps only a hash), and lifting one. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FeedRowProps };
```

---

## @marktiderman/genesis-notifications/native

**Barrel:** [`packages/notifications/src/native/index.tsx`](../packages/notifications/src/native/index.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`NotificationsFeed`](../packages/notifications/src/native/index.tsx) | `NotificationsFeedProps` | Beta | The feed on ui-native's `NotificationsPage`: pull to refresh, unread dots, a tap marks read and opens. Realtime refetches it (NotificationsProvider). |

### Other exports (9)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`CHANNEL_LABELS`](../packages/notifications/src/native/index.tsx) | const | — | _(no summary)_ |
| [`ChannelPreferences`](../packages/notifications/src/native/index.tsx) | function | Beta | Category × channel switches (push and email, and the feed when a type offers it as optional), for NotificationSettings' `categories` slot. It ignores the push block's own category switches and reads the notifier's preferences instead. |
| [`NotificationPreferences`](../packages/notifications/src/native/index.tsx) | function | Beta | Settings → Notifications with the notifier's channel switches: the push block's permission, quiet hours and previews, and `ChannelPreferences` for the categories. Needs the push block and NotificationsProvider. |
| [`NOTIFICATIONS_FEED_LIMIT`](../packages/notifications/src/native/index.tsx) | const | — | How many notifications the feed (and its header) reads: one query, shared by both. |
| [`notificationsPushBackend`](../packages/notifications/src/native/index.tsx) | function | Beta | The push block's `PushBackend` on genesis-notifications' migration: registers with this install's id (so a token moves between logins only on its own phone), and keeps preferences with `notificationsPushPreferences`. |
| [`NotificationsPushBackendError`](../packages/notifications/src/native/index.tsx) | class | — | A database refusal, with its SQLSTATE; never a token. |
| [`notificationsPushPreferences`](../packages/notifications/src/native/index.tsx) | function | Beta | The push block's `loadPreferences` / `savePreferences` on genesis-notifications' migration, for an app that registers devices its own way: spread it into the backend and NotificationSettings (quiet hours, previews, the category switches)... |
| [`pushOptionsFrom`](../packages/notifications/src/native/index.tsx) | function | Beta | What the push block needs from the registry: a category per notification category (its Android channel; NotificationSettings shows the categories section only when there are some), and the device categories with their action buttons. |
| [`useNotificationsFeedHeader`](../packages/notifications/src/native/index.tsx) | function | — | The feed's `Stack.Screen` options, with "Mark all read" while anything is unread. Pass the feed's `limit` if you changed it, so both read one query. |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { PushBackendClientLike };
export type { PushPreferencesBackend };
```

---

## @marktiderman/genesis-notifications/blocks

**Barrel:** [`packages/notifications/src/blocks.ts`](../packages/notifications/src/blocks.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`notificationsBlock`](../packages/notifications/src/blocks.ts) | const | Beta | Notifications: the feed, push and email for every domain, on one notifier. |

---

## @marktiderman/genesis-product

The product system for a Genesis repo: a Now / Next / Later board from features.ts with demand from ideas and feedback, a triage inbox, and release notes that close the loop with the people who asked. Ideas and feedback come from GitHub issues today, behind a SignalSource contract. Part of the Genesis framework.

**Barrel:** [`packages/product/src/index.ts`](../packages/product/src/index.ts)

### Other exports (25)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answeredBy`](../packages/product/src/release.ts) | function | Experimental | The open ideas a release answers: the people to tell, and the asks to close. This is how the loop closes. Feedback and bugs are left alone: a feature going live doesn't mean a reported problem with it is fixed. |
| [`buildBoard`](../packages/product/src/board.ts) | function | Experimental | Lays the catalog and its signals out as a board. A building feature with no horizon counts as now. Signals are matched to features by id or alias. |
| [`cancelShipped`](../packages/product/src/notifications.ts) | function | Experimental | A release was withdrawn: stop the shipped notifications for one feature that haven't gone out yet, and take them out of the feed (`archive`, on by default). Only sends still waiting are stopped: email goes out as soon as the runner picks... |
| [`createProductWhatsNew`](../packages/product/src/app.ts) | function | Experimental | "What's new", once per app version plus over-the-air update. A first install remembers the key and shows nothing; a new key fetches its notes then (never bundled) and opens when there are any. No notes for it: remembered, nothing shown. ... |
| [`createVoteQueue`](../packages/product/src/app.ts) | function | Experimental | The offline vote queue, modelled on chat's outbox: a vote shows at once, is saved, and is sent when there is a connection (`flush()`: on start, after each vote and on reconnect). Votes on one idea collapse into the last one, and a toggle... |
| [`demand`](../packages/product/src/board.ts) | function | Experimental | Demand for a feature: each open signal counts its importance (1 when unset) plus its votes. Closed signals don't count, so demand falls as asks are answered. |
| [`diffRelease`](../packages/product/src/release.ts) | function | Experimental | The features a release shipped: those that reached `live` or `beta` between the catalog before and after it. Features with `visibility: internal` are left out of release notes. |
| [`isAppPath`](../packages/product/src/notifications.ts) | function | Experimental | _(no summary)_ |
| [`isPermanentVoteError`](../packages/product/src/app.ts) | function | Experimental | True for an error retrying won't fix: `permanent: true`, or an HTTP 4xx other than 408 and 429. @stability Experimental |
| [`memoryProductSource`](../packages/product/src/app.ts) | function | Experimental | A source in memory, for tests and demos: votes change its own copy. @stability Experimental |
| [`memorySignals`](../packages/product/src/model.ts) | function | Experimental | Signals held in memory, for tests and demos. @stability Experimental |
| [`memoryVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in memory (the default: queued votes last as long as the app runs). @stability Experimental |
| [`NOTIFY_BATCH`](../packages/product/src/notifications.ts) | const | Experimental | The most recipients genesis-notifications' `notify()` takes in one call. @stability Experimental |
| [`notifyShipped`](../packages/product/src/notifications.ts) | function | Experimental | One `product.idea_shipped` notification to everyone who asked for a feature, keyed `shipped:<release>:<feature>`. `notify` is genesis-notifications' `notify` with the client and registry bound. It is called once per 1,000 recipients (not... |
| [`PRODUCT_SHIPPED_TYPE`](../packages/product/src/notifications.ts) | const | Experimental | The notification type of "an idea you asked for shipped". @stability Experimental |
| [`PRODUCT_UPDATES_CATEGORY`](../packages/product/src/notifications.ts) | const | Experimental | Its category: what a person turns on or off in their preferences. @stability Experimental |
| [`productNotifications`](../packages/product/src/notifications.ts) | const | Experimental | The fragment for the app's `defineNotifications({ categories, types })`. Not critical and not transactional, so preferences, quiet hours and the unsubscribe link all apply. In the feed and by email by default; push is offered as an opt-i... |
| [`renderBoard`](../packages/product/src/board.ts) | function | Experimental | The board as GitHub-flavoured markdown: one table per horizon, the top ideas by demand, and the triage inbox. |
| [`renderRelease`](../packages/product/src/release.ts) | function | Experimental | Draft release notes for people, not developers: each feature's tagline (or its summary), grouped into shipped and in beta, with the asks it answers. A person edits and publishes them. |
| [`roadmapFromBoard`](../packages/product/src/app.ts) | function | Experimental | The board's Now / Next / Later columns as roadmap rows. Only features everyone may see are kept (`public`, `customer`, or no visibility): `internal` and every `client:<name>` feature are left out, except that `client`'s own when it is gi... |
| [`shippedKey`](../packages/product/src/notifications.ts) | function | Experimental | `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental |
| [`SIGNAL_KINDS`](../packages/product/src/model.ts) | const | Experimental | What someone sent: an idea, a piece of feedback or a bug. @stability Experimental |
| [`storageVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in AsyncStorage, under one key. A value that can't be read counts as empty. @stability Experimental |
| [`VoteRefusedError`](../packages/product/src/app.ts) | class | Experimental | A vote the source refused for good: the queue drops it and the board shows the source's state again. @stability Experimental |
| [`whatsNewKey`](../packages/product/src/app.ts) | function | Experimental | What "what's new" is shown once for: the store version plus the over-the-air update running (`"1.4.0+3f2a…"`), or `"1.4.0+embedded"` for the code that shipped in the binary. `null` without a version: it never shows. |

### Types (34)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Board };
export type { BoardItem };
export type { CatalogFeature };
export type { Importance };
export type { MemoryProductSeed };
export type { NotifyShippedOptions };
export type { ProductCancelInput };
export type { ProductIdea };
export type { ProductIdeaStatus };
export type { ProductNotifyInput };
export type { ProductRecipient };
export type { ProductSource };
export type { ProductStorageLike };
export type { ProductWhatsNew };
export type { ProductWhatsNewOptions };
export type { ProductWhatsNewState };
export type { QueuedVote };
export type { ReleaseChange };
export type { RenderBoardOptions };
export type { RenderReleaseOptions };
export type { RoadmapFromBoardOptions };
export type { RoadmapItem };
export type { ShippedData };
export type { ShippedFeature };
export type { Signal };
export type { SignalKind };
export type { SignalSource };
export type { VoteFlushResult };
export type { VoteQueue };
export type { VoteQueueOptions };
export type { VoteQueueStore };
export type { WhatsNewApplicationLike };
export type { WhatsNewNote };
export type { WhatsNewUpdatesLike };
```

---

## @marktiderman/genesis-product/server

**Barrel:** [`packages/product/src/server.ts`](../packages/product/src/server.ts)

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cancelShipped`](../packages/product/src/notifications.ts) | function | Experimental | A release was withdrawn: stop the shipped notifications for one feature that haven't gone out yet, and take them out of the feed (`archive`, on by default). Only sends still waiting are stopped: email goes out as soon as the runner picks... |
| [`isAppPath`](../packages/product/src/notifications.ts) | function | Experimental | _(no summary)_ |
| [`NOTIFY_BATCH`](../packages/product/src/notifications.ts) | const | Experimental | The most recipients genesis-notifications' `notify()` takes in one call. @stability Experimental |
| [`notifyShipped`](../packages/product/src/notifications.ts) | function | Experimental | One `product.idea_shipped` notification to everyone who asked for a feature, keyed `shipped:<release>:<feature>`. `notify` is genesis-notifications' `notify` with the client and registry bound. It is called once per 1,000 recipients (not... |
| [`PRODUCT_SHIPPED_TYPE`](../packages/product/src/notifications.ts) | const | Experimental | The notification type of "an idea you asked for shipped". @stability Experimental |
| [`PRODUCT_UPDATES_CATEGORY`](../packages/product/src/notifications.ts) | const | Experimental | Its category: what a person turns on or off in their preferences. @stability Experimental |
| [`productNotifications`](../packages/product/src/notifications.ts) | const | Experimental | The fragment for the app's `defineNotifications({ categories, types })`. Not critical and not transactional, so preferences, quiet hours and the unsubscribe link all apply. In the feed and by email by default; push is offered as an opt-i... |
| [`shippedKey`](../packages/product/src/notifications.ts) | function | Experimental | `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { NotifyShippedOptions };
export type { ProductCancelInput };
export type { ProductNotifyInput };
export type { ProductRecipient };
export type { ShippedData };
export type { ShippedFeature };
```

---

## @marktiderman/genesis-product/node

**Barrel:** [`packages/product/src/node.ts`](../packages/product/src/node.ts)

### Other exports (34)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answeredBy`](../packages/product/src/release.ts) | function | Experimental | The open ideas a release answers: the people to tell, and the asks to close. This is how the loop closes. Feedback and bugs are left alone: a feature going live doesn't mean a reported problem with it is fixed. |
| [`BOARD_LABEL`](../packages/product/src/node.ts) | const | Experimental | The label that marks the board issue. No issue form applies it. @stability Experimental |
| [`buildBoard`](../packages/product/src/board.ts) | function | Experimental | Lays the catalog and its signals out as a board. A building feature with no horizon counts as now. Signals are matched to features by id or alias. |
| [`cancelShipped`](../packages/product/src/notifications.ts) | function | Experimental | A release was withdrawn: stop the shipped notifications for one feature that haven't gone out yet, and take them out of the feed (`archive`, on by default). Only sends still waiting are stopped: email goes out as soon as the runner picks... |
| [`catalogAt`](../packages/product/src/node.ts) | function | Experimental | The catalog at a git ref (a tag, a branch or a commit). `[]` only when the ref exists and the file didn't exist at it yet; a ref that doesn't exist, or a file that can't be read at it, throws, so a typo never reads as "everything is new"... |
| [`closeAnswered`](../packages/product/src/node.ts) | function | Experimental | Closes the loop on GitHub: closes each answered issue as completed, then comments on it saying what shipped. Closing first means a rerun after a failure never comments twice (the issue is no longer open). Only for signals from GitHub. |
| [`createProductWhatsNew`](../packages/product/src/app.ts) | function | Experimental | "What's new", once per app version plus over-the-air update. A first install remembers the key and shows nothing; a new key fetches its notes then (never bundled) and opens when there are any. No notes for it: remembered, nothing shown. ... |
| [`createVoteQueue`](../packages/product/src/app.ts) | function | Experimental | The offline vote queue, modelled on chat's outbox: a vote shows at once, is saved, and is sent when there is a connection (`flush()`: on start, after each vote and on reconnect). Votes on one idea collapse into the last one, and a toggle... |
| [`demand`](../packages/product/src/board.ts) | function | Experimental | Demand for a feature: each open signal counts its importance (1 when unset) plus its votes. Closed signals don't count, so demand falls as asks are answered. |
| [`diffRelease`](../packages/product/src/release.ts) | function | Experimental | The features a release shipped: those that reached `live` or `beta` between the catalog before and after it. Features with `visibility: internal` are left out of release notes. |
| [`githubSignals`](../packages/product/src/node.ts) | function | Experimental | Signals from a repo's open issues. For each linked one, votes are the distinct people who gave it a 👍, not counting its author or bots. |
| [`isAppPath`](../packages/product/src/notifications.ts) | function | Experimental | _(no summary)_ |
| [`isPermanentVoteError`](../packages/product/src/app.ts) | function | Experimental | True for an error retrying won't fix: `permanent: true`, or an HTTP 4xx other than 408 and 429. @stability Experimental |
| [`issueToSignal`](../packages/product/src/node.ts) | function | Experimental | One issue as a signal, or `null` when it isn't intake. An issue is intake when it carries an `idea`, `feedback` or `bug` label, or its title starts with `[Idea]`, `[Feedback]` or `[Bug]` (the issue forms set both). |
| [`memoryProductSource`](../packages/product/src/app.ts) | function | Experimental | A source in memory, for tests and demos: votes change its own copy. @stability Experimental |
| [`memorySignals`](../packages/product/src/model.ts) | function | Experimental | Signals held in memory, for tests and demos. @stability Experimental |
| [`memoryVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in memory (the default: queued votes last as long as the app runs). @stability Experimental |
| [`NOTIFY_BATCH`](../packages/product/src/notifications.ts) | const | Experimental | The most recipients genesis-notifications' `notify()` takes in one call. @stability Experimental |
| [`notifyShipped`](../packages/product/src/notifications.ts) | function | Experimental | One `product.idea_shipped` notification to everyone who asked for a feature, keyed `shipped:<release>:<feature>`. `notify` is genesis-notifications' `notify` with the client and registry bound. It is called once per 1,000 recipients (not... |
| [`parseCatalog`](../packages/product/src/node.ts) | function | Experimental | The catalog from a `features.json` (what `genesis features build` writes), whose `features` is an object keyed by id or an array. |
| [`PRODUCT_SHIPPED_TYPE`](../packages/product/src/notifications.ts) | const | Experimental | The notification type of "an idea you asked for shipped". @stability Experimental |
| [`PRODUCT_UPDATES_CATEGORY`](../packages/product/src/notifications.ts) | const | Experimental | Its category: what a person turns on or off in their preferences. @stability Experimental |
| [`productNotifications`](../packages/product/src/notifications.ts) | const | Experimental | The fragment for the app's `defineNotifications({ categories, types })`. Not critical and not transactional, so preferences, quiet hours and the unsubscribe link all apply. In the feed and by email by default; push is offered as an opt-i... |
| [`publishBoardIssue`](../packages/product/src/node.ts) | function | Experimental | Writes the board into the open issue labelled `product-board` that `author` opened, opening one if there is none, so the board is one link away on any device. Nobody else's issue is ever written, and the issue is left alone when only the... |
| [`readCatalog`](../packages/product/src/node.ts) | function | Experimental | The catalog in a file. @stability Experimental |
| [`renderBoard`](../packages/product/src/board.ts) | function | Experimental | The board as GitHub-flavoured markdown: one table per horizon, the top ideas by demand, and the triage inbox. |
| [`renderRelease`](../packages/product/src/release.ts) | function | Experimental | Draft release notes for people, not developers: each feature's tagline (or its summary), grouped into shipped and in beta, with the asks it answers. A person edits and publishes them. |
| [`repoFromGit`](../packages/product/src/node.ts) | function | Experimental | `owner/repo` from the `origin` remote, or `undefined`. @stability Experimental |
| [`roadmapFromBoard`](../packages/product/src/app.ts) | function | Experimental | The board's Now / Next / Later columns as roadmap rows. Only features everyone may see are kept (`public`, `customer`, or no visibility): `internal` and every `client:<name>` feature are left out, except that `client`'s own when it is gi... |
| [`shippedKey`](../packages/product/src/notifications.ts) | function | Experimental | `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental |
| [`SIGNAL_KINDS`](../packages/product/src/model.ts) | const | Experimental | What someone sent: an idea, a piece of feedback or a bug. @stability Experimental |
| [`storageVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in AsyncStorage, under one key. A value that can't be read counts as empty. @stability Experimental |
| [`VoteRefusedError`](../packages/product/src/app.ts) | class | Experimental | A vote the source refused for good: the queue drops it and the board shows the source's state again. @stability Experimental |
| [`whatsNewKey`](../packages/product/src/app.ts) | function | Experimental | What "what's new" is shown once for: the store version plus the over-the-air update running (`"1.4.0+3f2a…"`), or `"1.4.0+embedded"` for the code that shipped in the binary. `null` without a version: it never shows. |

### Types (37)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Board };
export type { BoardItem };
export type { CatalogFeature };
export type { GitHubIssue };
export type { GitHubOptions };
export type { Importance };
export type { MemoryProductSeed };
export type { NotifyShippedOptions };
export type { ProductCancelInput };
export type { ProductIdea };
export type { ProductIdeaStatus };
export type { ProductNotifyInput };
export type { ProductRecipient };
export type { ProductSource };
export type { ProductStorageLike };
export type { ProductWhatsNew };
export type { ProductWhatsNewOptions };
export type { ProductWhatsNewState };
export type { PublishBoardOptions };
export type { QueuedVote };
export type { ReleaseChange };
export type { RenderBoardOptions };
export type { RenderReleaseOptions };
export type { RoadmapFromBoardOptions };
export type { RoadmapItem };
export type { ShippedData };
export type { ShippedFeature };
export type { Signal };
export type { SignalKind };
export type { SignalSource };
export type { VoteFlushResult };
export type { VoteQueue };
export type { VoteQueueOptions };
export type { VoteQueueStore };
export type { WhatsNewApplicationLike };
export type { WhatsNewNote };
export type { WhatsNewUpdatesLike };
```

---

## @marktiderman/genesis-product/native

**Barrel:** [`packages/product/src/native/index.ts`](../packages/product/src/native/index.ts)

### Components (4)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ProductWhatsNew`](../packages/product/src/native/whats-new.tsx) | `ProductWhatsNewProps` | — | Renders the sheet while the store shows notes, and nothing otherwise. |
| [`ProductWhatsNewSheet`](../packages/product/src/native/whats-new.tsx) | `ProductWhatsNewSheetProps` | — | _(no summary)_ |
| [`RoadmapDetailSheet`](../packages/product/src/native/roadmap.tsx) | `RoadmapDetailSheetProps` | — | _(no summary)_ |
| [`VoteButton`](../packages/product/src/native/idea-board.tsx) | `VoteButtonProps` | — | _(no summary)_ |

### Other exports (32)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`answeredBy`](../packages/product/src/release.ts) | function | Experimental | The open ideas a release answers: the people to tell, and the asks to close. This is how the loop closes. Feedback and bugs are left alone: a feature going live doesn't mean a reported problem with it is fixed. |
| [`buildBoard`](../packages/product/src/board.ts) | function | Experimental | Lays the catalog and its signals out as a board. A building feature with no horizon counts as now. Signals are matched to features by id or alias. |
| [`cancelShipped`](../packages/product/src/notifications.ts) | function | Experimental | A release was withdrawn: stop the shipped notifications for one feature that haven't gone out yet, and take them out of the feed (`archive`, on by default). Only sends still waiting are stopped: email goes out as soon as the runner picks... |
| [`createProductWhatsNew`](../packages/product/src/app.ts) | function | Experimental | "What's new", once per app version plus over-the-air update. A first install remembers the key and shows nothing; a new key fetches its notes then (never bundled) and opens when there are any. No notes for it: remembered, nothing shown. ... |
| [`createVoteQueue`](../packages/product/src/app.ts) | function | Experimental | The offline vote queue, modelled on chat's outbox: a vote shows at once, is saved, and is sent when there is a connection (`flush()`: on start, after each vote and on reconnect). Votes on one idea collapse into the last one, and a toggle... |
| [`demand`](../packages/product/src/board.ts) | function | Experimental | Demand for a feature: each open signal counts its importance (1 when unset) plus its votes. Closed signals don't count, so demand falls as asks are answered. |
| [`diffRelease`](../packages/product/src/release.ts) | function | Experimental | The features a release shipped: those that reached `live` or `beta` between the catalog before and after it. Features with `visibility: internal` are left out of release notes. |
| [`haptic`](../packages/product/src/native/haptics.ts) | function | — | Plays a haptic when the app gave expo-haptics; never throws, never rejects. |
| [`IdeaBoardScreen`](../packages/product/src/native/idea-board.tsx) | function | — | The idea board screen. Put `getInboxPageStackOptions({ headerTitle })` on its `<Stack.Screen>`. |
| [`isAppPath`](../packages/product/src/notifications.ts) | function | Experimental | _(no summary)_ |
| [`isPermanentVoteError`](../packages/product/src/app.ts) | function | Experimental | True for an error retrying won't fix: `permanent: true`, or an HTTP 4xx other than 408 and 429. @stability Experimental |
| [`memoryProductSource`](../packages/product/src/app.ts) | function | Experimental | A source in memory, for tests and demos: votes change its own copy. @stability Experimental |
| [`memorySignals`](../packages/product/src/model.ts) | function | Experimental | Signals held in memory, for tests and demos. @stability Experimental |
| [`memoryVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in memory (the default: queued votes last as long as the app runs). @stability Experimental |
| [`NOTIFY_BATCH`](../packages/product/src/notifications.ts) | const | Experimental | The most recipients genesis-notifications' `notify()` takes in one call. @stability Experimental |
| [`notifyShipped`](../packages/product/src/notifications.ts) | function | Experimental | One `product.idea_shipped` notification to everyone who asked for a feature, keyed `shipped:<release>:<feature>`. `notify` is genesis-notifications' `notify` with the client and registry bound. It is called once per 1,000 recipients (not... |
| [`PRODUCT_COPY`](../packages/product/src/native/copy.ts) | const | — | Every word the product screens show. Pass a part of it as `copy` to change or translate it. |
| [`PRODUCT_SHIPPED_TYPE`](../packages/product/src/notifications.ts) | const | Experimental | The notification type of "an idea you asked for shipped". @stability Experimental |
| [`PRODUCT_UPDATES_CATEGORY`](../packages/product/src/notifications.ts) | const | Experimental | Its category: what a person turns on or off in their preferences. @stability Experimental |
| [`productNotifications`](../packages/product/src/notifications.ts) | const | Experimental | The fragment for the app's `defineNotifications({ categories, types })`. Not critical and not transactional, so preferences, quiet hours and the unsubscribe link all apply. In the feed and by email by default; push is offered as an opt-i... |
| [`renderBoard`](../packages/product/src/board.ts) | function | Experimental | The board as GitHub-flavoured markdown: one table per horizon, the top ideas by demand, and the triage inbox. |
| [`renderRelease`](../packages/product/src/release.ts) | function | Experimental | Draft release notes for people, not developers: each feature's tagline (or its summary), grouped into shipped and in beta, with the asks it answers. A person edits and publishes them. |
| [`roadmapFromBoard`](../packages/product/src/app.ts) | function | Experimental | The board's Now / Next / Later columns as roadmap rows. Only features everyone may see are kept (`public`, `customer`, or no visibility): `internal` and every `client:<name>` feature are left out, except that `client`'s own when it is gi... |
| [`RoadmapScreen`](../packages/product/src/native/roadmap.tsx) | function | — | The roadmap screen: the segmented control above the rows, and the open item's sheet. |
| [`shippedKey`](../packages/product/src/notifications.ts) | function | Experimental | `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental |
| [`SIGNAL_KINDS`](../packages/product/src/model.ts) | const | Experimental | What someone sent: an idea, a piece of feedback or a bug. @stability Experimental |
| [`storageVoteQueueStore`](../packages/product/src/app.ts) | function | Experimental | A queue store in AsyncStorage, under one key. A value that can't be read counts as empty. @stability Experimental |
| [`useIdeaBoard`](../packages/product/src/native/idea-board.tsx) | function | — | The idea board as InboxPage props: `<InboxPage {...useIdeaBoard({ source })} />`. |
| [`useProductWhatsNew`](../packages/product/src/native/whats-new.tsx) | function | — | The store's state; loads it once on mount. |
| [`useRoadmap`](../packages/product/src/native/roadmap.tsx) | function | — | _(no summary)_ |
| [`VoteRefusedError`](../packages/product/src/app.ts) | class | Experimental | A vote the source refused for good: the queue drops it and the board shows the source's state again. @stability Experimental |
| [`whatsNewKey`](../packages/product/src/app.ts) | function | Experimental | What "what's new" is shown once for: the store version plus the over-the-air update running (`"1.4.0+3f2a…"`), or `"1.4.0+embedded"` for the code that shipped in the binary. `null` without a version: it never shows. |

### Types (42)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Board };
export type { BoardItem };
export type { CatalogFeature };
export type { HapticsLike };
export type { IdeaBoard };
export type { IdeaBoardOptions };
export type { Importance };
export type { MemoryProductSeed };
export type { NotifyShippedOptions };
export type { ProductCancelInput };
export type { ProductCopy };
export type { ProductCopyInput };
export type { ProductHapticEvent };
export type { ProductIdea };
export type { ProductIdeaStatus };
export type { ProductNotifyInput };
export type { ProductRecipient };
export type { ProductSource };
export type { ProductStorageLike };
export type { ProductWhatsNew };
export type { ProductWhatsNewOptions };
export type { ProductWhatsNewState };
export type { QueuedVote };
export type { ReleaseChange };
export type { RenderBoardOptions };
export type { RenderReleaseOptions };
export type { Roadmap };
export type { RoadmapFromBoardOptions };
export type { RoadmapItem };
export type { RoadmapOptions };
export type { ShippedData };
export type { ShippedFeature };
export type { Signal };
export type { SignalKind };
export type { SignalSource };
export type { VoteFlushResult };
export type { VoteQueue };
export type { VoteQueueOptions };
export type { VoteQueueStore };
export type { WhatsNewApplicationLike };
export type { WhatsNewNote };
export type { WhatsNewUpdatesLike };
```

---

## @marktiderman/genesis-sites

Sites and landing pages for Genesis apps: a section registry with zod 4 schemas, 20 server-rendered sections on Genesis UI (timetable, team, blog, map, timeline and downloads among them), a blog with drafts, published posts, RSS and Article JSON-LD, a guarded asset import (/import), a per-request renderer with no hydration, SEO (meta, sitemap, robots, JSON-LD, redirects), publish-time accessibility checks, one-click landing pages from a brand, a Supabase schema with draft, publish and rollback, and a visual editor on Puck (/editor) that published pages never load. Part of the Genesis framework.

**Barrel:** [`packages/sites/src/index.ts`](../packages/sites/src/index.ts)

### Other exports (121)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`absoluteUrl`](../packages/sites/src/core/seo.ts) | function | — | The absolute URL of a site path. |
| [`articleJsonLd`](../packages/sites/src/core/seo.ts) | function | — | `Article` JSON-LD for a blog post. |
| [`ASSET_TYPES`](../packages/sites/src/core/store.ts) | const | — | The file types a site asset may be, as the database checks them: images and PDF. Never SVG or HTML, which a browser runs as a page. |
| [`assetPath`](../packages/sites/src/core/store.ts) | function | — | The storage key for an upload: `sites/<siteId>/<id>-<name>` for an image, `sites/<siteId>/files/<id>-<name>` for a file to download (a PDF), so storage policies scope by site with `can_edit`. |
| [`BodyFontChoice`](../packages/sites/src/core/schemas.ts) | const | — | Fonts a site may choose for its body text: every choice but the display faces that have one weight. |
| [`brandDisplayName`](../packages/sites/src/core/theme.ts) | function | — | The brand's display name: the minimal brand's `name`, a canonical brand's `displayName` or `name`. |
| [`breadcrumbJsonLd`](../packages/sites/src/core/seo.ts) | function | — | The trail from the home page to `page`, through every ancestor path that is a page. |
| [`BUILT_IN_SECTION_TYPES`](../packages/sites/src/core/registry.ts) | const | — | The built-in section kinds, which a host replaces only with `{ replace: true }`. |
| [`checkAssetHosts`](../packages/sites/src/core/a11y.ts) | function | Beta | Images and files that load from somewhere other than the site itself or the store's asset origin: a warning, or an error when the site serves only its own (`images: "own"`), whose Content-Security-Policy would block them. |
| [`checkBlog`](../packages/sites/src/core/a11y.ts) | function | — | The blog's rules: one post page, not the home page, with a post-body section; a post list needs a post page. |
| [`checkContrast`](../packages/sites/src/core/a11y.ts) | function | — | Colour pairs below their minimum (1.4.3 text, 1.4.11 focus ring and primary borders and markers). |
| [`checkHtmlOutline`](../packages/sites/src/core/a11y.ts) | function | — | A rendered page's outline, from its HTML: one `h1`, no skipped heading level, every `<img>` with an `alt` attribute. For tests and for hosts that want to audit what was actually served. |
| [`checkPage`](../packages/sites/src/core/a11y.ts) | function | — | Issues on one page: its sections, limits and the h1. |
| [`checkPost`](../packages/sites/src/core/a11y.ts) | function | Beta | The checks a post passes before it is published: a slug, a title, alt text on its images, and a heading outline under the post's own title (the page's h1): no level 1 heading, none skipped, starting at 2. |
| [`checkRelease`](../packages/sites/src/core/a11y.ts) | function | Beta | Everything a publish checks, for a whole release. |
| [`checkSiteDoc`](../packages/sites/src/core/a11y.ts) | function | — | Issues with the site's own parts: header, footer, redirects. |
| [`contrastRatio`](../packages/sites/src/core/theme.ts) | function | — | WCAG contrast ratio (1–21) of two colours. |
| [`Copy`](../packages/sites/src/core/schemas.ts) | const | — | A paragraph of plain copy. |
| [`createMemorySiteStore`](../packages/sites/src/core/store.ts) | function | Beta | An in-memory `SiteStore`: the same rules as the database (compare-and-swap revisions, path checks, redirects on move, immutable releases), for tests, demos and local previews. Documents are copied in and out, so callers can't change stor... |
| [`DEFAULT_RESERVED_PATHS`](../packages/sites/src/core/urls.ts) | const | — | Paths a site never owns, because it shares its hostname with the host app: the app's API and server functions, its auth callbacks, and this package's own assets. A host passes its own list (or a predicate) to `handleSiteRequest` and `val... |
| [`defineSection`](../packages/sites/src/core/registry.ts) | function | Beta | Declare a section kind. Checks the definition (and every preset against its schema) and returns it frozen. It isn't registered until `registerSection`. |
| [`escapeXml`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`exampleBrands`](../packages/sites/src/core/examples.ts) | const | — | _(no summary)_ |
| [`FileRef`](../packages/sites/src/core/schemas.ts) | const | — | A downloadable file (a PDF timetable, a waiver): a site path (an upload under `sites/<site_id>/files/`) or an https URL. `bytes` and `mime` say what the visitor is about to download. |
| [`FONT_CHOICES`](../packages/design-system/src/fonts.ts) | const | — | The fonts a brand may choose. Every one but `system` is self-hosted. |
| [`FontChoice`](../packages/sites/src/core/schemas.ts) | const | — | Fonts a site may choose for its headings: genesis-design-system's `FONT_IDS` (see `FONT_CHOICES` for their stacks). |
| [`fontFileKey`](../packages/design-system/src/fonts.ts) | const | — | The key of one font file (`inter-700`): what the asset table and the renderer name it by. |
| [`formCacheTag`](../packages/sites/src/core/store.ts) | function | — | The cache tag of every page that embeds a form: purge it when the host changes that form. |
| [`getSection`](../packages/sites/src/core/registry.ts) | function | — | _(no summary)_ |
| [`hexToHslTriplet`](../packages/sites/src/core/theme.ts) | function | — | `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's variables hold. |
| [`Href`](../packages/sites/src/core/schemas.ts) | const | — | A link target: a site path, a fragment, or an http(s), mailto or tel URL. |
| [`Image`](../packages/sites/src/core/schemas.ts) | const | — | An image. `alt` describes it for someone who can't see it; an image that adds nothing (a texture) is `decorative: true` and gets an empty alt. The accessibility check refuses to publish an image with neither. |
| [`isConflict`](../packages/sites/src/core/store.ts) | const | — | _(no summary)_ |
| [`isExternalHref`](../packages/sites/src/core/urls.ts) | function | — | Is this an external (absolute) link, opened with `rel="noopener noreferrer"`? |
| [`isOwnUrl`](../packages/sites/src/core/a11y.ts) | function | Beta | Is this URL the site's own: a site path (`/photo.jpg`), or a URL on one of `origins` (the store's asset origin)? |
| [`isPlainEmail`](../packages/sites/src/core/forms.ts) | function | — | A plain email address (no display name, no `%` escapes, no header injection): what a `mailto` form may write to. |
| [`isPublishable`](../packages/sites/src/core/a11y.ts) | const | — | _(no summary)_ |
| [`isReservedPath`](../packages/sites/src/core/urls.ts) | function | — | Is `path` reserved: equal to a reserved prefix, or under it (`/api`, `/api/x`, not `/apiary`)? |
| [`isSafeHref`](../packages/sites/src/core/urls.ts) | function | — | Is this a link a site may render: a site path, a fragment, or an http(s), mailto or tel URL? |
| [`isSafeImageSrc`](../packages/sites/src/core/urls.ts) | function | — | Is this a URL an image may load from: a site path or an `https:` URL? |
| [`isSiteBrand`](../packages/sites/src/core/theme.ts) | function | — | _(no summary)_ |
| [`landingPage`](../packages/sites/src/core/templates.ts) | function | Beta | The one-click landing page: brand plus message, on one page. |
| [`LATIN_UNICODE_RANGE`](../packages/design-system/src/fonts.ts) | const | — | The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. |
| [`Line`](../packages/sites/src/core/schemas.ts) | const | — | A short line of copy (a heading, a label). |
| [`Link`](../packages/sites/src/core/schemas.ts) | const | — | A labelled link: a button, a menu entry, a footer link, an outbound booking link. |
| [`LinkEvent`](../packages/sites/src/core/schemas.ts) | const | — | An analytics event name for a link: `data-gs-event` on the page (default `cta` on buttons). |
| [`listSections`](../packages/sites/src/core/registry.ts) | function | — | _(no summary)_ |
| [`luminance`](../packages/sites/src/core/theme.ts) | function | — | WCAG relative luminance. |
| [`mailtoHref`](../packages/sites/src/core/forms.ts) | function | — | The `mailto:` link for a mailto form, or null when its address isn't a plain one. |
| [`matchRedirect`](../packages/sites/src/core/seo.ts) | function | — | The redirect for a request path, if any (exact match on the normalised path). |
| [`MAX_DOC_BYTES`](../packages/sites/src/core/schemas.ts) | const | — | The size limit of one stored document, as the database enforces it (512 KiB of JSON). |
| [`MAX_IMPORT_POSTS`](../packages/sites/src/core/posts.ts) | const | — | The most posts one `importPosts` call takes. |
| [`MAX_LIVE_POSTS`](../packages/sites/src/core/posts.ts) | const | — | The most posts a list reads (the newest first). |
| [`MAX_PAGE_PATH_LENGTH`](../packages/sites/src/core/urls.ts) | const | — | _(no summary)_ |
| [`MAX_URL_LENGTH`](../packages/sites/src/core/urls.ts) | const | — | The longest URL a site stores. |
| [`MenuItem`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`migrateNode`](../packages/sites/src/core/migrate.ts) | function | — | Bring one node up to its section's current version and check its props. |
| [`migratePage`](../packages/sites/src/core/migrate.ts) | function | — | Migrate every node of a page. Nodes that can't be shown stay in the document unchanged (an editor must not lose them) and are reported. |
| [`migrateSite`](../packages/sites/src/core/migrate.ts) | function | — | _(no summary)_ |
| [`mix`](../packages/sites/src/core/theme.ts) | function | — | Mix a colour toward white (`amount` > 0) or black (< 0), 0–1. |
| [`newSectionId`](../packages/sites/src/core/registry.ts) | function | — | A new section id: short, alphanumeric, unique enough within a page. |
| [`nodeFromPreset`](../packages/sites/src/core/registry.ts) | function | — | A section node from a preset: the editor's Add, and templates. |
| [`normalizeRequestPath`](../packages/sites/src/core/urls.ts) | function | — | The page path a request path asks for: decoded, lowercase, without a trailing slash. Returns null for a path that can't name a page (so the caller falls through to the host app). |
| [`onePageSite`](../packages/sites/src/core/templates.ts) | function | Beta | The smallest site, for seeding a brand that has none: a header, a hero, a call to action and a footer. `brand` is the minimal brand to store beside it (the host's `BrandSource` returns it). |
| [`opensInNewTab`](../packages/sites/src/core/schemas.ts) | const | — | Does this link open in a new tab? Only an http(s) link can. |
| [`organizationJsonLd`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`PAGE_PATH`](../packages/sites/src/core/urls.ts) | const | — | A page's path: `/`, or lowercase segments of letters, digits and hyphens (`/about`, `/services/repairs`). No trailing slash, no dots, at most 8 segments and 200 characters. The database checks the same pattern. |
| [`PageDoc`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`PageKind`](../packages/sites/src/core/schemas.ts) | const | — | What a page is: an ordinary `page`, a focused `landing` page, or the `post` page: the template every blog post renders in. A site has at most one post page; at its own path (`/blog`) it is the blog's index, and at `/blog/<slug>` it shows... |
| [`pageMeta`](../packages/sites/src/core/seo.ts) | function | — | Every meta value a page prints in its `<head>`. |
| [`PagePath`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`pagePathProblems`](../packages/sites/src/core/urls.ts) | function | — | Problems with a page path, empty when it is fine. |
| [`pageTitle`](../packages/sites/src/core/seo.ts) | function | — | The page's title with the site's template (`%s · Riverside Works`), so every tab and search result names the site. An SEO title written for the page (`seo.title`) is used as it is. |
| [`parseHex`](../packages/sites/src/core/theme.ts) | function | — | `#abc` / `#aabbcc` → [r, g, b] (0–255). Throws on anything else. |
| [`parseSnapshot`](../packages/sites/src/core/schemas.ts) | function | — | Read a stored snapshot page by page: a page that no longer parses (a schema this release tightened, a document written past the checks) is left out and reported, so one bad page doesn't take the whole site down. Null only when the site d... |
| [`PostAuthor`](../packages/sites/src/core/posts.ts) | const | — | _(no summary)_ |
| [`postDescription`](../packages/sites/src/core/seo.ts) | const | — | A post's description for a feed or a page with no excerpt: its first words. |
| [`PostDoc`](../packages/sites/src/core/posts.ts) | const | — | _(no summary)_ |
| [`postPath`](../packages/sites/src/core/seo.ts) | function | — | The URL of a post: `<post page path>/<slug>`. |
| [`PostSlug`](../packages/sites/src/core/posts.ts) | const | — | A post's slug: lowercase letters, digits and single hyphens (`september-testing`). |
| [`postSummary`](../packages/sites/src/core/posts.ts) | function | — | A published post as a list item. |
| [`PostSummarySchema`](../packages/sites/src/core/posts.ts) | const | — | A list item as a store returns it, checked: a stored row that skipped the checks is left out. |
| [`prepareImportPost`](../packages/sites/src/core/store.ts) | function | — | One post of an import, checked: its document parsed, its status (a draft when asked for, or when a check fails, with the reasons) and its date. Every store's `importPosts` runs it. |
| [`prepareRelease`](../packages/sites/src/core/store.ts) | function | Beta | The publish pipeline every store shares: migrate every node, freeze the drafts into a snapshot, and check it. Throws `PublishBlockedError` when a check fails. Pages come in the order they are listed. |
| [`PublishBlockedError`](../packages/sites/src/core/store.ts) | class | — | A publish the checks refused: `issues` lists why. |
| [`Redirect`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`redirectsAfterMove`](../packages/sites/src/core/seo.ts) | function | — | The redirects after a page moves from `from` to `to`: a permanent redirect from the old path, earlier redirects to the old path pointed straight at the new one (no chains), and any redirect away from the new path dropped (a page lives th... |
| [`registerBuiltInSection`](../packages/sites/src/core/registry.ts) | function | — | For `@marktiderman/genesis-sites/sections`: register a built-in unless one (or a replacement) is there. @internal |
| [`registerSection`](../packages/sites/src/core/registry.ts) | function | Beta | Register a section kind (from `defineSection`, or a plain definition, which is checked the same way). Re-registering a host kind replaces it, so hot reload works; a built-in kind's name throws unless `{ replace: true }`. |
| [`ReleasePage`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`ReleaseSnapshot`](../packages/sites/src/core/schemas.ts) | const | — | Everything a published site serves: the site document and every page, frozen at publish. |
| [`RichText`](../packages/sites/src/core/schemas.ts) | const | — | Rich text: the JSON genesis-ui's `RichTextEditor` (TipTap) produces. Only its outline is checked here; genesis-ui's `RichText` sanitizes it again when it renders, so a stored document can never carry raw HTML. |
| [`richTextPlain`](../packages/sites/src/core/posts.ts) | function | — | Plain text of a rich text document (for a feed's description when a post has no excerpt). |
| [`robotsTxt`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`rssXml`](../packages/sites/src/core/seo.ts) | function | — | The blog's RSS 2.0 feed: the newest posts, with their excerpts. |
| [`safeJsonForHtml`](../packages/sites/src/core/seo.ts) | function | — | JSON for a `<script type="application/ld+json">` (or any JSON inside HTML): `<`, `>`, `&` and the line separators are escaped as `\uXXXX`, so stored text can never close the script element or open a comment. |
| [`SECTION_CATEGORIES`](../packages/sites/src/core/registry.ts) | const | — | _(no summary)_ |
| [`SectionDefinitionError`](../packages/sites/src/core/registry.ts) | class | — | _(no summary)_ |
| [`SectionId`](../packages/sites/src/core/schemas.ts) | const | — | A section's id: stable, letters, digits, `-` and `_` (Shopify's rule). |
| [`sectionJsonSchema`](../packages/sites/src/core/registry.ts) | function | Beta | The JSON Schema of a section's props (`z.toJSONSchema`, input side), for the editor's fields and for validating AI output. Refinements (safe URLs) don't appear in JSON Schema; the zod schema still checks them on save. |
| [`sectionManifests`](../packages/sites/src/core/registry.ts) | function | Beta | Every registered section as editor data (no renderers): the editor's catalog. @stability Beta |
| [`SectionNode`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`SELF_HOSTED_FONTS`](../packages/design-system/src/fonts.ts) | const | — | Every self-hosted family, by its font choice id. |
| [`Seo`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`SeoDefaults`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`siteCacheTag`](../packages/sites/src/core/store.ts) | function | — | The cache tag every response of a site carries (`Vercel-Cache-Tag`). |
| [`SiteConflictError`](../packages/sites/src/core/store.ts) | class | — | Someone saved first; the store's current document is in the result of the save that raised this. |
| [`SiteDoc`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`sitemapXml`](../packages/sites/src/core/seo.ts) | function | — | sitemap.xml: every indexable page (not `noindex`, not one whose canonical points elsewhere). |
| [`siteTheme`](../packages/sites/src/core/theme.ts) | function | Beta | The site's theme: variables for light and dark, the fonts to load, the pairs the contrast check reads, and a hash of what it was made from. |
| [`stableHash`](../packages/sites/src/core/theme.ts) | function | — | FNV-1a, 32 bits twice: a short, stable hash for cache keys and release records (not for security). |
| [`starterSite`](../packages/sites/src/core/templates.ts) | function | Beta | A three-page starter site: home, about and contact, with the menu, a footer and redirects-ready paths. |
| [`Surface`](../packages/sites/src/core/schemas.ts) | const | — | The band a section sits on. |
| [`themeCss`](../packages/sites/src/core/theme.ts) | function | — | The site's `<style>` body: the light variables on `:root`, the dark ones by scheme. |
| [`toCanonicalBrand`](../packages/sites/src/core/theme.ts) | function | — | The minimal brand as a design-system brand (Genesis's neutrals and status colours, the brand's primary and fonts). |
| [`TokenOverrides`](../packages/sites/src/core/schemas.ts) | const | — | A site's theme choices on top of the brand: token choices only, never raw CSS, so a site stays inside the design system. |
| [`unregisterSection`](../packages/sites/src/core/registry.ts) | function | — | Remove a host section kind (tests, hot reload). Built-ins can't be removed, only replaced. |
| [`validatePagePath`](../packages/sites/src/core/urls.ts) | function | — | Throws when the path can't be a page's. |
| [`validatePostSlug`](../packages/sites/src/core/posts.ts) | function | — | Validate a post slug, throwing with a readable message. |
| [`websiteJsonLd`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`withCacheInvalidation`](../packages/sites/src/core/store.ts) | function | Beta | A store that purges the site's cached pages after every publish and rollback: `invalidate` gets `["site:<id>"]` and what happened. |

### Types (67)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnySectionDefinition };
export type { Asset };
export type { AssetHostOptions };
export type { AssetMeta };
export type { BrandInput };
export type { BrandSource };
export type { BuiltInSectionType };
export type { CheckReleaseOptions };
export type { FontInfo };
export type { FormsResolver };
export type { FormsResolverContext };
export type { ImportPost };
export type { ImportPostsResult };
export type { InvalidationInfo };
export type { LivePost };
export type { MemorySiteStore };
export type { MemoryStoreOptions };
export type { MigratedNode };
export type { MigratedPage };
export type { MigrationIssue };
export type { NewPage };
export type { NewSite };
export type { OnePageSiteInput };
export type { PageDraft };
export type { PageMeta };
export type { PageMetaInput };
export type { PostDocInput };
export type { PostDraft };
export type { PostMeta };
export type { PostStatus };
export type { PostSummary };
export type { PostsContext };
export type { PreparedRelease };
export type { PublishOptions };
export type { RegisterSectionOptions };
export type { Release };
export type { ReleaseMeta };
export type { RenderContext };
export type { RenderMedia };
export type { ReservedPaths };
export type { ResolvedForm };
export type { RobotsInput };
export type { RssInput };
export type { SavePostInput };
export type { SavePostResult };
export type { SaveResult };
export type { SectionCategory };
export type { SectionDefinition };
export type { SectionManifest };
export type { SectionPlacement };
export type { SectionPreset };
export type { SectionRenderProps };
export type { SectionVariant };
export type { SelfHostedFont };
export type { SeoPageMeta };
export type { SiteBrand };
export type { SiteDocInput };
export type { SiteDraft };
export type { SiteIssue };
export type { SiteStore };
export type { SiteTheme };
export type { SiteThemeOptions };
export type { SitemapInput };
export type { TemplateInput };
export type { TemplateMessage };
export type { TemplateResult };
export type { ThemePair };
```

---

## @marktiderman/genesis-sites/core

**Barrel:** [`packages/sites/src/index.ts`](../packages/sites/src/index.ts)

### Other exports (121)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`absoluteUrl`](../packages/sites/src/core/seo.ts) | function | — | The absolute URL of a site path. |
| [`articleJsonLd`](../packages/sites/src/core/seo.ts) | function | — | `Article` JSON-LD for a blog post. |
| [`ASSET_TYPES`](../packages/sites/src/core/store.ts) | const | — | The file types a site asset may be, as the database checks them: images and PDF. Never SVG or HTML, which a browser runs as a page. |
| [`assetPath`](../packages/sites/src/core/store.ts) | function | — | The storage key for an upload: `sites/<siteId>/<id>-<name>` for an image, `sites/<siteId>/files/<id>-<name>` for a file to download (a PDF), so storage policies scope by site with `can_edit`. |
| [`BodyFontChoice`](../packages/sites/src/core/schemas.ts) | const | — | Fonts a site may choose for its body text: every choice but the display faces that have one weight. |
| [`brandDisplayName`](../packages/sites/src/core/theme.ts) | function | — | The brand's display name: the minimal brand's `name`, a canonical brand's `displayName` or `name`. |
| [`breadcrumbJsonLd`](../packages/sites/src/core/seo.ts) | function | — | The trail from the home page to `page`, through every ancestor path that is a page. |
| [`BUILT_IN_SECTION_TYPES`](../packages/sites/src/core/registry.ts) | const | — | The built-in section kinds, which a host replaces only with `{ replace: true }`. |
| [`checkAssetHosts`](../packages/sites/src/core/a11y.ts) | function | Beta | Images and files that load from somewhere other than the site itself or the store's asset origin: a warning, or an error when the site serves only its own (`images: "own"`), whose Content-Security-Policy would block them. |
| [`checkBlog`](../packages/sites/src/core/a11y.ts) | function | — | The blog's rules: one post page, not the home page, with a post-body section; a post list needs a post page. |
| [`checkContrast`](../packages/sites/src/core/a11y.ts) | function | — | Colour pairs below their minimum (1.4.3 text, 1.4.11 focus ring and primary borders and markers). |
| [`checkHtmlOutline`](../packages/sites/src/core/a11y.ts) | function | — | A rendered page's outline, from its HTML: one `h1`, no skipped heading level, every `<img>` with an `alt` attribute. For tests and for hosts that want to audit what was actually served. |
| [`checkPage`](../packages/sites/src/core/a11y.ts) | function | — | Issues on one page: its sections, limits and the h1. |
| [`checkPost`](../packages/sites/src/core/a11y.ts) | function | Beta | The checks a post passes before it is published: a slug, a title, alt text on its images, and a heading outline under the post's own title (the page's h1): no level 1 heading, none skipped, starting at 2. |
| [`checkRelease`](../packages/sites/src/core/a11y.ts) | function | Beta | Everything a publish checks, for a whole release. |
| [`checkSiteDoc`](../packages/sites/src/core/a11y.ts) | function | — | Issues with the site's own parts: header, footer, redirects. |
| [`contrastRatio`](../packages/sites/src/core/theme.ts) | function | — | WCAG contrast ratio (1–21) of two colours. |
| [`Copy`](../packages/sites/src/core/schemas.ts) | const | — | A paragraph of plain copy. |
| [`createMemorySiteStore`](../packages/sites/src/core/store.ts) | function | Beta | An in-memory `SiteStore`: the same rules as the database (compare-and-swap revisions, path checks, redirects on move, immutable releases), for tests, demos and local previews. Documents are copied in and out, so callers can't change stor... |
| [`DEFAULT_RESERVED_PATHS`](../packages/sites/src/core/urls.ts) | const | — | Paths a site never owns, because it shares its hostname with the host app: the app's API and server functions, its auth callbacks, and this package's own assets. A host passes its own list (or a predicate) to `handleSiteRequest` and `val... |
| [`defineSection`](../packages/sites/src/core/registry.ts) | function | Beta | Declare a section kind. Checks the definition (and every preset against its schema) and returns it frozen. It isn't registered until `registerSection`. |
| [`escapeXml`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`exampleBrands`](../packages/sites/src/core/examples.ts) | const | — | _(no summary)_ |
| [`FileRef`](../packages/sites/src/core/schemas.ts) | const | — | A downloadable file (a PDF timetable, a waiver): a site path (an upload under `sites/<site_id>/files/`) or an https URL. `bytes` and `mime` say what the visitor is about to download. |
| [`FONT_CHOICES`](../packages/design-system/src/fonts.ts) | const | — | The fonts a brand may choose. Every one but `system` is self-hosted. |
| [`FontChoice`](../packages/sites/src/core/schemas.ts) | const | — | Fonts a site may choose for its headings: genesis-design-system's `FONT_IDS` (see `FONT_CHOICES` for their stacks). |
| [`fontFileKey`](../packages/design-system/src/fonts.ts) | const | — | The key of one font file (`inter-700`): what the asset table and the renderer name it by. |
| [`formCacheTag`](../packages/sites/src/core/store.ts) | function | — | The cache tag of every page that embeds a form: purge it when the host changes that form. |
| [`getSection`](../packages/sites/src/core/registry.ts) | function | — | _(no summary)_ |
| [`hexToHslTriplet`](../packages/sites/src/core/theme.ts) | function | — | `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's variables hold. |
| [`Href`](../packages/sites/src/core/schemas.ts) | const | — | A link target: a site path, a fragment, or an http(s), mailto or tel URL. |
| [`Image`](../packages/sites/src/core/schemas.ts) | const | — | An image. `alt` describes it for someone who can't see it; an image that adds nothing (a texture) is `decorative: true` and gets an empty alt. The accessibility check refuses to publish an image with neither. |
| [`isConflict`](../packages/sites/src/core/store.ts) | const | — | _(no summary)_ |
| [`isExternalHref`](../packages/sites/src/core/urls.ts) | function | — | Is this an external (absolute) link, opened with `rel="noopener noreferrer"`? |
| [`isOwnUrl`](../packages/sites/src/core/a11y.ts) | function | Beta | Is this URL the site's own: a site path (`/photo.jpg`), or a URL on one of `origins` (the store's asset origin)? |
| [`isPlainEmail`](../packages/sites/src/core/forms.ts) | function | — | A plain email address (no display name, no `%` escapes, no header injection): what a `mailto` form may write to. |
| [`isPublishable`](../packages/sites/src/core/a11y.ts) | const | — | _(no summary)_ |
| [`isReservedPath`](../packages/sites/src/core/urls.ts) | function | — | Is `path` reserved: equal to a reserved prefix, or under it (`/api`, `/api/x`, not `/apiary`)? |
| [`isSafeHref`](../packages/sites/src/core/urls.ts) | function | — | Is this a link a site may render: a site path, a fragment, or an http(s), mailto or tel URL? |
| [`isSafeImageSrc`](../packages/sites/src/core/urls.ts) | function | — | Is this a URL an image may load from: a site path or an `https:` URL? |
| [`isSiteBrand`](../packages/sites/src/core/theme.ts) | function | — | _(no summary)_ |
| [`landingPage`](../packages/sites/src/core/templates.ts) | function | Beta | The one-click landing page: brand plus message, on one page. |
| [`LATIN_UNICODE_RANGE`](../packages/design-system/src/fonts.ts) | const | — | The latin subset's `unicode-range`, so a page in another script falls back to the next font in the stack. |
| [`Line`](../packages/sites/src/core/schemas.ts) | const | — | A short line of copy (a heading, a label). |
| [`Link`](../packages/sites/src/core/schemas.ts) | const | — | A labelled link: a button, a menu entry, a footer link, an outbound booking link. |
| [`LinkEvent`](../packages/sites/src/core/schemas.ts) | const | — | An analytics event name for a link: `data-gs-event` on the page (default `cta` on buttons). |
| [`listSections`](../packages/sites/src/core/registry.ts) | function | — | _(no summary)_ |
| [`luminance`](../packages/sites/src/core/theme.ts) | function | — | WCAG relative luminance. |
| [`mailtoHref`](../packages/sites/src/core/forms.ts) | function | — | The `mailto:` link for a mailto form, or null when its address isn't a plain one. |
| [`matchRedirect`](../packages/sites/src/core/seo.ts) | function | — | The redirect for a request path, if any (exact match on the normalised path). |
| [`MAX_DOC_BYTES`](../packages/sites/src/core/schemas.ts) | const | — | The size limit of one stored document, as the database enforces it (512 KiB of JSON). |
| [`MAX_IMPORT_POSTS`](../packages/sites/src/core/posts.ts) | const | — | The most posts one `importPosts` call takes. |
| [`MAX_LIVE_POSTS`](../packages/sites/src/core/posts.ts) | const | — | The most posts a list reads (the newest first). |
| [`MAX_PAGE_PATH_LENGTH`](../packages/sites/src/core/urls.ts) | const | — | _(no summary)_ |
| [`MAX_URL_LENGTH`](../packages/sites/src/core/urls.ts) | const | — | The longest URL a site stores. |
| [`MenuItem`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`migrateNode`](../packages/sites/src/core/migrate.ts) | function | — | Bring one node up to its section's current version and check its props. |
| [`migratePage`](../packages/sites/src/core/migrate.ts) | function | — | Migrate every node of a page. Nodes that can't be shown stay in the document unchanged (an editor must not lose them) and are reported. |
| [`migrateSite`](../packages/sites/src/core/migrate.ts) | function | — | _(no summary)_ |
| [`mix`](../packages/sites/src/core/theme.ts) | function | — | Mix a colour toward white (`amount` > 0) or black (< 0), 0–1. |
| [`newSectionId`](../packages/sites/src/core/registry.ts) | function | — | A new section id: short, alphanumeric, unique enough within a page. |
| [`nodeFromPreset`](../packages/sites/src/core/registry.ts) | function | — | A section node from a preset: the editor's Add, and templates. |
| [`normalizeRequestPath`](../packages/sites/src/core/urls.ts) | function | — | The page path a request path asks for: decoded, lowercase, without a trailing slash. Returns null for a path that can't name a page (so the caller falls through to the host app). |
| [`onePageSite`](../packages/sites/src/core/templates.ts) | function | Beta | The smallest site, for seeding a brand that has none: a header, a hero, a call to action and a footer. `brand` is the minimal brand to store beside it (the host's `BrandSource` returns it). |
| [`opensInNewTab`](../packages/sites/src/core/schemas.ts) | const | — | Does this link open in a new tab? Only an http(s) link can. |
| [`organizationJsonLd`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`PAGE_PATH`](../packages/sites/src/core/urls.ts) | const | — | A page's path: `/`, or lowercase segments of letters, digits and hyphens (`/about`, `/services/repairs`). No trailing slash, no dots, at most 8 segments and 200 characters. The database checks the same pattern. |
| [`PageDoc`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`PageKind`](../packages/sites/src/core/schemas.ts) | const | — | What a page is: an ordinary `page`, a focused `landing` page, or the `post` page: the template every blog post renders in. A site has at most one post page; at its own path (`/blog`) it is the blog's index, and at `/blog/<slug>` it shows... |
| [`pageMeta`](../packages/sites/src/core/seo.ts) | function | — | Every meta value a page prints in its `<head>`. |
| [`PagePath`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`pagePathProblems`](../packages/sites/src/core/urls.ts) | function | — | Problems with a page path, empty when it is fine. |
| [`pageTitle`](../packages/sites/src/core/seo.ts) | function | — | The page's title with the site's template (`%s · Riverside Works`), so every tab and search result names the site. An SEO title written for the page (`seo.title`) is used as it is. |
| [`parseHex`](../packages/sites/src/core/theme.ts) | function | — | `#abc` / `#aabbcc` → [r, g, b] (0–255). Throws on anything else. |
| [`parseSnapshot`](../packages/sites/src/core/schemas.ts) | function | — | Read a stored snapshot page by page: a page that no longer parses (a schema this release tightened, a document written past the checks) is left out and reported, so one bad page doesn't take the whole site down. Null only when the site d... |
| [`PostAuthor`](../packages/sites/src/core/posts.ts) | const | — | _(no summary)_ |
| [`postDescription`](../packages/sites/src/core/seo.ts) | const | — | A post's description for a feed or a page with no excerpt: its first words. |
| [`PostDoc`](../packages/sites/src/core/posts.ts) | const | — | _(no summary)_ |
| [`postPath`](../packages/sites/src/core/seo.ts) | function | — | The URL of a post: `<post page path>/<slug>`. |
| [`PostSlug`](../packages/sites/src/core/posts.ts) | const | — | A post's slug: lowercase letters, digits and single hyphens (`september-testing`). |
| [`postSummary`](../packages/sites/src/core/posts.ts) | function | — | A published post as a list item. |
| [`PostSummarySchema`](../packages/sites/src/core/posts.ts) | const | — | A list item as a store returns it, checked: a stored row that skipped the checks is left out. |
| [`prepareImportPost`](../packages/sites/src/core/store.ts) | function | — | One post of an import, checked: its document parsed, its status (a draft when asked for, or when a check fails, with the reasons) and its date. Every store's `importPosts` runs it. |
| [`prepareRelease`](../packages/sites/src/core/store.ts) | function | Beta | The publish pipeline every store shares: migrate every node, freeze the drafts into a snapshot, and check it. Throws `PublishBlockedError` when a check fails. Pages come in the order they are listed. |
| [`PublishBlockedError`](../packages/sites/src/core/store.ts) | class | — | A publish the checks refused: `issues` lists why. |
| [`Redirect`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`redirectsAfterMove`](../packages/sites/src/core/seo.ts) | function | — | The redirects after a page moves from `from` to `to`: a permanent redirect from the old path, earlier redirects to the old path pointed straight at the new one (no chains), and any redirect away from the new path dropped (a page lives th... |
| [`registerBuiltInSection`](../packages/sites/src/core/registry.ts) | function | — | For `@marktiderman/genesis-sites/sections`: register a built-in unless one (or a replacement) is there. @internal |
| [`registerSection`](../packages/sites/src/core/registry.ts) | function | Beta | Register a section kind (from `defineSection`, or a plain definition, which is checked the same way). Re-registering a host kind replaces it, so hot reload works; a built-in kind's name throws unless `{ replace: true }`. |
| [`ReleasePage`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`ReleaseSnapshot`](../packages/sites/src/core/schemas.ts) | const | — | Everything a published site serves: the site document and every page, frozen at publish. |
| [`RichText`](../packages/sites/src/core/schemas.ts) | const | — | Rich text: the JSON genesis-ui's `RichTextEditor` (TipTap) produces. Only its outline is checked here; genesis-ui's `RichText` sanitizes it again when it renders, so a stored document can never carry raw HTML. |
| [`richTextPlain`](../packages/sites/src/core/posts.ts) | function | — | Plain text of a rich text document (for a feed's description when a post has no excerpt). |
| [`robotsTxt`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`rssXml`](../packages/sites/src/core/seo.ts) | function | — | The blog's RSS 2.0 feed: the newest posts, with their excerpts. |
| [`safeJsonForHtml`](../packages/sites/src/core/seo.ts) | function | — | JSON for a `<script type="application/ld+json">` (or any JSON inside HTML): `<`, `>`, `&` and the line separators are escaped as `\uXXXX`, so stored text can never close the script element or open a comment. |
| [`SECTION_CATEGORIES`](../packages/sites/src/core/registry.ts) | const | — | _(no summary)_ |
| [`SectionDefinitionError`](../packages/sites/src/core/registry.ts) | class | — | _(no summary)_ |
| [`SectionId`](../packages/sites/src/core/schemas.ts) | const | — | A section's id: stable, letters, digits, `-` and `_` (Shopify's rule). |
| [`sectionJsonSchema`](../packages/sites/src/core/registry.ts) | function | Beta | The JSON Schema of a section's props (`z.toJSONSchema`, input side), for the editor's fields and for validating AI output. Refinements (safe URLs) don't appear in JSON Schema; the zod schema still checks them on save. |
| [`sectionManifests`](../packages/sites/src/core/registry.ts) | function | Beta | Every registered section as editor data (no renderers): the editor's catalog. @stability Beta |
| [`SectionNode`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`SELF_HOSTED_FONTS`](../packages/design-system/src/fonts.ts) | const | — | Every self-hosted family, by its font choice id. |
| [`Seo`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`SeoDefaults`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`siteCacheTag`](../packages/sites/src/core/store.ts) | function | — | The cache tag every response of a site carries (`Vercel-Cache-Tag`). |
| [`SiteConflictError`](../packages/sites/src/core/store.ts) | class | — | Someone saved first; the store's current document is in the result of the save that raised this. |
| [`SiteDoc`](../packages/sites/src/core/schemas.ts) | const | — | _(no summary)_ |
| [`sitemapXml`](../packages/sites/src/core/seo.ts) | function | — | sitemap.xml: every indexable page (not `noindex`, not one whose canonical points elsewhere). |
| [`siteTheme`](../packages/sites/src/core/theme.ts) | function | Beta | The site's theme: variables for light and dark, the fonts to load, the pairs the contrast check reads, and a hash of what it was made from. |
| [`stableHash`](../packages/sites/src/core/theme.ts) | function | — | FNV-1a, 32 bits twice: a short, stable hash for cache keys and release records (not for security). |
| [`starterSite`](../packages/sites/src/core/templates.ts) | function | Beta | A three-page starter site: home, about and contact, with the menu, a footer and redirects-ready paths. |
| [`Surface`](../packages/sites/src/core/schemas.ts) | const | — | The band a section sits on. |
| [`themeCss`](../packages/sites/src/core/theme.ts) | function | — | The site's `<style>` body: the light variables on `:root`, the dark ones by scheme. |
| [`toCanonicalBrand`](../packages/sites/src/core/theme.ts) | function | — | The minimal brand as a design-system brand (Genesis's neutrals and status colours, the brand's primary and fonts). |
| [`TokenOverrides`](../packages/sites/src/core/schemas.ts) | const | — | A site's theme choices on top of the brand: token choices only, never raw CSS, so a site stays inside the design system. |
| [`unregisterSection`](../packages/sites/src/core/registry.ts) | function | — | Remove a host section kind (tests, hot reload). Built-ins can't be removed, only replaced. |
| [`validatePagePath`](../packages/sites/src/core/urls.ts) | function | — | Throws when the path can't be a page's. |
| [`validatePostSlug`](../packages/sites/src/core/posts.ts) | function | — | Validate a post slug, throwing with a readable message. |
| [`websiteJsonLd`](../packages/sites/src/core/seo.ts) | function | — | _(no summary)_ |
| [`withCacheInvalidation`](../packages/sites/src/core/store.ts) | function | Beta | A store that purges the site's cached pages after every publish and rollback: `invalidate` gets `["site:<id>"]` and what happened. |

### Types (67)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnySectionDefinition };
export type { Asset };
export type { AssetHostOptions };
export type { AssetMeta };
export type { BrandInput };
export type { BrandSource };
export type { BuiltInSectionType };
export type { CheckReleaseOptions };
export type { FontInfo };
export type { FormsResolver };
export type { FormsResolverContext };
export type { ImportPost };
export type { ImportPostsResult };
export type { InvalidationInfo };
export type { LivePost };
export type { MemorySiteStore };
export type { MemoryStoreOptions };
export type { MigratedNode };
export type { MigratedPage };
export type { MigrationIssue };
export type { NewPage };
export type { NewSite };
export type { OnePageSiteInput };
export type { PageDraft };
export type { PageMeta };
export type { PageMetaInput };
export type { PostDocInput };
export type { PostDraft };
export type { PostMeta };
export type { PostStatus };
export type { PostSummary };
export type { PostsContext };
export type { PreparedRelease };
export type { PublishOptions };
export type { RegisterSectionOptions };
export type { Release };
export type { ReleaseMeta };
export type { RenderContext };
export type { RenderMedia };
export type { ReservedPaths };
export type { ResolvedForm };
export type { RobotsInput };
export type { RssInput };
export type { SavePostInput };
export type { SavePostResult };
export type { SaveResult };
export type { SectionCategory };
export type { SectionDefinition };
export type { SectionManifest };
export type { SectionPlacement };
export type { SectionPreset };
export type { SectionRenderProps };
export type { SectionVariant };
export type { SelfHostedFont };
export type { SeoPageMeta };
export type { SiteBrand };
export type { SiteDocInput };
export type { SiteDraft };
export type { SiteIssue };
export type { SiteStore };
export type { SiteTheme };
export type { SiteThemeOptions };
export type { SitemapInput };
export type { TemplateInput };
export type { TemplateMessage };
export type { TemplateResult };
export type { ThemePair };
```

---

## @marktiderman/genesis-sites/sections

**Barrel:** [`packages/sites/src/sections/index.ts`](../packages/sites/src/sections/index.ts)

### Other exports (25)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`Anchor`](../packages/sites/src/sections/shared.tsx) | const | — | An in-page anchor (`#contact`): lowercase letters, digits and hyphens. |
| [`builtInSections`](../packages/sites/src/sections/index.ts) | const | — | The built-in sections, in the editor's order. |
| [`ButtonLink`](../packages/sites/src/sections/shared.tsx) | function | — | A link drawn as a button: at least 44px tall, with the focus ring. |
| [`CHIP_TONES`](../packages/sites/src/sections/schedule.tsx) | const | — | How a session type's chip is drawn, from the brand's own colours. |
| [`fileDescription`](../packages/sites/src/sections/shared.tsx) | function | — | "PDF, 1.2 MB": what a download is, said beside its link. |
| [`fileHref`](../packages/sites/src/sections/shared.tsx) | function | — | A file's href: checked again, under the base path when it is a site path. Null when it isn't safe. |
| [`formatPostDate`](../packages/sites/src/sections/blog-list.tsx) | function | — | A post's date as the page says it, in UTC so every visitor sees the same day. |
| [`formatTime`](../packages/sites/src/sections/schedule.tsx) | function | — | `06:15` as the page says it: `6:15 am` or `06:15`. |
| [`HiddenTitle`](../packages/sites/src/sections/shared.tsx) | function | — | A section with no visible title still needs a name: a visually hidden one. |
| [`ICONS`](../packages/sites/src/sections/shared.tsx) | const | — | _(no summary)_ |
| [`ItemTitle`](../packages/sites/src/sections/shared.tsx) | function | — | An item's title inside a section: one level below the section's. |
| [`linkAttrs`](../packages/sites/src/sections/shared.tsx) | function | — | A link's attributes: its checked href, and for an http(s) link, `rel` and `target`. An outbound link (`external`), or one that opens a new tab, gets `rel="noopener noreferrer"` and `data-gs-outbound` (for analytics); any other absolute l... |
| [`MAP_PROVIDERS`](../packages/sites/src/sections/map.tsx) | const | — | _(no summary)_ |
| [`mapEmbedUrl`](../packages/sites/src/sections/map.tsx) | function | — | The provider's embed URL for these props: built here, never typed by an editor. |
| [`mapPageUrl`](../packages/sites/src/sections/map.tsx) | function | — | The provider's own page for the place: the link that works without script. |
| [`resolveHref`](../packages/sites/src/sections/shared.tsx) | function | — | A stored link as it prints: checked again (a document that skipped the schema can't smuggle `javascript:` in), with the host's base path on site paths. An unsafe link renders as an inert `#` and is logged. |
| [`SectionBand`](../packages/sites/src/sections/shared.tsx) | function | — | The band a body section sits on, named by its title. |
| [`SectionIntro`](../packages/sites/src/sections/shared.tsx) | function | — | A section's heading block: an eyebrow, the title and a lead, centred or left. |
| [`SectionTitle`](../packages/sites/src/sections/shared.tsx) | function | — | The section's title, at the level the page gives it (h1 for the page's main heading). |
| [`SiteFormHeader`](../packages/sites/src/sections/form-header.tsx) | function | — | _(no summary)_ |
| [`siteFormSlots`](../packages/sites/src/sections/form-header.tsx) | const | — | _(no summary)_ |
| [`SiteImage`](../packages/sites/src/sections/shared.tsx) | function | — | An image with alt text (empty when decorative), its size to stop layout shift, a `srcset` through the host's image URL builder, the focal point as `object-position`, a phone crop as a `<picture>` source, and lazy loading except for the p... |
| [`TextLink`](../packages/sites/src/sections/shared.tsx) | function | — | A text link: underlined, at least 24px tall (WCAG 2.5.8). |
| [`titleId`](../packages/sites/src/sections/shared.tsx) | const | — | _(no summary)_ |
| [`WEEKDAYS`](../packages/sites/src/sections/schedule.tsx) | const | — | _(no summary)_ |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { IconName };
export type { MapProvider };
export type { ScheduleSession };
export type { Weekday };
```

---

## @marktiderman/genesis-sites/web

**Barrel:** [`packages/sites/src/web/index.ts`](../packages/sites/src/web/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SiteRenderer`](../packages/sites/src/web/document.tsx) | `SiteRendererProps` | Beta | The document for one page. |

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ASSET_SIZES`](../packages/sites/src/web/assets.generated.ts) | const | — | _(no summary)_ |
| [`ASSETS_PREFIX`](../packages/sites/src/web/handler.ts) | const | — | Where this package serves its own files, under the site's base path. Reserved for pages. |
| [`collectFormSlugs`](../packages/sites/src/web/document.tsx) | function | — | The form slugs a page uses, to resolve before rendering: well-formed slugs of visible form embeds in the page body. |
| [`FONT_FILES`](../packages/sites/src/web/assets.generated.ts) | const | — | Each self-hosted font file's name under the assets prefix, by its key (`inter-700`). |
| [`fontFaces`](../packages/sites/src/web/document.tsx) | function | Beta | The `@font-face` rules for a theme's fonts, from files this package serves (`font-display: swap`, the latin subset), and the heading font's file to preload. A face with one weight is declared for every weight, so a bold heading draws it ... |
| [`handleSiteRequest`](../packages/sites/src/web/handler.ts) | function | Beta | Serve a site request, or return null when the request isn't the site's. |
| [`pageStyleText`](../packages/sites/src/web/document.tsx) | function | — | The page's one inline `<style>`: its font faces, then the theme's variables. The Content-Security-Policy pins its hash. |
| [`renderSitePageToString`](../packages/sites/src/web/handler.ts) | function | Beta | One page as an HTML string (tests, static export, the editor's preview frame). |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SiteAssets };
export type { SiteRequestOptions };
```

---

## @marktiderman/genesis-sites/supabase

**Barrel:** [`packages/sites/src/supabase/index.ts`](../packages/sites/src/supabase/index.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSupabaseSiteStore`](../packages/sites/src/supabase/index.ts) | function | Beta | A `SiteStore` on Supabase. |
| [`SITES_SCHEMA`](../packages/sites/src/supabase/index.ts) | const | — | _(no summary)_ |
| [`SiteStoreError`](../packages/sites/src/supabase/index.ts) | class | — | A database error with its SQLSTATE (`GS409` a conflict, `42501` not allowed). |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SupabaseSiteStoreOptions };
```

---

## @marktiderman/genesis-sites/blocks

**Barrel:** [`packages/sites/src/blocks.ts`](../packages/sites/src/blocks.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`sitesBlock`](../packages/sites/src/blocks.ts) | const | Beta | Sites and landing pages: the `genesis_sites` schema (sites, pages, releases, assets, blog posts), drafts, publish and rollback. The pages are served by `handleSiteRequest` from `@marktiderman/genesis-sites/web`, mounted by the app on its... |

---

## @marktiderman/genesis-sites/editor

**Barrel:** [`packages/sites/src/editor/index.ts`](../packages/sites/src/editor/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AssetPicker`](../packages/sites/src/editor/asset-picker.tsx) | `AssetPickerProps` | — | _(no summary)_ |
| [`SiteEditor`](../packages/sites/src/editor/site-editor.tsx) | `SiteEditorProps` | Beta | The visual editor. |

### Other exports (30)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AutosaveBlockedError`](../packages/sites/src/editor/autosave.ts) | class | — | Thrown by `flush` when the document can't be saved yet (a conflict, or a failed save). |
| [`Autosaver`](../packages/sites/src/editor/autosave.ts) | class | Beta | One document's autosave. |
| [`checkSite`](../packages/sites/src/editor/site-actions.ts) | function | Beta | Run the publish checks on the drafts as they are now (accessibility, contrast, placeholders, paths), without publishing: what the Publish panel lists, errors first. |
| [`countTypes`](../packages/sites/src/editor/data.ts) | function | — | How many sections of each type the page holds, in every zone (for the Add picker's limits). |
| [`createEditorConfig`](../packages/sites/src/editor/config.tsx) | function | Beta | The Puck config for one page kind, from the registry. |
| `createUsePuck` | value | — | _(no summary)_ |
| [`fromEditorData`](../packages/sites/src/editor/data.ts) | function | — | The editor's Puck data back as a page and the site's header and footer. |
| [`genesisOverrides`](../packages/sites/src/editor/overrides.tsx) | function | — | _(no summary)_ |
| [`h1SectionId`](../packages/sites/src/editor/data.ts) | function | — | The id of the section that gets the page's `h1`: the first visible one that provides it. |
| [`humanize`](../packages/sites/src/editor/fields.ts) | function | — | `primaryCta` → "Primary CTA"; `hideOn` → "Hide on". |
| [`IMAGE_TYPES`](../packages/sites/src/editor/asset-picker.tsx) | const | — | Raster images only: the database refuses SVG (it can carry script). |
| [`itemToNode`](../packages/sites/src/editor/data.ts) | function | — | A Puck item as a node. |
| [`movePageInList`](../packages/sites/src/editor/site-actions.ts) | function | — | Move one page up or down the list (through `reorderPages`, when the store has it). |
| [`NODE_KEYS`](../packages/sites/src/editor/data.ts) | const | — | Keys a section schema may not use: they carry the node's own fields. |
| [`nodeToItem`](../packages/sites/src/editor/data.ts) | function | — | A node as a Puck item, at its section's current version. Unknown types keep their props, so nothing is lost. |
| [`pageTemplates`](../packages/sites/src/editor/site-actions.ts) | function | Beta | The templates the Add page dialog offers: a blank page, the one-click landing page from the brand, and each page of the starter site (about, contact) after its home page. |
| [`pathProblems`](../packages/sites/src/editor/site-actions.ts) | function | — | Why a path can't be a page's here (empty when it can): the pattern, reserved paths, and pages already there. |
| [`placeholderSnapshot`](../packages/sites/src/editor/data.ts) | function | — | A hash of every placeholder node's props, to tell later whether it was edited. |
| [`presetComponentName`](../packages/sites/src/editor/data.ts) | const | — | The Puck component name of a section's preset: `hero` for the first, `hero__1` for the second (`_` never appears in a section type, and Puck builds ids from the name, so it must be id-safe). |
| [`pruneEmpty`](../packages/sites/src/editor/data.ts) | function | — | Empty optional values out: `""`, and objects left with nothing in them (an optional button whose fields were cleared). A required field that empties is then reported by the section's schema, never saved as `""`. Strings inside arrays sta... |
| [`publishSite`](../packages/sites/src/editor/site-actions.ts) | function | — | Publish after checking: a site with errors is refused before the store is asked. |
| [`renamePage`](../packages/sites/src/editor/site-actions.ts) | function | — | Move a page to a new address. The store writes a 301 from the old path (and rewrites older redirects, so there are no chains). Refuses the home page, reserved paths and a path another page has, before asking the store. |
| [`renderPreview`](../packages/sites/src/editor/preview.ts) | function | Beta | One page through `handleSiteRequest`, as an iframe-ready document. |
| [`safeSectionId`](../packages/sites/src/editor/data.ts) | function | — | A section id the schema accepts (1–64 letters, digits, `-`, `_`). Puck makes ids for dragged-in and duplicated sections from the component name and a UUID; the same id always maps to the same safe one, so saves stay stable. |
| [`sectionFields`](../packages/sites/src/editor/fields.ts) | function | Beta | Every field of a section: its layout (variant) first, then its props from the JSON Schema, then where it shows. |
| [`sectionTypeOf`](../packages/sites/src/editor/data.ts) | const | — | The section type a Puck component name stands for. |
| [`slugify`](../packages/sites/src/editor/site-actions.ts) | function | — | A page's title as a path segment: "Our services" → "/our-services". |
| [`toEditorData`](../packages/sites/src/editor/data.ts) | function | — | A page (and its site's header and footer) as the editor's Puck data. |
| [`uploadProblem`](../packages/sites/src/editor/asset-picker.tsx) | function | — | Why an upload can't be used (or null). |
| `usePuck` | value | — | _(no summary)_ |

### Types (22)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AutosaveState };
export type { AutosaveStatus };
export type { AutosaverOptions };
export type { CanvasMetadata };
export type { ComponentInfo };
export type { EditorAssets };
export type { EditorConfig };
export type { EditorConfigOptions };
export type { EditorData };
export type { EditorRootProps };
export type { EditorSiteStore };
export type { FromEditorResult };
export type { PageTemplate };
export type { PickedImage };
export type { PreviewInput };
export type { PreviewResult };
export type { PuckConfig };
export type { PuckData };
export type { PuckItem };
export type { PuckOverrides };
export type { SectionFields };
export type { SiteCheck };
```

---

## @marktiderman/genesis-sites/import

**Barrel:** [`packages/sites/src/import/index.ts`](../packages/sites/src/import/index.ts)

### Other exports (9)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BlockedAddressError`](../packages/media/src/server/guard.ts) | class | — | _(no summary)_ |
| [`guardedLookup`](../packages/media/src/server/guard.ts) | function | — | A DNS lookup for sockets (`http.request({ lookup })`) that refuses a name if any address it resolves to isn't public. It runs when the connection is made, so the address checked is the address connected to. |
| [`guardedTransport`](../packages/sites/src/import/index.ts) | const | — | The default transport: Node's http(s) with `guardedLookup` as the socket's DNS lookup and a fresh agent (no pooled sockets, no proxy from the environment), so the address connected to is the address checked. |
| [`importAssets`](../packages/sites/src/import/index.ts) | function | Beta | Re-host remote images and files on a site: fetch, check, store, and map each old URL to its new one. A URL that fails (refused by the guard, not an image or PDF, too big, a server error) is listed in `failed` and the rest go on. |
| [`isPublicAddress`](../packages/media/src/server/guard.ts) | function | — | May a server connect to this address on an editor's say-so? True only for a public unicast IPv4 or IPv6 address; false for anything else, including text that isn't an address. |
| [`MAX_IMPORT_URLS`](../packages/sites/src/import/index.ts) | const | — | The most URLs one `importAssets` call fetches (one at a time, each with its own time limit). |
| [`rewriteUrls`](../packages/sites/src/import/index.ts) | function | — | A copy of a document (a page, a post, a site) with every string that is exactly an old URL in `map` replaced by its new one: image sources, file links, rich text links. Nothing else changes. |
| [`sniff`](../packages/media/src/sniff.ts) | function | — | The file's type and size, or null when it isn't one of those types. |
| [`urlProblems`](../packages/media/src/server/guard.ts) | function | — | Problems with a URL a server is asked to fetch, before any connection: empty when it may try. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FetchedResponse };
export type { ImportAssetsOptions };
export type { ImportAssetsResult };
export type { ImportedAsset };
export type { Sniffed };
export type { Transport };
```

---

## @marktiderman/genesis-sites/templates

**Barrel:** [`packages/sites/src/templates/index.ts`](../packages/sites/src/templates/index.ts)

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`fitness`](../packages/sites/src/templates/fitness.ts) | const | — | A functional fitness gym's presets and sample data. |
| [`forgeDesignSystem`](../packages/sites/src/templates/design-systems.ts) | const | — | Forge: bold and athletic. Poster-sized headings (up to 112px, capitals in a condensed face), square corners and 2px edges, a cool ground, crisp photos with a little grain, and lively motion. For a strength gym or a training box. |
| [`industryDesignSystems`](../packages/sites/src/templates/design-systems.ts) | const | — | Every industry design system in this library. |
| [`industryTemplates`](../packages/sites/src/templates/index.ts) | const | — | Every template in this package, by id. |
| [`studioDesignSystem`](../packages/sites/src/templates/design-systems.ts) | const | — | Studio: calm. A warm ground, generous space, rounded corners, soft shadows, light headings that never shout (no display step bigger than an h1), warm photos and calm motion. For a yoga or Pilates studio. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { IndustryTemplate };
```

---

## @marktiderman/genesis-studio

Data Studio workspace UI — a table sidebar and a sheet grid with version-checked, audited cell edits, as the signed-in user. See packages/studio/README.md + docs/DATA-STUDIO.md.

**Barrel:** [`packages/studio/src/index.ts`](../packages/studio/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataStudio`](../packages/studio/src/DataStudio.tsx) | `DataStudioProps` | Experimental | The Data Studio: a sidebar of the tables this user may see, and a sheet of the selected one where a cell is edited in place. Every edit carries the version it was read at, so a stale edit is refused rather than saved over someone else's,... |

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSearchParamsRouter`](../packages/studio/src/router.ts) | function | — | An adapter over any router that exposes search params with a setter — React Router's `useSearchParams`, or Next.js's `useSearchParams` plus `router.replace`/`push`. |
| [`locationFromSearchParams`](../packages/studio/src/router.ts) | function | — | _(no summary)_ |
| [`searchParamsFromLocation`](../packages/studio/src/router.ts) | function | — | The studio's location as query parameters, keeping every parameter in `base` that isn't the studio's own. |
| [`useHistoryRouter`](../packages/studio/src/router.ts) | function | — | For an app with no router: keeps the studio's state in the current page's query string through the History API. |
| [`useMemoryRouter`](../packages/studio/src/router.ts) | function | — | A router held in memory, for tests and embedded previews. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { StudioActivity };
export type { StudioLocation };
export type { StudioNavigateOptions };
export type { StudioRouter };
export type { StudioSessionSource };
export type { StudioView };
```

---

## @marktiderman/genesis-studio-server

Data Studio server handler (Request → Response) that acts as the signed-in user over Postgres/Supabase. The only package that touches database credentials. See packages/studio-server/README.md.

**Barrel:** [`packages/studio-server/src/index.ts`](../packages/studio-server/src/index.ts)

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ADD_COMMENT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Comments on records. |
| [`AUDIT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Name of the audit function the handler calls. |
| [`backoffDelay`](../packages/studio-server/src/outbox.ts) | function | — | Delay before attempt `attempt + 1`, with jitter. |
| [`bearerToken`](../packages/studio-server/src/auth.ts) | function | — | Read a bearer token from the `Authorization` header. |
| [`byResource`](../packages/studio-server/src/authorize.ts) | function | — | The common case of `authorize`: a fixed allow-list by `schema.table`, for the users `who` admits. Anything not listed is denied, and a listed table without `update` is read-only. |
| [`COMMENTS_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | _(no summary)_ |
| [`createOutboxWorker`](../packages/studio-server/src/outbox.ts) | function | — | _(no summary)_ |
| [`createPostgresDatabase`](../packages/studio-server/src/db.ts) | function | — | A `StudioDatabase` over a Postgres connection string, or over a postgres.js pool you already have. A pool you pass in keeps its own type parsing, so dates arrive as JS Dates rather than Postgres's exact text; version tokens are unaffecte... |
| [`createStudioHandler`](../packages/studio-server/src/handler.ts) | function | — | Create the handler. It opens one transaction per request, switches to the signed-in user (`set local role` plus their verified claims), and only then reads the catalog or touches a row, so the database's own privileges and row rules alwa... |
| [`databaseDecides`](../packages/studio-server/src/authorize.ts) | function | — | Turn the studio on for every table, and let the database decide: each user reads, edits, adds and deletes exactly what their grants and row rules allow, sees history and comments on the rows they can see, and runs the row actions configu... |
| [`DEFAULT_SWITCH_ROLES`](../packages/studio-server/src/switch.ts) | const | — | The roles `switchToUser` switches to unless `allowRoles` says otherwise. |
| [`HISTORY_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Reads a record's audit history. |
| [`IdentitySwitchError`](../packages/studio-server/src/switch.ts) | class | — | Thrown when the transaction did not end up as the requested role. |
| [`jwtAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify a bearer JWT with a shared secret or a JWKS endpoint. Exactly one of `secret` and `jwksUrl` is required. |
| [`jwtVerifier`](../packages/studio-server/src/auth.ts) | function | — | `jwtAuth`'s check on a raw token, for a token that doesn't arrive as a bearer header, e.g. a socket handshake's `auth.token`. Same rules: the signature, `exp`, `sub`, the audience and the issuer. |
| [`OUTBOX_AUDIT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | The `outbox` sink's audit function: writes the log entry and queues it. |
| [`PermanentDeliveryError`](../packages/studio-server/src/outbox.ts) | class | — | Throw this from `deliver` when retrying can't help (the receiver rejected the payload). |
| [`STUDIO_PROTOCOL_VERSION`](../packages/studio-server/src/protocol.ts) | const | — | Bumped on any incompatible change; the handler rejects other versions. |
| [`studioSetupSql`](../packages/studio-server/src/setup-sql.ts) | function | — | SQL that installs the tamper-proof audit trail: |
| [`supabaseAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify Supabase Auth access tokens: JWKS from the project, issuer `<url>/auth/v1`, audience `authenticated`. |
| [`supabaseStudio`](../packages/studio-server/src/supabase.ts) | function | — | The studio handler for a Supabase project, on for every table in `public`: each user sees and edits what their row rules allow, every write is version-checked and audited (`genesis_studio.audit_log`, from `genesis studio init`'s migratio... |
| [`supabaseVerifier`](../packages/studio-server/src/auth.ts) | function | — | `supabaseAuth`'s check on a raw token, e.g. a socket handshake's. |
| [`switchToUser`](../packages/studio-server/src/switch.ts) | function | — | Switch the current transaction to `identity`, then check, in SQL, that it took: `current_user` must be `identity.role` and must not bypass RLS, or the transaction is aborted and it throws `IdentitySwitchError`. Call it first, inside a tr... |

### Types (48)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AuditSink };
export type { Authorize };
export type { AuthorizeContext };
export type { AuthorizeDecision };
export type { BulkResponse };
export type { ByResourceOptions };
export type { CommentResponse };
export type { CommentsResponse };
export type { CreateResponse };
export type { DatabaseDecidesOptions };
export type { DeadLetter };
export type { DeleteResponse };
export type { DescribeResponse };
export type { ErrorResponse };
export type { HistoryResponse };
export type { Identity };
export type { JwtAuthOptions };
export type { ListResponse };
export type { OutboxEntry };
export type { OutboxWorker };
export type { OutboxWorkerOptions };
export type { PostgresOptions };
export type { Query };
export type { ReadResponse };
export type { ResourceRule };
export type { ResourceSettings };
export type { ResourcesResponse };
export type { RowActionSettings };
export type { RunActionResponse };
export type { RunSummary };
export type { SetupSqlOptions };
export type { SqlRow };
export type { StudioAction };
export type { StudioAuth };
export type { StudioClaims };
export type { StudioContract };
export type { StudioDatabase };
export type { StudioHandler };
export type { StudioHandlerOptions };
export type { StudioRequest };
export type { StudioRow };
export type { StudioTokenVerifier };
export type { SupabaseAuthOptions };
export type { SupabaseStudioOptions };
export type { SwitchOptions };
export type { TaggedQuery };
export type { UndoResponse };
export type { UpdateResponse };
```

---

## @marktiderman/genesis-studio-server/client

**Barrel:** [`packages/studio-server/src/client.ts`](../packages/studio-server/src/client.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createStudioProvider`](../packages/studio-server/src/client.ts) | function | — | _(no summary)_ |
| [`createSupabaseStudioProvider`](../packages/studio-server/src/client.ts) | function | — | The studio's provider for an app that signs in with Supabase: it sends the current session's token with every request and tells `DataStudio` when the user changes, so embedding the studio is one line. |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { StudioProvider };
export type { StudioProviderOptions };
export type { StudioSession };
export type { SupabaseClientLike };
export type { SupabaseStudioProviderOptions };
```

---

## @marktiderman/genesis-studio-server/auth

**Barrel:** [`packages/studio-server/src/auth.ts`](../packages/studio-server/src/auth.ts)

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`bearerToken`](../packages/studio-server/src/auth.ts) | function | — | Read a bearer token from the `Authorization` header. |
| [`jwtAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify a bearer JWT with a shared secret or a JWKS endpoint. Exactly one of `secret` and `jwksUrl` is required. |
| [`jwtVerifier`](../packages/studio-server/src/auth.ts) | function | — | `jwtAuth`'s check on a raw token, for a token that doesn't arrive as a bearer header, e.g. a socket handshake's `auth.token`. Same rules: the signature, `exp`, `sub`, the audience and the issuer. |
| [`supabaseAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify Supabase Auth access tokens: JWKS from the project, issuer `<url>/auth/v1`, audience `authenticated`. |
| [`supabaseVerifier`](../packages/studio-server/src/auth.ts) | function | — | `supabaseAuth`'s check on a raw token, e.g. a socket handshake's. |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { JwtAuthOptions };
export type { StudioAuth };
export type { StudioClaims };
export type { StudioTokenVerifier };
export type { SupabaseAuthOptions };
```

---

## @marktiderman/genesis-supabase

Supabase for Genesis apps on web and React Native: a client with PKCE and safe defaults, Keychain session storage that survives interrupted writes, refresh only while the app is in front, native Sign in with Apple and Google, OAuth redirects, in-app account deletion, per-tenant feature switches (tenant_features), a background-job queue with schedules (genesis_jobs) on one outbox engine (/runner, shared with notifications and forms), the feature registry in the database for the feature gate (features, entitlements, flag values, feature_on), a native-to-web sign-in handoff (continue on the web, already signed in: web-handoff), and a result helper. Part of the Genesis framework.

**Barrel:** [`packages/supabase/src/index.ts`](../packages/supabase/src/index.ts)

### Other exports (18)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`accountBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The account block: sign-in, profile and in-app account deletion. Its screens are the app's (or genesis-ui-native's `AuthScreen`); this names its migrations and its data. |
| [`APPLE_REVOKE_FUNCTION`](../packages/supabase/src/apple-tokens.ts) | const | — | The Edge Function's default name, as shipped in `functions/genesis-apple-revoke`. |
| [`createGenesisSupabase`](../packages/supabase/src/index.ts) | function | Beta | A Supabase client with Genesis's defaults: PKCE sign-in (the code flow, not tokens in a redirect URL, with an S256 challenge: pass `crypto` on native), a persisted session that refreshes itself, and the session storage you pass. |
| [`deleteMyAccount`](../packages/supabase/src/index.ts) | function | Beta | In-app account deletion (App Store Review Guideline 5.1.1(v)), on web and native: calls the `delete_my_account` RPC (this package's `migrations/0001_genesis_account_deletion.sql`), which deletes the login and, through the app's `on delet... |
| [`eventsBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The product events block: the app's own events table and its tracking functions (ADR 0010). The client is `createEventTracker` from `/events`; on native, `createEventsSink` plugs it into the observability sinks. |
| [`featureGateState`](../packages/supabase/src/feature-registry.ts) | function | Beta | A tenant's switches, entitlements and flag values: `feature_gate_state`. Works with a signed-in person's client (for tenants they belong to; their own person entitlements are included) or the service key. Throws a `SupabaseQueryError` (`... |
| [`featureMirrorBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The feature registry block: the registry mirrored into the app's database on deploy, entitlements, per-tenant and platform flag values and SQL `feature_on()`, for the feature gate. Needs the tenant features block. |
| [`jobsBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The jobs block: a background-job queue and named schedules that call the app's job route. Server only; the route is `createJobsHandler` from `/jobs`. |
| [`must`](../packages/supabase/src/index.ts) | function | Beta | The data, or a thrown {@link SupabaseQueryError}: for query results where an error should fail the caller (a TanStack Query `queryFn`). The return type keeps `null` when the query can return no row (`.maybeSingle()`). |
| [`requestAppleRevocation`](../packages/supabase/src/apple-tokens.ts) | function | — | Asks the Edge Function to revoke the tokens of deleted accounts now, rather than at its next scheduled run. Never throws and never fails the caller: the account is already gone and the queue keeps the token until a run succeeds. |
| [`setTenantFeature`](../packages/supabase/src/tenant-features.ts) | function | Beta | Turn a feature on or off for a tenant: `set_tenant_feature`. Only the tenant's admins (the app's `private.genesis_tenant_admin` hook); throws a `SupabaseQueryError` otherwise (`42501`), for a blank reason (`22023`) or a malformed feature... |
| [`storeAppleToken`](../packages/supabase/src/apple-tokens.ts) | function | Beta | After a Sign in with Apple, sends the authorization code to the Edge Function, which exchanges it for Apple's refresh token and keeps it where only the server reads it, so deleting the account can revoke it. Call it with the session from... |
| [`SupabaseQueryError`](../packages/supabase/src/index.ts) | class | Beta | A failed query, with the database's `code` (`23505` unique violation, `42501` permission denied, `PGRST116` no rows…), `details` and `hint`, so a caller can tell an RLS refusal from a conflict. The original error is the `cause`. |
| [`syncFeatureRegistry`](../packages/supabase/src/feature-registry.ts) | function | Beta | Copy the registry into the database: `sync_feature_registry`. Call it with the service key when a production deployment starts serving, never from a preview. Returns false when the database already has this registry or a newer one; throw... |
| [`tenantFeatureHistory`](../packages/supabase/src/tenant-features.ts) | function | Beta | A tenant's history of changes, newest first (at most `maxRows`, 1 to 1000, default 100), for its admins. @stability Beta |
| [`tenantFeatures`](../packages/supabase/src/tenant-features.ts) | function | Beta | The features `tenantId` has turned off, for one of its members (or admins): `tenant_features_off`. Throws a `SupabaseQueryError` (`42501`) for anyone else, so a refusal is never mistaken for "everything on". |
| [`tenantFeaturesBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The tenant features block: per-tenant on/off switches for shipped features, set by the tenant's admins with a reason. |
| [`tenantFeatureSettings`](../packages/supabase/src/tenant-features.ts) | function | Beta | Every switch a tenant has set, with its reason, for its admins: `tenant_feature_settings`. @stability Beta |

### Types (20)

Type-only exports not consumed as a component's `Props`.

```ts
export type { DeleteAccountClient };
export type { DeleteMyAccountOptions };
export type { ExpoCryptoLike };
export type { FeatureGateState };
export type { FeatureGateStateOptions };
export type { FeatureRegistryClient };
export type { FeatureRegistryDocument };
export type { FlagStateValue };
export type { FunctionsClient };
export type { GenesisSupabaseOptions };
export type { PostgrestErrorLike };
export type { SessionStorage };
export type { SetTenantFeatureInput };
export type { StoreAppleTokenOptions };
export type { StoreAppleTokenResult };
export type { SyncFeatureRegistryOptions };
export type { TenantFeatureChange };
export type { TenantFeatureSetting };
export type { TenantFeatures };
export type { TenantFeaturesClient };
```

---

## @marktiderman/genesis-supabase/native

**Barrel:** [`packages/supabase/src/native.ts`](../packages/supabase/src/native.ts)

### Other exports (14)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`assertPkceCrypto`](../packages/supabase/src/web-crypto.ts) | function | Beta | Fail loudly when PKCE would fall back to "plain": throws in development, logs an error in a release build (a crash at launch helps no one there). |
| [`completeOAuthRedirect`](../packages/supabase/src/sign-in.ts) | function | Beta | Finish an OAuth sign-in from the URL the browser came back to. With a `code` it exchanges it for a session (PKCE: the verifier is already in the client's storage), passing the redirect's `sb_flow_id` so the right flow's verifier is used;... |
| [`formatFullName`](../packages/supabase/src/sign-in.ts) | function | — | "Given Middle Family", or null when Apple shared no name. |
| [`GenesisAuthError`](../packages/supabase/src/sign-in.ts) | class | Beta | Why a sign-in didn't produce a session. `code` is the provider's error (`access_denied`…), Supabase Auth's error code, or one of Genesis's own: `missing_code` (the redirect carried neither a code nor an error), `oauth_error`, `exchange_f... |
| [`hasPkceCrypto`](../packages/supabase/src/web-crypto.ts) | function | Beta | True when `target` has everything supabase-js needs for an S256 PKCE challenge made from secure random bytes. |
| [`installWebCrypto`](../packages/supabase/src/web-crypto.ts) | function | Beta | Give `globalThis.crypto` a `getRandomValues` and a SHA-256 `subtle.digest`, backed by `expo-crypto`, when the runtime has none. Real WebCrypto is never replaced: a `crypto` that has one of the two keeps it. Only SHA-256 is offered: `subt... |
| [`isDigestOnlyPolyfill`](../packages/supabase/src/web-crypto.ts) | function | — | True when `globalThis.crypto.subtle` is this polyfill's digest-only stand-in (no `importKey` or `verify`), which supabase-js's `getClaims` can't use. |
| [`keychainStorage`](../packages/supabase/src/native.ts) | function | Beta | Session storage in the Keychain (iOS) or Keystore (Android). |
| [`redirectParams`](../packages/supabase/src/sign-in.ts) | function | — | The query and fragment parameters of a URL (the query wins for a key in both). Hand-parsed: React Native's `URL` has no reliable `searchParams`. |
| [`refreshWhileActive`](../packages/supabase/src/native.ts) | function | Beta | Refresh the session only while the app is in front, as Supabase recommends for React Native. Returns the unsubscribe. |
| [`signInWithApple`](../packages/supabase/src/sign-in.ts) | function | Beta | Native Sign in with Apple straight into a Supabase session: checks the device supports it, asks for name and email with a SHA-256 hashed nonce, and signs in with the identity token. Closing Apple's sheet is `{ canceled: true }`, not an e... |
| [`signInWithGoogle`](../packages/supabase/src/sign-in.ts) | function | Beta | Native Google sign-in straight into a Supabase session, as Supabase's Google guide describes: a fresh random nonce, its SHA-256 (hex) to Google, which puts it in the ID token, and the raw nonce to `signInWithIdToken`, which checks the tw... |
| [`splitUtf8`](../packages/supabase/src/native.ts) | function | — | Split text into pieces of at most `maxBytes` UTF-8 bytes, never inside a character. |
| [`wipeSessionOnReinstall`](../packages/supabase/src/native.ts) | function | Beta | On iOS the Keychain outlives an uninstall, so a reinstalled app would sign the last person back in. Call this before creating the client: on the first launch after an install it removes any session left in the Keychain, then sets a marke... |

### Types (16)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppStateLike };
export type { AppleAuthenticationLike };
export type { AppleFullNameLike };
export type { AutoRefreshAuth };
export type { ExpoCryptoLike };
export type { GoogleSignInLike };
export type { KeychainStorageOptions };
export type { OAuthRedirectResult };
export type { SecureStoreLike };
export type { SignInClient };
export type { SignInWithAppleOptions };
export type { SignInWithAppleResult };
export type { SignInWithGoogleOptions };
export type { SignInWithGoogleResult };
export type { WebCryptoSource };
export type { WipeOnReinstallOptions };
```

---

## @marktiderman/genesis-supabase/blocks

**Barrel:** [`packages/supabase/src/blocks.ts`](../packages/supabase/src/blocks.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`accountBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The account block: sign-in, profile and in-app account deletion. Its screens are the app's (or genesis-ui-native's `AuthScreen`); this names its migrations and its data. |
| [`eventsBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The product events block: the app's own events table and its tracking functions (ADR 0010). The client is `createEventTracker` from `/events`; on native, `createEventsSink` plugs it into the observability sinks. |
| [`featureMirrorBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The feature registry block: the registry mirrored into the app's database on deploy, entitlements, per-tenant and platform flag values and SQL `feature_on()`, for the feature gate. Needs the tenant features block. |
| [`jobsBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The jobs block: a background-job queue and named schedules that call the app's job route. Server only; the route is `createJobsHandler` from `/jobs`. |
| [`tenantFeaturesBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The tenant features block: per-tenant on/off switches for shipped features, set by the tenant's admins with a reason. |
| [`webHandoffBlock`](../packages/supabase/src/blocks.ts) | const | Beta | The web handoff block: continue on the web, already signed in. The routes are `createWebHandoff` from `/web-handoff/server`, the page uses `/web-handoff`, and the native app calls `openOnWeb` from genesis-native. |

---

## @marktiderman/genesis-supabase/jobs

**Barrel:** [`packages/supabase/src/jobs.ts`](../packages/supabase/src/jobs.ts)

### Other exports (8)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createJobsHandler`](../packages/supabase/src/jobs.ts) | function | Beta | The app's job route: checks the request is signed for (or carries the secret of) the job named by the route (`name`, e.g. a path param), the body's `job`, or the URL's last segment, then runs it. GET and POST (platform crons send GET). A... |
| [`defaultBackoff`](../packages/supabase/src/jobs.ts) | function | — | 30 s, doubling per attempt, ±20% jitter, at most an hour. |
| [`enqueueJob`](../packages/supabase/src/jobs.ts) | function | Beta | Queue one job of `kind` (`"email.digest"`, lowercase) with a JSON object payload. Returns the job's id. Payloads are readable by the service role: put ids in them, never secrets. |
| [`JobsError`](../packages/supabase/src/jobs.ts) | class | — | A failure from the queue's own functions (not from a handler). |
| [`PermanentJobError`](../packages/supabase/src/jobs.ts) | class | Beta | Thrown by a handler for a failure that won't get better with a retry (a bad payload, a 4xx). @stability Beta |
| [`runJobs`](../packages/supabase/src/jobs.ts) | function | Beta | Claim due jobs of the handled kinds, run them, and settle each: done, a retry after backoff, or failed. One job's failure, or a failure to record it, never stops the others; only a failed claim throws. Nothing about a payload is logged. ... |
| [`signJobRequest`](../packages/supabase/src/jobs.ts) | function | Beta | The `Authorization` value a scheduler sends for `job`: `GenesisJob t=<unix seconds>,sig=<hex HMAC-SHA256 of "<t>.<job>">`. What `genesis_schedule_job` sends; for calling a job route from your own code. |
| [`verifyJobRequest`](../packages/supabase/src/jobs.ts) | function | Beta | Checks a request's `Authorization` in constant time against the secret and the previous one. Two forms: `GenesisJob t=…,sig=…`, signed for `job` within `maxSkewSeconds` (what schedules send: the secret never travels), or `Bearer <secret>... |

### Types (10)

Type-only exports not consumed as a component's `Props`.

```ts
export type { EnqueueOptions };
export type { Job };
export type { JobHandler };
export type { JobOutcome };
export type { JobsClient };
export type { JobsHandlerOptions };
export type { NamedJob };
export type { RunJobsOptions };
export type { RunJobsReport };
export type { VerifyJobRequestOptions };
```

---

## @marktiderman/genesis-supabase/events

**Barrel:** [`packages/supabase/src/events.ts`](../packages/supabase/src/events.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createEventsSink`](../packages/supabase/src/events.ts) | function | Beta | The tracker as a genesis-native observability sink (structurally: an object with `name`, `event` and `flush`), so typed events reach the app's own table. |
| [`createEventTracker`](../packages/supabase/src/events.ts) | function | Beta | A batching tracker for the app's own events. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { EventTracker };
export type { EventTrackerOptions };
export type { EventValue };
export type { EventsClient };
export type { EventsSinkOptions };
export type { TrackOptions };
```

---

## @marktiderman/genesis-supabase/runner

**Barrel:** [`packages/supabase/src/runner.ts`](../packages/supabase/src/runner.ts)

### Other exports (7)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createRunner`](../packages/supabase/src/runner.ts) | function | Beta | The runner. |
| [`DEFAULT_BATCH_SIZE`](../packages/supabase/src/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_ATTEMPTS`](../packages/supabase/src/runner.ts) | const | — | _(no summary)_ |
| [`DEFAULT_MAX_DEFERRALS`](../packages/supabase/src/runner.ts) | const | — | _(no summary)_ |
| [`defaultBackoff`](../packages/supabase/src/runner.ts) | function | — | 5 minutes, quadrupling each attempt, at most 24 hours: 5m, 20m, 80m, 5h20m, 21h20m, then 24h; about 3 days across 8 attempts. Each wait is jittered by up to ±20%, so jobs that failed together don't all come back at once. |
| [`failureOf`](../packages/supabase/src/runner.ts) | function | — | A thrown error as a retryable failure with a safe message. |
| [`jobOutcome`](../packages/supabase/src/runner.ts) | function | — | Turns a send result into an outcome for a job on its `attempt`. |

### Types (10)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ClaimRequest };
export type { JobFailure };
export type { JobOutcome };
export type { JobResult };
export type { RunOptions };
export type { RunReport };
export type { Runner };
export type { RunnerJob };
export type { RunnerOptions };
export type { SendContext };
```

---

## @marktiderman/genesis-supabase/web-handoff

**Barrel:** [`packages/supabase/src/web-handoff.ts`](../packages/supabase/src/web-handoff.ts)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`appRelativePath`](../packages/supabase/src/web-handoff-path.ts) | function | Beta | `value` as a path on this app (`/clients/1/forms?tab=questions`), normalized, or `null` when it could leave the origin or isn't a path: anything without a single leading `/`, `//host`, `/\host`, a scheme (`javascript:`, `https:`), whites... |
| [`completeWebHandoff`](../packages/supabase/src/web-handoff.ts) | function | Beta | Claim the handoff and say what the page shows next. Never signs anyone in or out by itself: a `confirm` step does that only when the person chooses `continue()` or `cancel()`. A fragment is claimed once: calling again with the same fragm... |
| [`forgetWebHandoffFragment`](../packages/supabase/src/web-handoff.ts) | function | — | Forget a fragment {@link takeWebHandoffFragment} read (tests, or after the handoff finished). |
| [`takeWebHandoffFragment`](../packages/supabase/src/web-handoff.ts) | function | Beta | Read the handoff link's fragment (`#t=<token>&next=<path>`) and remove it from the address bar and history at once (`history.replaceState`), so the token isn't left in history, a bookmark, a screenshot of the address bar, or the URL an a... |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CompleteWebHandoffOptions };
export type { WebHandoffAuthClient };
export type { WebHandoffFailure };
export type { WebHandoffFragment };
export type { WebHandoffStep };
```

---

## @marktiderman/genesis-supabase/web-handoff/server

**Barrel:** [`packages/supabase/src/web-handoff-server.ts`](../packages/supabase/src/web-handoff-server.ts)

### Other exports (10)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`appRelativePath`](../packages/supabase/src/web-handoff-path.ts) | function | Beta | `value` as a path on this app (`/clients/1/forms?tab=questions`), normalized, or `null` when it could leave the origin or isn't a path: anything without a single leading `/`, `//host`, `/\host`, a scheme (`javascript:`, `https:`), whites... |
| [`bindWebHandoffSession`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The page reports the session Continue made: its access token is verified with `auth.getUser`, and its `session_id` is kept on the handoff (for the same person, within two minutes of Continue), so {@link signOutWebHandoffs} can end it. |
| [`claimWebHandoff`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The page opened a link: use it (once, within its lifetime) and say whose it is. Mints nothing. When the browser is already that person (`currentUserId`) the handoff is spent and the page simply goes on; otherwise it gets a continue nonce... |
| [`continueWebHandoff`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The person chose Continue: spend the nonce (once, in time, not after Cancel) and only now ask Supabase Auth for a sign-in token for the handoff's own person. |
| [`createWebHandoff`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The web handoff's routes, each `(request) => Response`, POST only, no CORS headers: |
| [`discardWebHandoff`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The person chose Cancel: burn the nonce, so Continue is refused from now on. @stability Beta |
| [`handoffDigest`](../packages/supabase/src/web-handoff-server.ts) | function | — | The SHA-256 of a handoff token or nonce, hex: what the database keeps instead. |
| [`mintWebHandoff`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | Record a handoff for a person the caller has already verified and return the link that completes it. Refuses a path that could leave the app, a person without an email (Supabase signs in by email link; there is no phone equivalent), and ... |
| [`sessionIdOf`](../packages/supabase/src/web-handoff-server.ts) | function | — | The `session_id` claim of an access token Supabase Auth has already verified (`auth.getUser`), or null. It only reads the payload; never call it on a token nobody verified. |
| [`signOutWebHandoffs`](../packages/supabase/src/web-handoff-server.ts) | function | Beta | The app is signing out: end the web sessions handed off from that app session (and only those; never the person's other devices). Call it before the app's own sign-out, with the app's still-valid access token. Supabase documents a sessio... |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ClaimWebHandoffResult };
export type { ContinueWebHandoffResult };
export type { MintWebHandoffOptions };
export type { MintWebHandoffResult };
export type { WebHandoffAdmin };
export type { WebHandoffLogEvent };
export type { WebHandoffOptions };
```

---

## @marktiderman/genesis-support

Support and feedback for Genesis apps, in the app's own Supabase: a feedback record (bug, idea, question, praise) with the app's context and screenshots, collector and sink seams with a Supabase sink, a web feedback panel and launcher, a native feedback screen with screenshot capture, annotation and shake to report, the person's reports with staff replies (on genesis-chat with the support-chat block: live, with files, an assignee and internal notes), and an idea board with votes and "you asked, we shipped". Declared as a defineBlock block. Part of the Genesis framework.

**Barrel:** [`packages/support/src/index.ts`](../packages/support/src/index.ts)

### Other exports (38)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`attachmentBytes`](../packages/support/src/record.ts) | function | — | The bytes of an attachment, from `bytes` or `base64`. |
| [`base64ToBytes`](../packages/support/src/record.ts) | function | — | Base64 (or a `data:` URI) to bytes, without `atob` (Hermes, workers, Node all agree). |
| [`cleanRoute`](../packages/support/src/contract.ts) | function | — | A route as a path only, safe to store and send: the query string and fragment (tokens, codes, emails) are dropped, and path segments that look private (an email, an id, a long token) become `:email`, `:id` or `:token` (`/users/jane@x.tes... |
| [`composeCollectors`](../packages/support/src/record.ts) | function | — | Collectors merged left to right (a later one's values win; `device` and `extra` merge by key). |
| [`CONTRACT_VERSION`](../packages/support/src/contract.ts) | const | — | Bumped only on a shape change. Old clients must keep working. |
| [`createContextCollector`](../packages/support/src/record.ts) | function | — | The default collector: reads each value when feedback is sent, cleans the route, and drops a device or extra bag over its size cap rather than sending a report the database would refuse. |
| [`createIntakeClient`](../packages/support/src/intake.ts) | function | — | _(no summary)_ |
| [`createIntakeSink`](../packages/support/src/intake.ts) | function | — | A sink over the intake function. The function takes no screenshots (they go to storage with a session), so attachments are reported as dropped. |
| [`createSupabaseSink`](../packages/support/src/client.ts) | function | — | The Supabase sink on its own (the support client is one). |
| [`createSupportClient`](../packages/support/src/client.ts) | function | — | The support client over the app's Supabase client. |
| [`defineSupportBlock`](../packages/support/src/block.ts) | function | — | The platform-neutral declaration. |
| [`defineSupportChatBlock`](../packages/support/src/block.ts) | function | — | The support-chat block: a report's conversation runs on genesis-chat. It adds no screens of its own (the support block's thread route renders the conversation); it brings migration `0001_genesis_support_chat.sql` from this package, after... |
| [`defineSupportEmailBlock`](../packages/support/src/block.ts) | function | — | The support-email block: email is a ticket channel (ADR 0011). It brings migration `0002_genesis_support_email.sql` from this package, after 0006; the server half is `@marktiderman/genesis-support/email` with genesis-notifications' inbou... |
| [`DEVICE_MAX_BYTES`](../packages/support/src/record.ts) | const | — | _(no summary)_ |
| [`EXTRA_MAX_BYTES`](../packages/support/src/record.ts) | const | — | _(no summary)_ |
| [`FEEDBACK_REPORT_TYPES`](../packages/support/src/contract.ts) | const | — | _(no summary)_ |
| [`FEEDBACK_STATUSES`](../packages/support/src/contract.ts) | const | — | _(no summary)_ |
| [`FEEDBACK_TYPES`](../packages/support/src/record.ts) | const | — | _(no summary)_ |
| [`fill`](../packages/support/src/copy.ts) | function | — | Fills `{name}` placeholders. |
| [`IntakeError`](../packages/support/src/intake.ts) | class | — | A non-2xx answer (`status` 0: it never arrived). `code` is the function's `error`. |
| [`isMissingFunction`](../packages/support/src/chat.ts) | function | — | PostgREST's "no such function" (PGRST202) or Postgres's (42883): the block's migration isn't applied. |
| [`isUnread`](../packages/support/src/client.ts) | function | — | True when there is a staff reply newer than the person's last read. |
| [`LIMITS`](../packages/support/src/contract.ts) | const | — | Text limits, the same as the database's checks. |
| [`resolveSupportCopy`](../packages/support/src/copy.ts) | function | — | The catalog with overrides merged over the English. |
| [`sanitizeContext`](../packages/support/src/record.ts) | function | — | The context as the database takes it: a clean route, short strings, bags under their caps. |
| [`SUPPORT_BLOCK_ID`](../packages/support/src/block.ts) | const | — | The FeatureId of the support block (features.ts). |
| [`SUPPORT_BUCKET`](../packages/support/src/client.ts) | const | — | The storage bucket migration 0006 creates. |
| [`SUPPORT_CHAT_BLOCK_ID`](../packages/support/src/chat.ts) | const | — | The block's FeatureId. |
| [`SUPPORT_CHAT_KIND`](../packages/support/src/chat.ts) | const | — | The genesis_chat kind a report's conversation is, and its subject type. |
| [`SUPPORT_CHAT_SUBJECT`](../packages/support/src/chat.ts) | const | — | _(no summary)_ |
| [`SUPPORT_EMAIL_BLOCK_ID`](../packages/support/src/block.ts) | const | — | The support-email block's id. |
| [`SUPPORT_TO_CHAT_STATUS`](../packages/support/src/chat.ts) | const | — | A support report's status, as genesis-chat's conversation status (the migration's mapping). |
| [`supportContributions`](../packages/support/src/block.ts) | function | — | The block's contributions, for any platform. |
| [`supportCopy`](../packages/support/src/copy.ts) | const | — | Every string the support block shows, in English. Pass `copy` (any part of this shape) to translate or reword; what you leave out stays English. |
| [`SupportError`](../packages/support/src/client.ts) | class | — | A Supabase refusal, with its code (`GS429` rate limited, `42501` not allowed, …). |
| [`supportPaths`](../packages/support/src/block.ts) | function | — | _(no summary)_ |
| [`validateSubmitInput`](../packages/support/src/contract.ts) | function | — | Checks a `submit` body the way the server does: known keys only, every limit. |
| [`WIDGET_HEADERS`](../packages/support/src/contract.ts) | const | — | Headers a client sends. The person's access token goes in `Authorization: Bearer …`. |

### Types (44)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BootConfig };
export type { ContextCollector };
export type { ContextCollectorOptions };
export type { FeedbackAttachment };
export type { FeedbackContext };
export type { FeedbackDelivery };
export type { FeedbackOp };
export type { FeedbackRecord };
export type { FeedbackReportSummary };
export type { FeedbackReportType };
export type { FeedbackSink };
export type { FeedbackStatus };
export type { FeedbackType };
export type { FindingSeverity };
export type { IdeaStatus };
export type { IdentityMode };
export type { IntakeClient };
export type { IntakeClientConfig };
export type { LauncherPosition };
export type { Lazy };
export type { ScreenshotContentType };
export type { SubmitFeedbackInput };
export type { SubmitFeedbackResult };
export type { SubmitValidation };
export type { SupportAttachmentView };
export type { SupportBlockOptions };
export type { SupportChatAttachment };
export type { SupportChatClient };
export type { SupportChatMessage };
export type { SupportClient };
export type { SupportClientOptions };
export type { SupportCopy };
export type { SupportCopyOverrides };
export type { SupportIdea };
export type { SupportPaths };
export type { SupportReply };
export type { SupportReplyAttachment };
export type { SupportReport };
export type { SupportSupabase };
export type { SupportThreadInfo };
export type { ThemeTokens };
export type { WidgetConfig };
export type { WidgetType };
export type { WidgetTypeWire };
```

---

## @marktiderman/genesis-support/web

**Barrel:** [`packages/support/src/web/index.ts`](../packages/support/src/web/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FeedbackLauncher`](../packages/support/src/web/launcher.tsx) | `FeedbackLauncherProps` | — | _(no summary)_ |
| [`FeedbackPanel`](../packages/support/src/web/feedback-panel.tsx) | `FeedbackPanelProps` | — | _(no summary)_ |

### Other exports (10)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`annotateScreenshot`](../packages/support/src/web/capture.ts) | function | — | Draws pen strokes and solid redactions onto a captured image; returns the new capture. |
| [`canCaptureScreenshot`](../packages/support/src/web/capture.ts) | function | — | Whether this browser can capture the tab at all. |
| [`captureScreenshot`](../packages/support/src/web/capture.ts) | function | — | One frame of the current tab, or `null` when the person declined or the browser can't. |
| [`createPinOverlay`](../packages/support/src/web/pin.ts) | function | — | Numbered pins for reports sent from the current path. Re-drawn on navigation, scroll and resize. |
| [`mountSupportWidget`](../packages/support/src/web/launcher.tsx) | function | — | Mount the launcher into the page: into `container`, or a new element at the end of `<body>`. Returns the unmount. The page needs Genesis UI's styles. |
| [`pickPin`](../packages/support/src/web/pin.ts) | function | — | Waits for one click anywhere on the page and returns the pin, or `null` on Escape. The click doesn't reach the page. |
| [`resolvePin`](../packages/support/src/web/pin.ts) | function | — | Where a pin sits now: on its element if it is still there, else where it was clicked. |
| [`stableLocator`](../packages/support/src/web/pin.ts) | function | — | A selector for an element that is likely to survive a re-render: its id, else a data-testid. |
| [`undoMark`](../packages/support/src/web/feedback-panel.tsx) | function | — | Marks without the newest one (by `order`; without it, the last redaction, then the last stroke). |
| [`webContextCollector`](../packages/support/src/web/feedback-panel.tsx) | function | — | The default web collector: the path (never the query string), `web`, and the viewport and language. |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FeedbackPin };
export type { LauncherPosition };
export type { Marks };
export type { PinOverlay };
export type { PinnedReport };
export type { Redaction };
export type { Stroke };
export type { WebCapture };
```

---

## @marktiderman/genesis-support/web-chat

**Barrel:** [`packages/support/src/web-chat/index.ts`](../packages/support/src/web-chat/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SupportReportThread`](../packages/support/src/web-chat/report-thread.tsx) | `SupportReportThreadProps` | — | The person's view of their report: the report, then the conversation with support, live. |
| [`SupportStaffThread`](../packages/support/src/web-chat/staff-thread.tsx) | `SupportStaffThreadProps` | — | A report for staff: status and assignee controls over the live conversation, with internal notes. |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`supportWebKeys`](../packages/support/src/web-chat/report-thread.tsx) | const | — | The query keys, under genesis-support's root (as on native). |

---

## @marktiderman/genesis-support/native

**Barrel:** [`packages/support/src/native/index.ts`](../packages/support/src/native/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FeedbackForm`](../packages/support/src/native/feedback-form.tsx) | `FeedbackFormProps` | — | _(no summary)_ |
| [`ScreenshotAnnotator`](../packages/support/src/native/annotator.tsx) | `ScreenshotAnnotatorProps` | — | _(no summary)_ |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`boxOf`](../packages/support/src/native/annotator.tsx) | function | — | _(no summary)_ |
| [`createSupport`](../packages/support/src/native/support.tsx) | function | — | _(no summary)_ |
| [`listenForShake`](../packages/support/src/native/modules.ts) | function | — | Calls `onShake` when the phone is shaken: a few strong jolts close together, then a cooldown. Returns the stop. |
| [`SendFeedbackButton`](../packages/support/src/native/screens.tsx) | function | — | "Send feedback", for a devtools panel's slot or any screen: captures the screen, then opens the feedback screen. Renders nothing when support is off. |
| [`strokeDots`](../packages/support/src/native/annotator.tsx) | function | — | The dots along a stroke, close enough to read as a line. |
| [`SUPPORT_QUERY_ROOT`](../packages/support/src/native/support.tsx) | const | — | _(no summary)_ |
| [`SupportProvider`](../packages/support/src/native/support.tsx) | function | — | _(no summary)_ |
| [`useIdeaBoard`](../packages/support/src/native/screens.tsx) | function | — | The idea board: most votes first, a vote button on each, and a field to suggest one. |
| [`useOptionalSupport`](../packages/support/src/native/support.tsx) | function | — | The same block, or `null` when support is off (for a button that hides itself). |
| [`usePendingFeedback`](../packages/support/src/native/support.tsx) | function | — | The pending feedback, re-rendering when it changes. |
| [`useShippedIdeas`](../packages/support/src/native/screens.tsx) | function | — | "You asked, we shipped": the shipped ideas the person suggested or voted for, with the FeatureId each shipped as. |
| [`useSupport`](../packages/support/src/native/support.tsx) | function | — | The support block, from `GenesisNativeApp blocks` (or `SupportProvider`). Throws outside one. |
| [`useSupportConversation`](../packages/support/src/native/screens.tsx) | function | — | Where a report's thread lives: its genesis-chat conversation (the support-chat block, with a `chat` client given to `createSupport`), or support_replies. For a screen of your own that renders the conversation with `@marktiderman/genesis-... |
| [`useSupportInbox`](../packages/support/src/native/screens.tsx) | function | — | Help: the person's reports, newest first, with unread staff replies, and links to the idea board. |
| [`useSupportThread`](../packages/support/src/native/screens.tsx) | function | — | One report as a conversation: the report itself, then the replies. Marks it read as it opens and as replies arrive. On genesis-chat (the support-chat block) it updates live and shows the photos in replies; otherwise it re-reads support_r... |
| [`useUnreadReplies`](../packages/support/src/native/support.tsx) | function | — | How many reports have a staff reply the person hasn't read. |
| [`VoteButton`](../packages/support/src/native/screens.tsx) | function | — | A vote toggle for an idea row. |

### Types (9)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AccelerometerLike };
export type { AccelerometerMeasurement };
export type { CaptureOptions };
export type { PendingFeedback };
export type { PendingScreenshot };
export type { ShakeOptions };
export type { SupportBlock };
export type { SupportOptions };
export type { ViewShotLike };
```

---

## @marktiderman/genesis-support/email

**Barrel:** [`packages/support/src/email.ts`](../packages/support/src/email.ts)

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`runSupportEmail`](../packages/support/src/email.ts) | function | Beta | Sends the queued staff replies on email tickets. Returns how many were sent and failed; a failed one is queued again (up to 5 attempts). Never throws for one email. |
| [`supportEmailRoute`](../packages/support/src/email.ts) | function | Beta | A route that files support email as tickets. It takes an email when one of its recipients is a support address or a ticket's reply address, or (with `threads`) when it answers an email. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ReceivedEmail };
export type { RunSupportEmailOptions };
export type { SupportEmailClient };
export type { SupportEmailMessage };
export type { SupportEmailProvider };
export type { SupportEmailRouteOptions };
```

---

## @marktiderman/genesis-switchboard

Pluggable data layer — a resource's backing (L1 Code / L2 Airtable·Notion / L3 Supabase × tiers A/B/C) is config, not a rewrite. Read one canonical shape via data.resource('x'). See packages/switchboard/README.md + SWITCHBOARD.md.

**Barrel:** [`packages/switchboard/src/index.ts`](../packages/switchboard/src/index.ts)

### Other exports (30)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AIRTABLE_BASE_ID`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`AirtableAdapter`](../packages/switchboard/src/adapters/airtable.ts) | class | — | _(no summary)_ |
| [`asWritable`](../packages/switchboard/src/adapters/adapter.ts) | function | — | Narrow an adapter to its writable surface (or throw a typed error). |
| [`CodeAdapter`](../packages/switchboard/src/adapters/code.ts) | class | — | _(no summary)_ |
| [`driftReport`](../packages/switchboard/src/reconcile.ts) | function | — | Compare a resource across two Levels using the two adapters that back those Levels. The `from`/`to` adapters are passed in explicitly by the caller; the Registry is used only to look up the resource contract (`getContract`). |
| [`featuresAirtableMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresContract`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresSupabaseMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`gitdataMdContract`](../packages/switchboard/src/gitdata-names.ts) | function | — | Default markdown contract: identity + common columns; extras still round-trip. |
| [`gitdataResourceName`](../packages/switchboard/src/gitdata-names.ts) | function | — | Stable resource name for a gitdata table — minimum wiring for new tables. |
| [`inferFieldType`](../packages/switchboard/src/introspect.ts) | function | — | Infer the canonical StorageType (+ array-ness) of a single value. |
| [`introspectFields`](../packages/switchboard/src/introspect.ts) | function | — | Derive a resource's live field schema from its actual DATA. Fields = the union of keys across `rows`; types are inferred from values; `optional`/`array` come from the data. The optional `contract` ENRICHES (description + a more-specific ... |
| [`isMergeBinding`](../packages/switchboard/src/types.ts) | function | — | Narrow a binding to the Tier-B MERGE (multi-source) variant. |
| [`LEVEL_LABEL`](../packages/switchboard/src/types.ts) | const | — | Human-facing label for a Level (docs / drift reports). |
| [`LEVELS`](../packages/switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`markStale`](../packages/switchboard/src/staleness.ts) | function | — | Stamp a row array as a degraded (stale) read. Returns the SAME array for chaining. The marker is non-enumerable so it never serializes into data. |
| [`NotionAdapter`](../packages/switchboard/src/adapters/notion.ts) | class | — | _(no summary)_ |
| [`promote`](../packages/switchboard/src/reconcile.ts) | function | — | Generate a reviewable Supabase migration that promotes a proven L2 shape to L3. Emits: CREATE TABLE (from the contract field schema) + a user_id column + RLS (user_id = auth.uid()) + updated_at trigger + optional backfill. Returns SQL TE... |
| [`propagateStale`](../packages/switchboard/src/staleness.ts) | function | — | Copy a staleness marker from `source` onto `target` (used after a defensive `{ ...row }` clone drops the array-level symbol). No-op when `source` is fresh. Returns `target` for chaining. |
| [`PROVIDER_LEVEL`](../packages/switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`ReadOnlyAdapterError`](../packages/switchboard/src/adapters/adapter.ts) | class | — | Thrown by a read-only adapter when a write op is attempted. |
| [`reconcileModel`](../packages/switchboard/src/reconcile.ts) | function | — | Reconcile the whole MODEL across two Levels: run `driftReport` for every registered resource backed by BOTH adapters, record the rest as MISSING, and roll up a model verdict. The `from`/`to` adapters are passed explicitly (the Registry s... |
| [`Registry`](../packages/switchboard/src/registry.ts) | class | — | _(no summary)_ |
| [`staleInfo`](../packages/switchboard/src/staleness.ts) | function | — | Read the staleness marker off a row array (or any value), if present. |
| [`SupabaseAdapter`](../packages/switchboard/src/adapters/supabase.ts) | class | — | _(no summary)_ |
| [`Switchboard`](../packages/switchboard/src/resolver.ts) | class | — | _(no summary)_ |
| [`ticketsAirtableMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsContract`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsSupabaseMap`](../packages/switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`UnknownResourceError`](../packages/switchboard/src/adapters/adapter.ts) | class | — | Thrown when an adapter is asked for a resource it has no mapping for. |

### Types (43)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Adapter };
export type { AirtableAdapterConfig };
export type { AirtableResourceMap };
export type { Binding };
export type { CodeAdapterOptions };
export type { DataRow };
export type { DescribeResult };
export type { DriftReport };
export type { EnvironmentBinding };
export type { FeatureRow };
export type { FetchLike };
export type { FieldBinding };
export type { FieldDrift };
export type { FieldSchema };
export type { FieldType };
export type { Level };
export type { MergeBinding };
export type { ModelReconcileReport };
export type { ModelReconcileSummary };
export type { NotionAdapterConfig };
export type { NotionPropertyMap };
export type { NotionPropertyType };
export type { NotionResourceMap };
export type { PromoteOptions };
export type { PromoteResult };
export type { ProviderKind };
export type { QueryOptions };
export type { ReconcileModelOptions };
export type { ResolvedPlan };
export type { ResourceBinding };
export type { ResourceClient };
export type { ResourceContract };
export type { ResourceReconcile };
export type { RowDrift };
export type { StaleReadInfo };
export type { SupabaseAdapterConfig };
export type { SupabaseClientLike };
export type { SupabaseQueryBuilder };
export type { SupabaseResourceMap };
export type { SwitchboardContract };
export type { TicketRow };
export type { Tier };
export type { ValueDrift };
```

---

## @marktiderman/genesis-switchboard/gitdata

**Barrel:** [`packages/switchboard/src/gitdata.ts`](../packages/switchboard/src/gitdata.ts)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`attachGitdata`](../packages/switchboard/src/gitdata.ts) | function | — | _(no summary)_ |
| [`GitdataAdapter`](../packages/switchboard/src/adapters/gitdata.ts) | class | — | _(no summary)_ |
| [`gitdataMdContract`](../packages/switchboard/src/gitdata-names.ts) | function | — | Default markdown contract: identity + common columns; extras still round-trip. |
| [`gitdataResourceName`](../packages/switchboard/src/gitdata-names.ts) | function | — | Stable resource name for a gitdata table — minimum wiring for new tables. |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AttachGitdataOptions };
export type { GitdataAdapterConfig };
export type { GitdataResourceMap };
```

---

## @marktiderman/genesis-switchboard/data-provider

**Barrel:** [`packages/switchboard/src/data-provider.ts`](../packages/switchboard/src/data-provider.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSwitchboardProvider`](../packages/switchboard/src/data-provider.ts) | function | — | Build a `DataProvider` backed by a `Switchboard`. Reads route to the resolved backing (Supabase live, Code mock); a Genesis-core consumer needs no change — only the data plane beneath `useResource` is swapped. |

---

## @marktiderman/genesis-ui

Shadcn-based web components. Use in Vite / RR7 / Next surfaces.

**Barrel:** [`packages/ui/src/index.ts`](../packages/ui/src/index.ts)

### Components (43)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AccessibleIcon`](../packages/ui/src/components/ui/accessible-icon.tsx) | `AccessibleIconProps` | Beta | AccessibleIcon — gives a decorative icon an accessible name. |
| [`Badge`](../packages/ui/src/components/ui/badge.tsx) | `BadgeProps` | — | _(no summary)_ |
| [`Band`](../packages/ui/src/components/layout/band.tsx) | `BandProps` | Beta | Band: a full-bleed, full-width marketing section. The background runs edge to edge; the content sits in a centered column with the page gutter. It is what a landing page is made of: a hero, a features band, a call to action, a footer. |
| [`BandLead`](../packages/ui/src/components/layout/band.tsx) | `BandLeadProps` | Beta | _(no summary)_ |
| [`BuilderLayout`](../packages/ui/src/components/layout/builder-layout.tsx) | `BuilderLayoutProps` | Beta | BuilderLayout — the three columns of a builder: an outline of the parts on the left, the editor for the selected part in the centre, a live preview on the right. |
| [`Button`](../packages/ui/src/components/ui/button.tsx) | `ButtonProps` | Stable | Button — primary interactive control. Variants: default, secondary, outline, ghost, destructive, link. |
| [`ButtonGroup`](../packages/ui/src/components/ui/button-group.tsx) | `ButtonGroupProps` | — | _(no summary)_ |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |
| [`Container`](../packages/ui/src/components/layout/container.tsx) | `ContainerProps` | Beta | Container — the page gutter: a centered column with a named maximum width and responsive side padding. |
| [`DashboardPage`](../packages/ui/src/components/layout/dashboard-page.tsx) | `DashboardPageProps` | Beta | DashboardPage — a stat row over a flexible region of charts, tables and sections. |
| [`DatePicker`](../packages/ui/src/components/ui/date-picker.tsx) | `DatePickerProps` | — | _(no summary)_ |
| [`DetailPage`](../packages/ui/src/components/layout/detail-page.tsx) | `DetailPageProps` | Beta | DetailPage — one record's full view: a title row with actions, a primary content region, and a metadata sidebar that drops below the content on small screens. |
| [`Display`](../packages/ui/src/components/layout/band.tsx) | `DisplayProps` | Beta | Display: a heading in the marketing type scale (`displayVariants`). |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | `EmptyStateProps` | Beta | EmptyState — what to show when a list, page, or panel has no data. |
| [`FormPage`](../packages/ui/src/components/layout/form-page.tsx) | `FormPageProps` | Beta | FormPage — a titled form: header, validation summary, a body of sections, and a sticky action bar. |
| [`Grid`](../packages/ui/src/components/layout/grid.tsx) | `GridProps` | Beta | Grid — two-dimensional flow for card and tile collections. |
| [`InputGroup`](../packages/ui/src/components/ui/input-group.tsx) | `InputGroupProps` | — | _(no summary)_ |
| [`Kbd`](../packages/ui/src/components/ui/kbd.tsx) | `KbdProps` | — | _(no summary)_ |
| [`PageLoading`](../packages/ui/src/components/patterns/page-loading.tsx) | `PageLoadingProps` | Beta | PageLoading — full-page or in-section loading state: a centered `Spinner` with an optional message. The loading-state counterpart to `EmptyState`. Reach for `Skeleton` instead when the placeholder should mimic the shape of the content th... |
| [`PasswordToggleField`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldProps` | Experimental | PasswordToggleField — a password input with a show/hide control that keeps focus and caret position across the toggle. |
| [`PasswordToggleFieldIcon`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldIconProps` | Experimental | PasswordToggleFieldIcon — the SVG-level variant of `PasswordToggleFieldSlot`. |
| [`PasswordToggleFieldInput`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldInputProps` | Experimental | PasswordToggleFieldInput — the field itself. |
| [`PasswordToggleFieldSlot`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldSlotProps` | Experimental | PasswordToggleFieldSlot — renders one of two nodes depending on visibility. |
| [`PasswordToggleFieldToggle`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldToggleProps` | Experimental | PasswordToggleFieldToggle — the show/hide button. |
| [`ResourceHeader`](../packages/ui/src/components/resource/ResourceHeader.tsx) | `ResourceHeaderProps` | — | The header of a page that edits one publishable thing (a form, a course, a lesson, a worksheet): the breadcrumb ("Courses › name"), the title once, its status and save-state chips, and on the right undo and redo, Preview, Share and Publi... |
| [`Section`](../packages/ui/src/components/layout/section.tsx) | `SectionProps` | Beta | Section — a titled region of a page: heading, optional description, optional trailing actions, and the content itself. |
| [`SettingsPage`](../packages/ui/src/components/layout/settings-page.tsx) | `SettingsPageProps` | Beta | SettingsPage — a sectioned settings surface with a nav rail for jumping between sections. |
| [`SettingsRow`](../packages/ui/src/components/patterns/settings-row.tsx) | `SettingsRowProps` | Beta | SettingsRow — label + description on one side, an arbitrary trailing control (Switch, Select, Button, Badge, ...) on the other. This is the shared layout behind every settings/preferences list row; see `ToggleRow` for the common label+de... |
| [`SortableList`](../packages/ui/src/components/patterns/sortable-list.tsx) | `SortableListProps` | Beta | A vertical list the user can rearrange: course steps, lesson blocks, form fields. |
| [`Spinner`](../packages/ui/src/components/ui/spinner.tsx) | `SpinnerProps` | — | _(no summary)_ |
| [`Split`](../packages/ui/src/components/layout/split.tsx) | `SplitProps` | Beta | Split — the master-detail layout: two panes side by side above a breakpoint, stacked below it. |
| [`Stack`](../packages/ui/src/components/layout/stack.tsx) | `StackProps` | Beta | Stack — one-dimensional flow. The single most-repeated shape in any application: a run of things in a line, evenly spaced. |
| [`StatusBadge`](../packages/ui/src/components/patterns/status-badge.tsx) | `StatusBadgeProps` | Beta | Status-specific badge for progress/health states — the OKR-style "on track / at risk / off track" goal vocabulary plus common task-lifecycle states ("done", "blocked", "in progress"). |
| [`Table`](../packages/ui/src/components/ui/table.tsx) | `TableProps` | — | _(no summary)_ |
| [`ToggleRow`](../packages/ui/src/components/patterns/toggle-row.tsx) | `ToggleRowProps` | Beta | ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common label+description+on/off row for settings and preferences UI. |
| [`Toolbar`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarProps` | Beta | Toolbar — a grouped set of controls that behaves as ONE tab stop. |
| [`ToolbarButton`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarButtonProps` | Beta | ToolbarButton — a button that participates in the toolbar's roving tabindex. |
| [`ToolbarLink`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarLinkProps` | Beta | ToolbarLink — an anchor inside the toolbar's roving tabindex. |
| [`ToolbarSeparator`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarSeparatorProps` | Beta | ToolbarSeparator — a decorative divider between toolbar groups. |
| [`ToolbarToggleItem`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarToggleItemProps` | Beta | ToolbarToggleItem — one member of a `ToolbarToggleGroup`. |
| [`Tooltip`](../packages/ui/src/components/ui/tooltip.tsx) | `TooltipProps` | Stable | Tooltip — hover/focus hint anchored to its trigger child. |
| [`UserAvatar`](../packages/ui/src/components/patterns/user-avatar.tsx) | `UserAvatarProps` | Beta | UserAvatar — canonical user-identity avatar. Shows the person's photo when `src` is set and loads successfully; otherwise (including a failed image load — Radix's Avatar swaps to the fallback automatically) it falls back to initials comp... |
| [`VisuallyHidden`](../packages/ui/src/components/ui/visually-hidden.tsx) | `VisuallyHiddenProps` | Beta | VisuallyHidden — content removed from the visual layout but kept in the accessibility tree. |

### Other exports (264)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`Accordion`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionContent`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionItem`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionTrigger`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`Alert`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDescription`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDialog`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogAction`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogCancel`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogContent`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogDescription`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogFooter`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogHeader`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogOverlay`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogPortal`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTitle`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTrigger`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertTitle`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`alertVariants`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AspectRatio`](../packages/ui/src/components/ui/aspect-ratio.tsx) | value | — | _(no summary)_ |
| [`Avatar`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarFallback`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarImage`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`bandVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Breadcrumb`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbEllipsis`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbItem`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbLink`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbList`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbPage`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbSeparator`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`Calendar`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`CalendarDayButton`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`Card`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardContent`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardDescription`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardFooter`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardHeader`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardTitle`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`Carousel`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselContent`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselItem`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselNext`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselPrevious`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`ChartContainer`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegend`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegendContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartStyle`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltip`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltipContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`Checkbox`](../packages/ui/src/components/ui/checkbox.tsx) | value | — | _(no summary)_ |
| [`Chip`](../packages/ui/src/components/resource/chip.tsx) | function | — | A small status chip in one of the resource workspace's tones (tinted, AA-safe Genesis badges). |
| [`cn`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`Collapsible`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleContent`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleTrigger`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`Command`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandDialog`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandEmpty`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandGroup`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandInput`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandItem`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandList`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandSeparator`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandShortcut`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`containerVariants`](../packages/ui/src/components/layout/container.tsx) | value | — | _(no summary)_ |
| [`ContextMenu`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuCheckboxItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuLabel`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuPortal`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSeparator`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuShortcut`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSub`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`dayLabel`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`DefaultLink`](../packages/ui/src/navigation.tsx) | const | Beta | Default link — a plain `<a>`. No router required. |
| [`defaultNavigate`](../packages/ui/src/navigation.tsx) | const | Beta | Default navigate — a full-page navigation. No router required. |
| [`Dialog`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogClose`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogContent`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogDescription`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogFooter`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogHeader`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogOverlay`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogPortal`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTitle`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTrigger`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`displayVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Drawer`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerClose`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerContent`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerDescription`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerFooter`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerHeader`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerOverlay`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerPortal`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTitle`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTrigger`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DropdownMenu`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuCheckboxItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuLabel`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuPortal`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSeparator`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuShortcut`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSub`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`embedSnippet`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`fillMessage`](../packages/ui/src/messages.tsx) | function | — | Fills `{name}` placeholders; an unknown placeholder is left as written. |
| [`FollowUpList`](../packages/ui/src/components/resource/FollowUpList.tsx) | function | — | Responses that need a follow-up (the host decides which; forms-studio's needsFollowUp is one rule), each with who answered, a tag, the day and context, their comment, its low score and the host's actions (Reply, Mark handled). Handled it... |
| [`FormDescription`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormError`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormField`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormLabel`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`GAP_CLASSES`](../packages/ui/src/components/layout/spacing.ts) | const | — | `SpaceToken` → Tailwind gap utility. `satisfies` keeps the table exhaustive against the scale, so adding a step to `spaceScale` without a class here is a type error rather than a silently missing gap. |
| [`gridVariants`](../packages/ui/src/components/layout/grid.tsx) | value | — | _(no summary)_ |
| [`H1`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H2`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H3`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H4`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`HeadlineNumbers`](../packages/ui/src/components/resource/HeadlineNumbers.tsx) | function | — | A row of headline numbers (KPI cards): two across on a phone, up to four on a wide screen. |
| [`HoverCard`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardContent`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardTrigger`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`Input`](../packages/ui/src/components/ui/input.tsx) | value | — | _(no summary)_ |
| [`InputGroupInput`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupPrefix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupSuffix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputOTP`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPGroup`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSeparator`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSlot`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`isPathActive`](../packages/core/src/navigation.ts) | function | Beta | Default active-path matcher, mirroring React Router's `NavLink` (prefix match, with `/` treated as exact). Consumers can override via an `isActive` prop where components accept one. |
| [`Label`](../packages/ui/src/components/ui/label.tsx) | value | — | _(no summary)_ |
| [`Large`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`Lead`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`leadVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`Menubar`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarCheckboxItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarLabel`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarMenu`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarPortal`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSeparator`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarShortcut`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSub`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`Muted`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`NavigationMenu`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuContent`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuIndicator`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuItem`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuLink`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuList`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuTrigger`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`navigationMenuTriggerStyle`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuViewport`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NoFeaturesFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for an empty roadmap / feature list. |
| [`NoFeedbackFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a feedback inbox with nothing in it yet. |
| [`NoSearchResults`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a search or filter that matched nothing. |
| [`P`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`pageLoadingVariants`](../packages/ui/src/components/patterns/page-loading.tsx) | value | — | _(no summary)_ |
| [`Pagination`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationContent`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationEllipsis`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationItem`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationLink`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationNext`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationPrevious`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`Popover`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverContent`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverTrigger`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`prefilledUrl`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`Progress`](../packages/ui/src/components/ui/progress.tsx) | value | — | _(no summary)_ |
| [`RadioGroup`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`RadioGroupItem`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`readinessChip`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`ReadinessChip`](../packages/ui/src/components/resource/ReadinessChip.tsx) | function | — | "Ready to publish", or how many problems to fix: for the trailing slot of a resource page's row of tabs (genesis-ui's `<AppShellSubNavEnd>`). With `onClick` it is a button (open the checks). |
| [`readinessOf`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`renderSlot`](../packages/core/src/slots.tsx) | function | — | Renders one slot: the override if given, the default otherwise, nothing if ejected with `null`. |
| [`ResizableHandle`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanel`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanelGroup`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`resolveNavigation`](../packages/core/src/navigation.ts) | function | Beta | Resolve where `pathname` sits in a logical navigation tree. Pure: it never reads browser history or `window`. |
| [`resolveUiMessages`](../packages/ui/src/messages.tsx) | function | — | The catalogue with overrides merged over the English. |
| [`ResourceSettingsPage`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | Every setting of one thing (a form, a course, a worksheet) on one page: jump links on the left ("On this page", the one in view marked), the sections as cards on the right. On a phone the links sit above the sections as a row that scroll... |
| [`ResponsesToolbar`](../packages/ui/src/components/resource/ResponsesToolbar.tsx) | function | — | The Responses tab's toolbar: a Summary / Each response switch, the host's filters (forms-studio's ResponsesFilters, or its own) and, on the right, its export actions (open a Sheet, Download CSV). `labels` renames the switch, e.g. "Each s... |
| [`SAVE_STATE_LABEL`](../packages/ui/src/components/resource/index.ts) | value | — | _(no summary)_ |
| [`ScrollArea`](../packages/ui/src/components/ui/scroll-area.tsx) | value | — | _(no summary)_ |
| [`sectionHeadingVariants`](../packages/ui/src/components/layout/section.tsx) | value | — | _(no summary)_ |
| [`Select`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectContent`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectGroup`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectItem`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollDownButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollUpButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectTrigger`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectValue`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`Separator`](../packages/ui/src/components/ui/separator.tsx) | value | — | _(no summary)_ |
| [`SettingsSection`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | One group of settings as a card: an icon, a title and a sentence, then its rows (genesis-ui `SettingsRow` and `ToggleRow`: a label, a one-sentence description and the control), divided by lines. On a phone a row whose control isn't a swi... |
| [`ShareDialog`](../packages/ui/src/components/resource/ShareDialog.tsx) | function | — | Sharing one published page (a form, a course, a worksheet), as Google Forms' Send step: its link with Copy, a QR code (and a printable poster when the host has one), an `<iframe>` to embed it on a website, and a builder for prefilled lin... |
| [`Sheet`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetClose`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetContent`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetDescription`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetFooter`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetHeader`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetOverlay`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetPortal`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTitle`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTrigger`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`Skeleton`](../packages/ui/src/components/ui/skeleton.tsx) | value | — | _(no summary)_ |
| [`Slider`](../packages/ui/src/components/ui/slider.tsx) | value | — | _(no summary)_ |
| [`Small`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`spaceScale`](../packages/ui/src/components/layout/spacing.ts) | const | — | Semantic spacing steps, in pixels, on the 4px design grid. |
| [`splitVariants`](../packages/ui/src/components/layout/split.tsx) | value | — | _(no summary)_ |
| [`stackVariants`](../packages/ui/src/components/layout/stack.tsx) | value | — | _(no summary)_ |
| [`statusBadgeVariants`](../packages/ui/src/components/patterns/status-badge.tsx) | const | — | _(no summary)_ |
| [`SummaryCard`](../packages/ui/src/components/resource/SummaryCard.tsx) | function | — | One card of a summary column: an icon and a title, a short line on the right ("24 responses · average 4.1"), then whatever summarises it (bars, quotes, a split bar). |
| [`Switch`](../packages/ui/src/components/ui/switch.tsx) | value | — | _(no summary)_ |
| [`TableBody`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCaption`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCell`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableFooter`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHead`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHeader`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableRow`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`Tabs`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsContent`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsList`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsTrigger`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`Textarea`](../packages/ui/src/components/ui/textarea.tsx) | value | — | _(no summary)_ |
| [`toast`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toaster`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toggle`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToggleGroup`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`ToggleGroupItem`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToolbarToggleGroup`](../packages/ui/src/components/ui/toolbar.tsx) | const | Beta | ToolbarToggleGroup — a set of pressed/unpressed controls inside a toolbar (the classic bold / italic / underline cluster). |
| [`toolbarVariants`](../packages/ui/src/components/ui/toolbar.tsx) | const | — | _(no summary)_ |
| [`UiMessagesProvider`](../packages/ui/src/messages.tsx) | function | — | Rewords or translates Genesis UI's components below it. Nested providers build on the one above, so a section can change a few words. |
| [`useBrowserSearchParams`](../packages/ui/src/navigation.tsx) | function | Beta | Browser-native {@link SearchParamsAdapter} built on the History API. Reads the current query string and writes updates via `pushState`/`replaceState`, staying reactive to `popstate` events. No router required. |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`userAvatarVariants`](../packages/ui/src/components/patterns/user-avatar.tsx) | value | — | _(no summary)_ |
| [`useUiMessages`](../packages/ui/src/messages.tsx) | function | — | The catalogue in effect: English unless a `UiMessagesProvider` says otherwise. |

### Types (34)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BuilderLayoutSlotProps };
export type { ButtonAsChildProps };
export type { CarouselApi };
export type { ChartConfig };
export type { ChipTone };
export type { CommandPaletteItem };
export type { FollowUpEntry };
export type { GenesisLinkProps };
export type { HeadlineNumber };
export type { IsPathActiveOptions };
export type { LinkComponent };
export type { NavigateFn };
export type { NavigationNode };
export type { PrefillChoice };
export type { Readiness };
export type { ReadinessFinding };
export type { ReadinessLabels };
export type { ReadinessOptions };
export type { ResolvedNavigation };
export type { ResourceSettingsSection };
export type { ResponsesView };
export type { SaveState };
export type { SearchParamsAdapter };
export type { SettingsPageSection };
export type { SlotOverride };
export type { SlotPropsFor };
export type { Slots };
export type { SortableListItemContext };
export type { SortableListReorder };
export type { SpaceToken };
export type { SplitBreakpoint };
export type { SplitRatio };
export type { StatusBadgeStatus };
export type { UiMessagesOverrides };
```

---

## @marktiderman/genesis-ui/data

**Barrel:** [`packages/ui/src/components/data/index.ts`](../packages/ui/src/components/data/index.ts)

### Components (15)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |
| [`ConfirmDeleteDialog`](../packages/ui/src/components/data/ConfirmDeleteDialog.tsx) | `ConfirmDeleteDialogProps` | Beta | The confirm step in front of a destructive delete: an `AlertDialog` (Radix owns focus trap, Escape and focus return), a pending state, and the failure shown in place rather than swallowed. `ResourcePage` renders it for `allowDelete` / `c... |
| [`DataList`](../packages/ui/src/components/data/DataList.tsx) | `DataListProps` | — | _(no summary)_ |
| [`DataPageShell`](../packages/ui/src/components/data/DataPageShell.tsx) | `DataPageShellProps` | — | _(no summary)_ |
| [`DataTable`](../packages/ui/src/components/data/DataTable.tsx) | `DataTableProps` | — | _(no summary)_ |
| [`DetailPanel`](../packages/ui/src/components/data/DetailPanel.tsx) | `DetailPanelProps` | — | _(no summary)_ |
| [`KanbanBoard`](../packages/ui/src/components/data/KanbanBoard.tsx) | `KanbanBoardProps` | — | Columns of cards, optionally movable between columns. |
| [`RecordView`](../packages/ui/src/components/data/resource-view/RecordView.tsx) | `RecordViewProps` | — | One record's screen, from its record view (defineRecordView): |
| [`ResourceDetailPage`](../packages/ui/src/components/data/ResourceDetailPage.tsx) | `ResourceDetailPageProps` | Beta | ResourceDetailPage — `DetailPage` with a record bound to it: fetches one record by id through the mounted `DataProvider` and hands it to the title, the actions, the sidebar and the content. |
| [`ResourceForm`](../packages/ui/src/components/data/ResourceForm.tsx) | `ResourceFormProps` | — | _(no summary)_ |
| [`ResourcePage`](../packages/ui/src/components/data/ResourcePage.tsx) | `ResourcePageProps` | — | A list page for a resource: header, filters, table or cards, paging, the open record's panel, and the built-in form and confirmed delete. {@link useResourceTable} is the same behaviour without this markup. |
| [`ResourceView`](../packages/ui/src/components/data/resource-view/ResourceView.tsx) | `ResourceViewProps` | — | A list screen from a view, in one line: |
| [`ResourceWorkspace`](../packages/ui/src/components/data/resource-view/RecordView.tsx) | `ResourceWorkspaceProps` | — | _(no summary)_ |
| [`StatCard`](../packages/ui/src/components/data/StatCard.tsx) | `StatCardProps` | — | _(no summary)_ |
| [`TreeIndent`](../packages/ui/src/components/data/TreeIndent.tsx) | `TreeIndentProps` | — | The indent for a row's depth, its expand arrow (or a spacer for a leaf), then the row's content. |

### Other exports (35)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AppShell`](../packages/ui/src/components/data/index.ts) | const | Deprecated | _(no summary)_ |
| [`BadgeCell`](../packages/ui/src/components/data/cell-formatters.tsx) | function | — | BadgeCell -- status badge with configurable color map. |
| [`CurrencyCell`](../packages/ui/src/components/data/cell-formatters.tsx) | function | — | CurrencyCell -- currency formatting with string-safe parsing. |
| [`DataBulkBar`](../packages/ui/src/components/data/DataBulkBar.tsx) | function | — | _(no summary)_ |
| [`DataFilters`](../packages/ui/src/components/data/DataFilters.tsx) | function | — | _(no summary)_ |
| [`DataGrid`](../packages/ui/src/components/data/DataGrid.tsx) | function | — | _(no summary)_ |
| [`DateCell`](../packages/ui/src/components/data/cell-formatters.tsx) | function | — | DateCell -- shows relative date by default, formatted date otherwise. Compatible with DataTableColumn<T>'s `render` prop. |
| [`DefaultLink`](../packages/ui/src/navigation.tsx) | const | Beta | Default link — a plain `<a>`. No router required. |
| [`defaultNavigate`](../packages/ui/src/navigation.tsx) | const | Beta | Default navigate — a full-page navigation. No router required. |
| [`DisplayRenderersProvider`](../packages/ui/src/components/data/resource-view/display.tsx) | function | — | Replace some of the renderers for everything below (nested providers build on each other). Pass a stable object (a module constant or a `useMemo`): a new one each render redraws every column. |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | EmptyState — what to show when a list, page, or panel has no data. |
| [`FieldArrayRenderer`](../packages/ui/src/components/data/FieldArrayRenderer.tsx) | function | — | _(no summary)_ |
| [`FileUploadField`](../packages/ui/src/components/data/FileUploadField.tsx) | function | — | _(no summary)_ |
| [`FilterCombobox`](../packages/ui/src/components/data/FilterCombobox.tsx) | function | — | _(no summary)_ |
| [`isPathActive`](../packages/core/src/navigation.ts) | function | Beta | Default active-path matcher, mirroring React Router's `NavLink` (prefix match, with `/` treated as exact). Consumers can override via an `isActive` prop where components accept one. |
| [`LinkCell`](../packages/ui/src/components/data/DataTable.tsx) | function | — | _(no summary)_ |
| [`NumberCell`](../packages/ui/src/components/data/cell-formatters.tsx) | function | — | NumberCell -- locale-aware number formatting. |
| [`PageHeader`](../packages/ui/src/components/data/index.ts) | const | Deprecated | _(no summary)_ |
| [`RelationField`](../packages/ui/src/components/data/RelationField.tsx) | function | — | _(no summary)_ |
| [`resolveNavigation`](../packages/core/src/navigation.ts) | function | Beta | Resolve where `pathname` sits in a logical navigation tree. Pure: it never reads browser history or `window`. |
| [`RowAvatar`](../packages/ui/src/components/data/resource-view/RowAvatar.tsx) | function | — | A row's picture from `rowPicture(view.summary(row))`: the image, or initials when there is no safe image or it fails to load. Decorative unless the view gave `alt`: the row's title beside it already names the row. |
| [`showUndoToast`](../packages/ui/src/components/data/undo-toast.ts) | function | — | The undo toast for an `undoable` write (core's `onUndoable`): a sonner toast with an Undo button, shown for as long as the undo is offered. Needs a mounted `<Toaster />`. |
| [`showWriteErrorToast`](../packages/ui/src/components/data/undo-toast.ts) | function | — | The default error report for writes that fail after the form has closed. |
| [`ThumbnailCell`](../packages/ui/src/components/data/DataTable.tsx) | function | — | _(no summary)_ |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`useDisplayCell`](../packages/ui/src/components/data/resource-view/display.tsx) | function | — | Draw one cell: the empty mark for no value or a cell the row (or viewer) hides (`when`), else its hint's renderer. |
| [`useResourceTable`](../packages/ui/src/components/data/use-resource-table.ts) | function | Beta | The list behind {@link ResourcePage}, without any markup: where the rows come from (a `resource` through the data provider, or `data` you pass), search, sort, status filter and paging, selection, the open record (and its URL state), the ... |
| [`useResourceView`](../packages/ui/src/components/data/resource-view/ResourceView.tsx) | function | — | The headless form: the same state as `useResourceTable`, from a view. |
| [`useResourceViewProps`](../packages/ui/src/components/data/resource-view/ResourceView.tsx) | function | — | The ResourcePage props a view and a screen's options make. `useResourceView` and `<ResourceView>` both use it; call it yourself to hand the props to your own layout. |
| [`useSavedViews`](../packages/ui/src/hooks/use-saved-views.ts) | function | — | Persist `DataFilters` saved-view shape in localStorage. |
| [`ViewSettings`](../packages/ui/src/components/patterns/view-settings.tsx) | function | — | _(no summary)_ |
| [`ViewToggle`](../packages/ui/src/components/patterns/view-toggle.tsx) | function | — | _(no summary)_ |
| [`webDisplayRenderers`](../packages/ui/src/components/data/resource-view/display.tsx) | const | — | Genesis's web renderers. Every one shows text it can't draw, never a broken cell. |
| [`WizardForm`](../packages/ui/src/components/data/WizardForm.tsx) | function | — | _(no summary)_ |
| `X` | value | — | _(no summary)_ |

### Types (43)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BulkAction };
export type { ColumnStatus };
export type { CommandPaletteItem };
export type { DataFilterConfig };
export type { DataTableColumn };
export type { DataTableSort };
export type { DataTableTree };
export type { Density };
export type { DisplayContext };
export type { DisplayRenderer };
export type { DisplayRenderers };
export type { FieldType };
export type { FilterOption };
export type { GenesisLinkProps };
export type { IsPathActiveOptions };
export type { KanbanColumn };
export type { LinkComponent };
export type { NavigateFn };
export type { NavigationNode };
export type { ResolvedNavigation };
export type { ResourceAction };
export type { ResourceActions };
export type { ResourceCardActions };
export type { ResourceColumnDef };
export type { ResourceDeleteConfirmCopy };
export type { ResourceFormFieldDef };
export type { ResourcePageSlotMap };
export type { ResourcePageSlotProps };
export type { ResourcePageSlots };
export type { ResourceTableState };
export type { ResourceViewOptions };
export type { ResponsiveViewMode };
export type { SavedViewItem };
export type { SelectOption };
export type { SlotOverride };
export type { SlotPropsFor };
export type { Slots };
export type { StatCardColor };
export type { StatusChipOption };
export type { StatusChipsVariant };
export type { UseSavedViewsReturn };
export type { ViewMode };
export type { ViewModeDefault };
```

---

## @marktiderman/genesis-ui/patterns

**Barrel:** [`packages/ui/src/components/patterns/index.ts`](../packages/ui/src/components/patterns/index.ts)

### Components (7)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | `EmptyStateProps` | Beta | EmptyState — what to show when a list, page, or panel has no data. |
| [`PageLoading`](../packages/ui/src/components/patterns/page-loading.tsx) | `PageLoadingProps` | Beta | PageLoading — full-page or in-section loading state: a centered `Spinner` with an optional message. The loading-state counterpart to `EmptyState`. Reach for `Skeleton` instead when the placeholder should mimic the shape of the content th... |
| [`SettingsRow`](../packages/ui/src/components/patterns/settings-row.tsx) | `SettingsRowProps` | Beta | SettingsRow — label + description on one side, an arbitrary trailing control (Switch, Select, Button, Badge, ...) on the other. This is the shared layout behind every settings/preferences list row; see `ToggleRow` for the common label+de... |
| [`SortableList`](../packages/ui/src/components/patterns/sortable-list.tsx) | `SortableListProps` | Beta | A vertical list the user can rearrange: course steps, lesson blocks, form fields. |
| [`StatusBadge`](../packages/ui/src/components/patterns/status-badge.tsx) | `StatusBadgeProps` | Beta | Status-specific badge for progress/health states — the OKR-style "on track / at risk / off track" goal vocabulary plus common task-lifecycle states ("done", "blocked", "in progress"). |
| [`ToggleRow`](../packages/ui/src/components/patterns/toggle-row.tsx) | `ToggleRowProps` | Beta | ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common label+description+on/off row for settings and preferences UI. |
| [`UserAvatar`](../packages/ui/src/components/patterns/user-avatar.tsx) | `UserAvatarProps` | Beta | UserAvatar — canonical user-identity avatar. Shows the person's photo when `src` is set and loads successfully; otherwise (including a failed image load — Radix's Avatar swaps to the fallback automatically) it falls back to initials comp... |

### Other exports (12)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FormDescription`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormError`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormField`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormLabel`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`NoFeaturesFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for an empty roadmap / feature list. |
| [`NoFeedbackFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a feedback inbox with nothing in it yet. |
| [`NoSearchResults`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a search or filter that matched nothing. |
| [`pageLoadingVariants`](../packages/ui/src/components/patterns/page-loading.tsx) | value | — | _(no summary)_ |
| [`statusBadgeVariants`](../packages/ui/src/components/patterns/status-badge.tsx) | const | — | _(no summary)_ |
| [`userAvatarVariants`](../packages/ui/src/components/patterns/user-avatar.tsx) | value | — | _(no summary)_ |
| [`ViewSettings`](../packages/ui/src/components/patterns/view-settings.tsx) | function | — | _(no summary)_ |
| [`ViewToggle`](../packages/ui/src/components/patterns/view-toggle.tsx) | function | — | _(no summary)_ |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SortableListItemContext };
export type { SortableListReorder };
export type { StatusBadgeStatus };
export type { ViewMode };
```

---

## @marktiderman/genesis-ui/layout

**Barrel:** [`packages/ui/src/components/layout/index.ts`](../packages/ui/src/components/layout/index.ts)

### Components (19)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppShell`](../packages/ui/src/components/layout/AppShell.tsx) | `AppShellProps` | — | _(no summary)_ |
| [`AuthPage`](../packages/ui/src/components/layout/auth-page.tsx) | `AuthPageProps` | Beta | AuthPage — the web counterpart of native `AuthScreen`: a whole-screen, centred card for sign-in, sign-up, password reset, invite acceptance and email verification. |
| [`Band`](../packages/ui/src/components/layout/band.tsx) | `BandProps` | Beta | Band: a full-bleed, full-width marketing section. The background runs edge to edge; the content sits in a centered column with the page gutter. It is what a landing page is made of: a hero, a features band, a call to action, a footer. |
| [`BandLead`](../packages/ui/src/components/layout/band.tsx) | `BandLeadProps` | Beta | _(no summary)_ |
| [`BuilderLayout`](../packages/ui/src/components/layout/builder-layout.tsx) | `BuilderLayoutProps` | Beta | BuilderLayout — the three columns of a builder: an outline of the parts on the left, the editor for the selected part in the centre, a live preview on the right. |
| [`Container`](../packages/ui/src/components/layout/container.tsx) | `ContainerProps` | Beta | Container — the page gutter: a centered column with a named maximum width and responsive side padding. |
| [`DashboardPage`](../packages/ui/src/components/layout/dashboard-page.tsx) | `DashboardPageProps` | Beta | DashboardPage — a stat row over a flexible region of charts, tables and sections. |
| [`DetailPage`](../packages/ui/src/components/layout/detail-page.tsx) | `DetailPageProps` | Beta | DetailPage — one record's full view: a title row with actions, a primary content region, and a metadata sidebar that drops below the content on small screens. |
| [`Display`](../packages/ui/src/components/layout/band.tsx) | `DisplayProps` | Beta | Display: a heading in the marketing type scale (`displayVariants`). |
| [`FormPage`](../packages/ui/src/components/layout/form-page.tsx) | `FormPageProps` | Beta | FormPage — a titled form: header, validation summary, a body of sections, and a sticky action bar. |
| [`Grid`](../packages/ui/src/components/layout/grid.tsx) | `GridProps` | Beta | Grid — two-dimensional flow for card and tile collections. |
| [`PageHeader`](../packages/ui/src/components/layout/PageHeader.tsx) | `PageHeaderProps` | — | _(no summary)_ |
| [`PublicPage`](../packages/ui/src/components/layout/public-page.tsx) | `PublicPageProps` | Beta | PublicPage — a page anyone can open without signing in: a public form, a QR poster, a landing page. A brand header, one content column, and a "Powered by …" footer, themed from a brand object. |
| [`Section`](../packages/ui/src/components/layout/section.tsx) | `SectionProps` | Beta | Section — a titled region of a page: heading, optional description, optional trailing actions, and the content itself. |
| [`SettingsPage`](../packages/ui/src/components/layout/settings-page.tsx) | `SettingsPageProps` | Beta | SettingsPage — a sectioned settings surface with a nav rail for jumping between sections. |
| [`Split`](../packages/ui/src/components/layout/split.tsx) | `SplitProps` | Beta | Split — the master-detail layout: two panes side by side above a breakpoint, stacked below it. |
| [`Stack`](../packages/ui/src/components/layout/stack.tsx) | `StackProps` | Beta | Stack — one-dimensional flow. The single most-repeated shape in any application: a run of things in a line, evenly spaced. |
| [`SubNavTabs`](../packages/ui/src/components/layout/sub-nav.tsx) | `SubNavTabsProps` | Beta | A row of navigation tabs: real links (deep links and middle-click work), `aria-current="page"` on the active one, badges as chips, the active tab underlined in the brand colour. AppShell renders it in `tabs` mode; an app using `subNav: "... |
| [`WorkspaceSwitcher`](../packages/ui/src/components/layout/workspace-switcher.tsx) | `WorkspaceSwitcherProps` | Beta | The workspace switcher. Put it in AppShell's `headerSlot`, and the `rail` and `bar` variants in `collapsedHeaderSlot` and `mobileHeaderSlot`. |

### Other exports (27)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`accessibleAccent`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | The contrast fallback. Returns the accent unchanged when its emitted triplet reaches `minRatio` against `background` (white by default); otherwise the same (rounded) hue and saturation at the highest lightness, to 0.1%, whose emitted tri... |
| [`AppShellPageHeader`](../packages/ui/src/components/layout/sub-nav.tsx) | function | Beta | Render the page's resource header (breadcrumb, title, status, actions) at the top of the shell's content, ABOVE the sub-navigation tab row, where the design puts it. A portal like `AppShellSubNavEnd`, so it keeps the page's state; the in... |
| [`AppShellSubNavEnd`](../packages/ui/src/components/layout/sub-nav.tsx) | function | Beta | Render `children` in the right-hand slot of the shell's sub-navigation tab row, e.g. a "Ready to publish" status chip. Rendered through a portal, so it keeps the page's context and state. On phones, where the bottom bar replaces the tab ... |
| [`bandVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`brandThemeStyle`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | The CSS variables for a brand's accent, for a page root's `style`. Empty when the brand has no valid accent, so the page keeps Genesis's primary. |
| [`containerVariants`](../packages/ui/src/components/layout/container.tsx) | value | — | _(no summary)_ |
| [`contrastRatio`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | WCAG 2 contrast ratio between two colours, 1 to 21. |
| [`DEFAULT_WORKSPACE_KIND_ICONS`](../packages/ui/src/components/layout/workspace-switcher.tsx) | const | — | The default picture for a kind with no image of its own; tenants show their initials. |
| [`DEFAULT_WORKSPACE_KIND_LABELS`](../packages/ui/src/components/layout/workspace-switcher.tsx) | const | — | The default heading over each kind's group in the menu. |
| [`displayVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`GAP_CLASSES`](../packages/ui/src/components/layout/spacing.ts) | const | — | `SpaceToken` → Tailwind gap utility. `satisfies` keeps the table exhaustive against the scale, so adding a step to `spaceScale` without a class here is a type error rather than a silently missing gap. |
| [`gridVariants`](../packages/ui/src/components/layout/grid.tsx) | value | — | _(no summary)_ |
| [`leadVariants`](../packages/ui/src/components/layout/band.tsx) | value | — | _(no summary)_ |
| [`MIN_TEXT_CONTRAST`](../packages/ui/src/components/layout/brand-theme.ts) | const | — | WCAG AA for normal-size text. |
| [`parseColor`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | Parses `#rgb`, `#rrggbb`, `rgb()`/`rgba()`, `hsl()`/`hsla()` (commas or spaces, optional `/` or `,` alpha, which is ignored) and bare HSL triplets like `"160 84% 39%"`. Anything else, including out-of-range channels: `null`. Never throws. |
| [`relativeLuminance`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | WCAG 2 relative luminance, 0 (black) to 1 (white). |
| [`resolveNavigation`](../packages/core/src/navigation.ts) | function | Beta | Resolve where `pathname` sits in a logical navigation tree. Pure: it never reads browser history or `window`. |
| [`sectionHeadingVariants`](../packages/ui/src/components/layout/section.tsx) | value | — | _(no summary)_ |
| [`spaceScale`](../packages/ui/src/components/layout/spacing.ts) | const | — | Semantic spacing steps, in pixels, on the 4px design grid. |
| [`splitVariants`](../packages/ui/src/components/layout/split.tsx) | value | — | _(no summary)_ |
| [`stackVariants`](../packages/ui/src/components/layout/stack.tsx) | value | — | _(no summary)_ |
| [`toHslTriplet`](../packages/ui/src/components/layout/brand-theme.ts) | function | — | The Genesis token shape: `"160 84% 39%"`, for `hsl(var(--x))`. |
| [`useAppShellSubNav`](../packages/ui/src/components/layout/sub-nav.tsx) | function | Beta | Give the shell this page's child items (sub-navigation) while the page is mounted. They replace the current `NavigationNode`'s `items`; pass `null` / `undefined` to fall back to them (a `mode` still applies). When several components call... |
| [`WORKSPACE_SWITCHER_PARTS`](../packages/ui/src/components/layout/workspace-switcher.tsx) | const | — | Every part, in document order; see {@link WorkspaceSwitcherPart}. |
| [`WORKSPACE_SWITCHER_SCOPE`](../packages/ui/src/components/layout/workspace-switcher.tsx) | const | — | The value of every part's `data-scope`. |
| [`WORKSPACE_SWITCHER_SEARCH_THRESHOLD`](../packages/ui/src/components/layout/workspace-switcher.tsx) | const | — | With `search="auto"`, past this many workspaces the menu opens with a search box. |
| [`workspaceThemeStyle`](../packages/ui/src/components/layout/workspace-switcher.tsx) | function | Beta | The CSS variables for a workspace's brand (`workspace.theme.accent`): `--primary`, `--primary-foreground` and `--ring` pointed at an accessible shade of the accent, as `brandThemeStyle` does for a public page. Empty without a valid accen... |

### Types (35)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AccessibleAccent };
export type { AppShellOptions };
export type { AuthPageBrandingProps };
export type { AuthPageSlotMap };
export type { BuilderLayoutSlotProps };
export type { GenesisLinkProps };
export type { LinkComponent };
export type { NavItem };
export type { NavigationNode };
export type { PageHeaderOptions };
export type { ParentNavigation };
export type { PublicBrand };
export type { PublicPageSlotMap };
export type { ResolvedNavigation };
export type { Rgb };
export type { SettingsPageSection };
export type { SpaceToken };
export type { SplitBreakpoint };
export type { SplitRatio };
export type { SubNavItem };
export type { SubNavMode };
export type { UseAppShellSubNavOptions };
export type { WorkspaceSwitcherAction };
export type { WorkspaceSwitcherBadgeProps };
export type { WorkspaceSwitcherClassNames };
export type { WorkspaceSwitcherEmptyProps };
export type { WorkspaceSwitcherImageProps };
export type { WorkspaceSwitcherItemProps };
export type { WorkspaceSwitcherPart };
export type { WorkspaceSwitcherSearchProps };
export type { WorkspaceSwitcherShortcuts };
export type { WorkspaceSwitcherSlotMap };
export type { WorkspaceSwitcherSlotProps };
export type { WorkspaceSwitcherSlots };
export type { WorkspaceSwitcherVariant };
```

---

## @marktiderman/genesis-ui/resource

**Barrel:** [`packages/ui/src/components/resource/index.ts`](../packages/ui/src/components/resource/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ResourceHeader`](../packages/ui/src/components/resource/ResourceHeader.tsx) | `ResourceHeaderProps` | — | The header of a page that edits one publishable thing (a form, a course, a lesson, a worksheet): the breadcrumb ("Courses › name"), the title once, its status and save-state chips, and on the right undo and redo, Preview, Share and Publi... |

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`Chip`](../packages/ui/src/components/resource/chip.tsx) | function | — | A small status chip in one of the resource workspace's tones (tinted, AA-safe Genesis badges). |
| [`dayLabel`](../packages/core/src/resource/days.ts) | function | — | A day (YYYY-MM-DD) in words, given today on the same clock: "Today", "Yesterday", "Oct 21", "Oct 21, 2025". |
| [`embedSnippet`](../packages/core/src/resource/share.ts) | function | — | An `<iframe>` that shows the page on another website, full width. |
| [`FollowUpList`](../packages/ui/src/components/resource/FollowUpList.tsx) | function | — | Responses that need a follow-up (the host decides which; forms-studio's needsFollowUp is one rule), each with who answered, a tag, the day and context, their comment, its low score and the host's actions (Reply, Mark handled). Handled it... |
| [`HeadlineNumbers`](../packages/ui/src/components/resource/HeadlineNumbers.tsx) | function | — | A row of headline numbers (KPI cards): two across on a phone, up to four on a wide screen. |
| [`prefilledUrl`](../packages/core/src/resource/share.ts) | function | — | `url` with `values` set as search params (empty values left out), keeping what it has. An absolute link stays absolute; a relative one (`/f/a?x=1`) stays relative, so it never throws while a page is still working out its origin. |
| [`readinessChip`](../packages/core/src/resource/status.ts) | function | — | The readiness chip's label and tone. |
| [`ReadinessChip`](../packages/ui/src/components/resource/ReadinessChip.tsx) | function | — | "Ready to publish", or how many problems to fix: for the trailing slot of a resource page's row of tabs (genesis-ui's `<AppShellSubNavEnd>`). With `onClick` it is a button (open the checks). |
| [`readinessOf`](../packages/core/src/resource/status.ts) | function | — | Readiness from an editor's findings (any list of `{ level, code? }`): errors block publishing, warnings ask for a look. One pass over the findings. |
| [`ResourceSettingsPage`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | Every setting of one thing (a form, a course, a worksheet) on one page: jump links on the left ("On this page", the one in view marked), the sections as cards on the right. On a phone the links sit above the sections as a row that scroll... |
| [`ResponsesToolbar`](../packages/ui/src/components/resource/ResponsesToolbar.tsx) | function | — | The Responses tab's toolbar: a Summary / Each response switch, the host's filters (forms-studio's ResponsesFilters, or its own) and, on the right, its export actions (open a Sheet, Download CSV). `labels` renames the switch, e.g. "Each s... |
| [`SAVE_STATE_LABEL`](../packages/core/src/resource/status.ts) | const | — | _(no summary)_ |
| [`SettingsSection`](../packages/ui/src/components/resource/ResourceSettingsPage.tsx) | function | — | One group of settings as a card: an icon, a title and a sentence, then its rows (genesis-ui `SettingsRow` and `ToggleRow`: a label, a one-sentence description and the control), divided by lines. On a phone a row whose control isn't a swi... |
| [`ShareDialog`](../packages/ui/src/components/resource/ShareDialog.tsx) | function | — | Sharing one published page (a form, a course, a worksheet), as Google Forms' Send step: its link with Copy, a QR code (and a printable poster when the host has one), an `<iframe>` to embed it on a website, and a builder for prefilled lin... |
| [`SummaryCard`](../packages/ui/src/components/resource/SummaryCard.tsx) | function | — | One card of a summary column: an icon and a title, a short line on the right ("24 responses · average 4.1"), then whatever summarises it (bars, quotes, a split bar). |

### Types (11)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChipTone };
export type { FollowUpEntry };
export type { HeadlineNumber };
export type { PrefillChoice };
export type { Readiness };
export type { ReadinessFinding };
export type { ReadinessLabels };
export type { ReadinessOptions };
export type { ResourceSettingsSection };
export type { ResponsesView };
export type { SaveState };
```

---

## @marktiderman/genesis-ui/resource/rules

**Barrel:** [`packages/ui/src/components/resource/rules.ts`](../packages/ui/src/components/resource/rules.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`dayLabel`](../packages/core/src/resource/days.ts) | function | — | A day (YYYY-MM-DD) in words, given today on the same clock: "Today", "Yesterday", "Oct 21", "Oct 21, 2025". |
| [`embedSnippet`](../packages/core/src/resource/share.ts) | function | — | An `<iframe>` that shows the page on another website, full width. |
| [`prefilledUrl`](../packages/core/src/resource/share.ts) | function | — | `url` with `values` set as search params (empty values left out), keeping what it has. An absolute link stays absolute; a relative one (`/f/a?x=1`) stays relative, so it never throws while a page is still working out its origin. |
| [`readinessChip`](../packages/core/src/resource/status.ts) | function | — | The readiness chip's label and tone. |
| [`readinessOf`](../packages/core/src/resource/status.ts) | function | — | Readiness from an editor's findings (any list of `{ level, code? }`): errors block publishing, warnings ask for a look. One pass over the findings. |
| [`SAVE_STATE_LABEL`](../packages/core/src/resource/status.ts) | const | — | _(no summary)_ |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChipTone };
export type { PrefillChoice };
export type { Readiness };
export type { ReadinessFinding };
export type { ReadinessLabels };
export type { ReadinessOptions };
export type { SaveState };
```

---

## @marktiderman/genesis-ui/hooks

**Barrel:** [`packages/ui/src/hooks/index.ts`](../packages/ui/src/hooks/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |

### Other exports (15)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createPrefetch`](../packages/ui/src/hooks/use-prefetch.ts) | function | — | Factory: create prefetch + prefetchHandlers bound to a given route map. |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`useDataFilters`](../packages/ui/src/hooks/use-data-filters.ts) | function | — | _(no summary)_ |
| [`useIsMobile`](../packages/ui/src/hooks/use-mobile.ts) | function | — | Whether the viewport is narrower than the mobile breakpoint (768px). |
| [`useKeyboardNavigation`](../packages/ui/src/hooks/use-keyboard-navigation.ts) | function | Beta | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useResourcePage`](../packages/ui/src/hooks/use-resource-page.ts) | function | — | _(no summary)_ |
| [`useResourceTable`](../packages/ui/src/components/data/use-resource-table.ts) | function | Beta | The list behind {@link ResourcePage}, without any markup: where the rows come from (a `resource` through the data provider, or `data` you pass), search, sort, status filter and paging, selection, the open record (and its URL state), the ... |
| [`useResourceUrlState`](../packages/ui/src/hooks/use-resource-url-state.ts) | function | Beta | A list's peek, page, sort and search, kept in the URL through any {@link SearchParamsAdapter} (the browser's, React Router's or TanStack Router's). The URL is the source of truth: a copied link reopens the same record on the same page, a... |
| [`useSavedViews`](../packages/ui/src/hooks/use-saved-views.ts) | function | — | Persist `DataFilters` saved-view shape in localStorage. |
| [`useViewPreference`](../packages/ui/src/hooks/use-view-preference.ts) | function | — | _(no summary)_ |
| [`useViewSettings`](../packages/ui/src/hooks/use-view-settings.ts) | function | — | _(no summary)_ |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |

### Types (29)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CommandPaletteItem };
export type { Density };
export type { FilterDef };
export type { FilterDefs };
export type { FilterValues };
export type { KeyboardNavOptions };
export type { KeyboardNavResult };
export type { ResourceActions };
export type { ResourceColumnDef };
export type { ResourcePageTreeState };
export type { ResourceTableState };
export type { ResourceUrlParams };
export type { ResourceUrlState };
export type { ResourceUrlStateOptions };
export type { ResponsiveViewMode };
export type { RouteMap };
export type { UseDataFiltersOptions };
export type { UseOneOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourcePageProps };
export type { UseResourcePageReturn };
export type { UseResourceReturn };
export type { UseSavedViewsReturn };
export type { UseWizardReturn };
export type { ViewModeDefault };
export type { ViewSettings };
export type { WizardStep };
```

---

## @marktiderman/genesis-ui/utils

**Barrel:** [`packages/ui/src/utils.ts`](../packages/ui/src/utils.ts)

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cn`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`formatDate`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`formatRelativeTime`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |

---

## @marktiderman/genesis-ui/status-colors

**Barrel:** [`packages/ui/src/status-colors.ts`](../packages/ui/src/status-colors.ts)

### Other exports (11)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`allStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Combined lookup — useful when you don't know the entity type |
| [`changelogTypeColors`](../packages/ui/src/status-colors.ts) | const | — | Changelog entry types |
| [`feedbackStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Feedback statuses |
| [`getCoverageColor`](../packages/ui/src/status-colors.ts) | function | — | Coverage color helpers |
| [`getCoverageTextColor`](../packages/ui/src/status-colors.ts) | function | — | _(no summary)_ |
| [`ideaStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Idea statuses |
| [`prdStatusColors`](../packages/ui/src/status-colors.ts) | const | — | PRD statuses |
| [`productStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Product statuses |
| [`researchActionColors`](../packages/ui/src/status-colors.ts) | const | — | Research recommended actions |
| [`syncStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Sync statuses |
| [`taskStatusColors`](../packages/ui/src/status-colors.ts) | const | — | Task statuses |

---

## @marktiderman/genesis-ui/provider

**Barrel:** [`packages/ui/src/provider/index.ts`](../packages/ui/src/provider/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataProviderRoot`](../packages/core/src/provider/context.tsx) | `DataProviderRootProps` | — | _(no summary)_ |
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | Convenience root: a `QueryClientProvider`, storage, and a data provider (yours, or a mock built from datasets). It creates its own `QueryClient` unless you pass `queryClient`; an app that already has one should pass it, or mount `DataPro... |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`callRpc`](../packages/core/src/provider/write-helpers.ts) | function | — | Calls a database function and returns its result. A failure throws a DataWriteError with the usual outcome and code, and words a person can read: yours for the code, a guard's own message (P0001), the defaults above, or a generic sentenc... |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createOrAdopt`](../packages/core/src/provider/write-helpers.ts) | function | — | "One live row per key": creates the row, or, when one with the same key is already there (a `duplicate`), adopts it, optionally merging changes in. `adopted` says which, and `final` that the row already there is finished. Key fields that... |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | The Supabase data provider. Reads and writes go through the client you pass, under that client's session and RLS. |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`DEFAULT_RPC_MESSAGES`](../packages/core/src/provider/write-helpers.ts) | const | — | The words shown for a code when the caller gives none. A guard's own `raise exception` (P0001) keeps its words. |
| [`fieldErrorsFromPostgrest`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Reads which columns a Postgres constraint error is about, from PostgREST's `message` / `details`, and gives safe messages for them. Only plain column names are taken from the store's text; the values it echoes are never used. A unique vi... |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |
| [`readOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a store error code to the read outcome it means: the write mapping, with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116, `42703` unknown column, `42P01` unknown table) read as `invalid`. |
| [`RPC_FAILED`](../packages/core/src/provider/write-helpers.ts) | const | — | _(no summary)_ |
| [`toDataWriteError`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Turns anything a write threw, or the `{ message, code }` error a Supabase client returned, into a `DataWriteError`. A `DataWriteError` passes through unchanged; anything else keeps its message and `code`, and is kept as the `cause`. |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`writeOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it means. Anything not listed is `error`: a code is only read as a refusal or a bad value when it says so. |

### Types (49)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { BaseRecord };
export type { BulkChange };
export type { BulkResult };
export type { CallRpcOptions };
export type { CountMode };
export type { CreateOrAdoptOptions };
export type { CreateOrAdoptResult };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DataReadErrorOptions };
export type { DataWriteErrorOptions };
export type { DeleteParams };
export type { DeleteResult };
export type { FilterParam };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { HistoryParams };
export type { Identifier };
export type { ImportParams };
export type { InvalidationKey };
export type { ListParams };
export type { ListResult };
export type { MockProviderOptions };
export type { NullFilter };
export type { PaginationParam };
export type { PostgrestFieldErrors };
export type { RangeFilter };
export type { ReadOutcome };
export type { ResourceChangeEvent };
export type { RowFailure };
export type { RpcClient };
export type { ScalarFilter };
export type { SortParam };
export type { SubscribeParams };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { SupabaseProviderOptions };
export type { SupabaseRealtimeChannel };
export type { SupabaseRealtimePayload };
export type { SupabaseResourceConfig };
export type { SupabaseWriteContext };
export type { UpdateParams };
export type { UpdateResult };
export type { WriteEvent };
export type { WriteOutcome };
```

---

## @marktiderman/genesis-ui/sheet-grid

**Barrel:** [`packages/ui/src/components/sheet-grid/sheet-grid.tsx`](../packages/ui/src/components/sheet-grid/sheet-grid.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SheetGrid`](../packages/ui/src/components/sheet-grid/sheet-grid.tsx) | `SheetGridProps` | Experimental | A spreadsheet grid: virtualized rows, a keyboard-driven active cell and range, in-place editing, and copy and paste through the system clipboard as tab-separated text, so it round-trips with Sheets and Excel. |

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`parseTsv`](../packages/ui/src/components/sheet-grid/sheet-grid.tsx) | function | — | Parse spreadsheet clipboard text (tab-separated, quoted when needed). |
| [`SheetCommitError`](../packages/ui/src/components/sheet-grid/sheet-grid.tsx) | class | — | Reject `onCommit` with this to mark specific cells, rather than every cell in the commit, as failed. |
| [`toTsv`](../packages/ui/src/components/sheet-grid/sheet-grid.tsx) | function | — | Write a block of cells as spreadsheet clipboard text (the inverse of `parseTsv`). |

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SheetCellChange };
export type { SheetGridColumn };
export type { SheetGridRowHeader };
```

---

## @marktiderman/genesis-ui/rich-text

Read-only rich text renderer and server-safe helpers (sanitize, HTML, plain text). No editor dependency; usable in server components and on the server.

**Barrel:** [`packages/ui/src/components/rich-text/rich-text.tsx`](../packages/ui/src/components/rich-text/rich-text.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`RichText`](../packages/ui/src/components/rich-text/rich-text.tsx) | `RichTextProps` | Beta | RichText — renders a rich text document as React elements. |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`emptyRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | An empty document: one empty paragraph, which is what the editor produces. |
| [`escapeHtml`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Escape text for use in HTML element content and quoted attributes. |
| [`isRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | True when `value` is shaped like a rich text document (`{ type: "doc" }`). |
| [`isRichTextEmpty`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | True when the document has no visible text and no embeds. |
| [`isSafeUrl`](../packages/core/src/urls.ts) | function | — | True when `url` is safe to put in an `href`: an absolute http(s), mailto or tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`). |
| [`normalizeLinkUrl`](../packages/core/src/urls.ts) | function | — | Turn what a person typed into the link field into a safe href, or `null`. `example.com/page` becomes `https://example.com/page`; an email address becomes a `mailto:` link. |
| [`parseVideoUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Recognise a YouTube, Vimeo or Loom video URL (watch, share, short and embed forms) and reduce it to its provider and id. Returns `null` for anything else, including other hosts that merely look similar. |
| [`richTextClassName`](../packages/ui/src/components/rich-text/rich-text.tsx) | const | — | Typography for rendered rich text, shared by `RichText` and the editor's editable area so a document looks the same while writing and reading. Exported for apps that render stored HTML themselves. |
| [`RichTextLimitError`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | class | — | Thrown by `sanitizeRichTextDoc` when a document breaks a limit it was given. |
| [`richTextToHtml`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Serialize a document to HTML. The input is sanitized first, so this is safe to call on untrusted JSON; the output contains only the tags listed in this file's header, with every value escaped. |
| [`richTextToPlainText`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Plain text for search indexes, previews and notifications. Blocks are separated by blank lines; embeds become "Title (url)". |
| [`sanitizeRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Validate an untrusted value as a rich text document and return a clean copy that contains only allow-listed nodes, marks and attributes. |
| [`sanitizeVideoEmbedAttrs`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Validate untrusted embed attributes, returning a clean copy or `null`. |
| [`VIDEO_IFRAME_ATTRS`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | const | — | Attributes for an embed's `<iframe>`. Shared by the HTML serializer, the React renderer and the editor so all three emit the same frame. |
| [`videoEmbedSrc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | The player URL for an embed. Built from validated parts only. |
| [`videoEmbedTitle`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Accessible name for an embed's frame: its title, or "YouTube video" etc. |
| [`videoWatchUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | The page URL for an embed (what a viewer would open in a new tab). |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { RichTextDoc };
export type { RichTextHeadingLevel };
export type { RichTextMark };
export type { RichTextNode };
export type { RichTextToHtmlOptions };
export type { SanitizeRichTextOptions };
export type { VideoEmbedAttrs };
export type { VideoProvider };
```

---

## @marktiderman/genesis-ui/rich-text-editor

Rich text editor (Tiptap 3) with a Genesis toolbar. Needs the optional `@tiptap/*` peers.

**Barrel:** [`packages/ui/src/components/rich-text/rich-text-editor.tsx`](../packages/ui/src/components/rich-text/rich-text-editor.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`RichTextEditor`](../packages/ui/src/components/rich-text/rich-text-editor.tsx) | `RichTextEditorProps` | Beta | RichTextEditor — formatted text input for lessons, notes and other long-form content. |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`VideoEmbed`](../packages/ui/src/components/rich-text/video-embed.ts) | const | Beta | Tiptap node for YouTube, Vimeo and Loom players, stored as `{ provider, id, hash?, title? }` and rebuilt from those parts on render. Adds the `setVideoEmbed({ url, title })` command. |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { RichTextChangeDetails };
export type { RichTextDoc };
export type { RichTextEditorHandle };
export type { RichTextEditorLabels };
export type { RichTextEditorValue };
export type { RichTextHeadingLevel };
export type { RichTextToolbarItem };
```

---

## @marktiderman/genesis-ui/router/react-router

React Router adapters for genesis-ui's navigation contract: a `LinkComponent`, a `NavigateFn`, a `SearchParamsAdapter` and the full-location `activePath`. `react-router` is an optional peer, loaded only by this subpath.

**Barrel:** [`packages/ui/src/router/react-router.tsx`](../packages/ui/src/router/react-router.tsx)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ReactRouterLink`](../packages/ui/src/router/react-router.tsx) | const | Beta | {@link LinkComponent} for React Router. Pass it as `linkComponent` to `AppShell`, `StatCard` and anything else that takes one. `href` maps to React Router's `to` (query and hash included), and `testID` is forwarded as `data-testid`, as `... |
| [`useReactRouterActivePath`](../packages/ui/src/router/react-router.tsx) | function | Beta | The current location as `pathname + search + hash`, the shape `AppShell`'s `activePath` expects, so nav items whose `to` names a query or hash (`/admin?tab=users`, `/settings#profile`) highlight correctly. |
| [`useReactRouterNavigate`](../packages/ui/src/router/react-router.tsx) | function | Beta | {@link NavigateFn} backed by React Router's `useNavigate()`. Pass it as `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for client-side navigation instead of a full page load. Absolute URLs (`https://…`, `mailto:…`... |
| [`useReactRouterSearchParams`](../packages/ui/src/router/react-router.tsx) | function | Beta | {@link SearchParamsAdapter} backed by React Router's location. Pass it as `useDataFilters(key, defs, { searchParams })` so URL-synced filters go through the router (loaders re-run, back/forward stays in sync) instead of the raw History A... |

---

## @marktiderman/genesis-ui/router/tanstack-router

TanStack Router adapters for genesis-ui's navigation contract: a `LinkComponent`, a `NavigateFn`, a `SearchParamsAdapter` and the full-location `activePath`. `@tanstack/react-router` is an optional peer, loaded only by this subpath.

**Barrel:** [`packages/ui/src/router/tanstack-router.tsx`](../packages/ui/src/router/tanstack-router.tsx)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`TanStackRouterLink`](../packages/ui/src/router/tanstack-router.tsx) | const | Beta | {@link LinkComponent} for TanStack Router. Pass it as `linkComponent` to `AppShell`, `StatCard` and anything else that takes one. In-app hrefs navigate client-side (query and hash included, parsed by the router's `parseSearch`); absolute... |
| [`useTanStackRouterActivePath`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | The current location as `pathname + search + hash`, the shape `AppShell`'s `activePath` expects, so nav items whose `to` names a query or hash (`/admin?tab=users`, `/settings#profile`) highlight correctly. Paths are the router's (basepat... |
| [`useTanStackRouterNavigate`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | {@link NavigateFn} backed by the TanStack router. Pass it as `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for client-side navigation instead of a full page load. Absolute URLs (`https://…`, `mailto:…`, `//host/…... |
| [`useTanStackRouterSearchParams`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | {@link SearchParamsAdapter} backed by the TanStack router's location. Pass it as `useDataFilters(key, defs, { searchParams })` so URL-synced filters go through the router (loaders and `validateSearch` run, back/forward stays in sync) ins... |

---

## @marktiderman/genesis-ui/accessible-icon

**Barrel:** [`packages/ui/src/components/ui/accessible-icon.tsx`](../packages/ui/src/components/ui/accessible-icon.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AccessibleIcon`](../packages/ui/src/components/ui/accessible-icon.tsx) | `AccessibleIconProps` | Beta | AccessibleIcon — gives a decorative icon an accessible name. |

---

## @marktiderman/genesis-ui/badge

**Barrel:** [`packages/ui/src/components/ui/badge.tsx`](../packages/ui/src/components/ui/badge.tsx)

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BadgeProps };
```

---

## @marktiderman/genesis-ui/band

**Barrel:** [`packages/ui/src/components/layout/band.tsx`](../packages/ui/src/components/layout/band.tsx)

### Components (3)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Band`](../packages/ui/src/components/layout/band.tsx) | `BandProps` | Beta | Band: a full-bleed, full-width marketing section. The background runs edge to edge; the content sits in a centered column with the page gutter. It is what a landing page is made of: a hero, a features band, a call to action, a footer. |
| [`BandLead`](../packages/ui/src/components/layout/band.tsx) | `BandLeadProps` | Beta | _(no summary)_ |
| [`Display`](../packages/ui/src/components/layout/band.tsx) | `DisplayProps` | Beta | Display: a heading in the marketing type scale (`displayVariants`). |

---

## @marktiderman/genesis-ui/builder-layout

**Barrel:** [`packages/ui/src/components/layout/builder-layout.tsx`](../packages/ui/src/components/layout/builder-layout.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`BuilderLayout`](../packages/ui/src/components/layout/builder-layout.tsx) | `BuilderLayoutProps` | Beta | BuilderLayout — the three columns of a builder: an outline of the parts on the left, the editor for the selected part in the centre, a live preview on the right. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BuilderLayoutSlotProps };
```

---

## @marktiderman/genesis-ui/button

**Barrel:** [`packages/ui/src/components/ui/button.tsx`](../packages/ui/src/components/ui/button.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Button`](../packages/ui/src/components/ui/button.tsx) | `ButtonProps` | Stable | Button — primary interactive control. Variants: default, secondary, outline, ghost, destructive, link. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ButtonAsChildProps };
```

---

## @marktiderman/genesis-ui/chart

**Barrel:** [`packages/ui/src/components/ui/chart.tsx`](../packages/ui/src/components/ui/chart.tsx)

### Types (3)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ChartConfig };
export type { ChartPayloadItem };
export type { ChartTooltipContentProps };
```

---

## @marktiderman/genesis-ui/command-palette

**Barrel:** [`packages/ui/src/components/ui/command-palette.tsx`](../packages/ui/src/components/ui/command-palette.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { CommandPaletteItem };
```

---

## @marktiderman/genesis-ui/dashboard-page

**Barrel:** [`packages/ui/src/components/layout/dashboard-page.tsx`](../packages/ui/src/components/layout/dashboard-page.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DashboardPage`](../packages/ui/src/components/layout/dashboard-page.tsx) | `DashboardPageProps` | Beta | DashboardPage — a stat row over a flexible region of charts, tables and sections. |

---

## @marktiderman/genesis-ui/detail-page

**Barrel:** [`packages/ui/src/components/layout/detail-page.tsx`](../packages/ui/src/components/layout/detail-page.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DetailPage`](../packages/ui/src/components/layout/detail-page.tsx) | `DetailPageProps` | Beta | DetailPage — one record's full view: a title row with actions, a primary content region, and a metadata sidebar that drops below the content on small screens. |

---

## @marktiderman/genesis-ui/empty-state

**Barrel:** [`packages/ui/src/components/patterns/empty-state.tsx`](../packages/ui/src/components/patterns/empty-state.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | `EmptyStateProps` | Beta | EmptyState — what to show when a list, page, or panel has no data. |

### Other exports (3)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`NoFeaturesFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for an empty roadmap / feature list. |
| [`NoFeedbackFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a feedback inbox with nothing in it yet. |
| [`NoSearchResults`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a search or filter that matched nothing. |

---

## @marktiderman/genesis-ui/form-page

**Barrel:** [`packages/ui/src/components/layout/form-page.tsx`](../packages/ui/src/components/layout/form-page.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FormPage`](../packages/ui/src/components/layout/form-page.tsx) | `FormPageProps` | Beta | FormPage — a titled form: header, validation summary, a body of sections, and a sticky action bar. |

---

## @marktiderman/genesis-ui/page-loading

**Barrel:** [`packages/ui/src/components/patterns/page-loading.tsx`](../packages/ui/src/components/patterns/page-loading.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`PageLoading`](../packages/ui/src/components/patterns/page-loading.tsx) | `PageLoadingProps` | Beta | PageLoading — full-page or in-section loading state: a centered `Spinner` with an optional message. The loading-state counterpart to `EmptyState`. Reach for `Skeleton` instead when the placeholder should mimic the shape of the content th... |

---

## @marktiderman/genesis-ui/password-toggle-field

**Barrel:** [`packages/ui/src/components/ui/password-toggle-field.tsx`](../packages/ui/src/components/ui/password-toggle-field.tsx)

### Components (5)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`PasswordToggleField`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldProps` | Experimental | PasswordToggleField — a password input with a show/hide control that keeps focus and caret position across the toggle. |
| [`PasswordToggleFieldIcon`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldIconProps` | Experimental | PasswordToggleFieldIcon — the SVG-level variant of `PasswordToggleFieldSlot`. |
| [`PasswordToggleFieldInput`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldInputProps` | Experimental | PasswordToggleFieldInput — the field itself. |
| [`PasswordToggleFieldSlot`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldSlotProps` | Experimental | PasswordToggleFieldSlot — renders one of two nodes depending on visibility. |
| [`PasswordToggleFieldToggle`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldToggleProps` | Experimental | PasswordToggleFieldToggle — the show/hide button. |

---

## @marktiderman/genesis-ui/settings-page

**Barrel:** [`packages/ui/src/components/layout/settings-page.tsx`](../packages/ui/src/components/layout/settings-page.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SettingsPage`](../packages/ui/src/components/layout/settings-page.tsx) | `SettingsPageProps` | Beta | SettingsPage — a sectioned settings surface with a nav rail for jumping between sections. |

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SettingsPageSection };
```

---

## @marktiderman/genesis-ui/settings-row

**Barrel:** [`packages/ui/src/components/patterns/settings-row.tsx`](../packages/ui/src/components/patterns/settings-row.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SettingsRow`](../packages/ui/src/components/patterns/settings-row.tsx) | `SettingsRowProps` | Beta | SettingsRow — label + description on one side, an arbitrary trailing control (Switch, Select, Button, Badge, ...) on the other. This is the shared layout behind every settings/preferences list row; see `ToggleRow` for the common label+de... |

---

## @marktiderman/genesis-ui/sortable-list

**Barrel:** [`packages/ui/src/components/patterns/sortable-list.tsx`](../packages/ui/src/components/patterns/sortable-list.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`SortableList`](../packages/ui/src/components/patterns/sortable-list.tsx) | `SortableListProps` | Beta | A vertical list the user can rearrange: course steps, lesson blocks, form fields. |

### Types (2)

Type-only exports not consumed as a component's `Props`.

```ts
export type { SortableListItemContext };
export type { SortableListReorder };
```

---

## @marktiderman/genesis-ui/status-badge

**Barrel:** [`packages/ui/src/components/patterns/status-badge.tsx`](../packages/ui/src/components/patterns/status-badge.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`StatusBadge`](../packages/ui/src/components/patterns/status-badge.tsx) | `StatusBadgeProps` | Beta | Status-specific badge for progress/health states — the OKR-style "on track / at risk / off track" goal vocabulary plus common task-lifecycle states ("done", "blocked", "in progress"). |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`statusBadgeVariants`](../packages/ui/src/components/patterns/status-badge.tsx) | const | — | _(no summary)_ |

---

## @marktiderman/genesis-ui/table

**Barrel:** [`packages/ui/src/components/ui/table.tsx`](../packages/ui/src/components/ui/table.tsx)

### Types (1)

Type-only exports not consumed as a component's `Props`.

```ts
export type { TableProps };
```

---

## @marktiderman/genesis-ui/toggle-row

**Barrel:** [`packages/ui/src/components/patterns/toggle-row.tsx`](../packages/ui/src/components/patterns/toggle-row.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`ToggleRow`](../packages/ui/src/components/patterns/toggle-row.tsx) | `ToggleRowProps` | Beta | ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common label+description+on/off row for settings and preferences UI. |

---

## @marktiderman/genesis-ui/toolbar

**Barrel:** [`packages/ui/src/components/ui/toolbar.tsx`](../packages/ui/src/components/ui/toolbar.tsx)

### Components (5)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Toolbar`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarProps` | Beta | Toolbar — a grouped set of controls that behaves as ONE tab stop. |
| [`ToolbarButton`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarButtonProps` | Beta | ToolbarButton — a button that participates in the toolbar's roving tabindex. |
| [`ToolbarLink`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarLinkProps` | Beta | ToolbarLink — an anchor inside the toolbar's roving tabindex. |
| [`ToolbarSeparator`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarSeparatorProps` | Beta | ToolbarSeparator — a decorative divider between toolbar groups. |
| [`ToolbarToggleItem`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarToggleItemProps` | Beta | ToolbarToggleItem — one member of a `ToolbarToggleGroup`. |

### Other exports (2)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ToolbarToggleGroup`](../packages/ui/src/components/ui/toolbar.tsx) | const | Beta | ToolbarToggleGroup — a set of pressed/unpressed controls inside a toolbar (the classic bold / italic / underline cluster). |
| [`toolbarVariants`](../packages/ui/src/components/ui/toolbar.tsx) | const | — | _(no summary)_ |

---

## @marktiderman/genesis-ui/tooltip

**Barrel:** [`packages/ui/src/components/ui/tooltip.tsx`](../packages/ui/src/components/ui/tooltip.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Tooltip`](../packages/ui/src/components/ui/tooltip.tsx) | `TooltipProps` | Stable | Tooltip — hover/focus hint anchored to its trigger child. |

---

## @marktiderman/genesis-ui/user-avatar

**Barrel:** [`packages/ui/src/components/patterns/user-avatar.tsx`](../packages/ui/src/components/patterns/user-avatar.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`UserAvatar`](../packages/ui/src/components/patterns/user-avatar.tsx) | `UserAvatarProps` | Beta | UserAvatar — canonical user-identity avatar. Shows the person's photo when `src` is set and loads successfully; otherwise (including a failed image load — Radix's Avatar swaps to the fallback automatically) it falls back to initials comp... |

---

## @marktiderman/genesis-ui/visually-hidden

**Barrel:** [`packages/ui/src/components/ui/visually-hidden.tsx`](../packages/ui/src/components/ui/visually-hidden.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`VisuallyHidden`](../packages/ui/src/components/ui/visually-hidden.tsx) | `VisuallyHiddenProps` | Beta | VisuallyHidden — content removed from the visual layout but kept in the accessibility tree. |

---

## @marktiderman/genesis-ui-native

React Native components (NativeWind v4-5). Use in Expo / RN surfaces.

**Barrel:** [`packages/ui-native/src/index.ts`](../packages/ui-native/src/index.ts)

### Components (96)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppleSignInButton`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | `AppleSignInButtonProps` | — | Apple's branded button, full width. Renders nothing off iOS. |
| [`AuthBranding`](../packages/ui-native/src/layouts/auth.tsx) | `AuthBrandingProps` | — | _(no summary)_ |
| [`AuthForm`](../packages/ui-native/src/layouts/auth.tsx) | `AuthFormProps` | — | _(no summary)_ |
| [`AuthScreen`](../packages/ui-native/src/layouts/auth-screen.tsx) | `AuthScreenProps` | — | _(no summary)_ |
| [`Box`](../packages/ui-native/src/components/layout/index.ts) | `BoxProps` | — | _(no summary)_ |
| [`BrandExtensionsProvider`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | `BrandExtensionsProviderProps` | — | _(no summary)_ |
| [`GenesisModulesProvider`](../packages/ui-native/src/native-modules.tsx) | `GenesisModulesProviderProps` | — | Pass the optional native modules the app has installed. Nested providers merge: an inner one adds to or replaces what an outer one gave. Define the `modules` object once at module scope (as the starter's `src/lib/native-modules.ts` does)... |
| [`Grid`](../packages/ui-native/src/components/layout/index.ts) | `GridProps` | — | _(no summary)_ |
| [`InboxPage`](../packages/ui-native/src/layouts/inbox-page.tsx) | `InboxPageProps` | — | _(no summary)_ |
| [`Inline`](../packages/ui-native/src/components/layout/index.ts) | `InlineProps` | — | _(no summary)_ |
| [`NativeAccordion`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionProps` | — | _(no summary)_ |
| [`NativeAccordionContent`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionContentProps` | — | _(no summary)_ |
| [`NativeAccordionItem`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionItemProps` | — | _(no summary)_ |
| [`NativeAccordionTrigger`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionTriggerProps` | — | _(no summary)_ |
| [`NativeAlert`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertProps` | — | _(no summary)_ |
| [`NativeAlertDescription`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertDescriptionProps` | — | _(no summary)_ |
| [`NativeAlertTitle`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertTitleProps` | — | _(no summary)_ |
| [`NativeAvatar`](../packages/ui-native/src/components/avatar.tsx) | `NativeAvatarProps` | — | _(no summary)_ |
| [`NativeBadge`](../packages/ui-native/src/components/badge.tsx) | `NativeBadgeProps` | — | _(no summary)_ |
| [`NativeBanner`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeBannerProps` | — | _(no summary)_ |
| [`NativeButton`](../packages/ui-native/src/components/button.tsx) | `NativeButtonProps` | — | _(no summary)_ |
| [`NativeCard`](../packages/ui-native/src/components/card.tsx) | `NativeCardProps` | — | _(no summary)_ |
| [`NativeCardTitle`](../packages/ui-native/src/components/card.tsx) | `NativeCardTitleProps` | — | _(no summary)_ |
| [`NativeCheckbox`](../packages/ui-native/src/components/checkbox.tsx) | `NativeCheckboxProps` | — | _(no summary)_ |
| [`NativeChip`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipProps` | — | _(no summary)_ |
| [`NativeChipGroup`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipGroupProps` | — | _(no summary)_ |
| [`NativeCombobox`](../packages/ui-native/src/components/combobox.tsx) | `NativeComboboxProps` | — | _(no summary)_ |
| [`NativeDatePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeDatePickerProps` | — | _(no summary)_ |
| [`NativeDialog`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogProps` | — | _(no summary)_ |
| [`NativeDialogContent`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogContentProps` | — | _(no summary)_ |
| [`NativeDialogDescription`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogDescriptionProps` | — | _(no summary)_ |
| [`NativeDialogFooter`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogFooterProps` | — | _(no summary)_ |
| [`NativeDialogHeader`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogHeaderProps` | — | _(no summary)_ |
| [`NativeDialogTitle`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogTitleProps` | — | _(no summary)_ |
| [`NativeDrawer`](../packages/ui-native/src/components/drawer.tsx) | `NativeDrawerProps` | — | _(no summary)_ |
| [`NativeDropdownMenu`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuProps` | — | _(no summary)_ |
| [`NativeDropdownMenuContent`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuContentProps` | — | _(no summary)_ |
| [`NativeDropdownMenuItem`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuItemProps` | — | _(no summary)_ |
| [`NativeDropdownMenuTrigger`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuTriggerProps` | — | _(no summary)_ |
| [`NativeEmptyState`](../packages/ui-native/src/components/empty-state.tsx) | `NativeEmptyStateProps` | — | _(no summary)_ |
| [`NativeFullScreenModal`](../packages/ui-native/src/components/full-screen-modal.tsx) | `NativeFullScreenModalProps` | Beta | _(no summary)_ |
| [`NativeGlassSurface`](../packages/ui-native/src/components/glass-surface.tsx) | `NativeGlassSurfaceProps` | — | _(no summary)_ |
| [`NativeHeaderCard`](../packages/ui-native/src/components/header-card.tsx) | `NativeHeaderCardProps` | — | _(no summary)_ |
| [`NativeIcon`](../packages/ui-native/src/components/icon.tsx) | `NativeIconProps` | — | _(no summary)_ |
| [`NativeImage`](../packages/ui-native/src/components/image.tsx) | `NativeImageProps` | — | _(no summary)_ |
| [`NativeInlineAlert`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeInlineAlertProps` | — | _(no summary)_ |
| [`NativeInput`](../packages/ui-native/src/components/input.tsx) | `NativeInputProps` | — | _(no summary)_ |
| [`NativeLabel`](../packages/ui-native/src/components/label.tsx) | `NativeLabelProps` | — | _(no summary)_ |
| [`NativeListItem`](../packages/ui-native/src/components/list-item.tsx) | `NativeListItemProps` | — | _(no summary)_ |
| [`NativeLoadingState`](../packages/ui-native/src/components/loading-state.tsx) | `NativeLoadingStateProps` | — | _(no summary)_ |
| [`NativeNumberInput`](../packages/ui-native/src/components/number-input.tsx) | `NativeNumberInputProps` | — | _(no summary)_ |
| [`NativePagination`](../packages/ui-native/src/components/pagination.tsx) | `NativePaginationProps` | — | _(no summary)_ |
| [`NativePopover`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverProps` | — | _(no summary)_ |
| [`NativePopoverContent`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverContentProps` | — | _(no summary)_ |
| [`NativePopoverTrigger`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverTriggerProps` | — | _(no summary)_ |
| [`NativeProgress`](../packages/ui-native/src/components/progress.tsx) | `NativeProgressProps` | — | _(no summary)_ |
| [`NativeRadioGroup`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupProps` | — | _(no summary)_ |
| [`NativeRadioGroupItem`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupItemProps` | — | _(no summary)_ |
| [`NativeRangeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeRangeSliderProps` | — | _(no summary)_ |
| [`NativeRefreshControl`](../packages/ui-native/src/components/refresh-control.tsx) | `NativeRefreshControlProps` | — | _(no summary)_ |
| [`NativeSearchBar`](../packages/ui-native/src/components/search-bar.tsx) | `NativeSearchBarProps` | — | _(no summary)_ |
| [`NativeSectionListHeader`](../packages/ui-native/src/components/section-list.tsx) | `NativeSectionListHeaderProps` | — | _(no summary)_ |
| [`NativeSegmentedControl`](../packages/ui-native/src/components/segmented-control.tsx) | `NativeSegmentedControlProps` | — | _(no summary)_ |
| [`NativeSelect`](../packages/ui-native/src/components/select.tsx) | `NativeSelectProps` | — | _(no summary)_ |
| [`NativeSelectContent`](../packages/ui-native/src/components/select.tsx) | `NativeSelectContentProps` | — | _(no summary)_ |
| [`NativeSelectItem`](../packages/ui-native/src/components/select.tsx) | `NativeSelectItemProps` | — | _(no summary)_ |
| [`NativeSelectTrigger`](../packages/ui-native/src/components/select.tsx) | `NativeSelectTriggerProps` | — | _(no summary)_ |
| [`NativeSeparator`](../packages/ui-native/src/components/separator.tsx) | `NativeSeparatorProps` | — | _(no summary)_ |
| [`NativeSheet`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProps` | Beta | _(no summary)_ |
| [`NativeSheetProvider`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProviderProps` | Beta | Opts every `NativeSheet` below it into `@gorhom/bottom-sheet` and mounts the library's `BottomSheetModalProvider`. A module missing any export the sheet needs is reported with `console.error` and ignored, so sheets fall back to the nativ... |
| [`NativeSkeleton`](../packages/ui-native/src/components/skeleton.tsx) | `NativeSkeletonProps` | — | _(no summary)_ |
| [`NativeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeSliderProps` | — | _(no summary)_ |
| [`NativeStepper`](../packages/ui-native/src/components/stepper.tsx) | `NativeStepperProps` | — | _(no summary)_ |
| [`NativeSwitch`](../packages/ui-native/src/components/switch.tsx) | `NativeSwitchProps` | — | _(no summary)_ |
| [`NativeTabs`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsProps` | — | _(no summary)_ |
| [`NativeTabsContent`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsContentProps` | — | _(no summary)_ |
| [`NativeTabsList`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsListProps` | — | _(no summary)_ |
| [`NativeTabsTrigger`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsTriggerProps` | — | _(no summary)_ |
| [`NativeText`](../packages/ui-native/src/components/text.tsx) | `NativeTextProps` | — | _(no summary)_ |
| [`NativeTextarea`](../packages/ui-native/src/components/textarea.tsx) | `NativeTextareaProps` | — | _(no summary)_ |
| [`NativeTimePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeTimePickerProps` | — | _(no summary)_ |
| [`NativeToastProvider`](../packages/ui-native/src/components/toast.tsx) | `NativeToastProviderProps` | — | _(no summary)_ |
| [`NativeToggle`](../packages/ui-native/src/components/toggle.tsx) | `NativeToggleProps` | — | _(no summary)_ |
| [`NativeTooltip`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipProps` | — | _(no summary)_ |
| [`NativeTooltipContent`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipContentProps` | — | _(no summary)_ |
| [`NativeTooltipTrigger`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipTriggerProps` | — | _(no summary)_ |
| [`NavBarSaveButton`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSaveButtonProps` | — | _(no summary)_ |
| [`NavBarSearchBar`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSearchBarProps` | — | Inline search input meant to occupy the title slot on a search results screen. For a sticky search-below-the-header pattern, prefer the standalone <NativeSearchBar> primitive. |
| [`NavBarTitle`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarTitleProps` | — | _(no summary)_ |
| [`NotificationsPage`](../packages/ui-native/src/layouts/notifications-page.tsx) | `NotificationsPageProps` | — | _(no summary)_ |
| [`ScreenContainer`](../packages/ui-native/src/layouts/screen-container.tsx) | `ScreenContainerProps` | — | _(no summary)_ |
| [`SettingsPage`](../packages/ui-native/src/layouts/settings-page.tsx) | `SettingsPageProps` | — | _(no summary)_ |
| [`SettingsSubPage`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | `SettingsSubPageProps` | — | _(no summary)_ |
| [`SocialAuthRow`](../packages/ui-native/src/layouts/auth.tsx) | `SocialAuthRowProps` | — | _(no summary)_ |
| [`Stack`](../packages/ui-native/src/components/layout/index.ts) | `StackProps` | — | _(no summary)_ |
| [`ThreadPage`](../packages/ui-native/src/layouts/thread-page.tsx) | `ThreadPageProps` | — | _(no summary)_ |

### Other exports (46)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`alertVariants`](../packages/ui-native/src/components/alert.tsx) | value | — | _(no summary)_ |
| [`appleProvider`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"apple"`) that draws Apple's button, for `AuthScreen`'s `providers`. `null` off iOS or without the module. |
| [`badgeTextVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`badgeVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`buttonTextVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`buttonVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`cn`](../packages/ui-native/src/utils.ts) | function | — | _(no summary)_ |
| [`composeHeaderOptions`](../packages/ui-native/src/layouts/screen-container.tsx) | function | — | Compose a `<Stack.Screen options={...}>` object from Layer-3 named props + a direct `headerOptions` passthrough. Layouts call this and pass the result to `<Stack.Screen>` so the host's expo-router stack renders a platform-native large ti... |
| [`confirmDiscardChanges`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Default leave-guard helper. Pops a native Alert with Discard / Keep Editing buttons; calls `proceed()` only if the user opts to discard. |
| [`defaultStickyHeaderOffset`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Where a list's section headers stick by default: on iOS, the bottom of the collapsed navigation bar (the safe area's top plus the compact bar), since the list runs under the header; elsewhere 0 (the header sits above the list). |
| [`ForgotPasswordLink`](../packages/ui-native/src/layouts/auth.tsx) | function | — | _(no summary)_ |
| [`formatInboxTime`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | The default row time: `9:41`, `Yesterday`, `Monday`, then a short date. |
| [`FULL_SCREEN_DARK`](../packages/ui-native/src/components/full-screen-modal.tsx) | const | — | The dark tone's backdrop: media reads best on true black in light and dark mode alike. |
| [`getInboxPageStackOptions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | `<Stack.Screen options>` for an InboxPage: a large title that collapses on scroll. |
| [`getNotificationsPageStackOptions`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires a "Mark all read" action via `headerRight` when `onMarkAllRead` is passed. |
| [`getSettingsPageStackOptions`](../packages/ui-native/src/layouts/settings-page.tsx) | function | — | Convenience helper for callers that want to wire `<Stack.Screen options={...}>` without re-importing composeHeaderOptions. Defaults `large: true` and `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings pattern out o... |
| [`getSettingsSubPageStackOptions`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires the nav-bar Save button via `headerRight` automatically when `onSave` is passed. |
| [`getThreadPageStackOptions`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | `<Stack.Screen options>` for a ThreadPage: a standard (not large) title, like Messages. |
| [`googleProvider`](../packages/ui-native/src/layouts/google-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"google"`) for `AuthScreen`'s `providers`, or `null` when `enabled` is false. |
| [`iosCompactNavigationBarHeight`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | The height of iOS's compact navigation bar, below the status bar: 44 pt up to iOS 18, 54 pt from iOS 26 (measured on an iOS 26 simulator, the collapsed large-title bar of a native stack). |
| [`KEYBOARD_TOOLBAR_HEIGHT`](../packages/ui-native/src/layouts/keyboard.tsx) | const | — | Height of react-native-keyboard-controller's `KeyboardToolbar`, kept clear above the focused input. Mirrors `KEYBOARD_TOOLBAR_HEIGHT` in the library's `src/components/KeyboardToolbar/constants.ts` (1.22): move them together. |
| [`KeyboardScrollProvider`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | _(no summary)_ |
| [`NATIVE_ICON_NAMES`](../packages/ui-native/src/icon-names.ts) | const | — | Every semantic icon name. |
| [`NativeCardContent`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardDescription`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardFooter`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardHeader`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeListItemDivider`](../packages/ui-native/src/components/list-item.tsx) | function | — | _(no summary)_ |
| [`NativeSheetScrollView`](../packages/ui-native/src/components/sheet.tsx) | function | Beta | A `ScrollView` for sheet content: the library's `BottomSheetScrollView` under `NativeSheetProvider` (so scrolling and dragging the sheet don't fight), React Native's otherwise. Sized to its content until it reaches the sheet's height. |
| [`readReceiptFor`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | The newest of my messages the other side has read, or null. |
| [`SF_SYMBOLS`](../packages/ui-native/src/icon-names.ts) | const | Beta | The semantic icon names Genesis components ask for, and the SF Symbol each one draws on iOS. Components say "settings" or "bell", never a library's own name; `lucideIcons` (`/icons/lucide`) maps the same names for Android, web and the SF... |
| [`showInboxActions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | Opens a row's actions as a menu (long press). |
| [`spaceScale`](../packages/ui-native/src/components/layout/spacing.ts) | const | — | Layout spacing scale — the single source of truth for gap / padding / margin across the Genesis layout primitives (Stack / Inline / Box / Grid). |
| [`spacingClass`](../packages/ui-native/src/components/layout/spacing.ts) | function | — | Resolve a semantic spacing token to its NativeWind utility class for a given prefix — e.g. `spacingClass("gap", "md") === "gap-3"` (12px / 4). |
| [`textVariants`](../packages/ui-native/src/components/text.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui-native/src/components/toggle.tsx) | value | — | _(no summary)_ |
| [`useGenesisExtension`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | function | — | Read an extension scale by key. Returns `undefined` when the provider isn't mounted OR when the key isn't declared on the brand. The return type follows the consumer's augmented `BrandExtensions[K]`. |
| [`useGenesisModules`](../packages/ui-native/src/native-modules.tsx) | function | — | The modules given to the nearest `GenesisModulesProvider`; `{}` without one. |
| [`useKeyboardScroll`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard-aware scroll view, or null when none was provided. |
| [`useKeyboardToolbar`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard toolbar, or null when none was provided (or no scroll view to go with it). |
| [`useLiquidGlass`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | expo-glass-effect's `GlassView` when Liquid Glass can be drawn here, else `null`. |
| [`useReducedMotion`](../packages/ui-native/src/hooks/use-reduced-motion.ts) | function | — | _(no summary)_ |
| [`useReduceTransparency`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | True while the user has Reduce Transparency on (iOS), `null` until the first answer. Always false elsewhere, and on a runtime that can't say. |
| [`useThemeMode`](../packages/ui-native/src/hooks/use-theme-mode.ts) | function | — | _(no summary)_ |
| [`useThemeRoles`](../packages/ui-native/src/hooks/use-theme-roles.ts) | function | — | _(no summary)_ |
| [`useToast`](../packages/ui-native/src/components/toast.tsx) | function | — | _(no summary)_ |

### Types (62)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppleButtonModuleLike };
export type { AppleProviderOptions };
export type { AuthFormValues };
export type { AuthScreenSlotMap };
export type { BoxBackground };
export type { BrandExtensionsValue };
export type { FlexAlign };
export type { FlexJustify };
export type { GenesisDatePickerComponent };
export type { GenesisDatePickerProps };
export type { GenesisGlassModule };
export type { GenesisIconComponent };
export type { GenesisIconSet };
export type { GenesisImageComponent };
export type { GenesisImageProps };
export type { GenesisListComponent };
export type { GenesisListProps };
export type { GenesisModules };
export type { GenesisNavigationModule };
export type { GenesisNavigationTheme };
export type { GenesisReanimatedModule };
export type { GenesisSymbolComponent };
export type { GenesisSymbolProps };
export type { GoogleProviderOptions };
export type { InboxItem };
export type { InboxPageSlotMap };
export type { InboxSwipeAction };
export type { KeyboardScrollProps };
export type { KeyboardToolbarProps };
export type { NativeAccordionType };
export type { NativeChipGroupMode };
export type { NativeComboboxOption };
export type { NativeEmptyStateVariant };
export type { NativeIconName };
export type { NativeInlineAlertVariant };
export type { NativeLoadingStateEdge };
export type { NativeSegmentedControlOption };
export type { NativeSheetLibrary };
export type { NativeStepperStep };
export type { NativeToastOptions };
export type { NativeToastVariant };
export type { NotificationItem };
export type { NotificationsPageSlotMap };
export type { SafeAreaEdge };
export type { ScreenHeaderProps };
export type { ScrollEdgeBehavior };
export type { SettingsPageDangerousAction };
export type { SettingsPageRow };
export type { SettingsPageSection };
export type { SettingsPageSlotMap };
export type { SocialAuthProvider };
export type { SpaceToken };
export type { SpacingPrefix };
export type { TextPreset };
export type { ThemeMode };
export type { ThemeRoleColors };
export type { ThreadAttachment };
export type { ThreadComposer };
export type { ThreadLabels };
export type { ThreadMessage };
export type { ThreadPageSlotMap };
export type { UseThemeRolesOptions };
```

---

## @marktiderman/genesis-ui-native/components

**Barrel:** [`packages/ui-native/src/components/index.ts`](../packages/ui-native/src/components/index.ts)

### Components (81)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`Box`](../packages/ui-native/src/components/layout/index.ts) | `BoxProps` | — | _(no summary)_ |
| [`GenesisModulesProvider`](../packages/ui-native/src/native-modules.tsx) | `GenesisModulesProviderProps` | — | Pass the optional native modules the app has installed. Nested providers merge: an inner one adds to or replaces what an outer one gave. Define the `modules` object once at module scope (as the starter's `src/lib/native-modules.ts` does)... |
| [`Grid`](../packages/ui-native/src/components/layout/index.ts) | `GridProps` | — | _(no summary)_ |
| [`Inline`](../packages/ui-native/src/components/layout/index.ts) | `InlineProps` | — | _(no summary)_ |
| [`NativeAccordion`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionProps` | — | _(no summary)_ |
| [`NativeAccordionContent`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionContentProps` | — | _(no summary)_ |
| [`NativeAccordionItem`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionItemProps` | — | _(no summary)_ |
| [`NativeAccordionTrigger`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionTriggerProps` | — | _(no summary)_ |
| [`NativeAlert`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertProps` | — | _(no summary)_ |
| [`NativeAlertDescription`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertDescriptionProps` | — | _(no summary)_ |
| [`NativeAlertTitle`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertTitleProps` | — | _(no summary)_ |
| [`NativeAvatar`](../packages/ui-native/src/components/avatar.tsx) | `NativeAvatarProps` | — | _(no summary)_ |
| [`NativeBadge`](../packages/ui-native/src/components/badge.tsx) | `NativeBadgeProps` | — | _(no summary)_ |
| [`NativeBanner`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeBannerProps` | — | _(no summary)_ |
| [`NativeButton`](../packages/ui-native/src/components/button.tsx) | `NativeButtonProps` | — | _(no summary)_ |
| [`NativeCard`](../packages/ui-native/src/components/card.tsx) | `NativeCardProps` | — | _(no summary)_ |
| [`NativeCardTitle`](../packages/ui-native/src/components/card.tsx) | `NativeCardTitleProps` | — | _(no summary)_ |
| [`NativeCheckbox`](../packages/ui-native/src/components/checkbox.tsx) | `NativeCheckboxProps` | — | _(no summary)_ |
| [`NativeChip`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipProps` | — | _(no summary)_ |
| [`NativeChipGroup`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipGroupProps` | — | _(no summary)_ |
| [`NativeCombobox`](../packages/ui-native/src/components/combobox.tsx) | `NativeComboboxProps` | — | _(no summary)_ |
| [`NativeDatePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeDatePickerProps` | — | _(no summary)_ |
| [`NativeDialog`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogProps` | — | _(no summary)_ |
| [`NativeDialogContent`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogContentProps` | — | _(no summary)_ |
| [`NativeDialogDescription`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogDescriptionProps` | — | _(no summary)_ |
| [`NativeDialogFooter`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogFooterProps` | — | _(no summary)_ |
| [`NativeDialogHeader`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogHeaderProps` | — | _(no summary)_ |
| [`NativeDialogTitle`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogTitleProps` | — | _(no summary)_ |
| [`NativeDrawer`](../packages/ui-native/src/components/drawer.tsx) | `NativeDrawerProps` | — | _(no summary)_ |
| [`NativeDropdownMenu`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuProps` | — | _(no summary)_ |
| [`NativeDropdownMenuContent`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuContentProps` | — | _(no summary)_ |
| [`NativeDropdownMenuItem`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuItemProps` | — | _(no summary)_ |
| [`NativeDropdownMenuTrigger`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuTriggerProps` | — | _(no summary)_ |
| [`NativeEmptyState`](../packages/ui-native/src/components/empty-state.tsx) | `NativeEmptyStateProps` | — | _(no summary)_ |
| [`NativeFullScreenModal`](../packages/ui-native/src/components/full-screen-modal.tsx) | `NativeFullScreenModalProps` | Beta | _(no summary)_ |
| [`NativeGlassSurface`](../packages/ui-native/src/components/glass-surface.tsx) | `NativeGlassSurfaceProps` | — | _(no summary)_ |
| [`NativeHeaderCard`](../packages/ui-native/src/components/header-card.tsx) | `NativeHeaderCardProps` | — | _(no summary)_ |
| [`NativeIcon`](../packages/ui-native/src/components/icon.tsx) | `NativeIconProps` | — | _(no summary)_ |
| [`NativeImage`](../packages/ui-native/src/components/image.tsx) | `NativeImageProps` | — | _(no summary)_ |
| [`NativeInlineAlert`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeInlineAlertProps` | — | _(no summary)_ |
| [`NativeInput`](../packages/ui-native/src/components/input.tsx) | `NativeInputProps` | — | _(no summary)_ |
| [`NativeLabel`](../packages/ui-native/src/components/label.tsx) | `NativeLabelProps` | — | _(no summary)_ |
| [`NativeListItem`](../packages/ui-native/src/components/list-item.tsx) | `NativeListItemProps` | — | _(no summary)_ |
| [`NativeLoadingState`](../packages/ui-native/src/components/loading-state.tsx) | `NativeLoadingStateProps` | — | _(no summary)_ |
| [`NativeNumberInput`](../packages/ui-native/src/components/number-input.tsx) | `NativeNumberInputProps` | — | _(no summary)_ |
| [`NativePagination`](../packages/ui-native/src/components/pagination.tsx) | `NativePaginationProps` | — | _(no summary)_ |
| [`NativePopover`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverProps` | — | _(no summary)_ |
| [`NativePopoverContent`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverContentProps` | — | _(no summary)_ |
| [`NativePopoverTrigger`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverTriggerProps` | — | _(no summary)_ |
| [`NativeProgress`](../packages/ui-native/src/components/progress.tsx) | `NativeProgressProps` | — | _(no summary)_ |
| [`NativeRadioGroup`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupProps` | — | _(no summary)_ |
| [`NativeRadioGroupItem`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupItemProps` | — | _(no summary)_ |
| [`NativeRangeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeRangeSliderProps` | — | _(no summary)_ |
| [`NativeRefreshControl`](../packages/ui-native/src/components/refresh-control.tsx) | `NativeRefreshControlProps` | — | _(no summary)_ |
| [`NativeSearchBar`](../packages/ui-native/src/components/search-bar.tsx) | `NativeSearchBarProps` | — | _(no summary)_ |
| [`NativeSectionListHeader`](../packages/ui-native/src/components/section-list.tsx) | `NativeSectionListHeaderProps` | — | _(no summary)_ |
| [`NativeSegmentedControl`](../packages/ui-native/src/components/segmented-control.tsx) | `NativeSegmentedControlProps` | — | _(no summary)_ |
| [`NativeSelect`](../packages/ui-native/src/components/select.tsx) | `NativeSelectProps` | — | _(no summary)_ |
| [`NativeSelectContent`](../packages/ui-native/src/components/select.tsx) | `NativeSelectContentProps` | — | _(no summary)_ |
| [`NativeSelectItem`](../packages/ui-native/src/components/select.tsx) | `NativeSelectItemProps` | — | _(no summary)_ |
| [`NativeSelectTrigger`](../packages/ui-native/src/components/select.tsx) | `NativeSelectTriggerProps` | — | _(no summary)_ |
| [`NativeSeparator`](../packages/ui-native/src/components/separator.tsx) | `NativeSeparatorProps` | — | _(no summary)_ |
| [`NativeSheet`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProps` | Beta | _(no summary)_ |
| [`NativeSheetProvider`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProviderProps` | Beta | Opts every `NativeSheet` below it into `@gorhom/bottom-sheet` and mounts the library's `BottomSheetModalProvider`. A module missing any export the sheet needs is reported with `console.error` and ignored, so sheets fall back to the nativ... |
| [`NativeSkeleton`](../packages/ui-native/src/components/skeleton.tsx) | `NativeSkeletonProps` | — | _(no summary)_ |
| [`NativeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeSliderProps` | — | _(no summary)_ |
| [`NativeStepper`](../packages/ui-native/src/components/stepper.tsx) | `NativeStepperProps` | — | _(no summary)_ |
| [`NativeSwitch`](../packages/ui-native/src/components/switch.tsx) | `NativeSwitchProps` | — | _(no summary)_ |
| [`NativeTabs`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsProps` | — | _(no summary)_ |
| [`NativeTabsContent`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsContentProps` | — | _(no summary)_ |
| [`NativeTabsList`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsListProps` | — | _(no summary)_ |
| [`NativeTabsTrigger`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsTriggerProps` | — | _(no summary)_ |
| [`NativeText`](../packages/ui-native/src/components/text.tsx) | `NativeTextProps` | — | _(no summary)_ |
| [`NativeTextarea`](../packages/ui-native/src/components/textarea.tsx) | `NativeTextareaProps` | — | _(no summary)_ |
| [`NativeTimePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeTimePickerProps` | — | _(no summary)_ |
| [`NativeToastProvider`](../packages/ui-native/src/components/toast.tsx) | `NativeToastProviderProps` | — | _(no summary)_ |
| [`NativeToggle`](../packages/ui-native/src/components/toggle.tsx) | `NativeToggleProps` | — | _(no summary)_ |
| [`NativeTooltip`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipProps` | — | _(no summary)_ |
| [`NativeTooltipContent`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipContentProps` | — | _(no summary)_ |
| [`NativeTooltipTrigger`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipTriggerProps` | — | _(no summary)_ |
| [`Stack`](../packages/ui-native/src/components/layout/index.ts) | `StackProps` | — | _(no summary)_ |

### Other exports (22)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`alertVariants`](../packages/ui-native/src/components/alert.tsx) | value | — | _(no summary)_ |
| [`badgeTextVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`badgeVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`buttonTextVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`buttonVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`FULL_SCREEN_DARK`](../packages/ui-native/src/components/full-screen-modal.tsx) | const | — | The dark tone's backdrop: media reads best on true black in light and dark mode alike. |
| [`NATIVE_ICON_NAMES`](../packages/ui-native/src/icon-names.ts) | const | — | Every semantic icon name. |
| [`NativeCardContent`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardDescription`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardFooter`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardHeader`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeListItemDivider`](../packages/ui-native/src/components/list-item.tsx) | function | — | _(no summary)_ |
| [`NativeSheetScrollView`](../packages/ui-native/src/components/sheet.tsx) | function | Beta | A `ScrollView` for sheet content: the library's `BottomSheetScrollView` under `NativeSheetProvider` (so scrolling and dragging the sheet don't fight), React Native's otherwise. Sized to its content until it reaches the sheet's height. |
| [`SF_SYMBOLS`](../packages/ui-native/src/icon-names.ts) | const | Beta | The semantic icon names Genesis components ask for, and the SF Symbol each one draws on iOS. Components say "settings" or "bell", never a library's own name; `lucideIcons` (`/icons/lucide`) maps the same names for Android, web and the SF... |
| [`spaceScale`](../packages/ui-native/src/components/layout/spacing.ts) | const | — | Layout spacing scale — the single source of truth for gap / padding / margin across the Genesis layout primitives (Stack / Inline / Box / Grid). |
| [`spacingClass`](../packages/ui-native/src/components/layout/spacing.ts) | function | — | Resolve a semantic spacing token to its NativeWind utility class for a given prefix — e.g. `spacingClass("gap", "md") === "gap-3"` (12px / 4). |
| [`textVariants`](../packages/ui-native/src/components/text.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui-native/src/components/toggle.tsx) | value | — | _(no summary)_ |
| [`useGenesisModules`](../packages/ui-native/src/native-modules.tsx) | function | — | The modules given to the nearest `GenesisModulesProvider`; `{}` without one. |
| [`useLiquidGlass`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | expo-glass-effect's `GlassView` when Liquid Glass can be drawn here, else `null`. |
| [`useReduceTransparency`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | True while the user has Reduce Transparency on (iOS), `null` until the first answer. Always false elsewhere, and on a runtime that can't say. |
| [`useToast`](../packages/ui-native/src/components/toast.tsx) | function | — | _(no summary)_ |

### Types (33)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BoxBackground };
export type { FlexAlign };
export type { FlexJustify };
export type { GenesisDatePickerComponent };
export type { GenesisDatePickerProps };
export type { GenesisGlassModule };
export type { GenesisIconComponent };
export type { GenesisIconSet };
export type { GenesisImageComponent };
export type { GenesisImageProps };
export type { GenesisListComponent };
export type { GenesisListProps };
export type { GenesisModules };
export type { GenesisNavigationModule };
export type { GenesisNavigationTheme };
export type { GenesisReanimatedModule };
export type { GenesisSymbolComponent };
export type { GenesisSymbolProps };
export type { NativeAccordionType };
export type { NativeChipGroupMode };
export type { NativeComboboxOption };
export type { NativeEmptyStateVariant };
export type { NativeIconName };
export type { NativeInlineAlertVariant };
export type { NativeLoadingStateEdge };
export type { NativeSegmentedControlOption };
export type { NativeSheetLibrary };
export type { NativeStepperStep };
export type { NativeToastOptions };
export type { NativeToastVariant };
export type { SpaceToken };
export type { SpacingPrefix };
export type { TextPreset };
```

---

## @marktiderman/genesis-ui-native/data

**Barrel:** [`packages/ui-native/src/data/index.ts`](../packages/ui-native/src/data/index.ts)

### Components (11)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`NativeDataFilters`](../packages/ui-native/src/data/NativeDataFilters.tsx) | `NativeDataFiltersProps` | — | _(no summary)_ |
| [`NativeDataPageShell`](../packages/ui-native/src/data/NativeDataPageShell.tsx) | `NativeDataPageShellProps` | — | _(no summary)_ |
| [`NativeDetailPanel`](../packages/ui-native/src/data/NativeDetailPanel.tsx) | `NativeDetailPanelProps` | — | _(no summary)_ |
| [`NativeEmptyState`](../packages/ui-native/src/data/NativeEmptyState.tsx) | `NativeEmptyStateProps` | — | _(no summary)_ |
| [`NativeRecordView`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | `NativeRecordViewProps` | — | One record's screen, from its record view (defineRecordView): |
| [`NativeResourceForm`](../packages/ui-native/src/data/NativeResourceForm.tsx) | `NativeResourceFormProps` | — | _(no summary)_ |
| [`NativeResourceFormFieldRenderer`](../packages/ui-native/src/data/NativeResourceFormField.tsx) | `NativeResourceFormFieldRendererProps` | — | _(no summary)_ |
| [`NativeResourceFormSheet`](../packages/ui-native/src/data/resource-view/NativeResourceFormSheet.tsx) | `NativeResourceFormSheetProps` | — | _(no summary)_ |
| [`NativeResourcePage`](../packages/ui-native/src/data/NativeResourcePage.tsx) | `NativeResourcePageProps` | — | _(no summary)_ |
| [`NativeResourceView`](../packages/ui-native/src/data/resource-view/NativeResourceView.tsx) | `NativeResourceViewProps` | — | A native list screen from a view: |
| [`NativeResourceWorkspace`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | `NativeResourceWorkspaceProps` | — | _(no summary)_ |

### Other exports (36)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`allowed`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | The effective right: the screen's rule AND the view's guard (never OR). The guard gets the viewer (`useViewer()`); without one it gets no one, so a guard that needs it refuses. |
| [`dateToDay`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A picked Date back to the `YYYY-MM-DD` day it shows, from its local parts (never `toISOString`). |
| [`dayToDate`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A `YYYY-MM-DD` day as a local Date at midnight, from its parts (the picker's value). Null when it isn't a day. |
| [`DEFAULT_MAX_PAGES`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | const | — | Pages kept loaded by default (cursor paging). |
| [`defaultNativeRecordViewMessages`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | const | — | _(no summary)_ |
| [`defaultNativeResourceViewMessages`](../packages/ui-native/src/data/resource-view/messages.ts) | const | — | _(no summary)_ |
| [`defaultNativeResourceWorkspaceMessages`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | const | — | _(no summary)_ |
| [`DisplayRenderersProvider`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | Replace some of the renderers for everything below (nested providers build on each other). |
| [`displayText`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | One value as plain text, for the places that take a string (a row's subtitle, a section title, a read-only form row). Renderers use the same words. |
| [`DisplayTimeZonesProvider`](../packages/ui-native/src/data/resource-view/display.tsx) | const | — | The clocks timestamps are read on below. NativeResourceView sets it from ViewerScope. |
| [`formatDay`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A day. A calendar day (`YYYY-MM-DD`) from its parts; a timestamp as the day it is on `zone`'s clock (core's `wallClock`), so an 8pm edit in New York isn't tomorrow's (its UTC day). |
| [`formatInstant`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A timestamp as the clock on the wall in `zone` shows it (core's `wallClock`), not the device's. |
| [`formFieldsFor`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | The form sheet's fields: `view.form(mode)` (which already leaves out JSON, lists, links, scope, sensitive and unreadable fields and server-filled keys), each marked read-only unless `view.writable(mode)` lists it. Copied, never mutated: ... |
| [`getNativeRecordViewStackOptions`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | function | — | `<Stack.Screen options>` for a record view: the record's title in the navigation bar and the actions in the header menu. |
| [`getNativeResourceWorkspaceStackOptions`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | function | — | _(no summary)_ |
| [`nativeDisplayRenderers`](../packages/ui-native/src/data/resource-view/display.tsx) | const | — | Genesis's native renderers. Every one shows text it can't draw, never a broken row. |
| [`NativeRecordViewMenu`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | function | — | The header menu: a button that lists the record view's actions. On iOS an action sheet (ActionSheetIOS, destructive ones in red); elsewhere a sheet of rows, since Android's alert shows at most three buttons. A refused action stays listed... |
| [`NativeResourceViewMessagesProvider`](../packages/ui-native/src/data/resource-view/display.tsx) | const | — | The words NativeResourceView shows, for everything below. Pass a stable object. |
| [`NativeResourceWorkspaceMenu`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | function | — | _(no summary)_ |
| [`openableUrl`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A link a row may open: http(s), mailto or tel that passes `isSafeUrl`. Root-relative paths mean nothing on a phone. |
| [`parseSettingNumber`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | function | — | A number as typed: "1.5" or, with a comma as the decimal mark, "1,5". Anything else (an empty string aside) is an error, never NaN. |
| [`resolveZone`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | A column's clock: "viewer" (the default) and "scope" from `zones`, else a valid IANA name. Anything else throws (`defineView` refuses it first): drawing it on the viewer's clock instead would show the wrong times with nothing to say so. |
| [`rowItem`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | A row as NativeListItem draws it: `view.summary(row)`'s title, subtitle and chips, and nothing else. A view that wants a second line says so in its summary. |
| [`screenValues`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | function | — | The values a create takes from the screen: every non-null equality filter, the screen's over the tab's. |
| [`SEARCH_DEBOUNCE_MS`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | const | — | How long typing waits before the search goes to the server. |
| [`sectionsFor`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | Rows in sections by `definition.groupBy`, in the order each group first appears (the server's sort, so paging never reorders what's on screen). Without `groupBy`, one untitled section. |
| [`SEGMENTED_SECTIONS_MAX`](../packages/ui-native/src/data/resource-view/NativeRecordView.tsx) | const | — | Up to this many sections show as a segmented control; more are pushed rows. |
| [`serverSort`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | function | — | The first of {@link serverSorts}: what a provider that sorts by one field gets. |
| [`serverSorts`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | function | — | The server sorts: the `groupBy` field first, so every page arrives in section order and a later page never lands in the middle of an earlier section, then the view's `orderBy` within each group. A provider without `multiSort` applies onl... |
| [`swipeActionsFor`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | A row's swipe actions, from the view's guards. A refused action stays in the list with its reason, so the person learns why; one the screen turns off (`false`) is left out. |
| [`useDisplayCell`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | Draw one value: the empty mark for no value or a value the row (or viewer) hides (`when`), else its hint's renderer. |
| [`useDisplayTimeZones`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | The clocks for timestamps: the nearest provider's, else the device's for both. |
| [`useNativeResourceView`](../packages/ui-native/src/data/resource-view/use-native-resource-view.ts) | function | — | _(no summary)_ |
| [`useNativeResourceViewMessages`](../packages/ui-native/src/data/resource-view/display.tsx) | function | — | _(no summary)_ |
| [`validateValues`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | Field errors for a save: required fields with no value, and text over `max`. |
| [`writableValues`](../packages/ui-native/src/data/resource-view/mapping.ts) | function | — | What a save sends: only the keys `view.writable(mode)` lists and the form shows. Read-only, generated, key and scope fields, and anything else the values carry (joined columns), never go. An edit passes `dirty`, the fields the person cha... |

### Types (22)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AnyResourceView };
export type { DisplayContext };
export type { DisplayRenderer };
export type { DisplayRenderers };
export type { DisplayTimeZones };
export type { NativeCardFieldDef };
export type { NativeDetailField };
export type { NativeFormField };
export type { NativeFormFieldKind };
export type { NativeRecordViewHeaderProps };
export type { NativeRecordViewMessages };
export type { NativeResourceRowItem };
export type { NativeResourceScreenCan };
export type { NativeResourceSection };
export type { NativeResourceSwipeAction };
export type { NativeResourceSwipeableProps };
export type { NativeResourceViewMessages };
export type { NativeResourceViewOptions };
export type { NativeResourceWorkspaceHeaderProps };
export type { NativeResourceWorkspaceMessages };
export type { SaveResult };
export type { UseNativeResourceViewReturn };
```

---

## @marktiderman/genesis-ui-native/hooks

**Barrel:** [`packages/ui-native/src/hooks/index.ts`](../packages/ui-native/src/hooks/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`BrandExtensionsProvider`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | `BrandExtensionsProviderProps` | — | _(no summary)_ |

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`useGenesisExtension`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | function | — | Read an extension scale by key. Returns `undefined` when the provider isn't mounted OR when the key isn't declared on the brand. The return type follows the consumer's augmented `BrandExtensions[K]`. |
| [`useReducedMotion`](../packages/ui-native/src/hooks/use-reduced-motion.ts) | function | — | _(no summary)_ |
| [`useThemeMode`](../packages/ui-native/src/hooks/use-theme-mode.ts) | function | — | _(no summary)_ |
| [`useThemeRoles`](../packages/ui-native/src/hooks/use-theme-roles.ts) | function | — | _(no summary)_ |

### Types (4)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandExtensionsValue };
export type { ThemeMode };
export type { ThemeRoleColors };
export type { UseThemeRolesOptions };
```

---

## @marktiderman/genesis-ui-native/layouts

**Barrel:** [`packages/ui-native/src/layouts/index.ts`](../packages/ui-native/src/layouts/index.ts)

### Components (14)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppleSignInButton`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | `AppleSignInButtonProps` | — | Apple's branded button, full width. Renders nothing off iOS. |
| [`AuthBranding`](../packages/ui-native/src/layouts/auth.tsx) | `AuthBrandingProps` | — | _(no summary)_ |
| [`AuthForm`](../packages/ui-native/src/layouts/auth.tsx) | `AuthFormProps` | — | _(no summary)_ |
| [`AuthScreen`](../packages/ui-native/src/layouts/auth-screen.tsx) | `AuthScreenProps` | — | _(no summary)_ |
| [`InboxPage`](../packages/ui-native/src/layouts/inbox-page.tsx) | `InboxPageProps` | — | _(no summary)_ |
| [`NavBarSaveButton`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSaveButtonProps` | — | _(no summary)_ |
| [`NavBarSearchBar`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSearchBarProps` | — | Inline search input meant to occupy the title slot on a search results screen. For a sticky search-below-the-header pattern, prefer the standalone <NativeSearchBar> primitive. |
| [`NavBarTitle`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarTitleProps` | — | _(no summary)_ |
| [`NotificationsPage`](../packages/ui-native/src/layouts/notifications-page.tsx) | `NotificationsPageProps` | — | _(no summary)_ |
| [`ScreenContainer`](../packages/ui-native/src/layouts/screen-container.tsx) | `ScreenContainerProps` | — | _(no summary)_ |
| [`SettingsPage`](../packages/ui-native/src/layouts/settings-page.tsx) | `SettingsPageProps` | — | _(no summary)_ |
| [`SettingsSubPage`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | `SettingsSubPageProps` | — | _(no summary)_ |
| [`SocialAuthRow`](../packages/ui-native/src/layouts/auth.tsx) | `SocialAuthRowProps` | — | _(no summary)_ |
| [`ThreadPage`](../packages/ui-native/src/layouts/thread-page.tsx) | `ThreadPageProps` | — | _(no summary)_ |

### Other exports (19)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`appleProvider`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"apple"`) that draws Apple's button, for `AuthScreen`'s `providers`. `null` off iOS or without the module. |
| [`composeHeaderOptions`](../packages/ui-native/src/layouts/screen-container.tsx) | function | — | Compose a `<Stack.Screen options={...}>` object from Layer-3 named props + a direct `headerOptions` passthrough. Layouts call this and pass the result to `<Stack.Screen>` so the host's expo-router stack renders a platform-native large ti... |
| [`confirmDiscardChanges`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Default leave-guard helper. Pops a native Alert with Discard / Keep Editing buttons; calls `proceed()` only if the user opts to discard. |
| [`defaultStickyHeaderOffset`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Where a list's section headers stick by default: on iOS, the bottom of the collapsed navigation bar (the safe area's top plus the compact bar), since the list runs under the header; elsewhere 0 (the header sits above the list). |
| [`ForgotPasswordLink`](../packages/ui-native/src/layouts/auth.tsx) | function | — | _(no summary)_ |
| [`formatInboxTime`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | The default row time: `9:41`, `Yesterday`, `Monday`, then a short date. |
| [`getInboxPageStackOptions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | `<Stack.Screen options>` for an InboxPage: a large title that collapses on scroll. |
| [`getNotificationsPageStackOptions`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires a "Mark all read" action via `headerRight` when `onMarkAllRead` is passed. |
| [`getSettingsPageStackOptions`](../packages/ui-native/src/layouts/settings-page.tsx) | function | — | Convenience helper for callers that want to wire `<Stack.Screen options={...}>` without re-importing composeHeaderOptions. Defaults `large: true` and `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings pattern out o... |
| [`getSettingsSubPageStackOptions`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires the nav-bar Save button via `headerRight` automatically when `onSave` is passed. |
| [`getThreadPageStackOptions`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | `<Stack.Screen options>` for a ThreadPage: a standard (not large) title, like Messages. |
| [`googleProvider`](../packages/ui-native/src/layouts/google-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"google"`) for `AuthScreen`'s `providers`, or `null` when `enabled` is false. |
| [`iosCompactNavigationBarHeight`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | The height of iOS's compact navigation bar, below the status bar: 44 pt up to iOS 18, 54 pt from iOS 26 (measured on an iOS 26 simulator, the collapsed large-title bar of a native stack). |
| [`KEYBOARD_TOOLBAR_HEIGHT`](../packages/ui-native/src/layouts/keyboard.tsx) | const | — | Height of react-native-keyboard-controller's `KeyboardToolbar`, kept clear above the focused input. Mirrors `KEYBOARD_TOOLBAR_HEIGHT` in the library's `src/components/KeyboardToolbar/constants.ts` (1.22): move them together. |
| [`KeyboardScrollProvider`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | _(no summary)_ |
| [`readReceiptFor`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | The newest of my messages the other side has read, or null. |
| [`showInboxActions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | Opens a row's actions as a menu (long press). |
| [`useKeyboardScroll`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard-aware scroll view, or null when none was provided. |
| [`useKeyboardToolbar`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard toolbar, or null when none was provided (or no scroll view to go with it). |

### Types (25)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppleButtonModuleLike };
export type { AppleProviderOptions };
export type { AuthFormValues };
export type { AuthScreenSlotMap };
export type { GoogleProviderOptions };
export type { InboxItem };
export type { InboxPageSlotMap };
export type { InboxSwipeAction };
export type { KeyboardScrollProps };
export type { KeyboardToolbarProps };
export type { NotificationItem };
export type { NotificationsPageSlotMap };
export type { SafeAreaEdge };
export type { ScreenHeaderProps };
export type { ScrollEdgeBehavior };
export type { SettingsPageDangerousAction };
export type { SettingsPageRow };
export type { SettingsPageSection };
export type { SettingsPageSlotMap };
export type { SocialAuthProvider };
export type { ThreadAttachment };
export type { ThreadComposer };
export type { ThreadLabels };
export type { ThreadMessage };
export type { ThreadPageSlotMap };
```

---

## @marktiderman/genesis-ui-native/utils

**Barrel:** [`packages/ui-native/src/utils.ts`](../packages/ui-native/src/utils.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`cn`](../packages/ui-native/src/utils.ts) | function | — | _(no summary)_ |

---

## @marktiderman/genesis-ui-native/icons/lucide

**Barrel:** [`packages/ui-native/src/icons/lucide.ts`](../packages/ui-native/src/icons/lucide.ts)

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`lucideIcons`](../packages/ui-native/src/icons/lucide.ts) | const | — | _(no summary)_ |

