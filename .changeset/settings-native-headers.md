---
"@marktiderman/genesis-ui-native": patch
---

`SettingsPage` looks like the system Settings app on iOS (inset grouped). Section headers were a full-width gray band with a rule under it. Now a header is an uppercase footnote caption in `secondaryLabel` on the grouped background, inset so it lines up with the cell text. VoiceOver reads the title as written, and the header scales with the footnote Dynamic Type style. Cells sit in groups on `secondarySystemGroupedBackground` with a 16pt margin and UIKit's corner radius (10pt, or 26pt from iOS 26). Hairline `separator` lines run between cells only. They start at the cell text, past any leading icon, and follow right-to-left layouts. The footnote under a group is `secondaryLabel`. On Android a header is a Material subheader in the theme's primary color, with no band. Colors come from `useThemeRoles` and the theme, so they follow dark mode. The slots API is unchanged.
