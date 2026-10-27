---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui-native": patch
---

- **ResourceView `defaults`:** values a new row starts with, sent on create only and never a list filter.
- **ResourcePage `onSaved(row, action)`:** runs after the built-in form saves.
- **Fix:** an edit no longer sends a field that is read-only on edit (`readOnlyOnEdit`), so saving no longer fails on a column the person may not update. This covers ResourceView's locked fields and its filter-filled hidden fields.
- **Fix:** an edit with only read-only fields left sends nothing and still succeeds.
- **Fix:** a `filter` alone no longer turns on New and Edit. Only the view's own form fields do, so `form: []` means a list with no form.
- **Fix:** the `date` hint shows a timestamp as its day on the column's clock (the viewer's, by default), not its UTC day, on web and native.
