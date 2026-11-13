---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-chat": minor
---

Features: view-inbox, record-pages

The inbox view type: any view as a three-pane inbox. A view's `inbox` block (core: `title`, `preview`, `time`, `from`, `avatar`, `unread`, `badge`, `rail`, `doneAction`, `markRead`; `view.inboxRow(row)`, `view.inboxActions()`, `inboxProblems`) and `<ResourceView type="inbox">` (or `inbox` in a view's `types`): the segments with their counts and saved views in an `InboxViews` rail, the rows in `InboxPage` (unread in bold, preview, relative time, badge, the row's actions, checkboxes for bulk actions with Shift for a range), paged through the provider, and the open record's `RecordView` or the app's `inbox.renderReading(row, { close })`, with `inbox.renderContext` for the sidebar. Selection is the app's (`inbox.selected`, `inbox.onSelectedChange`); a key no row has shows "Not available"; narrow screens go Back; j, k, e (the view's done action) and Escape work; a declared `markRead` action runs on opening an unread row. A segment's `args` pass a function-backed source its arguments. `RecordView` takes `onEdit` and `onDelete`, and `recordPeekSlot` now forwards a list's own edit and delete to the peek (they were dropped). `InboxPage` takes `checked`, `onCheckedChange` and `checkLabel`. `NativeResourceView type="inbox"` draws the rows as InboxPage's. New part: `inbox`. genesis-support exports `ticketInbox`, `ticketSegments`, `supportQueueSource()` and `TICKET_STATUS_TONES`; genesis-chat exports `conversationInbox`.
