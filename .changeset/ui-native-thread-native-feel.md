---
"@marktiderman/genesis-ui-native": minor
---

- `NativeThreadList` takes `openAt`: it opens with that row (the first unread) at the top, once,
  when the rows and it are known (`undefined` waits, `null` opens at the bottom), and never after
  the reader has scrolled (a drag, or VoiceOver's or a wheel's scroll away from the bottom). A row
  FlatList hasn't measured is retried from an estimated offset, then it opens at the bottom. Under FlashList a scroll to the end after a send happens once: the
  list's bottom anchoring follows the new row, so the second try 180 ms later is gone (FlatList
  keeps it).
- `InboxPage` builds its rows only when its items change, or the minute does (so times and
  "Yesterday" turn over on the next render), and memoizes the row renderer and `DefaultRow`, so a
  page re-render no longer redraws every row.
- `GenesisModules.reanimated` may carry `FadeInDown` (`GenesisLayoutAnimation`), for an
  `entering` animation; `GenesisModules.swipeable` takes `leftThreshold` and
  `dragOffsetFromRightEdge`, and `onSwipeableWillOpen` gets the direction. `GenesisSwipeableComponent`
  and `GenesisLayoutAnimation` are exported.
