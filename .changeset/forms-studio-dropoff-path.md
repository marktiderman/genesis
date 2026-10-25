---
"@marktiderman/genesis-forms-studio": minor
---

Drop-off by question follows each respondent's path. `dropOffByQuestion` rebuilds every response's path with genesis-forms `computePath`, so a question logic hid or jumped over is neither viewed nor left by that respondent, and each response counts once. `SummaryItem` takes optional `hidden` (stored hidden inputs) and `extraAnswers` (answers kept apart, by field key) for logic that reads them. New `dropOffSummary(items, definitions)` returns `{ started, dropOffs }`, where `started` counts distinct responses of any status; `<DropOffByQuestion>` takes `started` (spread the summary into it) and falls back to the first question's views without it.
