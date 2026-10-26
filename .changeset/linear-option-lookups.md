---
"@marktiderman/genesis-forms-studio": patch
"@marktiderman/genesis-forms-builder": patch
---

Linear-time option lookups for large option lists. The response summary counts choice answers through a value map, and answerCell (used per answer by the summary, the table and CSV) looks labels up in a per-options map, instead of scanning the options for every answer; and the option list editor's CSV import preview compares against a value Set instead of scanning per row. A 5,000-option list with 50,000 answers now summarises in milliseconds.
