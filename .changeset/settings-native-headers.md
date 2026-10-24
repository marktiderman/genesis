---
"@marktiderman/genesis-ui-native": patch
---

`SettingsPage` looks like the system Settings app on iOS. Section headers were a full-width gray band with a rule under it; now a header is an uppercase footnote caption in `secondaryLabel`, on the grouped background and inset to line up with the cell text. Cells sit in rounded groups on `secondarySystemGroupedBackground` with hairline `separator` lines between cells only, inset to the cell text (past a leading icon), and the footnote under a group is in `secondaryLabel`. On Android a header is a Material subheader in the tint color, with no band. All colors come from `useThemeRoles`, so they follow dark mode. The slots API is unchanged.
