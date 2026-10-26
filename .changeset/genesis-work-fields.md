---
"@marktiderman/genesis-work": minor
---

New migration `0005_genesis_work_fields.sql` and the `custom-fields` block. A tenant can add its own fields to goals, projects, tasks, issues, metrics and sessions, with no code or migration.
- Fields use genesis-forms field types.
- Values sit in a `custom` jsonb keyed `<namespace>.<key>`, with a GIN index. The database checks their shape; the full validation runs on the server.
- An app's or a content pack's fields are written only by server code.
- A field's type is fixed once rows hold values for it.

Features: custom-fields
