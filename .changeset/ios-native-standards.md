---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui-native": minor
---

iOS standards for every native screen (ADR 0028).

- **Row actions:** a view action can say where it swipes (`swipe: "leading" | "trailing" | { side, full } | false`), with an `icon` and a `tone`; `InboxSwipeAction` (also `RowSwipeAction`) takes the same `icon`, `tone`, `full` and `swipe`. `NativeSwipeRow` draws icons and iOS system colors, iOS 26's round style (`appearance="round"`), runs a side's `full` action on a full swipe, and puts the actions on the row for VoiceOver. New `NativeRowActions` and `NativeListItem` `actions`: swipe, long-press menu (the system context menu with `GenesisModules.menu`, `@expo/ui`'s `MenuView`) and accessibility actions from one list.
- **Tab bar per screen:** `TabBarVisibilityProvider`, `useHideTabBar`, `useTabBarHidden`, `ScreenContainer tabBar="hidden"` and `NativeTabBar hidden`, as UIKit's `hidesBottomBarWhenPushed`.
- **Native header:** `ScreenContainer header` sets the stack's native header through `GenesisModules.router.StackScreen`; `composeHeaderOptions` takes `search` (`headerSearchBarOptions`) and `headerRightItems` / `headerLeftItems`. `NavBarSearchBar` is deprecated.
- Doctor rules `screens-use-native-header` and `tab-bar-hidden-per-screen`; icons `archive`, `bell-off`, `flag`, `mail-open`.
