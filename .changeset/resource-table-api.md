---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-core": patch
---

`useResourceTable` returns an explicit, documented `ResourceTableState`:

- rows, total, loading and error;
- search, sort and the status filter;
- paging;
- selection;
- the open record;
- create and edit, with the form's state;
- delete, with its confirm step.

It no longer exposes ResourcePage's internal names, so renaming them inside Genesis can't break an app. The hook now lives in its own module, so importing it from `/hooks` doesn't load ResourcePage's markup.

Two fixes:

- In a virtualized DataTable, the table's tab stop falls back to the first row in view, not an overscan row above the viewport.
- The Supabase provider recognises a quoted table name in a missing-`id` error, such as `column "Report-View".id does not exist`.
