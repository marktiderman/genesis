---
"@marktiderman/genesis-chat": minor
---

Native chat screens:

- **`ChatInboxScreen` takes `scope`**: `(item, { me }) => boolean`, the conversations the screen is about before any filter, such as one organization at a time. It holds for the rows, the pinned faces, the search field and Archived alike. Before, an app could scope the inbox only by wrapping each filter's predicate, and Archived skipped every filter, so it showed every archived conversation. Archived still has no filter menu and shows everything archived in scope. Without `scope`, nothing changes.
- **`ChatSearchScreen` takes `initialQuery`**: the search field's text when the screen opens, read once (a query carried over from the inbox's search, say).
- **`ChatSearchScreen` takes `scope`**: `(hit) => boolean`, the results it shows. A hit outside it is left out, so message search keeps to the same organization as the inbox. It filters on the device, over the newest 100 matches (the most the search returns, which the screen asks for when `scope` is set), so a search whose newest 100 matches are all outside scope shows none.
- **`chatKeys.search(query, conversationId, limit)`** now includes the page size (30 by default), so a search asked with a larger page (a scoped `ChatSearchScreen`) never reuses a smaller one from the cache. `chatKeys.searchAll()` still covers every search.
