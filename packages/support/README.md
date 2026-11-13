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

What the panel takes besides the client:

- `about={{ label, context }}`: what the app thinks the feedback is about (the screen's feature,
  say), shown as "About: …" with a way to drop it; kept, its `context` and the label join the
  report's context, and the report's thread (with `reportHeading`) shows "Sent from <label> (<route>)".
- `severity`: a bug gets a severity choice (Minor, Annoying, Blocks me, Broken), sent as
  `severity`. Default off.
- `draft` (from `useFeedbackDraft()`): what the person has written, captured and pinned, held by the
  host, so a host that unmounts the panel while the browser captures or the person pins (closing a
  Sheet on `onHide`) loses nothing. `FeedbackLauncher` holds one already.
- `captureOnOpen` takes a screenshot as the panel opens; `captureRequest` (a counter) takes one each
  time it goes up, once per value across remounts, keeping what the person wrote.
- `thanksReplacesForm`: after Send the thanks takes the form's place, with Send another (and
  `onOpenHelp`'s button, which opens your Help). Default off: the thanks shows under the form.
- Always on: a screenshot the browser didn't allow says so, and a placed pin shows as a row with
  Remove.

`useFeedbackShortcut(open, shortcut?)` opens feedback from anywhere with a key press (default
⌘⇧. on a Mac, Ctrl+Shift+. elsewhere; `false` turns it off); a held key and rich-text editors are
ignored. The press counts as the person's gesture, so the panel may ask to capture right away.

## Core

```ts
import { createSupportClient, createContextCollector, createIntakeClient, createIntakeSink } from "@marktiderman/genesis-support";

const client = createSupportClient(supabase);
await client.submit({ type: "bug", message, context: await collector.collect(), attachments: [{ kind: "screenshot", contentType: "image/jpeg", base64 }] });
// → { id, attachmentsDropped }
```

- `createSupportClient(supabase)`: `submit` (the Supabase sink), `myReports`, `report`,
  `replies`, `reply`, `markRead`, `deleteReport`, `attachments` (signed URLs), `ideas`,
  `suggestIdea`, `vote`, `unvote`, `shippedForMe`, `verify` (the person confirms a fix or reopens
  the report), `handles` (does the signed-in person handle this report), and for staff `isStaff`,
  `setStatus` and (support-chat block) `assign`; `thread`, `conversationId` and `subscribe` for a thread on
  genesis-chat (see below). Errors are `SupportError` with the database's code (`rateLimited` for
  `GS429`). `verify` and `handles` need migration 0003 and are optional on the `SupportClient`
  type (a client of your own may leave them out), so check for them before calling.
- A report's severity always goes into its context (`context.severity`). With migration 0003
  applied, pass `severityColumn: true` to `createSupportClient` (or `createSupabaseSink`) and it
  is written to the `severity` column as well; for the intake function, set
  `GENESIS_SUPPORT_SEVERITY_COLUMN=true`.
- `createIntakeClient` + `createIntakeSink`: the wire contract over HTTP, for code without
  supabase-js (it takes no screenshots, and says so in `attachmentsDropped`).
- `contract.ts` is the wire contract (`CONTRACT_VERSION`, headers, `SubmitFeedbackInput`,
  `validateSubmitInput`), byte-identical to the intake function's copy (a test checks).
- `isSitePath(route)`: whether a report's route is a path on this site, safe to link (one leading
  `/`, no other host or scheme, no `:id` placeholder). `cleanLabel`, `pageOf` and `reportHeading`
  are how the web thread shows a report's about label, page and heading.
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
   internal notes. Both take, each default off: `reportHeading` (head the report with its own
   words in an `h2`, show its message only when that adds something, and say which page it was
   sent from, a link only when it's a path on this site), `focusHeading` (focus that heading once
   it shows, for a sheet or dialog; it turns `reportHeading` on) and `plainChatTitle` (title the
   conversation "Report" rather than the report's title).

**The agent inbox** (`genesis add support-chat` copies migration 0009). `<SupportAgentInbox>` is a
tenant's whole help desk inbox on genesis-ui's `InboxLayout`, `InboxViews`, `InboxPage` and
`ThreadPage`: the views Mine, Unassigned and All, the tickets, the open ticket's thread with reply
and internal note, its status and assignee, and a details panel. Keep the open ticket in your
router; the inbox only needs a TanStack `QueryClientProvider` and a support client made with the
`chat` option. Point Tailwind at its classes as you do for genesis-ui (`@source
"../node_modules/@marktiderman/genesis-support/dist";`), or the view picker meant for narrow screens
also shows on wide ones.

```tsx
import { SupportAgentInbox } from "@marktiderman/genesis-support/web-chat";
import type { SupportClient } from "@marktiderman/genesis-support";

declare const support: SupportClient;
declare const workspaceId: string;
declare const ticketId: string | null;
declare const navigate: (to: string) => void;
declare const people: Map<string, string>;
declare const agents: { id: string; name: string }[];

export const inbox = (
  <SupportAgentInbox
    client={support}
    tenantId={workspaceId} // leave out for the app's own tickets
    ticketId={ticketId}
    onTicketChange={(id) => navigate(id ? `/help/inbox/${id}` : "/help/inbox")}
    resolveUser={(id) => ({ name: people.get(id) ?? "Someone" })}
    agents={agents} // { id: login, name }: who a ticket can be given to
    context={(ticket) => <p>{ticket.userId}</p>} // your own cards in the details panel
  />
);
```

Only a tenant's agents get in: `client.agentTickets`, `agentTicket` and `agentTicketCounts` read
through `support_agent_tickets` and `support_agent_ticket_counts`, which refuse anyone else. An
agent's own ticket isn't in their queue, since another agent answers it.

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

## The help desk (the `support-helpdesk` block)

`genesis add support-helpdesk` copies `migrations/0010_genesis_support_help_center.sql`. It's on for a
tenant once `support-helpdesk` is enabled for it in `tenant_features`; the app's own tenant is always
on.

**The messenger.** `<SupportMessenger>` is Home (greeting, article search, the latest conversation),
Messages and Help. A first message becomes a ticket in the tenant, and the reply arrives live.
`<SupportMessengerLauncher>` is a button with the unread count that opens it in the chat dock when
the app has `ChatDockProvider`, else in a sheet. The dock's windows sit bottom-right, so there use
`position="bottom-left"`, or `"inline"` and place it yourself. On the phone: `useMessengerHome`,
`useHelpCenter`, `useHelpArticle` with `HelpArticleBody`, and `useStartConversation`, at the block's
routes, with `tenantId` and `askAi` given to `createSupport`. Home and the help center open the help
route with `?q=` or `?collection=`: read them there and pass `initialQuery` and `collectionId`.

```tsx
import { SupportMessengerLauncher } from "@marktiderman/genesis-support/web-chat";
import type { SupportClient } from "@marktiderman/genesis-support";

declare const support: SupportClient;
declare const workspaceId: string;

export const help = <SupportMessengerLauncher client={support} tenantId={workspaceId} />;
```

**The help center.** Articles are a tenant's own: collections, drafts, and published articles its
people can read. Agents write them in `<SupportHelpCenterAdmin>`, or with `client.saveHelpArticle`. A
body is plain text, and a blank line starts a paragraph. Anon reads nothing through the database: for
a public help center, `helpCenterPages({ collections, articles })` gives genesis-sites pages to add
to the tenant's site and publish.

**AI answers have never run against a real model.** Keep them off: a tenant shouldn't turn them on
until a live run passes success, refusal, schema miss and safety route.

They're off until a tenant opts in, with an enabled `support-helpdesk-ai` row in `tenant_features`
and a monthly budget, its own or the `default` (`genesis_ai.set_budget`). Without a limit genesis-ai
admits every call, so neither counts alone, and a tenant on its own key still needs a budget row.
Anonymous sign-ins can't ask. That's the reverse of most features, where no row means on, so show it as off in
your Settings when there's no row. A tenant admin can turn it on, and it spends that tenant's AI
budget. The person asks for an answer after searching; only then do their
words go to the vendor. The AI answers only from that tenant's published articles and cites them; an
answer that cites anything else isn't kept, and every outcome offers a person.

1. Give `defineAi` your `safety` protocol, which sees what the person wrote before any model: nothing
   runs without one. It runs even when they haven't agreed to share with the vendor, so keep it local
   (patterns), or put a model it calls through `wrap` with `consent: "person"`, which refuses without
   their agreement and counts as no route. Install `@marktiderman/genesis-ai` and `zod`.
2. Serve the answer from your server. It runs the task as the person and records what came of it with
   a service-role client, so nobody can write an answer of their own, and spends the question's
   tenant's budget.

   Don't register `supportHelpAnswerTask` with `createAiHandler`: that hands a client the task's raw
   output and records nothing. `answerHelpQuestion` doesn't throw: failures end at no answer, and
   reach `onError`.

   ```ts
   import type { Ai } from "@marktiderman/genesis-ai";
   import { answerHelpQuestion, type HelpAiAdmin, type HelpAiDb } from "@marktiderman/genesis-support/ai";

   declare const ai: Ai;
   declare const serviceClient: HelpAiAdmin;
   declare function userFrom(req: Request): Promise<{ id: string; tenantId: string; db: HelpAiDb } | null>;

   export async function POST(req: Request) {
     const user = await userFrom(req);
     if (!user) return new Response(null, { status: 401 });
     const { questionId } = (await req.json()) as { questionId: string };
     return Response.json(await answerHelpQuestion(ai, { questionId, context: { tenantId: user.tenantId, personId: user.id, db: user.db }, admin: serviceClient }));
   }
   ```

3. Pass `askAi` to the messenger, or to `createSupport` on the phone, as a plain call to it, with the
   person's token where it needs one:
   `(questionId) => fetch(url, { method: "POST", headers, body: JSON.stringify({ questionId }) }).then((r) => r.json())`.
4. People agree to share with the vendor first (genesis-ai's consent), unless your terms cover it:
   `supportHelpAnswerTask({ consent: "terms" })`, passed as `task`. Until they agree, the messenger
   says so and offers a person; `onAiConsent` opens your screen for agreeing. Their words aren't kept
   meanwhile; once they've agreed, "Ask again" asks anew.
5. Run `support_purge_stuck_questions()` daily with the service role: a server that stops mid-answer
   leaves a question unfinished, with the person's words, which agents can't read.

A resolution is a question whose person said the answer helped: `help_questions.outcome = 'resolved'`,
readable by the tenant's agents, beside genesis-ai's usage row for each call. It's what people said,
counted, not a billing record.

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

- Staff link an email ticket to a login with `support_link_requester(report, person)` (with
  support-chat, the person joins the conversation), and mark it read as usual.
- Automatic mail (out-of-office, bounces, lists) and mail from your own addresses never open or
  reopen a ticket; a sender past 20 emails an hour is dropped.
- A reply keeps its text and thread ids when it is queued (a retry sends the same email); one
  deleted before it goes out is cancelled.

## Access, in the database

A person sees, edits (while open) and deletes their own reports, replies on them and sees their
own screenshots. Every signed-in person reads the idea board (not who suggested an idea); one vote per person and idea, and a
Supabase anonymous sign-in can neither vote nor suggest. Staff are whoever your
`private.genesis_support_staff(person uuid)` hook says (none until you add it). Status, owner,
feature id, vote counts and read receipts are the server's. See the migration's header.

`migrations/0003_genesis_support_findings.sql` (this package, applied after 0006) adds:

- `severity` (low, medium, high, critical) as a column the person sends with the report. The
  client and the intake function write it only when told the column is there (`severityColumn:
  true`, `GENESIS_SUPPORT_SEVERITY_COLUMN=true`); both always keep severity in `context` too.
- Report handlers: your optional `private.genesis_support_report_handler(report uuid, person uuid)`
  hook names who else handles a report besides staff (a team that owns the screen, say). They read
  it and its screenshots, reply as support and set its status; they don't observe its
  support-chat thread, so internal notes stay staff-only.
- The verify loop: `support_verify_report` lets the person confirm a fix (`verified_at`) or reopen
  the report (`in_progress`, `reopened_at`). Addressed and wont_fix stamp `resolved_at`.
- The verify prompt, off by default. Turn it on with your hook:

  ```sql
  create function private.genesis_support_verify_prompt_enabled() returns boolean
  language sql stable set search_path = '' as $$ select true $$;
  revoke execute on function private.genesis_support_verify_prompt_enabled() from public, anon, authenticated;
  ```

  Then when someone else marks a report addressed, its person is asked in the thread to check the
  fix (once an hour at most; the reply has `prompt = 'verify'` and isn't counted against anyone's
  limit). It is a staff reply: it marks the report unread for its person, ends their editing, and
  with support-chat is pushed as the marker's message. If it can't be posted, the status change
  still goes through without it.

  Genesis sends no notification of its own for it. An app that notifies on new replies tells the
  verify prompt apart by `support_replies.prompt = 'verify'`, never by the reply's words: the words
  are a sentence an app may translate or change.

It also replaces the reply trigger that `0002_genesis_support_email.sql` (support-email) replaces;
its version keeps the email rules when that block is already installed. Adding support-email after
it, handlers can't reply (their status changes still work, without the prompt) until 0003's
`genesis_support_new_reply` is applied again.

## Fixes to tickets (migration 0011) and to help answers (migration 0012)

- 0011 (with the support block, after 0004): the Data Studio's audit log and outbox move from the
  old table names to `public.tickets` and `public.ticket_attachments`, wherever those tables exist,
  so a ticket's history reads on past the rename. `support_agent_unread_count(tenant)` is an
  agent's count of open tickets with a requester's message no agent has read (`client.agentUnreadCount`),
  for a badge without reading the queue.
- 0012 (with support-helpdesk, after 0010): a question the safety protocol routes elsewhere, or one
  asked before the person agreed, keeps no answer and no cited articles, as well as no words.

## Tickets and tenants (migration 0004)

`migrations/0004_genesis_support_tickets.sql` (applied after 0006 and 0003; ADR 0015) turns
reports into **tickets** that each belong to a **tenant**, so every business on your app can run
its own help desk and your app runs its own support the same way. With the support-chat block add
`0005_genesis_support_chat_on_tickets.sql` and `0006_genesis_support_chat_tenants.sql`, and with support-email `0007_genesis_support_email_on_tickets.sql` and `0008_genesis_support_email_tenants.sql`.

- `support_reports` is now `tickets` and `support_attachments` `ticket_attachments`. For one
  minor the old names are views over the new tables (they run as the caller, so row security
  applies), so older clients and your SQL keep working. Compare a conversation's subject against
  `TICKET_SUBJECT`, never the literal.
- **The tenant** is whatever your `private.genesis_viewer_people` hook returns (genesis-supabase
  0016): in a single-tenant app one fixed id, in a multi-tenant app one per organization. Add your
  own tenant before applying 0004 (it stops without it):

  ```sql
  create function private.genesis_support_default_tenant() returns uuid
  language sql stable set search_path = '' as $$ select '…your tenant id…'::uuid $$;
  revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
  ```

  A new ticket goes to the tenant it is sent with (`createSupportClient(supabase, { tenantId })`,
  usually the viewer's current workspace; refused if the sender isn't in it or its help desk is
  off), else yours. Nothing is guessed from which tenants the sender belongs to. Existing reports go to yours, or where your optional
  `private.genesis_support_tenant_for(report uuid) returns uuid` puts them.
- **Agents**: `ticket_agents` (tenant, person, `agent` or `admin`), set with
  `support_set_agent(tenant, person, role)` (`client.setAgent`) by a tenant admin (genesis-supabase
  0004's `genesis_tenant_admin` hook) or an agent admin. A tenant's agents and admins read and
  handle its tickets and nobody else's. Your staff hook now means "an agent of your own tenant".
  With genesis-chat 0004, support chats keep their ticket's tenant (0005 and 0006 move any that
  chat placed by their members), and support turns chat's own tenant gate off for its kind, since
  its observer check already reads the ticket's tenant: your staff read your tickets' chats without
  being listed as people of your tenant.
- **Reading and handling stay apart**: the requester reads their ticket and never handles it; your
  report-handler hook only answers for your own tenant's tickets.
- **Opt-in per tenant**: a tenant takes tickets only once `support-helpdesk` is enabled for it in
  genesis-supabase 0004's `tenant_features` (`set_tenant_feature`); without that table, only your
  own tenant does. Your own tenant always takes tickets.
- **Screenshots** keep their `<user>/<ticket>/<file>` paths; who may open one comes from its
  ticket row (tenant and handlers), not the path.
- **Old names**: `support_reports` and `support_attachments` stay as views until every phone
  build you support sends to the new names; they are dropped in a later minor, announced in its
  changeset. `genesis doctor` warns about app SQL (`support-old-names-in-sql`) and code
  (`tickets-through-support-client`) that still name them.
- **Chat subject**: support conversations keep the stored subject `support_report`; compare with
  `TICKET_SUBJECT`, which replaces `SUPPORT_CHAT_SUBJECT`, never the literal. With genesis-chat's
  subject registry installed, 0006 registers the subject's tenant resolver; without it, nothing
  changes.
- **Email** (0008): route inbound mail with an optional
  `private.genesis_support_email_tenant(recipients text[]) returns uuid`; a ticket's emails are
  read by its handlers.
- **Ideas** get a tenant too: your own board is open to everyone signed in, a tenant's board to
  its members.

## Not yet

- No agent inbox or article editor on the phone yet: `SupportAgentInbox` and
  `SupportHelpCenterAdmin` are web only. Without the support-chat block, staff work through the
  database functions.
- Collections can be added and deleted in `SupportHelpCenterAdmin`; to rename or reorder one, call
  `client.saveHelpCollection`. Search leaves out common English words only.
- Articles are plain text, with no images or formatting. A messenger's person is signed in: there's
  no anonymous or signed-token identity yet.
- The agent inbox shows a ticket's latest 200 messages, and its queues refresh on a timer, not live.
  An open ticket's thread is live.
- The agent inbox doesn't list who can be assigned: pass `agents`, with each agent's login. Agent
  rows hold a tenant's person records, and only the app can map those to logins.
- Without the support-chat block there are no live updates: the thread re-reads every 30 seconds
  while open.
- No ratings, no web idea board, no notification when an idea ships.
- The CDN (script-tag) build of the web loader isn't published; `mountSupportWidget` is the loader.
