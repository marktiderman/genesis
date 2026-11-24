/**
 * The inbox's row actions, built once for web and native (`inboxRowActions`): Messages' Mark as
 * Unread (or Read) and Pin to the leading side, Hide Alerts and Delete for me to the trailing one,
 * Archive in the menu only. ChatInboxScreen (native) and ChatInbox (web) both take them, and an app
 * reshapes them with `rowActions(item, defaults)`.
 *
 * The look is Messages': Unread blue (`info`), Pin orange, Hide Alerts purple, Delete red.
 */
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import type { ChatInboxItem } from "../core/types";

/** The words on the inbox's row actions, shared by the native copy and the web inbox. */
export interface ChatInboxActionLabels {
  markRead: string;
  /** Mark as Unread (migration 0007): only you see it. */
  markUnread: string;
  pin: string;
  unpin: string;
  /** Mute from the inbox row, as Messages names it. */
  hideAlerts: string;
  showAlerts: string;
  archive: string;
  /** Delete for me (migration 0007), and its confirmation. */
  deleteConversation: string;
  deleteConversationTitle: string;
  deleteConversationBody: string;
  /** The confirmation's Cancel. */
  cancel: string;
  /** A muted row's bell-slash, for a screen reader. */
  alertsOff: string;
  /** A pinned row's pin, for a screen reader. */
  pinnedMark: string;
}

/** The English words, which the native copy starts from too. */
export const defaultInboxActionLabels: ChatInboxActionLabels = Object.freeze({
  markRead: "Mark read",
  markUnread: "Mark as Unread",
  pin: "Pin",
  unpin: "Unpin",
  hideAlerts: "Hide Alerts",
  showAlerts: "Show Alerts",
  archive: "Archive",
  deleteConversation: "Delete",
  deleteConversationTitle: "Delete this conversation?",
  deleteConversationBody:
    "Its messages are removed for you and it leaves your inbox. Everyone else still sees them. A new message brings it back, with only what comes after.",
  cancel: "Cancel",
  alertsOff: "Alerts off",
  pinnedMark: "Pinned",
});

/** Asks before a destructive action: resolves `true` to go ahead. Native passes an Alert, web a dialog. */
export type ChatConfirm = (title: string, body: string, confirmLabel: string) => Promise<boolean>;

/** What `useInboxActions` returns: your own actions on one inbox row, each the call's promise. */
export interface ChatInboxActions {
  /** Mark as Read when it has unread messages, else Mark as Unread. */
  toggleUnread: (item: ChatInboxItem) => Promise<unknown>;
  togglePinned: (item: ChatInboxItem) => Promise<unknown>;
  /** Show Alerts when muted, else Hide Alerts until `until` (default: until turned back on). */
  toggleMuted: (item: ChatInboxItem, until?: string) => Promise<unknown>;
  setArchived: (item: ChatInboxItem, archived: boolean) => Promise<unknown>;
  /** Delete for me, up to the last message the row showed (`item.lastSeq`). */
  deleteForMe: (item: ChatInboxItem) => Promise<unknown>;
}

export interface InboxRowActionsOptions {
  /** Asks before Delete for me. */
  confirm: ChatConfirm;
  /** A failed action: say so (an alert, a toast). Default: nothing. */
  onError?: (error: unknown) => void;
}

/** One inbox row's actions: Messages' set, in its order and colors. */
export function inboxRowActions(item: ChatInboxItem, act: ChatInboxActions, labels: ChatInboxActionLabels, options: InboxRowActionsOptions): RowSwipeAction[] {
  const run = (call: Promise<unknown>) => {
    call.catch((error: unknown) => options.onError?.(error));
  };
  const unread = item.unread > 0;
  return [
    {
      id: unread ? "read" : "unread",
      label: unread ? labels.markRead : labels.markUnread,
      icon: unread ? "mail-open" : "message-unread",
      tone: "info",
      swipe: { side: "leading", full: true },
      onPress: () => run(act.toggleUnread(item)),
    },
    {
      id: "pin",
      label: item.pinned ? labels.unpin : labels.pin,
      icon: "pin",
      accent: "orange",
      swipe: { side: "leading" },
      onPress: () => run(act.togglePinned(item)),
    },
    {
      id: "alerts",
      label: item.muted ? labels.showAlerts : labels.hideAlerts,
      icon: item.muted ? "bell" : "bell-off",
      accent: "purple",
      swipe: { side: "trailing" },
      onPress: () => run(act.toggleMuted(item)),
    },
    {
      id: "delete",
      label: labels.deleteConversation,
      icon: "trash",
      destructive: true,
      swipe: { side: "trailing", full: true },
      // It asks first, so a full swipe can't delete by mistake.
      confirms: true,
      onPress: () =>
        run(
          options.confirm(labels.deleteConversationTitle, labels.deleteConversationBody, labels.deleteConversation).then((ok) => (ok ? act.deleteForMe(item) : undefined)),
        ),
    },
    ...(item.archived ? [] : [{ id: "archive", label: labels.archive, icon: "archive", swipe: false as const, onPress: () => run(act.setArchived(item, true)) }]),
  ];
}
