---
"@marktiderman/genesis-ui": patch
---

DataTable tree mode: when `openColumn` names a column the viewer has hidden, no row renders an open button, so the expand arrow now stays a tab stop (before, it dropped out of the tab order and the tree couldn't be opened from the keyboard).
