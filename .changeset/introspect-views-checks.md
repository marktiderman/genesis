---
"@marktiderman/genesis-cli": minor
---

`genesis introspect` (Postgres) gives a view Postgres can update on its own its table's facts: each plain column's nullability, default, link, enum values and comment, the table's primary key when every key column is in the view, and the table's `noun`, `nounPlural` and `labelField`. The view's own comments win; computed columns and other views stay as read. A source table in a schema that wasn't asked for is read, not emitted. Single-column `CHECK`s that list values (`status in ('a', 'b')`, alone or `or status is null`) become the field's `enumValues`.
