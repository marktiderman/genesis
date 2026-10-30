---
"@marktiderman/genesis-ui-native": patch
---

`NativeRecordView` keeps its whole screen, the switcher, readiness and sections included, in one scroll view with `contentInsetAdjustmentBehavior="automatic"`, so iOS insets it below a translucent navigation bar. Before, the first rows sat behind the bar and couldn't be tapped. A list section is its own (already inset) list, with that top as its header, after any `lists[id].header`. A screen's own section (`slots[id]`) is laid out inside the scroll view.
