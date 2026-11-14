# @marktiderman/genesis-support

## 0.8.0

### Minor Changes

- 3cb1302: **In 0.7.0, `FeedbackStatus` gained `pending`** (waiting on the requester), in the exported union and in `FEEDBACK_STATUSES`, and that release didn't say it can break code that reads statuses. If you've upgraded to 0.7.0 or later, handle it everywhere you read a status:

  - A `switch` over the status with a `never` check stops typechecking; add a `pending` case.
  - A `switch` with a `default` still compiles, but quietly puts `pending` in the default bucket. Decide where it belongs (it is neither active nor closed: the desk shows it in its own Pending view) and add a case.
  - A `Record<FeedbackStatus, …>` map (labels, colours, icons) needs a `pending` key.
  - Code that iterates `FEEDBACK_STATUSES` (filters, menus, counts) now gets `pending` too.
  - Your own SQL that checks `status` (`in ('open', 'submitted', 'in_progress')` for active, `not in ('addressed', 'wont_fix')` for open) now meets `pending` rows: decide which side they fall on.

  There's no codemod: where `pending` belongs is your app's call.

  Follow-ups from the help-desk review:

  - **The phone gets the reply expectation.** `createSupport` takes `replyExpectation` and `officeHours`, as `SupportMessenger` does on the web (one shared piece): `useStartConversation` says how soon people hear back, or when someone's back, above the composer (and returns it as `expectation`), and `useSupportThread` says where the answer will come under a thread nobody has answered yet (`awaiting`), only when one of the two is set. The agent desk stays web only; the README says so.
  - **The composer's `!` and `?` pickers leave punctuation alone.** They open only once a letter follows the trigger, so "Merci !" or a lone "?" is just words, and Enter inserts an option only after the arrow keys move into the list; otherwise Enter sends. Tab still inserts.
  - **`{first_name}` and `{name}` are never an email address or a stand-in.** Without a real name for the requester (an email ticket with none, or `resolveUser` returning `""`), they fill as nothing and take the space before them: "Hi {first_name}," reads "Hi,".
  - **Office hours reject times past "24:00"** ("24:30" was read as 00:30 the next day); a span it can't read is left out.
  - **Migration `0015_genesis_support_agent_tools_bounds.sql`** (the support-chat block brings it after 0014): the report's open-by-requester list calls the app's new optional set-based hook, `private.genesis_support_requester_labels(reports uuid[])`, once for every open ticket, or else 0014's one-ticket hook for at most the 1,000 most recently changed open tickets, saying so with `AgentReport.byRequesterCapped` (and a line under `SupportAgentReports`' list). A mention is readable only while the mentioned agent still handles its ticket.

## 0.7.0

### Minor Changes

- 5431861: The agent's desk, with migrations `0013_genesis_support_queues.sql` and `0014_genesis_support_agent_tools.sql` (the support-chat block brings both after 0009):

  - **Pending.** A new ticket status, `pending` (waiting on the requester), set by an agent and back to `open` by itself when the requester writes. The other statuses keep their meaning. `SupportAgentInbox` gains the Pending and Closed views; Mine and Unassigned hold active tickets, and the counts on Mine, Unassigned and All are active tickets only. Rows show who wrote, the status, who has it and how long the requester has waited (`AgentTicket.waitingSince`).
  - **Earlier conversations.** The details panel lists the requester's other tickets in the tenant (`client.agentEarlierTickets`, `support_agent_requester_tickets`), each opening in the inbox; the app's `context` cards stay.
  - **The composer.** In an internal note `@` mentions a teammate (genesis-chat's mention format): the database records it in `ticket_mentions` (`client.agentMentions`) and calls the app's optional `private.genesis_support_agent_mentioned` hook to notify them. `!` inserts a saved reply with `{first_name}`-style variables filled (`replyVariables`), and `?` a help article's title and link (`articleHref`). When someone writes while an agent is writing, Send first says the conversation changed, with Send anyway and Review.
  - **Saved replies** per tenant: `SupportSavedRepliesAdmin`, `client.savedReplies`, `saveSavedReply` and `deleteSavedReply`.
  - **Reports**: `SupportAgentReports` and `client.agentReport` (opened, closed, median first response and time to close over a range, open now, and open by the requester's company through the app's optional `private.genesis_support_requester_label` hook).
  - **The messenger's reply expectation**: `replyExpectation` and `officeHours` on `SupportMessenger` (and the launcher) say how soon people hear back or, outside office hours, when someone is back; `officeHoursState` is the same check anywhere.

### Patch Changes

- d0b5676: InboxPage rows shrink to their list (`min-w-0`), so a long title truncates instead of widening the row past a narrow panel such as the support messenger's sheet. The support messenger says where the answer will come (`copy.messenger.awaitingReply`) under a conversation support hasn't answered yet.

## 0.6.2

### Patch Changes

- Updated dependencies [234414b]
  - @marktiderman/genesis-features@0.9.0

## 0.6.1

### Patch Changes

- 6996d4a: A new theme role, `primary-text`: the primary as text or an icon on the page, readable for every brand.

  `primary` is a fill colour, and a light brand primary (a gold `#FFC402` on white is 1.6:1) made every link, active tab, stat and icon coloured with `text-primary` unreadable. `--primary-text` (the `text-primary-text` class on web and in the NativeWind preset) is now declared in both modes for every brand: the primary where it reads at 4.5:1 on that mode's background, otherwise the primary's hue darkened (light mode) or lightened (dark mode) until it does. The gold above becomes `#947100` (4.54:1) on white. Genesis's own indigo already reads, so nothing changes for the default theme.

  - **design-system:** `brandRoleVariables`, `themeFromBrand`, the NativeWind preset, `themes/genesis.css`, the Tailwind v4 bridge and the design-system colour engine all emit `--primary-text`. A brand can pick the exact shade with the new optional `primaryText` and `dark.primaryText` fields. `brandContrastProblems` checks primary text on the page at 4.5:1.
  - **ui, ui-native, chat, forms, sites, support:** components that coloured text or icons with `text-primary` now use `text-primary-text`. Fills (`bg-primary`), borders and rings are unchanged. `brandThemeStyle` and the sites theme set `--primary-text` too.

  `themes/genesis.css` declares `--primary-text: var(--primary)`, so an app that sets only `--primary` in its own CSS looks exactly as before. If that primary is light, set `--primary-text` beside it (or take the role variables from `brandRoleVariables` / `themeFromBrand`) and drop any app-side "readable primary" token. Use `text-primary-text` in your own screens wherever you colour text with the primary.

## 0.6.0

### Minor Changes

- 38d530f: The help desk's agent inbox on the web. `SupportAgentInbox` (`/web-chat`) is a tenant's inbox on genesis-ui's `InboxLayout`, `InboxViews`, `InboxPage` and `ThreadPage`: the views Mine, Unassigned and All, the thread with reply and internal note, status, assignee and a details panel the app can add to (`context`). Migration `0009_genesis_support_inbox.sql` (in the support-chat block) adds its read path, `support_agent_tickets` and `support_agent_ticket_counts`, for a tenant's agents only; the client gains `agentTickets`, `agentTicket` and `agentTicketCounts`, and a reply gains `authorId` on genesis-chat.
- The help desk's person side. `SupportMessenger` and `SupportMessengerLauncher` (`/web-chat`) are Home, Messages and Help, opening in the chat dock when the app has one; `useMessengerHome`, `useHelpCenter`, `useHelpArticle` and `useStartConversation` (`/native`) are the same on the phone. Migration `0010_genesis_support_help_center.sql`, in a new `support-helpdesk` block, adds a tenant's help center: collections and articles, written in `SupportHelpCenterAdmin`, and `helpCenterPages` for a public site. `supportHelpAnswerTask` (`/ai`) is an optional AI answer: off until a tenant opts in, grounded only in its published articles, citing them, and always offering a person. `FeedbackRecord` gains `tenantId`, and `myReports` a `tenantId` filter. The optional genesis-chat peer's floor rises to 0.9.0, for the chat dock; a release with `{ visible }` on a docked panel, and a genesis-ai with `safetyRequired`, are better still, and those floors should rise once they're published.

### Patch Changes

- fa9d095: `cleanRoute` drops the query and fragment with one search, so a route made of many `#` characters no longer takes quadratic time. The support intake function's copy of the contract matches.
- Updated dependencies [5813132]
  - @marktiderman/genesis-features@0.8.2

## 0.5.0

### Minor Changes

- 0abdac9: Tickets, with tenants (ADR 0015). Migration `0004_genesis_support_tickets.sql` (support-feedback block). The support-chat block now ships `0005_genesis_support_chat_on_tickets.sql` (its 0001, for the renamed table and safe to re-run) and `0006_genesis_support_chat_tenants.sql`; support-email ships `0007_genesis_support_email_on_tickets.sql` and `0008_genesis_support_email_tenants.sql`. Each comes with its pgTAP test.

  - **Tickets.** `support_reports` is renamed `tickets` and `support_attachments` `ticket_attachments`. For one minor the old names stay as views over the new tables (`security_invoker`, same column grants), so installed clients, the intake function and app SQL keep working; the client still reads the old names this release.
  - **Tenants.** Every ticket and idea has a `tenant_id`: the tenant your `genesis_viewer_people` hook returns (one fixed id in a single-tenant app, one per organization in a multi-tenant one). A new ticket takes the tenant it is sent with (`tenantId`, usually the viewer's current workspace; refused if the sender isn't in it or its help desk is off), else your default tenant; nothing is guessed. Existing rows are filled from `genesis_support_tenant_for(report)` if you define it, else the default tenant.
  - **You must add** `private.genesis_support_default_tenant() returns uuid` (your own tenant) before applying 0004; the migration stops and says so otherwise. Existing rows keep their `updated_at`.
  - **Your SQL**: triggers, policies or `alter table` on `support_reports` must name `tickets` (the old name is a view); move realtime subscriptions to `tickets`.
  - **Agents.** `ticket_agents` (tenant, person, `agent` or `admin`), managed with `support_set_agent`; `support_is_agent(tenant)`. A tenant's agents and admins handle its tickets; your staff hook now means "agent of your default tenant", so platform staff no longer read other tenants' tickets. With genesis-chat 0004, support chats stay in their ticket's tenant whichever migration runs first, and your staff read them without being listed as people of your tenant.
  - **Reading and handling stay separate**: the requester reads a ticket and never handles it; the report-handler hook only answers for your own tenant's tickets.
  - **Opt-in per tenant**: a tenant takes tickets and email only once `support-helpdesk` is enabled for it in `tenant_features`; your own tenant always does. Email for a tenant that is off goes to your own support. Ideas go to your own board unless a tenant is named. `support_default_tenant()` returns your tenant.
  - **Email**: route an inbound email to a tenant with `genesis_support_email_tenant(recipients)`; a ticket's emails are read by its handlers.
  - **TypeScript**: `Ticket`, `TicketAgentRole`, `TICKET_SUBJECT` (compare against it, never the literal); `SupportClientOptions.tenantId`; optional `myTickets`, `isAgent`, `setAgent`.
  - **Doctor**: new warnings for app code that queries `tickets` (or the old names) directly instead of through the support client, and for app SQL that still names `support_reports` or `support_attachments` (dropped in a later minor, once every supported phone build is on the new names).

  genesis-supabase: `0006_genesis_support.test.sql` passes on the renamed tables and defines a default tenant inside its transaction when support 0004 is applied.

### Patch Changes

- 00ac05c: Web messaging, review follow-ups.

  - **genesis-ui:**
    - `ThreadPage` and `InboxPage` show times once hydrated, in the viewer's time zone, so server-rendered HTML matches.
    - The thread's log is a tab stop, so keyboard users can scroll it. "Jump to latest" moves focus to the log before it goes away.
    - Rows don't re-render on each keystroke in the composer.
    - `InboxPage.onEndReached` asks once per page, and the new `hasMore={false}` stops it.
    - The README lists the props that are web only.
  - **genesis-ui-native:** `InboxPage` marks a `selected` row (filled, and `selected` to a screen reader), as the web does.
  - **genesis-chat and genesis-support:** the docs of chat's web thread, inbox and composer, and of support's web-chat threads, name their move onto genesis-ui's components (feature `inbox-thread`). No behaviour change.

  Features: inbox-thread

## 0.4.0

### Minor Changes

- 208893f: Support reports become findings someone can fix and the person can verify, and the web feedback panel and report thread gain opt-in improvements. Existing apps keep working and look the same: the new database parts need migration 0003, and every new visible behaviour is behind an option, except the few listed at the end with why.

  - New migration `migrations/0003_genesis_support_findings.sql` in the `support-feedback` block (after 0006, with its pgTAP test): a `severity` column; report handlers, named by an optional app hook `private.genesis_support_report_handler(report, person)`, who read a report and its screenshots, reply as support and set its status besides staff (`support_handles`); and a verify loop: `support_verify_report` lets the person confirm a fix or reopen the report (`verified_at`, `reopened_at`; addressed and wont_fix stamp `resolved_at`). The prompt that asks the person to check a fix in the thread is off unless the app's hook `private.genesis_support_verify_prompt_enabled()` returns true; it is marked as the system's (`support_replies.prompt`), posts at most once an hour per report, and when a reply rule or limit refuses it the status change still goes through. Its reply trigger keeps the support-email block's rules when that block is installed first.
  - Severity: `FeedbackRecord.severity`, always kept in the report's `context.severity`. With migration 0003 applied, `severityColumn: true` on `createSupportClient` / `createSupabaseSink`, and `GENESIS_SUPPORT_SEVERITY_COLUMN=true` on the intake function, also write the `severity` column.
  - Client: optional `verify` and `handles` on `SupportClient` (a client of the app's own keeps compiling; check for them before calling), and `pinned`, `aboutLabel` and `page` on `SupportReport`. New helpers `isSitePath`, `cleanLabel`, `pageOf` and `reportHeading`.
  - Web panel, opt-in: `severity` (a severity choice for bugs), `thanksReplacesForm` (the thanks takes the form's place, with Send another and an optional `onOpenHelp` button), `about` (a suggestion the person can drop), `draft` with `useFeedbackDraft` (a draft the host holds, so stepping aside to capture or pin loses nothing), `captureOnOpen` and `captureRequest`. `FeedbackLauncher` holds the draft and gives each return from stepping aside a fresh Sheet, so its overlay no longer stays drawn over it.
  - `useFeedbackShortcut` (`/web`): opens feedback with ⌘⇧. or Ctrl+Shift+., ignoring key repeat and rich-text editors.
  - Web report thread (`/web-chat`), opt-in: `reportHeading` (the report's own words in a real `h2`, its message only when it adds something, and the page it was sent from, a link only when it's a path on this site), `focusHeading` (focuses that heading; turns `reportHeading` on) and `plainChatTitle` (the conversation titled "Report" instead of the report's title).
  - Types accept `undefined` on optional fields for apps compiled with `exactOptionalPropertyTypes`; the wire contract's two copies stay identical.
  - genesis-supabase: the intake function also writes the `severity` column when `GENESIS_SUPPORT_SEVERITY_COLUMN=true`; it always keeps severity in `context`.

  On by default, and why:

  - Layout only: the panel's tabs share the bar and truncate, and its choice rows wrap and start under their labels, so a long label or a narrow sheet no longer overflows. Nothing is added or removed.
  - A placed pin shows as a row ("Pinned to a spot on this page.") with Remove. It shows only the pin the panel already holds, which the Pinned button already announced, and Remove undoes a pin that could not be undone before.
  - When the browser refuses a screenshot the panel says so instead of showing nothing; it appears only after that failure, and the report can still be sent.
  - The "Write a few words first." error goes as soon as the person types.

  Features: support-feedback, support-chat

## 0.3.0

### Minor Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- ba4220d: Email is a support ticket channel (ADR 0011). genesis-notifications gains `createInboundEmailHandler` (`/server`): it verifies Resend's `email.received` webhook, fetches the message and hands it to the first route that takes it (`InboundEmail`, `inboundEmailOf`, `parseAddress`). genesis-support gains the `support-email` block (migration 0002: a report's channel, requester and reply token, `support_email_messages`, `support_receive_email`, a queue of staff replies to send) and `/email`: `supportEmailRoute` (files mail to a support address, a ticket's reply address or a ticket's thread) and `runSupportEmail` (sends staff replies threaded through the notifier's Resend provider, once per reply). 0006's reply rule now lets staff answer a ticket with no login and server code write on an email ticket.

### Patch Changes

- Updated dependencies [6eb984b]
- Updated dependencies [b11005b]
- Updated dependencies [b028861]
- Updated dependencies [c0c573f]
- Updated dependencies [37972e2]
- Updated dependencies [1ed0cba]
- Updated dependencies [f9a11f2]
  - @marktiderman/genesis-features@0.8.0

## 0.2.6

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0

## 0.2.5

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.2.4

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.2.1

### Patch Changes

- f852f04: Support threads on genesis-chat: a new `support-chat` block (migration `migrations/0001_genesis_support_chat.sql` with its pgTAP test, after 0006 and genesis-chat's 0001 and 0002). A report stays the record; its conversation runs on genesis-chat (kind `support`: the reporter its member, staff observers who reply and write internal notes, an assignee), with status, reply times and read state kept in step, existing replies copied without push, and `support_replies` mirrored both ways for one release. Additive client API: the `chat` option on `createSupportClient` and `createSupport` (a genesis-chat client; with the block, `replies`, `reply`, `markRead` and `subscribe` use the conversation, otherwise `support_replies`), `thread`, `conversationId`, `subscribe`, `isStaff`, `setStatus`, `assign`, `reply(…, { internal })`, optional `internal`, `attachments` and `seq` on replies and `userId` on reports, `defineSupportChatBlock`, native `useSupportConversation` and `mode`/`conversationId` from `useSupportThread` (live on chat, no polling), and `@marktiderman/genesis-support/web-chat` (`SupportReportThread`, `SupportStaffThread`). genesis-chat is a new optional peer.

  Features: support-chat

## 0.2.0

### Minor Changes

- 697c18c: `GenesisNativeApp` mounts `NativeToastProvider` around the screens, so `useToast()` from genesis-ui-native works on every screen without the app mounting one (it threw before). Toasts sit at the top by default, where a tab bar can't cover them; `toast={{ position, disableAnimation }}` places them and `toast={null}` leaves the provider to the app. A top toast now sits below the safe area's top (the status bar and the Dynamic Island) when a `SafeAreaProvider` is above it. `FeedbackForm` takes `sentAlert={false}` to leave the confirmation to `onSent`; the starter shows a toast after a sent report.

  Features: native-app-shell, native-components, support-feedback

### Patch Changes

- b3ee22b: Send feedback from the devtools overlay captures the screen once the overlay's sheet has finished closing, not after a fixed 400 ms that sometimes caught it half way down. The devtools block's `close()` (and the `devtoolsFeedback` slot's `close`) now returns a promise that resolves on the sheet's `onDismiss` (iOS), or after 800 ms where the platform doesn't report it (Android, which always waits that long); the sheet stays mounted while it slides away. The support block's slot waits for it, and still waits 400 ms for an overlay whose `close` returns nothing.

  Features: devtools-overlay, support-feedback

- 03e1fa0: The support block, with its data in the app's own Supabase.

  New package `@marktiderman/genesis-support` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

  - Core: the feedback record (bug, idea, question or praise; message; version signature, route, platform, device; screenshots) behind `ContextCollector` and `FeedbackSink` seams; `createSupportClient` (the Supabase sink, the person's reports and replies, read receipts, signed screenshot URLs, the idea board with votes, "you asked, we shipped"); `createIntakeClient` / `createIntakeSink` for the wire contract over HTTP; a copy catalog; `defineSupportBlock` (`support-feedback`), which adds Send feedback and Help to Settings, its routes and migration 0006.
  - `/web`: `FeedbackPanel` and `FeedbackLauncher` from Genesis UI, tab screenshots with pen marks and hidden areas, pins on the page, and `mountSupportWidget`.
  - `/native`: `createSupport` for `GenesisNativeApp`'s `blocks`, `FeedbackForm`, `ScreenshotAnnotator` (pen and Hide, flattened with `captureRef`), shake to report, `SendFeedbackButton` for a devtools slot, and hooks that feed `InboxPage` and `ThreadPage`.

  `@marktiderman/genesis-supabase`: migration `0006_genesis_support.sql` with its pgTAP test (reports, screenshots in a private bucket with storage policies, staff replies with read receipts, ideas and one vote per person; staff through the app's `private.genesis_support_staff` hook; grants by name; rate limits), and three Edge Function templates: `genesis-support-intake` (the wire contract, as the caller), `genesis-support-notify` (a GitHub issue or a signed webhook per report, summary only) and `genesis-support-cleanup` (removes deleted screenshots through the Storage API).

  `@marktiderman/genesis-support` declares the block under `genesis.blocks` in its package.json, so `genesis add support-feedback` finds its migration, function templates, routes and steps.

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0
