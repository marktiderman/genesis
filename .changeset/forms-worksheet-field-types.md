---
"@marktiderman/genesis-forms": minor
---

Four built-in field types for coaching worksheets: `list` (several short answers, `string[]`), `rows` (a table of up to six text columns, `Record<string, string>[]`), `timestamp-notes` (notes at moments of a video, `{ at, text }[]` with `at` in seconds) and `highlights` (notes on passages of a text, `{ start, end, quote, note }[]`; every highlight needs a note). Each validates, normalizes (trimmed, blanks dropped, notes in time order), summarizes and has samples for `coverage()`; `parseForm` checks their props, and `list` supports `contains`. New builders `f.list`, `f.rows`, `f.timestampNotes` and `f.highlights`, and helpers `formatTimestamp`, `parseTimestamp`, `rowsColumns`, `rowsLimits` and `listLimits`, the `WORKSHEET_FIELD_TYPES` list, with the `RowsColumn`, `TimestampNote` and `Highlight` types.
