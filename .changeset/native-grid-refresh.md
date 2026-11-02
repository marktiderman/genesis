---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-cli": patch
---

`NativeResourceView` draws a view as cards with `mode="grid"` (`numColumns`, default 2) and an app's own row or card with `renderCard(row, index, card)`, the names the web's ResourceView uses. `card.pressableProps` gives a custom card the built-in press, long press, label and accessibility actions; `card.item`, `card.actions`, `card.open` and `card.showActions` are there to wire it by hand. Sections, cursor paging, pull to refresh, the empty and error states, the peek and swipe actions all stay. Both are opt in: the default list is unchanged.

`ScreenContainer` takes `onRefresh` and `refreshing` for pull to refresh on a screen that isn't a list, on the theme-tinted `NativeRefreshControl`, as InboxPage and NotificationsPage have it. `onRefresh` makes the body scroll, since pulling needs a scroll view; without it nothing changes.

The native starter template's Jest suite runs gestures and animations as written: Gesture Handler's mocks (`jestSetup.js`) and Reanimated's test mode (`setUpTests()` and its resolver), with a test that drives a Pan gesture's shared value through `fireGestureHandler`. The template declares `react-native-gesture-handler` ~3.3.0 (Expo SDK 58's version) as a direct dependency.
