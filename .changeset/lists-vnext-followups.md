---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-cli": patch
---

Features: data-provider, resource-view-sheet, support-helpdesk, client-layer
Follow-ups to the lists release's review.

- **Core.** `SourceArgsContext.takeIn(field)` takes an `in` (or `eq`) filter's values out of the query, for a function that filters by a list. A `pages` source's count asks the function for `page_limit: 0`, which it answers with one row carrying the count.
- **Support.** Migration 0018's `support_agent_queue` takes `statuses` and applies it before paging, and `page_limit` 0 returns the count alone, with no message preview built. `supportQueueSource()` passes the list's status filter, so the Open segment's page and every segment's count stay paged. A text search or a sort other than newest activity still reads every ticket in the segment, by design (about 130 to 210 ms a page at 5,000 tickets).
- **Web.** A sheet save queued behind another is checked against the row as that save left it, so a row the first save locked refuses the second.
- **CLI.** `boundAsParameter` doesn't bind a name only read in a computed destructuring key (`{ [String(contract)]: other }`).
