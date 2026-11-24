---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui-native": minor
---

iOS standards for every native screen (ADR 0028).

- **One row-action shape, in core:** `@marktiderman/genesis-core/row-actions` is new and platform-neutral. It holds:
  - `RowSwipeAction` (`InboxSwipeAction` in `/conversation` is the same type), `RowActionSide`, `RowActionSwipe`;
  - `RowActionTone`, the meaning: `tint`, `danger`, `success`, `warning`, `info` or `neutral`;
  - `RowActionAccent`, a system color by name to match a system app's look: `blue`, `green`, `orange`, `purple`, `yellow`, `gray` or `red`;
  - the helpers `rowActionSwipe`, `rowActionPlaced`, `rowActionTone` and `rowActionLabel`, and `ROW_ACTION_TONES` / `ROW_ACTION_ACCENTS`.

  An action has one placement field, `swipe: { side, full? } | false`. Unset, it goes on the trailing side, and `side` stays as its deprecated alias. It also takes `icon` (a Genesis icon name; core keeps it a string, and ui-native's `isNativeIconName` checks it), `tone`, `accent`, `confirms` (its own `onPress` asks first or can be undone) and `reason` (a guard's refusal, read to screen readers).

  A view action (`defineView`) takes `swipe` with the bare side as shorthand (`"leading"`), plus `icon`, `tone` and `accent`. A destructive action on a full swipe needs a `confirm`, and NativeResourceView marks the row action `confirms`.
- **One way a row offers its actions:** NativeRowActions, `NativeListItem` `actions`, InboxPage's rows and NativeResourceView's rows and cards all build them the same way:
  - the system context menu with `GenesisModules.menu` (`@expo/ui`'s `MenuView`), else `NativeContextMenu`'s sheet; a `preview` peek always uses the sheet;
  - the swipe (`NativeSwipeRow`, or the screen's own);
  - the screen reader's actions, a refused one with its reason.

  InboxPage now uses the system menu when the app has one, and its sheet keeps the testID `<page>-menu`. InboxPage's `row` slot gets `actionProps` to spread on its pressable. NativeResourceView's long press opens the sheet instead of an alert, and `card.showActions` opens it too. `showInboxActions` is deprecated. A row whose actions go away while its sheet is open (disabled, or none left) closes the sheet, so it doesn't open again by itself when they return.
- **NativeSwipeRow:**
  - draws each action's tone or accent in iOS's system colors (info blue, warning orange, success green, neutral gray, danger red, an accent by name), with Android fallbacks at 4.5:1;
  - draws `tint` in the app's primary with its foreground;
  - supports iOS 26's round style (`appearance="round"`: 50pt circles, the open row a pill);
  - runs a side's `full` action on a full swipe: past 0.6 of the row, and 40pt clear of its open actions;
  - puts the actions on the row for VoiceOver;
  - keeps the buttons unseen at rest: the row's translation shows them with `GenesisModules.reanimated`, else one open state;
  - warns in development when a destructive full action doesn't set `confirms`.

  The swipe tracks the finger 1:1, and a swipe action runs before the row closes.
- **`useThemeRoles` adds `primary` and `onPrimary`:** the app's own `bg-primary` and `text-primary-foreground` on the phone. Under a `GenesisThemeProvider` they are `brandRoleVariables(brand, { platform: "native" })` for the resolved mode (native overrides, dark colors, the contrast-checked foreground). Otherwise they are the tint, with black or white by contrast, read from a hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` tint (a PlatformColor tint takes the theme's foreground).
- **Round rows and peeks:** NativeRowActions' `preview` and NativeContextMenu's `preview` show a peek above the menu; InboxPage takes `swipeAppearance` and `menuPreview`.
- **Tab bar per screen:** `TabBarVisibilityProvider`, `useHideTabBar`, `useTabBarHidden`, `ScreenContainer tabBar="hidden"` and `NativeTabBar hidden`, as UIKit's `hidesBottomBarWhenPushed`. `createPlaceExit` remembers where a place that hides the bar for its whole stack (Messages) goes back to.
- **Native header:** `ScreenContainer header` sets the stack's native header through `GenesisModules.router.StackScreen`, and resets what it set when a screen drops it. `composeHeaderOptions` takes `search` (`headerSearchBarOptions`) and `headerRightItems` / `headerLeftItems`. `NavBarSearchBar` is deprecated.
- **Also new:**
  - doctor rules `screens-use-native-header` and `tab-bar-hidden-per-screen`;
  - icons `archive`, `bell-off`, `flag`, `mail-open`, `message-unread`, `pin-off`, and `isNativeIconName`;
  - `NativeRowActions` keeps a row's own `onLongPress`.
- `defineView` refuses a tone or accent outside the sets above. `useHideTabBar` needs `GenesisModules.router.useFocusEffect`; without it the bar stays shown, with a development warning.

### Behaviour changes

Each one is visible on upgrade and has a way out, so no code fails to compile and no codemod is needed:

- **List rows swipe by default.** With `GenesisModules.swipeable` set, `NativeResourceView` list rows swipe: Edit and Delete on the trailing side, plus the view actions that set `swipe`, at most three a side. View actions without `swipe` stay in the long-press menu and VoiceOver's actions; a screen's own `swipeable` still gets them on the trailing side. Grid cards and `renderCard` rows don't swipe unless the screen passes `swipeable`. `swipeable={null}` turns it off.
- **`headerLargeTitle: false` is written.** `composeHeaderOptions` now writes `headerLargeTitle: false` when `large` is `false`, where it used to leave the key out, so a navigator's large-title default no longer carries into those screens. That covers ThreadPage and chat's thread, SettingsSubPage (whose default is `large: false`), and any InboxPage, SettingsPage, NotificationsPage or NativeRecordView given `large={false}`. A screen that wants the large title there passes `headerOptions: { headerLargeTitle: true }`, which wins over `large`.
- **Long press opens a sheet, not an alert.** NativeResourceView's rows used to open the system alert; they now open the sheet, or the system menu with `GenesisModules.menu`.
- **The optional `react-native-gesture-handler` peer floor rises from `>=2.0.0` to `>=2.21.0`.** 2.20 and earlier name the swipe's open direction the other way, so a `full` swipe action would never run there (the swipe itself and its buttons still work). Upgrade gesture-handler to 2.21 or later (`npx expo install react-native-gesture-handler`; Expo SDK 53 and later already ship it), or leave `full` off your row actions.

**Muted and pinned marks on an inbox row:** `InboxItem` (`/conversation`) takes `muted` and `pinned`. ui-native's `InboxPage` draws a bell-slash and a pin beside the time, grays a muted row's unread count or dot, and reads both to VoiceOver (`mutedLabel`, default "Alerts off"; `pinnedLabel`, default "Pinned"). The pin is a row mark, as Mail, WhatsApp and Telegram show one; it is not Messages' pinned tiles above the list, which InboxPage doesn't have.
