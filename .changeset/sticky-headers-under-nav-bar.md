---
"@marktiderman/genesis-ui-native": minor
---

`NotificationsPage`'s section headers stick under the native header instead of under the status bar. Under a large-title header the list runs beneath the header (iOS insets its rows), and FlashList pinned the current header at the list's top, y = 0. It now passes FlashList `stickyHeaderConfig.offset`: by default on iOS the safe area's top plus the compact navigation bar (44 pt, 54 pt from iOS 26; `defaultStickyHeaderOffset`, `iosCompactNavigationBarHeight`), 0 elsewhere; `stickyHeaderOffset` sets it (the safe area's top without a header). React Native's `SectionList` fallback has no offset, so there the headers scroll with their rows when the offset isn't 0. `GenesisListProps` gains `stickyHeaderConfig`.

Features: native-layouts
