---
"@marktiderman/genesis-ui": patch
---

DataTable follow-ups from the #105 review:

- A virtualized table tells screen readers the full row count and each row's position (`aria-rowcount`, `aria-rowindex`).
- Blank values sort last in both directions.
- Remembered column visibility, width and order no longer throw when storage is unavailable (Safari private mode, a full quota).
- A stored column order is used only when it's a list of column keys.
