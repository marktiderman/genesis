---
"@marktiderman/genesis-forms": minor
---

Four built-in structured field types, for questions that collect more than one value:

- `list`: several short answers, `string[]` (goals, action items, three wins this week). Supports `contains`. Builder `f.list`.
- `table`: rows with fixed columns, up to `MAX_TABLE_COLUMNS` (6) text columns, `Record<string, string>[]` (an action plan with What / Who / By when, pros and cons). Builder `f.table`.
- `media-notes`: notes pinned to moments of a video or audio, `{ at, text }[]` with `at` in seconds (lecture notes, reviewing a recorded call). Builder `f.mediaNotes`.
- `text-highlights`: notes on passages of a text, `{ start, end, quote, note }[]` (annotating an article, a policy or a contract). Every highlight needs a note, and quotes are at most `MAX_HIGHLIGHT_QUOTE_LENGTH` (2000) characters. Builder `f.textHighlights`.

Each validates, normalizes (trimmed, blanks dropped, notes in time order), summarizes and has samples for `coverage()`; `parseForm` checks their props. New helpers `formatTimestamp`, `parseTimestamp`, `tableColumns`, `tableLimits` and `listLimits`, the `STRUCTURED_FIELD_TYPES` list, and the `TableColumn`, `MediaNote` and `Highlight` types.
