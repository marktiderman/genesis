---
"@marktiderman/genesis-forms": patch
---

`parseForm` now checks the structured field types' settings even when a field has no `props`, so a `table` field without columns is rejected instead of publishing a form nobody can submit.
