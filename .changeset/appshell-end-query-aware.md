---
"@marktiderman/genesis-ui": patch
---

**`AppShell`: `end` items and `aria-current` ignore an incidental query/hash.**

`NavItem.end` and the nav-group parent's `aria-current` compared `activePath === item.to` as raw strings, so once an app passes `activePath = pathname + search + hash` (supported by `isPathActive`), an `end: true` item such as `/dashboard` went inactive on `/dashboard?page=2`, and a group parent lost `aria-current` on `/gitdata?tab=open`. Both now use `isPathActive(item.to, activePath, { end: true })`: exact on the path, query/hash-aware. `aria-current` stays exact-only, so a child route still does not mark its parent as the current page (CMT-322-008).
