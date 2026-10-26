---
"@marktiderman/genesis-extension": minor
---

Page bar: line icons on chips and buttons (`PageBarIcon`), tooltips (`PageBarChip.title`, `PageBarModel.titleTip`), a hover-only button (`reveal: "hover"`), a green "saved" lead (`leadTone: "success"`), icon-and-text marks (`bare` chips), the corner tab's accessible name (`collapsedTitle`), a 32px `density: "compact"`, and a × to shrink (`shrinkIcon: "close"`). All optional; a model without them draws as before, except the shrink control is now an SVG chevron instead of `▴`.

`isFromExtensionPage` now requires the sender's address to be this extension's own (its static origin, or the per-session one `runtime.getURL` gives with `use_dynamic_url`), not any `chrome-extension://` address.
