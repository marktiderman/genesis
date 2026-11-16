---
"@marktiderman/genesis-ui": minor
---

The responsive contract (docs/RESPONSIVE.md):

- A list answers to its own width. `ResourceView` measures its frame, and a responsive default (`{ mobile, desktop }`, or `ResourceViewDefaultsProvider phoneMode`) takes its narrow side while the frame is under 40rem (`LIST_NARROW_REM`, from the `use-list-width` hook). `phoneMode` now covers embedded lists as well as page lists, so a table that can't show its columns is no longer the default on a phone or in a narrow panel. Lists outside a `ResourceView` still follow the viewport.
- A list row keeps what the screen drew itself. A column a screen gives its own cell (ResourceView `cells`, or `keepInList` on a ResourcePage column) stays in the narrow list row: on the title column its cell is the row's title (a link, Move up and down), and any other such column shows beside the first three (a Restore button). Before, the row drew the title as plain text and only the first three other columns, so those controls disappeared on phones.
- Side sheets fill a phone's width below `sm` (`max-sm:w-full`), and stay `w-3/4 sm:max-w-sm` from there. A caller's own `w-*` still wins from `sm`; a navigation drawer that should stay narrow on a phone adds `max-sm:w-…` (AppShell's drawer and the inbox's views sheet do).
- PageHeader's actions cluster, and a list's `toolbar` in it, may shrink and wrap within the header instead of pushing past its edge.
- `touchTarget` (exported beside `cn`): an invisible 44×44px hit area on coarse pointers for controls that draw smaller. Switch, Checkbox and a pressable Chip use it, so they keep their look on desktop and meet 44px on touch.
