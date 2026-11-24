# ADR 0028: A row's actions, offered the iOS way from one list

- Status: proposed
- Date: 2026-11-23
- Features: `row-actions`, `native-headers`, `tab-bar-visibility`
- Related: docs/FRAMEWORK.md ("Native screens follow iOS"), docs/RESOURCE-VIEW.md, ADR 0017 (bulk actions)

## Context

A consumer app compared its Messages screen with Apple's and asked for parity, and for the pieces
that turned out to be general to become standards for every native Genesis app: swipe actions on
any list, the native header on every screen, and the tab bar hidden per screen.

Swipe actions already existed in three places that didn't agree:

- `NativeResourceView` turned a view's guards (edit, delete) and its named `actions` into swipe
  actions, but every one landed on the trailing side with a `bolt` icon (not in the icon set):
  a view couldn't say "Read goes on the leading edge, Delete runs on a full swipe".
- `InboxPage`'s rows had `InboxSwipeAction` with a `side`, but no icon, color or full swipe.
- `NativeSwipeRow` hid its buttons from VoiceOver (correctly: a screen reader doesn't swipe) and
  relied on each caller to put the same actions on the row as accessibility actions; a plain
  `NativeListItem` had no actions at all.

iOS offers a row's actions three ways at once (Mail, Messages, Settings): behind a swipe
(leading and trailing, a full swipe running the first), in the long-press context menu, and as
VoiceOver's actions. `pnpm features find swipe` and `menu`: `inbox-thread` (InboxPage),
`resource-view` (NativeResourceView's mapping). Both are the pieces to extend (G2); neither fits
as it is.

## Decision

1. **One row-action shape** in `@marktiderman/genesis-core/conversation`: `InboxSwipeAction`
   (also exported as `RowSwipeAction`) gains `icon` (a Genesis icon name), `tone`
   (`RowActionTone`: iOS's system colors, `tint` by default and `red` when destructive), `full`
   (a full swipe runs it) and `swipe` (`false` keeps it in the menu and the screen reader only).
   Every field is optional, so existing rows keep working.
2. **A view's actions say where they swipe.** `ViewAction` gains `swipe`
   (`"leading" | "trailing" | { side, full } | false`, `ViewActionSwipe`), `icon` and `tone`;
   `defineView` validates them (a destructive action on a full swipe must have a `confirm`) and
   `view.actions()` carries them (`swipe` resolved to `{ side, full }`) only when set. The web
   ignores `swipe`: its row menu lists every action. Unset, NativeResourceView's own swipe leaves
   the action in the long-press menu and the screen reader's actions; a screen's own `swipeable`
   gets it trailing, as before. The guards' Edit and Delete stay trailing and never run on a full
   swipe.
3. **ui-native draws them the same everywhere:**
   - `NativeSwipeRow`: icons and tones, `appearance: "fill" | "round"` (iOS 26's round buttons),
     at most three a side (`maxPerSide`), the row tracking the finger 1:1, and the full swipe
     past 0.6 of the row's width (`fullSwipeRatio`), decided on the row's offset as the release
     is reported, on the side it's opening (`fullSwipeSide`: backing out or crossing sides
     doesn't run it, and it must clear the side's open actions by 40pt, so a row springing open to its buttons never counts; a release right at the threshold can land either side, the report coming a
     frame after the finger lifts); a side keeps its destructive action under the cap;
     right-to-left aware; the actions on its child as `accessibilityActions` unless the row
     already has them; unseen at rest, and seen whenever the row is off it (the row's translation
     with Reanimated, else the swipe's open and close events, so a row opened from code shows them).
     The side comes from gesture-handler 2.21+'s naming of the open direction (2.20 and earlier
     named it the other way), so the optional peer starts at 2.21.0.
   - Text and icons: white on the iOS system tones, as iOS draws them (black on yellow), which
     doesn't reach WCAG AA on every tone; on `tint` and `red`, the color that reads on the app's
     own color (black or white by contrast on a hex tint, else the theme's `primaryForeground` /
     `destructiveForeground`). A destructive `full` action says it asks first or can be undone
     (`confirms`), or warns in development; NativeResourceView sets it for a view action with a
     `confirm`.
   - `NativeRowActions`: swipe + long-press menu + accessibility actions around any pressable
     row. The menu is the system context menu when the app passes `GenesisModules.menu`
     (`MenuView` from `@expo/ui/community/menu`), else `NativeContextMenu`'s sheet.
   - `NativeListItem`'s `actions` (and `actionsAppearance`) wraps the row in `NativeRowActions`;
     a row with actions is pressable, and a disabled row offers none.
   - `NativeResourceView` list rows swipe by default (NativeSwipeRow; `swipeable={null}` turns it
     off) and long-press into the system menu; grid cards and `renderCard` rows swipe only with a
     screen's own `swipeable`.
4. **The two screen standards ride with it**, since they're the same "follow iOS" rule and the
   same consumer is waiting on all three: `ScreenContainer` `header` (native large title, search
   and header items through `GenesisModules.router.StackScreen`; an option the screen set and
   later leaves out is reset, one it never set is left to the layout's screenOptions) and `tabBar="hidden"` (`TabBarVisibilityProvider`, `useHideTabBar`,
   counted so stacked hiding screens never flash the bar; without `GenesisModules.router` a
   screen never hides it, since a tab keeps its stack mounted), and two doctor rules that flag a
   screen drawing its own header or hiding the tab bar by hand.

## Glossary

- **Row action:** one thing a person can do to a row, offered behind a swipe, in the long-press
  menu and to screen readers. Not "swipe action" for the whole idea (the swipe is one of three
  ways to reach it), and not "row button".
- **Full swipe:** dragging a row far enough that letting go runs its side's first `full` action.

## Alternatives

- **A separate `swipeActions` list on the view, beside `actions`.** Two lists of the same
  operations would drift (an action on the swipe but not in the menu, or the reverse). Lost to
  placement on the action itself.
- **A new `NativeSwipeList` component.** Recreates the row primitives (G5). Lost to extending
  `NativeSwipeRow` and `NativeListItem`.
- **`@expo/ui`'s SwiftUI `List` with `.swipeActions`.** Native swipes with no gesture handler, but
  it owns the whole list (no FlashList, no NativeResourceView rows) and has no Android twin. Kept
  as a later option behind the same `RowSwipeAction` shape.

## Consequences

- Additive in the contract: every new field is optional, and `view.actions()` adds `swipe`, `icon`
  and `tone` only when the view sets them. One behaviour changes on upgrade: with
  `GenesisModules.swipeable` set, NativeResourceView's list rows swipe (Edit, Delete and the
  actions that set `swipe`); the changeset says so.
- Apps opt into the system menu with `GenesisModules.menu` and into router-driven chrome with
  `GenesisModules.router = { useFocusEffect, StackScreen: Stack.Screen }` from expo-router.
- `NavBarSearchBar` is deprecated in favour of `header.search`, for one deprecation window.
- A shared-contract change (core types): it needs an adversarial review before triage merges it.
