# @marktiderman/genesis-tasks

## 0.1.1

### Patch Changes

- 51db9af: New package, `@marktiderman/genesis-tasks`: the task sync layer. `TaskFields`, `mergeTask` (a three-way merge, field by field, against the last agreed state, with labels as a set and priority when asked for), `matchesScope`, `normalizeLabels`, and Todoist's adapter: `syncTodoist` (full, then incremental with the sync token), `getTodoistTask`, `todoistCommand` and `runTodoistCommands` (batched, idempotent uuids, temp ids, a result per command; a request that fails part-way keeps what ran on `TodoistError.partial`) and `readTodoistWebhook` (reads at most 256 KB, even without a content-length). Its first version is published by hand (docs/RELEASING.md, "A brand-new package").
