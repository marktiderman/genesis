---
"@marktiderman/genesis-ui": patch
---

`genesis-ui/resource/rules` and `genesis-ui/resource` re-export the pure resource rules from `@marktiderman/genesis-core/resource`, where they now live: the same names and functions, nothing deprecated. `HeadlineNumber` extends core's, with `value` and `detail` still any React node.

Features: resource-workspace
