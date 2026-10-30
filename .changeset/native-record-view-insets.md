---
"@marktiderman/genesis-ui-native": patch
---

`NativeRecordView` keeps its whole screen, the switcher, readiness and sections included, in one scroll view with `contentInsetAdjustmentBehavior="automatic"`, so iOS insets it below a translucent navigation bar. Before, the first rows sat behind the bar and couldn't be tapped. A list section is its own (already inset) list, with that top as its header, before any `lists[id].header`. A screen's own section (`slots[id]`) is laid out inside the scroll view, or, given as a function `(top) => node`, owns its scroll view (a long FlatList) and renders the top as its header. Taps reach a section's buttons while the keyboard is up (`keyboardShouldPersistTaps="handled"`).
