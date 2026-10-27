---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": patch
---

- **ResourceView `defaults`:** values a new row starts with, sent on create only and never a list filter.
- **ResourcePage `onSaved(row, action)`:** runs after the built-in form saves.
- **Fix:** an edit no longer sends a field that is read-only on edit (`readOnlyOnEdit`), so saving no longer fails on a column the person may not update. This covers ResourceView's locked fields and its filter-filled hidden fields.
