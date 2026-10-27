---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

Tree mode for lists. `<ResourceView tree={{ getParentId, defaultExpanded, cascadeSelect }} />` (and ResourcePage's `tree`) nests rows under their parent, built from the flat list: depth is computed, the table and list views draw an indent and an expand arrow in the first cell, a sort applies within siblings, search and the status filter keep each match's ancestors (muted), open state is uncontrolled (`defaultExpanded`) or controlled (`expanded`, `onExpandedChange`), and `cascadeSelect` opts in to selecting a row's descendants with it. The table is a WAI-ARIA treegrid (`aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize`; → opens, ← closes). Client data only: `pagination="server"` or `"cursor"` with `tree` throws. Grid, sheet and NativeResourceView don't draw trees yet.

genesis-core/resource-view holds the logic, with no React: `treeRows`, `initialExpanded`, `setExpanded`, `cascadeSelection` and the `ResourceTree` type. `useResourceView` / `useResourceTable` surface it: `rows` are the visible rows in order and `tree` holds each row's node, the open set and `setExpanded`. genesis-ui exports `TreeIndent` (the indent and arrow) and the `DataTableTree` and `ResourcePageTreeState` types. See docs/RESOURCE-VIEW.md, "Tree mode".

Features: resource-tree
