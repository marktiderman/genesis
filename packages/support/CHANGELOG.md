# @marktiderman/genesis-support

## 0.10.0

### Minor Changes

- 1fb6dca: The `support-chat` block now lists migrations 0013 (queues and pending), 0014 (agent tools: saved replies, mentions, reports) and 0015 (their bounds), so `genesis add support-chat` and `genesis migrate` copy them. In 0.7.0 they shipped in the package but no block named them, so `genesis migrate` skipped them: an app on 0.7.0 that copied them by hand keeps those files (the CLI matches them by their header), and `genesis migrate` adds only what's missing.

## 0.9.0

### Minor Changes

- dfe6adf: Features: view-inbox, record-pages

  The inbox view type: any view as a three-pane inbox. A view's `inbox` block (core: `title`, `preview`, `time`, `from`, `avatar`, `unread`, `badge`, `rail`, `doneAction`, `markRead`; `view.inboxRow(row)`, `view.inboxActions()`, `inboxProblems`) and `<ResourceView type="inbox">` (or `inbox` in a view's `types`): the segments with their counts and saved views in an `InboxViews` rail, the rows in `InboxPage` (unread in bold, preview, relative time, badge, the row's actions, checkboxes for bulk actions with Shift for a range), paged through the provider, and the open record's `RecordView` or the app's `inbox.renderReading(row, { close })`, with `inbox.renderContext` for the sidebar. Selection is the app's (`inbox.selected`, `inbox.onSelectedChange`); a key no row has shows "Not available"; narrow screens go Back; j, k, e (the view's done action) and Escape work; a declared `markRead` action runs on opening an unread row. An inbox block's `title`, `preview` and `from` take a field or a function of the row. A segment's `args` pass a function-backed source its arguments. `RecordView` takes `onEdit` and `onDelete`, and `recordPeekSlot` now forwards a list's own edit and delete to the peek (they were dropped). `InboxPage` takes `checked`, `onCheckedChange` and `checkLabel`. `NativeResourceView type="inbox"` draws the rows as InboxPage's. New part: `inbox`. genesis-support exports `ticketInbox`, `ticketSegments`, `supportQueueSource()` and `TICKET_STATUS_TONES`; genesis-chat exports `conversationInbox`.

- b3001d4: Features: data-provider, resource-view-sheet, support-helpdesk, client-layer
  Follow-ups to the lists release's review.

  - **Core.** `SourceArgsContext.takeIn(field)` takes an `in` (or `eq`) filter's values out of the query, for a function that filters by a list. A `pages` source's count asks the function for `page_limit: 0`, which it answers with one row carrying the count.
  - **Support.** Migration 0018's `support_agent_queue` is now `support_agent_queue(tenant, inbox_view, statuses, page_limit, page_offset)`: `statuses` applies before paging, and `page_limit` 0 returns the count alone, with no message preview built. It drops the overload an earlier draft of 0018 left, `(uuid, text, integer, integer)`. `supportQueueSource()` passes the list's status filter, so the Open segment's page and every segment's count stay paged. A text search or a sort other than newest activity still reads every ticket in the segment, by design (about 130 to 210 ms a page at 5,000 tickets).
  - **Web.** A sheet save queued behind another is checked against the row as that save left it, so a row the first save locked refuses the second.
  - **CLI.** `boundAsParameter` doesn't bind a name only read in a computed destructuring key (`{ [String(contract)]: other }`).

- 34842f5: Features: support-feedback, support-helpdesk
  Three migrations, numbered after #801's 0013 and 0014 (0015 is taken by a follow-up). `0016_genesis_support_ticket_fixes.sql` (with support, after 0004) moves the Data Studio's audit log, comments, outbox and dead-letter rows (and the outbox payloads' resource) from `public.support_reports` and `public.support_attachments` to `public.tickets` and `public.ticket_attachments` where those tables exist, and adds `support_agent_unread_count(tenant)` (`client.agentUnreadCount`). `0017_genesis_support_help_answers.sql` (with support-helpdesk, after 0010) clears a help question's answer and cited articles when it ends `safety_routed` or `no_consent`. `0018_genesis_support_agent_queue.sql` (with support-chat, after 0013's queues) adds `support_agent_queue(tenant, inbox_view, statuses, page_limit, page_offset)`, the agent queue with no row cap of its own: `statuses` filters before paging; given `page_limit` (and `page_offset`) it picks that page and the whole count (`total_count`) from the tickets' own columns and reads the latest message and waiting time for the page's rows only; `page_limit` 0 is the count alone; without them it returns every row for the provider to search, sort, page and count, with 0013's views and meanings (`mine` and `unassigned` hold active tickets, then `pending`, `closed`, `all`) and its `waiting_since`; `support_agent_unread_count` counts active tickets only, so a pending one doesn't show in the badge; `ticketSegments` gains Pending and Closed (Solved is now Closed); `supportQueueSource({ tenant })` reads it and passes the tenant (the view's `tenant_id` scope filter, or the one given, which still takes the list's `tenant_id` out of the query). The README says how an app's own reply notifications tell the verify prompt apart: `support_replies.prompt = 'verify'`, never the reply's words.

### Patch Changes

- 601fac2: Features: view-filters, view-actions, saved-views, view-inbox, resource-view-board, resource-view-calendar, resource-view-sheet, client-layer, appearance-preferences, data-provider
  The lists release's review, second round:

  - **Core.** A filter a function source took (`take`) belongs to that one read: a later read passing the same array (a table read, its count) keeps it as a filter. `getOne` and `getMany` take `scope` (the list's filters, which a function source takes its scope from; never applied to the record), and `useOne` takes `scope`. `useListState` keeps a declared filter's `default` on a URL-backed list (absent from the URL means the default, `f.<field>=` means cleared), Clear goes back to the defaults, a saved view's segment, filters, search and sort go into the URL in one replacement, and a new viewer or list key starts again from the screen's type. A range filter's day and time must be real (`2026-02-30`, `T25:00` are dropped). The saved-view store keeps a write the storage refused for the page's life. `useViewBoard` refuses a move on a field it can't write (`canMove` says so) and asks the guards again before Keep mine. A calendar's `maxDuration` reads rows with a `durationField` that started before the window and run into it (warned once without it); `defineView` checks it. A nested `ViewerScope` trusts the outer one's cache only over the same `QueryClient`. `AppearancePreferencesProvider` drops a read older than a value its store's `subscribe` delivered, and never sends a write queued for one store to the next.
  - **Web.** A view action is offered by what runs it: the screen's `onAction` (whatever the provider describes), the provider, or a bulk action's own `run`. An action runs once while it's running. A saved-view store that throws is reported. Each `ResourceView` holds its own list state, so a nested one never shares its parent's. `rows` draws on the table, list, grid and gallery only (other types throw, the switcher leaves them out) and without the view's declared filters. `useResourceViewProps` puts an action's confirmation in `ResourcePage`'s new `dialogs`. With the caller's data, an export gets the page's search, sort and status filter, and "Select all matching" ends when the query changes. DataTable's tab stop and arrows skip a closed group's rows; DataGrid keys a group's second run apart. The inbox's e key asks the done action's confirm, and an off-page open record is read in the list's scope. The sheet keeps list fields read-only, ties undo to its resource, asks the guards again before undoing, keeps an undo that failed or was refused, shows a failed read with a retry, and restores a saved view's search and sort. SheetGrid doesn't commit a cell that became read-only while it was edited.
  - **Phone.** `enabled={false}` holds every type's read. The calendar uses the screen's `scopeTimeZone` and shows a failed read with a retry. The inbox loads back pages it dropped (`InboxPage`'s new `onStartReached`).
  - **Support.** `supportQueueSource({ tenant })` takes the list's `tenant_id` out of the query too.
  - **CLI.** `genesis client init --type` takes lowercase words joined by single dashes only. `shadowed-export` lets a file wrap the Genesis component it names through an aliased import it uses (the scaffolded `ResourceView` and `RecordView`). `client/one-view-per-resource` doesn't count two functions' same-named parameters as one contract.
  - **Third round.**
    - **Core.** `useOne`'s `scope` leaves out a text search's `contains` (no record read per keystroke) and keeps the rest, `in` scopes and ranges included.
    - **Core: list state and calendar.** `useListState` drops a type that's no longer offered back to the screen's, without writing the store, so the choice returns once it's offered again. The `maxDuration` lookback reads the latest starts first; on a zoned timestamp it subtracts elapsed time from the window's first instant (a 23-hour day can't drop a row). It warns about a missing `maxDuration` only with no `endField`.
    - **Core: caches and appearance.** A `ViewerScope` keeps restored reads for the persisted viewer only in the `QueryClient` they were restored into. `AppearancePreferencesProvider` drops a choice held for one store's first read when the store changes.
    - **Web.** A held list's rows arriving after the person chose board, calendar, inbox or sheet fall back to the table instead of throwing. `ResourceInbox` and `ResourceSheet` rendered directly refuse `rows` too. The table's deep-linked record and the phone's peek and edit sheet read in the list's scope, as the inbox does. `ResourcePage` takes `restoreKey`, which `useResourceViewProps` sets, so a restored saved view's search and sort reach a screen's own page. A client-paged resource's export and "Select all matching" get the search, sort and status chips the page applies in the browser. The sheet runs one write at a time (undo and saves), ignores a second Undo while one runs, and adds no undo entry for a save that lands after the sheet moved to another resource.
    - **Phone.** `enabled={false}` also holds the segments' counts.
    - **CLI.** `shadowed-export` counts only real uses of the alias: a comment, a string or JSX text doesn't excuse a parallel component. `client/one-view-per-resource` skips a name a function parameter shadows in that file.
  - **Fourth round.**
    - **Web.** A client-paged page's status chip narrows on top of a provider filter on the same field, and the person's sort wins over a provider default, in the export query and the "all matching" selection. "Select all matching" is offered only while the browser narrows nothing (no search or status chip the provider didn't see). The sheet doesn't put back an undo that failed after it moved to another resource.
    - **CLI.** `shadowed-export` no longer blanks quotes before looking for the alias (an apostrophe in JSX text isn't a string, and `${G}` in a template is a use). `client/one-view-per-resource` also treats object and class method parameters as shadowing.
  - **Fifth round.**
    - **Web.** With server or cursor paging, the export and "all matching" query carries the provider's own search (padded or not), so "Select all matching" stays offered. A browser search over other fields than the provider's counts as the page's own query (its fields are in the selection key). A client-paged page that narrows its rows in the browser leaves the server's `total` out of the query.
    - **CLI.** `shadowed-export` and `client/one-view-per-resource` read files through a small scanner that knows code from strings, templates, comments, regular expressions and JSX text, instead of text patterns. An alias only in a string, an attribute value, JSX text or a comment never excuses a parallel component, and a parameter is found by balanced parentheses (a default that calls something included).
  - **Sixth round.**
    - **Web: one normalized search.** `useResourcePage` gives `searchQuery`, the typed text trimmed (spaces only is none), and `searchFields`, the fields the browser really searches. That one value is what the browser filters by, the provider is sent (server and cursor paging), and a list's export and "all matching" query carries. The query is read from whatever fetched the rows (the infinite query under cursor paging), so cursor lists get the server's search, `total` and "all matching" like server paging. In client paging the provider's own search stays in the query and a browser search narrows on top of it (a `contains` filter when it searches one field); a browser search over several fields on top of a provider search can't be one query, so export says so instead of exporting other rows. A deep-linked record reads in the fetching params' scope and honours `resourceOptions.enabled`.
    - **Web: sheet.** A save queued behind another never writes into a resource the sheet moved to; its cells say why.
    - **Core.** `AppearancePreferencesProvider` starts a new store with no `previous`, and keeps values a subscription delivered while a write was out.
    - **CLI.** The scanner runs on an explicit stack (no depth can overflow it), reads `<T,>` and `<T extends X>` in `.tsx` as type parameters, and divides after a literal, `)` or `]`. `boundAsParameter` counts binding positions only (not a default value, a type or a renamed key), finds `function f<T>(name)` and `catch (name)`, and matches parentheses in one pass.
  - **Seventh round.**
    - **Core: data provider.** A function `source` that pages itself declares `pages` (its order and the column with the whole count, `total_count` by default): a list page whose filters it all took, with no search and no other sort, passes `page_limit` and `page_offset` to the function instead of a `range`, and reads its total, and a segment's count, from that column. Any other list reads every row as before. New type `SourcePages`.
    - **Core: appearance.** A held choice stays shown when a subscription delivers values before the first read answers; a new store's writes never wait behind the last store's write; a queued choice is written onto the latest confirmed values, so another device's newer value isn't undone.
    - **Web.** The record peek drops a held delete when it shows another record or closes, so Confirm can't delete a record that's no longer shown. The sheet refuses a yes-or-no cell whose text is neither (it used to save false), and undoes a save queued behind another to the same cell back to what that one wrote. A bulk delete stops when the page moves to another resource. While a typed search waits out the debounce under server or cursor paging, the export query carries it alone, not on top of the old one. An empty list the screen holds exports with a search typed. "Select all matching" ends when the browser's search changes, even when the query can't carry it (several fields over a provider search), and never runs while the browser narrows the rows.
    - **Phone.** `NativeRecordPeek` with `confirmDelete={false}` hands Delete to the handler and leaves closing to it, so a cancelled confirm keeps the peek open.
    - **Support.** `supportQueueSource()` declares `pages`, so a segment's page reads only that page.
    - **CLI.** The scanner reads a JSX attribute's quoted value over newlines, starts a fresh expression inside JSX's `{…}` and a template's `${…}` (so `<span>` there opens an element), and stays linear on a file of `a > (b)`. `boundAsParameter` doesn't take a call before a ternary's `:` for a method, keeps a parameter whose type has a comma inside `<…>` whole (`other: Map<string, typeof contract>` binds `other` only), and binds a method's parameter that has type parameters (`m<T>(contract)`).

## 0.8.1

### Patch Changes

- b9814d7: Follow-ups from the help desk's post-merge review:

  - **Enter never sends a picker's trigger text.** While a `!`, `?` or `@` list offers something, or is still loading, and the arrow keys haven't moved into it, Enter does nothing, so "!refund" isn't sent to the customer by habit. The list now says "Esc to close" (`copy.agentInbox.pickerHint`), and the composer's input is described by that line while a list is open, so a screen reader says it. Arrows then Enter, Tab or a click inserts; Escape closes the list and Enter then sends. With no match, Enter sends as before, and "Merci !" never opens a list.
  - **`!` and `?` open their list only when a letter follows them**, as documented: "Prix ?1" and "Ça marche ?)" stay words. Any script's letters count ("?été").
  - **An empty `{first_name}` or `{name}` takes the separator that joined it.** At the start of a line, indented or not, the comma, colon or semicolon after it goes (" {first_name}, hi" reads " hi", "{first_name}: here's the fix" reads "here's the fix"). Elsewhere the comma before it goes too, unless a word follows it: "Thanks, {first_name}." and "Thanks, {first_name} 🙂" read "Thanks." and "Thanks 🙂" rather than "Thanks,." and "Thanks, 🙂", while "As discussed, {first_name} will call you." reads "As discussed, will call you.". A space here is any Unicode space (a non-breaking one pasted from rich text too) or a tab.
  - **Office hours say why they fell back.** When `Intl.DateTimeFormat` throws or has no time zone support (some phone engines), `officeHoursState` still says open, and a development build now says so once with `console.warn` instead of nothing.
  - **`useSupportThread().awaiting` is null on a closed report** (addressed or won't fix): no answer is coming.
  - **Saved replies' name variables follow `resolveUser`** when it names the requester after the first render (a stable function reading a cache filled later).

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
