---
"@marktiderman/genesis-chat": minor
---

Native chat screens:

- **`ChatInboxScreen` takes `scope`**: `(item, { me }) => boolean`, the conversations the screen is about before any filter, such as one organization at a time. It holds for the rows, the pinned faces, search and Archived alike. Before, an app could scope the inbox only by wrapping each filter's predicate, and Archived skipped every filter, so it showed every archived conversation. Archived still has no filter menu and shows everything archived in scope. Without `scope`, nothing changes.
- **`ChatSearchScreen` takes `initialQuery`**: the search field's text when the screen opens, read once (a query carried over from the inbox's search, say).
