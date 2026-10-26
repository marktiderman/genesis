---
"@marktiderman/genesis-ui": patch
---

AppShell: `<AppShellSubNavEnd>` content (a page's readiness chip) now renders on phones. Below `md` the tab row is hidden behind the bottom bar, and the end slot used to be hidden with it, so a disabled Publish button gave no reason. On phones the slot now moves to a compact strip under `<AppShellPageHeader>`; it is still one portal target, so the chip is never rendered twice. Desktop, an empty slot and the default `"section"` mode are unchanged.
