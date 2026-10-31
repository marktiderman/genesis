---
"@marktiderman/genesis-cli": minor
---

Doctor and introspect gaps from a consumer app:

- `page-layout` counts `RecordView` as a page layout, as it counted `ResourceWorkspace`, so record routes need no `allow` entries.
- `genesis introspect` links a column of a composite foreign key whose other columns reference their namesakes and whose own column references a column unique on its own (the tenant-safe `(gallery_id, org_id) references galleries (id, org_id)` makes `gallery_id` a link), from Postgres. PostgREST notes single-column keys only, so `--openapi` is unchanged.
- `genesis introspect` reads a key from a table or view comment, `@genesis {"key": "id"}` (or a list, no repeats), for a read-only view that joins tables; one that differs from a primary key is used with a warning.
- `genesis migrate` mirrors a named notifications registry (`--notifications <file>` or `notifications.registry` in genesis.config.json; never on `--dry-run`) into a `<timestamp>_genesis_notification_types.sql` migration that adds and updates its types when they change, never retiring one.
