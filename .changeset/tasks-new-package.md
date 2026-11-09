---
"@marktiderman/genesis-tasks": patch
---

New package, `@marktiderman/genesis-tasks`: the task sync layer. `TaskFields`, `mergeTask` (a three-way merge, field by field, against the last agreed state, with labels as a set and priority when asked for), `matchesScope`, `normalizeLabels`, and Todoist's adapter: `syncTodoist` (full, then incremental with the sync token), `getTodoistTask`, `todoistCommand` and `runTodoistCommands` (batched, idempotent uuids, temp ids, a result per command) and `readTodoistWebhook`. Its first version is published by hand (docs/RELEASING.md, "A brand-new package").
