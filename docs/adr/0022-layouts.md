# ADR 0022: Layouts: navigation styles, frames, density and the document page

- Status: proposed
- Date: 2026-11-13
- Features: `shell-navigation-styles`, `navigation-zones`, `page-layouts`, `app-themes`
- Related: ADR 0018 (app brands, styles and themes), ADR 0003 (navigation zones), ADR 0005 §5
  (the layout tier), ADR 0017 (lists v-next: inset lists), docs/GLOSSARY.md ("Look and feel")

## Context

A **layout** is how an app is navigated and framed: its navigation, its frame and its page
templates (GLOSSARY). An app theme carries one (ADR 0018 §4), but before this ADR the only layout
choices were the sidebar's: its width, a collapsed rail, and how a page's children show
(`subNav`). Products in the same family differ more than that. An issue tracker sits its pages in
an inset panel beside the sidebar; a code host puts its sections in tabs across the top; a
notebook shows its pages as a nested tree; a phone-first app keeps a bottom bar on every width.
An app that wanted any of these drew its own shell beside `AppShell`, which is the parallel piece
FRAMEWORK G2 forbids.

Three more gaps sat beside it:

- **Density** had three vocabularies: `AppShell` said `comfortable | compact`, lists and tables
  (`useViewSettings`, `DataTable`) `compact | comfortable | spacious`, and sites' design systems
  `compact | normal | generous`.
- **No page template for writing.** `DashboardPage`, `DetailPage`, `FormPage` and `SettingsPage`
  frame data; nothing framed a document (notes, a journal entry, a lesson) with a cover, an icon
  and a reading column.
- **Zones** (ADR 0003 §4, "to upstream") were never built in Genesis, so an app had nothing to key
  a theme per zone on.

`pnpm features find navigation` finds `app-shell` (the shell itself: extended here, not
duplicated) and `web-blocks` (planned: blocks building AppShell's navigation, which zones on
`BlockNavItem` prepare for). `find density` finds `app-themes` and `design-systems`; neither owned
the vocabulary.

## Decision

1. **One navigation setting.** `AppShellOptions.navigation`: `"sidebar"` (default: exactly the
   shell as it was), `"rail"` (the same sidebar opening collapsed to its icon rail; a page's or
   the person's own choice still wins), `"top-tabs"` (on a desktop, the top-level items as tabs
   in a bar with the brand and the account, an active item's children as a second row),
   `"bottom-bar"` (the phone's top bar, drawer and bottom tab bar on every width) and
   `"page-tree"` (the sidebar as a nested, collapsible tree indented by depth, as in a notebook;
   collapsed, it is the rail). Every style reads the same navigation tree and `NavItem`s
   (`children` give the tree, `resolveNavigation` the current page) and reuses the pieces that
   exist: the top tabs are `SubNavTabs`, the bottom bar is the shell's phone bar (the split
   `TabBar` uses). Phones keep the drawer and bottom bar in every style. Exported type:
   `AppShellNavigation`.
2. **A frame.** `AppShellOptions.frame`: `"flush"` (default, as before) or `"inset"`: from the
   md breakpoint, the page area is a panel with a margin, rounded corners and a border over the
   sidebar's colour. It reads four component tokens, `--shell-frame-gap`, `--shell-frame-radius`,
   `--shell-frame-border-width` and `--shell-frame-shadow` (in `COMPONENT_TOKENS`; a flush shell
   reads none, so the defaults change nothing), and is the `shell-frame` part. The frame is the
   shell's; an inset *list* (rows in a rounded group) is ADR 0017's `surface: "inset"`, a
   separate choice built with lists, not a copy of this one.
3. **One density vocabulary.** `compact`, `comfortable` and `spacious` (`DENSITY_LEVELS`,
   `DensityLevel` and `resolveDensity` in genesis-design-system, at the root and
   `/app-styles`). `AppShell` gains `spacious`; `useViewSettings`' `Density` is the same type;
   sites' design systems accept the three words as aliases of their own (`comfortable` is
   `normal`, `spacious` is `generous`), and `resolveChoices` still returns their own words, so no
   existing design system or brand changes.
4. **The document page template.** `DocumentPage` (layout tier, `genesis-ui/layout` and its own
   subpath `genesis-ui/document-page`): an optional cover (an image URL or a node) bleeding to
   the page area's edges, an icon overlapping it, a large title (the page-title tokens), a
   subtitle, actions and the body in a centred reading column (`width: "reading" | "full"`).
   Parts: `document-page` (with `data-width`), `document-page-cover`, `document-page-icon`,
   `document-page-title`. It is the page the record page's `document` template (ADR 0021) builds
   on.
5. **Zones in Genesis navigation** (ADR 0003's "to upstream", minimal): `NavigationNode.zone`
   (inherited by descendants), `ResolvedNavigation.zone` (the nearest zone in the trail), and
   `resolveNavigationZones(tree, pathname, { zones, rollUp })` in `genesis-core/navigation`,
   returning `{ navigation, zone, zones, global, rollUp }`. `BlockNavItem.zone` lets a block's
   pages land in their zone. `AppShell` marks the shell with `data-zone`. The sidebar and phone-bar
   helpers ADR 0003 §4 also names are left for later (see Consequences).
6. **Parts.** The shell part carries `data-density`, `data-navigation`, `data-frame` and
   `data-zone`; new parts: `shell-frame`, `shell-top-tabs`, `shell-page-tree`, `tab-bar` and
   `tab-bar-item` (`data-active`), `sub-nav` and `sub-nav-item` (`data-active`), `page-header` and
   `page-header-title`, and the document page's. `shell-nav-item` carries `data-depth` in the
   page tree. All are in `THEME_PARTS`, and genesis-ui's contract test checks them.
7. **In the theme.** `AppThemeLayout` gains `navigation` and `frame` (validated) and `density`
   gains `spacious`; `appShellOptionsFromTheme` passes them. The starter themes name a style
   each: tracker sidebar and inset, repository top tabs, checklist sidebar, notebook page tree,
   press flush sidebar, journal inset and spacious, arena rail. As ADR 0018 §5 says, these are
   defaults: the app's own `AppShell` options and the person's stored choices override them, and
   `lockedOptions` keeps one fixed.

## Glossary

- **layout**, **frame** (flush, inset), **page template** and **density**: as in
  docs/GLOSSARY.md "Look and feel"; this ADR adds `DocumentPage` to the page templates and the
  shared density words (`normal` and `generous` are sites' older words, still accepted).
- **navigation style**: one of sidebar, rail, top tabs, bottom bar, page tree
  (`AppShellOptions.navigation`). Don't use: nav mode, skeleton.
- **zone**: unchanged (ADR 0003); now a field on navigation nodes.

## Alternatives

- **A separate shell per style** (`TopTabsShell`, `TreeShell`): five components to keep in step
  on focus, collapse, phones, print and the dock; the opposite of G2. One option on one shell.
- **Navigation style as a person's toggle in the Sidebar options popover**: the style changes how
  the whole app reads, and an app designs for it; it stays the app's (and its theme's) choice. A
  stored override is still honoured, like any option.
- **The inset frame from list surfaces** (ADR 0017): a list's inset group and the shell's frame
  are different elements with different tokens; tying them would make an inset list impossible
  in a flush shell.
- **Renaming sites' density words**: breaks every stored brand that names `normal` or
  `generous`. Aliases cost nothing.
- **Zones as a second navigation config**: ADR 0003 §1 already rejected it; zones lay over the
  one tree.

## Consequences

- Every default renders as before: `navigation: "sidebar"`, `frame: "flush"` and `comfortable`
  produce the same markup, plus the new `data-*` attributes and `data-slot`s.
- Not built yet, each for later work: the sidebar and phone-bar helpers that turn
  `resolveNavigationZones` into `navItems` and `mobileNavItems` (ADR 0003 §4), native zone shells
  (ADR 0003 §5), and a native `AppShell` option set (genesis-ui-native has no shell; its layouts
  are the app's expo-router navigators). The parity file records these as "not yet".
- Figma: a page for the navigation styles and frames joins the library when the design pass for
  this piece runs.
