# @marktiderman/genesis-support

Support and feedback for Genesis apps, kept in **the app's own Supabase**:

- a **feedback record** (bug, idea, question or praise; the message; the version signature,
  route, platform and device; screenshots) behind two seams, a `ContextCollector` and a
  `FeedbackSink`, with a Supabase sink;
- **web**: a feedback panel and a floating launcher built from Genesis UI, a screenshot of the tab
  (the browser asks first) with pen marks and hidden areas, and pins on the page;
- **native**: a feedback screen, screenshot capture with mark-up that can hide private parts, and
  **shake to report**; the person's reports as an inbox with staff replies and read receipts; an
  **idea board** with one vote per person, and "you asked, we shipped" tied to FeatureIds;
- a `defineBlock` declaration (`support-feedback`) that adds **Send feedback** and **Help** to
  Settings, names its routes and its migration.

The database half is migration `0006_genesis_support.sql` in `@marktiderman/genesis-supabase`,
with its pgTAP test and three Edge Function templates (see that package's README).

## Install

```bash
pnpm add @marktiderman/genesis-support @marktiderman/genesis-supabase
# native, for screenshots and shake to report (both optional):
npx expo install react-native-view-shot expo-sensors
```

Copy `migrations/0006_genesis_support.sql` (and `migrations/tests/0006_genesis_support.test.sql`)
from `@marktiderman/genesis-supabase` into your app's `supabase/` under a new timestamped name.

## Native

```ts
// src/lib/support.ts
import * as ViewShot from "react-native-view-shot";
import { Accelerometer } from "expo-sensors";
import { router, usePathname } from "expo-router";
import { createSupport } from "@marktiderman/genesis-support/native";

export const support = createSupport({
  supabase,
  navigate: (href) => router.push(href),
  appVersion: () => versionSignature({ application, updates, platform }).short,
  useCurrentRoute: usePathname,
  viewShot: ViewShot,          // screenshots and mark-up
  accelerometer: Accelerometer, // shake to report
  basePath: "/settings/support",
});

// app.ts
<GenesisNativeApp blocks={[support]} appFeatures={["account"]} … />
```

Settings gets the two rows through `useBlockSettings` (section `support`). The screens are your
route files, each a genesis-ui-native layout fed by a hook:

| Route (under `basePath`) | File | Renders |
|---|---|---|
| `/` | `support/index.tsx` | `<InboxPage {...useSupportInbox()} />` |
| `/new` | `support/new.tsx` | `<SettingsSubPage><FeedbackForm /></SettingsSubPage>` |
| `/[id]` | `support/[id].tsx` | `<ThreadPage {...useSupportThread(id)} />` |
| `/ideas` | `support/ideas.tsx` | `<InboxPage {...useIdeaBoard()} />` |
| `/shipped` | `support/shipped.tsx` | `<InboxPage {...useShippedIdeas()} />` |

The hooks return the layout's props plus `headerTitle` for `<Stack.Screen>`. Data is cached with
TanStack Query under the `genesis-support` key root; leave it out of query persistence.

**Shake to report.** With an accelerometer, a shake (two strong jolts within a second, then a
three second rest) captures the screen and opens the feedback screen with it. The screenshot is
sent only if the person turns on **Include this screenshot** (off by default); **Mark up** lets them draw on it and **Hide** paints solid boxes
over anything private. The marks are flattened into the image (`captureRef`) before it is sent; if
flattening fails, the unmarked image is never sent in its place, and leaving the mark-up
without saving turns Include off again. On the web, marks stay a list until Send and are drawn
into the image once.

**From anywhere** (a devtools overlay's "Send feedback" slot, a help icon):
`<SendFeedbackButton />`, or `useSupport().openFeedback()`.

## Web

```tsx
import { createSupportClient } from "@marktiderman/genesis-support";
import { FeedbackLauncher, mountSupportWidget } from "@marktiderman/genesis-support/web";

const client = createSupportClient(supabase);
<FeedbackLauncher client={client} />;              // in a React app
const unmount = mountSupportWidget({ client });   // on any page (needs Genesis UI's styles)
```

`FeedbackPanel` is the panel on its own. A screenshot uses `getDisplayMedia` with
`preferCurrentTab`: the browser asks, and when the person says no there is no screenshot (never a
placeholder). Routes are sent as paths only: query strings and fragments are dropped on the client,
in the contract's validation and by a database check, and path segments that look private (an
email, an id, a long token) become `:email`, `:id` or `:token`.

## Core

```ts
import { createSupportClient, createContextCollector, createIntakeClient, createIntakeSink } from "@marktiderman/genesis-support";

const client = createSupportClient(supabase);
await client.submit({ type: "bug", message, context: await collector.collect(), attachments: [{ kind: "screenshot", contentType: "image/jpeg", base64 }] });
// → { id, attachmentsDropped }
```

- `createSupportClient(supabase)`: `submit` (the Supabase sink), `myReports`, `report`,
  `replies`, `reply`, `markRead`, `deleteReport`, `attachments` (signed URLs), `ideas`,
  `suggestIdea`, `vote`, `unvote`, `shippedForMe`, and for staff `isStaff`, `setStatus` and
  (support-chat block) `assign`; `thread`, `conversationId` and `subscribe` for a thread on
  genesis-chat (see below). Errors are `SupportError` with the database's code (`rateLimited` for
  `GS429`).
- `createIntakeClient` + `createIntakeSink`: the wire contract over HTTP, for code without
  supabase-js (it takes no screenshots, and says so in `attachmentsDropped`).
- `contract.ts` is the wire contract (`CONTRACT_VERSION`, headers, `SubmitFeedbackInput`,
  `validateSubmitInput`), byte-identical to the intake function's copy (a test checks).
- `resolveSupportCopy(overrides)`: every string, in English, overridable key by key.

A GitHub issue per report, or a signed webhook, is a server-side sink: the
`genesis-support-notify` function template in `@marktiderman/genesis-supabase`.

## Threads on genesis-chat (the `support-chat` block)

With `@marktiderman/genesis-chat` installed, a report's conversation can run on genesis-chat
instead of `support_replies`: live updates instead of a 30 second re-read, photos, files and
voice notes, push, an assignee (pushed every message) and internal notes staff write and the
person never sees. The report stays the record (type, status, message, screenshots, device).

1. Apply this package's `migrations/0001_genesis_support_chat.sql` (and its test) after
   `0006_genesis_support.sql` and genesis-chat's `0001` and `0002`. It registers the chat kind
   `support` (the reporter its only member, staff observers who post, no threads), gives every
   report its conversation, and copies the replies already in `support_replies` into it, in
   order and with their times, sending no push.
2. Give support genesis-chat's client:

   ```ts
   import { createChatClient } from "@marktiderman/genesis-chat";
   const chat = createChatClient(supabase);
   createSupport({ supabase, chat, … });                 // native
   const client = createSupportClient(supabase, { chat }); // web
   ```

   The client asks the database once (`support_chat_conversation`). With the block, `replies`,
   `reply`, `markRead` and the new `subscribe` go through the report's conversation; without it
   (or without `chat`) they use `support_replies` as before, and a `chat` client given to a
   database without the block says so once (`onChatUnavailable`, default `console.warn`).
3. Native: `useSupportThread(id)` needs no change. On chat it updates live (no polling), shows
   photos in replies and names voice notes and files; it also returns `mode` and
   `conversationId`. `useSupportConversation(id)` gives a screen of your own the conversation id,
   for genesis-chat's native `ChatThreadScreen`.
4. Web (`@marktiderman/genesis-support/web-chat`, under genesis-chat's `ChatProvider` in a
   QueryClientProvider): `<SupportReportThread client={client} reportId={id} />` is the person's
   view, the report above genesis-chat's `ChatThread`. `<SupportStaffThread client reportId
   resolveUser staff />` adds the status and assignee pickers; the composer's note toggle writes
   internal notes.

Kept in step by the migration: the report's status and the conversation's (open and submitted
are open, in_progress pending, addressed solved, wont_fix closed; a status set in chat moves the
report the same way), the report's reply times and read state from messages and
`genesis_chat.mark_read` (so `unread` and the Help badge keep working), assignees (staff only:
`client.assign` or `support_assign_report`), and deletion (a deleted report, or account, takes its
conversation; files follow each package's own cleanup). Staff set statuses with `client.setStatus`.

**`support_replies`, for one release.** App builds from before the block still read and write
`support_replies`, so the two are mirrored: a reply written there becomes a chat message, and a
chat message (never an internal note) becomes a reply there, edits and deletes included. While
the mirror runs, 0006's reply limit (60 an hour) counts every message. The next release drops the
mirror and moves the limit onto chat messages; then `support_replies` can go.

One difference: a chat message carries its sender's id, so the person can learn which staff
member answered (support_replies hid it). Name staff as "Support" in `resolveUser` (the web views
do by default for the person).

## Email tickets (the `support-email` block)

Email is a ticket channel (ADR 0011). `genesis add support-email` copies
`migrations/0002_genesis_support_email.sql` (after 0006). Mail to a support address opens a
ticket; a reply to the ticket's reply address (`support+<token>@your-reply-domain`) or to its
email joins it and reopens an answered one; a staff reply, written in the app or in
support-chat, goes back by email in the same thread. An email ticket may have no login: staff
see it, and nothing links a login from an address (a From header can be forged).

```ts
// The inbound webhook route (server only)
import { createInboundEmailHandler, resendProvider } from "@marktiderman/genesis-notifications/server";
import { runSupportEmail, supportEmailRoute } from "@marktiderman/genesis-support/email";

export const handleInbound = createInboundEmailHandler({
  webhookSecret: env.RESEND_INBOUND_WEBHOOK_SECRET,
  apiKey: env.RESEND_API_KEY,
  routes: [supportEmailRoute(admin, { addresses: ["support@acme.test"], replyDomain: "reply.acme.test" })],
});

// Every minute, from your jobs: send staff replies on email tickets, threaded.
await runSupportEmail(admin, { email: resendProvider({ apiKey: env.RESEND_API_KEY }), from: "Acme Support <support@acme.test>", replyDomain: "reply.acme.test" });
```

Point the reply domain's MX record at Resend so replies come back. Inbound attachments are
listed (name, type, size) but not stored yet.

## Access, in the database

A person sees, edits (while open) and deletes their own reports, replies on them and sees their
own screenshots. Every signed-in person reads the idea board (not who suggested an idea); one vote per person and idea, and a
Supabase anonymous sign-in can neither vote nor suggest. Staff are whoever your
`private.genesis_support_staff(person uuid)` hook says (none until you add it). Status, owner,
feature id, vote counts and read receipts are the server's. See the migration's header.

## Not yet

- No staff inbox (operator queue) screen. With the support-chat block, `SupportStaffThread` is one
  report for staff on the web; list reports with `genesis_chat.observed('support')` or a tool of
  yours. Without it, staff work through the database functions.
- Without the support-chat block there are no live updates: the thread re-reads every 30 seconds
  while open.
- No ratings, no web idea board, no notification when an idea ships.
- The CDN (script-tag) build of the web loader isn't published; `mountSupportWidget` is the loader.
