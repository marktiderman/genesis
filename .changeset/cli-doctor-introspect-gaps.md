---
"@marktiderman/genesis-cli": minor
---

Doctor and introspect gaps from a consumer app:

- `page-layout` counts `RecordView` as a page layout, as it counted `ResourceWorkspace`, so record routes need no `allow` entries.
- `genesis introspect` links a column of a composite foreign key whose other columns reference their namesakes (the tenant-safe `(gallery_id, org_id) references galleries (id, org_id)` makes `gallery_id` a link), from Postgres. PostgREST notes single-column keys only, so `--openapi` is unchanged.
- `genesis introspect` reads a key from a table or view comment, `@genesis {"key": "id"}` (or a list), for a read-only view that joins tables.
- `genesis migrate` mirrors the notifications registry into a `<timestamp>_genesis_notification_types.sql` migration when its types change (`--notifications <file>` names the registry), so a trigger never queues a type the database lacks before the deploy-time sync.
