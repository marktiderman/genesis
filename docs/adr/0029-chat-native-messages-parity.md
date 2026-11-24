# ADR 0029: genesis-chat native, Messages parity by default

- Status: proposed
- Date: 2026-11-24
- Features: `chat`, `inbox-thread`, `row-actions`, `native-headers`, `tab-bar-visibility`
- Related: ADR 0027 (Mark as Unread and Delete for me), ADR 0028 (row actions), docs/FRAMEWORK.md ("Native screens follow iOS", G1–G6)

## Context

A consumer app compared its chat with the platform's Messages app (iOS 26) and built the
difference in its own code: Messages' colors whatever the brand, plain inbox rows with faces and
pinned faces, a glass search field, a filter menu, round bubbles with tapbacks on the corner, time
separators, the long-press layer with the tapbacks over the bubble and a glass menu under it, the
composer's glass + circle and pill, the + list of round colored icons, the face over a name pill
in the header, and a details screen. The maintainer approved that look and decided it belongs in
Genesis, by default, so an app gets it by rendering the published screens, and the app's own copy
can be deleted.

`pnpm features find messages`: `chat` (genesis-chat's screens, which drew the Settings app's inset
grouped look through `InboxPage` and the brand's tint on sent bubbles) and `inbox-thread`
(genesis-ui-native's `InboxPage`, `NativeThreadList` and `NativeComposerBar`). The data wiring and
the primitives were right and are reused (G1); the drawing was not Messages', so genesis-chat's
screens are extended (G2), and nothing parallel is added beside them. `InboxPage` lacked only
plain rows, so it gets a `variant` (G2) rather than a second list in genesis-chat.

## Decision

1. **Colors have their own layer.** The design system's chat roles (`resolveChatRoles`,
   `CHAT_ROLES`, `CHAT_ACCENTS`) name Messages' colors once: the iOS system color where Messages
   uses one, a light and a dark value everywhere (Android, web, and iOS for its own greys). They
   are additive and namespaced under chat; the brand's tokens don't change and never move them.
   This change adds a `shadow` role for glass panels. genesis-chat reads them through
   `useChatColors()`, with the theme's neutral text roles beside them; no color literal is in
   genesis-chat.
2. **The native screens draw Messages by default.** `ChatInboxScreen`, `ChatThreadScreen` (its
   bubbles, separators, typing bubble, long-press layer and jump pill), `ChatComposer` and the
   thread title, and a new `ChatDetailsScreen`. Glass, symbols, haptics, motion, full-screen
   layers and row actions are genesis-ui-native's (`useLiquidGlass`, `GenesisModules.symbol`,
   `useHaptics`, `useMotion`, `NativeFullScreenModal`, `NativeRowActions`).
3. **InboxPage gets `variant="plain"`** (genesis-ui-native, additive): full-width rows on the page
   with no inset group, and `background` for the page. `"grouped"` stays the default.
   `ChatInboxScreen` draws on it, with chat's row in its `row` slot (spreading `actionProps`, so the
   screen reader's actions and the long press reach the row), its `formatTime`, paging, memoised rows
   and the peek through `menuPreview`.
4. **The stack's own header.** The inbox sets its header through `GenesisModules.router.StackScreen`
   (`composeHeaderOptions`): a large title that collapses with the list, which is the screen's
   first view and scroll view; Back, the filter menu and Compose as native header items; the tab
   bar hidden with `useHideTabBar`. The thread's title is a custom `headerTitle` in the native
   bar. No screen hides the header or draws its own bar.
5. **What an app adds is configuration or a slot, never a copy of the screen.** The inbox's
   `filters` and `menuItems` (`(defaults) => items`), the + list's `plusItems`, and Genesis's slot
   contract (`renderSlot`, `slots`, `slotProps`) on every visual part: the inbox's `row`, `pinned`,
   `searchField`, `listHeader` and `empty`; the thread's `bubble`, `composer`, `messageMenu`,
   `plusList` and `belowHeader` (nothing by default); the details' `hero`, `actions`, `settings`,
   `members` and `danger`. Genesis knows nothing of an app's domain: every default is Messages'
   own.
6. **The conversation with yourself** (direct, you its only member) shows your own face and
   "Just you". It is plain chat, with no concept of the app's.

## Consequences

- Every app on genesis-chat native changes look when it upgrades (the changeset says what, and how
  an app keeps a piece of its own through the slots).
- `ChatInboxScreen` draws `InboxPage` with `variant="plain"`; `pageProps` still reaches it.
- The thread no longer opens `MessageActionsSheet` (still exported), and the composer no longer
  sits on `NativeComposerBar` or has an emoji button (Messages has none; the keyboard has emoji).
- genesis-chat takes genesis-design-system as a required peer (from the minor with the chat roles),
  and genesis-ui-native from the release with `variant`.

## Glossary

None.
