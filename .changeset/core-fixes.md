---
"@marktiderman/genesis-core": minor
---

Features: appearance-preferences, data-provider, resource-view-links
Fixes a consumer app reported:

- `AppearancePreferencesProvider` copies a successful store read onto the device, holds a choice the person makes while the read is in flight and writes it merged onto the read (`previous` the read), leaves its last confirmed value alone when a read lands after a write, sends writes one at a time (a newer one replacing a waiting one), and passes the store's last answer as `write(values, { previous })` so a store can write conditionally. `onWriteError` (on the definition or the provider) hears a failed write.
- A Supabase function source's `args` gets the list's filters, which carry the viewer's scope (`args({ filters, take })`); `take(field)` reads an equality filter and keeps it out of the query (`SourceArgsContext`).
- A `ViewerScope` nested inside one for the same viewer keeps the query cache when it mounts; `persistedViewer` also names a viewer whose session filled the cache before the scope mounted (a router's loaders).
