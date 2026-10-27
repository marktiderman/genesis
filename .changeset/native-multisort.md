---
"@marktiderman/genesis-ui-native": minor
---

NativeResourceView sorts within each `groupBy` section by the view's `orderBy` (`defaultSorts: [groupBy, orderBy]`). A provider without `multiSort` still applies only the group sort, so sections stay whole. New `serverSorts(view)`; `serverSort(view)` returns its first entry.
