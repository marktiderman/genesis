---
"@marktiderman/genesis-chat": minor
---

Native chat screens:

- **`ChatInboxScreen` with `archived` keeps to the list's scope.** Before, Archived skipped every filter, so an app that scopes the inbox through `filters` (one organization at a time, say) showed every archived conversation. Archived has no filter menu, so it now shows the first filter: wrap each default's predicate and Archived keeps to it, like the inbox. The default first filter (All Messages) shows everything, so an app that doesn't pass `filters` sees no change.
- **`ChatSearchScreen` takes `initialQuery`**: the search field's text when the screen opens, such as a query carried over from the inbox's search.
