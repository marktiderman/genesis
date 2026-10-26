---
"@marktiderman/genesis-core": patch
---

A viewer switch never sends or re-applies the previous viewer's unsent undoable writes: `ViewerScope` drops them, `clearViewerCache` sends them first while the old session holds. New `flushPendingWrites` and `dropPendingWrites`. `where()` no longer matches every list for an empty list, or a key lacking a field asked for as undefined.
