---
"@marktiderman/genesis-core": minor
---

Query keys: `defineQueryKeys(domain, queries)` builds viewer-scoped keys (`for({ viewer, group?, day? })`) and invalidates by domain, kind or any field (`where(fields, kind?)`, which also finds one person inside a multi-person key); `resourceKeys(resource)` names the keys Genesis's own hooks use; `<ViewerScope viewer>` mounts screens only for a known viewer and empties the cache when it changes (`clearViewerCache` for apps without it).
