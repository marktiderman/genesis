---
"@marktiderman/genesis-core": minor
---

Query keys: `defineQueryKeys(domain, queries)` builds viewer-scoped keys (`for({ viewer, group?, day? })`), invalidates by domain, kind or any field (`where`, which also finds one person inside a multi-person key); `resourceKeys(resource)` names the keys Genesis's own hooks use; `useViewerCache(viewer)` empties the cache when the signed-in person changes.
