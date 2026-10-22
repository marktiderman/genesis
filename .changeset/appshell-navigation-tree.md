---
"@marktiderman/genesis-ui": minor
---

`AppShell` takes a `navigation` tree (`NavigationNode<NavItem>`) and derives the global sidebar, a contextual section for the current node (with `$param` paths filled from the URL), the mobile tab bar and a back-to-parent link in a new content-header slot. `parentNavigation={{ href, label }}` sets that link directly (or `null` hides it), and `navItems` is now optional when `navigation` is given. `/layout` also re-exports `resolveNavigation`, `NavigationNode`, `ResolvedNavigation`, `LinkComponent` and `GenesisLinkProps`. `navItems` is optional now (required before): leave it out to take the global items from the tree. On top-level pages, whose parent is the root, no back link is shown. Additive: existing `navItems` apps are unchanged.
