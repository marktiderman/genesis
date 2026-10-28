---
"@marktiderman/genesis-cli": patch
---

`genesis introspect` (Postgres) leaves a view that has rules of its own (beyond its `_RETURN` rule) as read: such a view may be updatable only through a `DO INSTEAD` rule over a query whose rows aren't its table's (an outer join), so it no longer takes that table's key or nullability. A view column of an enum type that its table's `CHECK` narrows keeps the narrowed list, as the table's own column does.
