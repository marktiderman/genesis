---
"@marktiderman/genesis-ui": minor
---

More ResourcePage props for app data views:

- `getTitle` / `getSubtitle` name a record from several fields (the detail title, and the card label with `openOnCardClick`).
- `emptyIcon` / `emptyMessage` / `emptyDescription` set the empty state. `DataPageShell` gains `emptyDescription`.

Fix: the open detail follows the current rows by key. After an edit it shows the new values, and when its record is deleted it closes instead of showing the old copy.
