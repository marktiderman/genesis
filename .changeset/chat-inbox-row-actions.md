---
"@marktiderman/genesis-chat": minor
---

The inbox's row actions, Messages' set, on the phone and the web (G1-315). Needs migration 0007 (Mark as Unread, Delete for me).

- **Native, `ChatInboxScreen`:**
  - Swipe right for Mark as Unread (or Read, full swipe) and Pin.
  - Swipe left for Hide Alerts and Delete. Delete is a full swipe, asks first, and deletes for you only.
  - Archive is in the long-press menu (the system menu with `GenesisModules.menu`).
  - Messages' look: Unread blue (`tone: "info"`), Pin orange and Hide Alerts purple (`accent`), Delete red.
  - All are screen reader actions too, and one that fails shows an alert (`actionFailed`).
  - `rowActions(item, defaults)` reshapes them, and `alertConfirm(cancelLabel)` is the Alert-based confirm.
- **Web, `ChatInbox`:** each row's More menu offers the same actions (genesis-ui's `InboxRowMenu`), and Delete asks in an AlertDialog. It takes `rowActions`, `actionLabels` and `onActionError`. `useConfirmDialog()` gives the dialog-based confirm.
- **`/react`:**
  - `inboxRowActions(item, actions, labels, { confirm, onError })` builds the set, next to `inboxRow`.
  - `ChatInboxActionLabels` holds the words, and `defaultInboxActionLabels` the English. The native copy includes them.
  - `ChatConfirm` is `(title, body, label) => Promise<boolean>`.
  - `useInboxActions()` runs them from the row: `toggleUnread(item)`, `togglePinned(item)`, `toggleMuted(item, until?)` (until it's turned back on by default), `setArchived(item, archived)`, and `deleteForMe(item)`, which deletes up to `item.lastSeq`.
  - Each refreshes the inbox and badge. Delete for me also drops the conversation's cached thread, pins and search results, so deleted history can't reappear on that device.
- **`chatKeys`:** `inboxAll()` and `searchAll()` are the prefix keys every inbox and search query sits under. Every refresh of the inbox now goes through them.
- **Peer floors:** genesis-core `>=2.21.0`, genesis-ui `>=3.3.0` and genesis-ui-native `>=3.17.0`, the releases with the row-action shape, `InboxRowMenu` and the swipe.
