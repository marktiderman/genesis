---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

The slot contract and the navigation resolver move to core, which has no DOM, so native patterns and shells can share them. New subpaths: `@marktiderman/genesis-core/slots` (`Slots`, `SlotOverride`, `SlotPropsFor`, `renderSlot`) and `@marktiderman/genesis-core/navigation` (`NavigationNode`, `ResolvedNavigation`, `resolveNavigation`, `isPathActive`). `@marktiderman/genesis-ui` re-exports both unchanged, so existing imports keep working.

Features: app-shell, resource-page
