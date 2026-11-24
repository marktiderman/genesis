---
"@marktiderman/genesis-chat": minor
"@marktiderman/genesis-design-system": minor
---

genesis-chat's native screens draw the platform's Messages pattern (iOS 26) by default, with Messages' colors in their own layer (ADR 0029).

- **design-system:** chat roles, additive and namespaced under chat: `resolveChatRoles({ target, scheme, platformColor })`, `CHAT_ROLES`, `CHAT_ACCENTS`. Every role has an iOS system color where Messages uses one and a light and dark value for Android, the web and the rest. Brand tokens don't change.
- **`ChatInboxScreen`:** plain rows with faces, the unread dot, two lines of the last message, the time and a chevron; pinned faces above; round row actions with a peek of the conversation; the glass search field at the bottom; the stack's large title with Back (`onBack`), the filter menu and Compose as native header items; no tab bar. New: `filters`, `filter` / `onFilterChange`, `menuItems`, `onOpenArchived`, `onOpenScheduled`, `onSearchMessages`, `onCompose`, `title`, `search`, `pinned`, `nativeHeader`, `slots` and `slotProps` (`row`, `pinned`, `searchField`, `listHeader`, `empty`). `pageProps` is deprecated.
- **`ChatThreadScreen`:** bubbles in the chat roles with round corners and a tail, tapbacks on the bubble's corner, "**Today** 9:41 AM" separators (`buildThreadRows(…, { separators: "time" })`), no time under a run (drag left for it), the long press as Messages' layer (`ChatMessageMenu`), a glass jump pill. New: `plusItems`, `slots.bubble`, `slots.composer`, `slots.messageMenu`, `slots.plusList`, `slots.belowHeader`, `slotProps`.
- **`ChatComposer`:** the glass + circle and "Message" pill, the mic inside it, the Send arrow (hold it to schedule); + opens a glass list with round colored icons (Camera, Photos, Audio, Video, Send Later, Paste). New: `plusItems`, `slots.plusList`.
- **Header and details:** `useChatThreadStackOptions` draws the face over a glass name pill (`titleLayout`, `faceSize`); `ChatDetailsScreen` is new.
- **Pieces:** `useChatColors`, `ChatFace`, `ChatGlassPanel`, `ChatGlassCircle`, `ChatGlassMenu`, `ChatContextOverlay`, `ChatSymbol`, `ChatBubbleShape`, `ChatConversationPreview`, `CHAT_METRICS`, `CHAT_TYPE`, the times (`timeSeparatorLabel`, `inboxTimeLabel`) and the inbox's rules (`defaultInboxFilters`, `applyInboxFilter`, `pinnedConversations`, `matchesInboxSearch`, `isSelfConversation`); `modules.keyboardStickyView` for the search field.
- **Peer:** genesis-design-system (optional).

## What changes on upgrade

Every app on genesis-chat native changes look when it takes this release:

- The inbox is Messages' plain list on the page background instead of the inset grouped list, sets its own header (the large title, the filter menu, Compose) when `GenesisModules.router` is set, and hides the tab bar while it shows (`TabBarVisibilityProvider` in the tabs layout). Pass `nativeHeader={false}` to keep a header of the app's own.
- Sent bubbles are Messages' blue and received ones its grey, whatever the brand; the thread's background is the page, not the grouped background.
- The long press opens Messages' layer instead of the actions sheet; the composer is the glass pill with a + list instead of `NativeComposerBar`, and its emoji button is gone.
- A thread title given an avatar, subtitle, `onPressTitle` or `conversationId` is the face over the name pill (`titleLayout: "inline"` keeps the old one).

To keep a piece of the app's own, replace that part through its slot (`slots.row`, `slots.bubble`, `slots.composer`, `slots.messageMenu`, `slots.plusList`, …), add to the defaults through `filters`, `menuItems` and `plusItems`, and put the app's own strip under the header with `slots.belowHeader`. An app's own Messages layer can be deleted.
