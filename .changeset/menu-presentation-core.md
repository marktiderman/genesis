---
"@marktiderman/genesis-core": minor
---

`NavigationNode.subNav` takes `"list"` and `"hub"` beside `"section"`, `"tabs"`, `"sidebar"` and `"off"`, and the union is exported as `NavigationSubNav`. Each node in a trail is drawn by its own setting (unset: its nearest ancestor's), so any depth can pick its variant.
