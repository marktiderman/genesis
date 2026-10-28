---
"@marktiderman/genesis-cli": minor
---

`genesis introspect` (Postgres) gives a view Postgres can update on its own its table's facts: each plain column's nullability, default, link, enum values and comment, the table's primary key when every key column is in the view, and the table's `noun`, `nounPlural` and `labelField`. Columns are traced by position, so a column renamed with `alter view … rename column` keeps the right facts and key. The view's own comments win; computed columns and other views stay as read. A source table in a schema that wasn't asked for is read, not emitted. Single-column `CHECK`s that list values (`status in ('a', 'b')`, alone or `or status is null`) become the field's `enumValues` (checks that share no value give none).

Contracts now state nullability both ways: `nullable: false` for a NOT NULL column, `nullable: true` for a nullable one, and nothing when the catalog can't tell (a view's own column). A schema or table name holding a dot or a quote is quoted (`"my.s"."we.ird"`). **Regenerate your contracts** (`genesis introspect`): older contracts mark every view column `nullable: true`, which the form's empty-input handling would believe.
