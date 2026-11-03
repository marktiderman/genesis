---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": patch
---

Messaging layouts for the web, on one conversation contract shared with native.

- **genesis-core:** a new `@marktiderman/genesis-core/conversation` subpath with the contract the messaging layouts share:
  - `ThreadMessage`, `ThreadMessageStatus`, `MessageTone`, `ThreadAttachment`;
  - `ThreadComposer`, `ComposerMode`, `ComposerTone`;
  - `ThreadLabels` and `DEFAULT_THREAD_LABELS`;
  - `InboxItem` (with a new optional `selected`) and `InboxSwipeAction`;
  - `readReceiptFor`, `formatInboxTime`, `formatMessageTime` and `isDelivered`;
  - `useThreadJump`, moved here from genesis-ui-native.
- **genesis-ui:** `ThreadPage`, `ThreadList`, `ComposerBar`, `InboxPage` and `InboxLayout` (three panes: views, list, thread, context).
  - **`InboxViews`:** the views rail.
  - **`InboxPage`:** controlled `selectedId` and `onSelect`.
  - **`InboxLayout`:** a context sidebar that toggles, can remember its state, and becomes a sheet below `xl`, plus optional keyboard `shortcuts` that stay off while typing. They take the same props and slots as genesis-ui-native's, so one description renders on web and phone. The composer sends on Enter, or on Cmd/Ctrl+Enter with `sendOn="mod-enter"`. Inbox rows move with the arrow keys or j/k, and a row's actions become a "More" menu.
- **genesis-ui-native:** its ThreadPage and InboxPage types, `readReceiptFor`, `formatInboxTime` and `useThreadJump` now come from genesis-core and are re-exported unchanged.

Features: inbox-thread
