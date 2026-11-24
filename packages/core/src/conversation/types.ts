/**
 * The conversation contract: what a thread, its messages, its composer and an
 * inbox row are, for web (genesis-ui) and native (genesis-ui-native) alike.
 * One description serves both: the same `ThreadMessage[]` renders in ui's
 * `ThreadPage` and ui-native's `ThreadPage`, and genesis-chat, the help desk
 * or an app's own thread feed either.
 *
 * Data, not behaviour: a row's send state (`status`) and its actions come in
 * from whatever owns the data (an outbox, the offline queue, the server), and
 * the layouts never fetch. Ids stay the same across refreshes (a cache, then
 * the server): pass `clientId ?? serverId` as `id`.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";

export interface ThreadAttachment {
  id: string;
  /** `image` shows the picture; `file` shows its name, and opens `uri`. Default `image`. */
  kind?: "image" | "file";
  /** An image URI, or a file's link (a signed URL, a file:// path). */
  uri: string;
  /** A file's name, as shown. */
  name?: string;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
  onPress?: () => void;
}

/**
 * Where a message is on its way. `sending` (in flight), `sent`, `pending`
 * (queued: offline), `paused` (the session expired: sign in to send),
 * `failed` and `conflict` (changed elsewhere) with `onRetry` / `onDiscard`.
 */
export type ThreadMessageStatus = "sending" | "sent" | "pending" | "paused" | "failed" | "conflict";

/** How a message reads: `default`, or `internal` (a staff-only note, never mistaken for a reply). */
export type MessageTone = "default" | "internal";

export interface ThreadMessage {
  /** Stays the same across refreshes, or the list jumps. */
  id: string;
  /** The id `jumpTo` names it by, when that isn't `id`: a message kept by the id the client gave it and gone to by the server's. Default `id`. */
  jumpId?: string;
  /** `event`: a centred line between messages ("Sam was assigned"); `body` is its text. Default `message`. */
  kind?: "message" | "event";
  body: string;
  /** Sent by the person using the app: trailing side, tint. */
  mine: boolean;
  /** Shown over theirs ("Support"); never over mine. */
  authorName?: string;
  timestamp: string | Date;
  status?: ThreadMessageStatus;
  onRetry?: () => void;
  onDiscard?: () => void;
  /** `internal`: a staff-only note, tinted so it never reads like a reply. */
  tone?: MessageTone;
  attachments?: ThreadAttachment[];
}

/** How a composer mode reads. The same tones as a message. */
export type ComposerTone = MessageTone;

export interface ComposerMode {
  id: string;
  label: string;
  tone?: ComposerTone;
}

export interface ThreadComposer {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** A send is in flight: the button spins and won't send twice. */
  sending?: boolean;
  placeholder?: string;
  sendLabel?: string;
  /** Turns the send button off (besides an empty or blank value). */
  disabled?: boolean;
  maxLength?: number;
  /** Said while sending. Default `labels.sending`. */
  sendingLabel?: string;
  /** Above the input: a reply preview, attachments waiting to send. */
  above?: ReactNode;
  /** Beside send: a mic. */
  trailing?: ReactNode;
  /** The input grows to this many lines, then scrolls. Default 6. */
  maxLines?: number;
  /** Ways to send ("Reply", "Internal note"); two or more show the picker. */
  modes?: readonly ComposerMode[];
  /** The picker's name, to a screen reader. Default "Send as". */
  modesLabel?: string;
  mode?: string;
  onModeChange?: (id: string) => void;
}

/** What the default parts of a thread say. */
export interface ThreadLabels {
  /** Who "mine" is, to a screen reader. */
  you: string;
  sending: string;
  /** Queued while offline. */
  pending: string;
  /** The session expired. */
  paused: string;
  notSent: string;
  /** Changed somewhere else before it was sent. */
  conflict: string;
  retryHint: string;
  discard: string;
  /** The first unread message's divider. */
  newMessages: string;
  /** The pill that goes back to the newest message. */
  jumpToLatest: string;
  /** While `updating`. */
  updating: string;
  /** Said with an internal note, so a screen reader never reads it as a reply. */
  internal: string;
  /** Said when a `jumpTo` message can't be found. */
  messageGone: string;
}

export const DEFAULT_THREAD_LABELS: Readonly<ThreadLabels> = Object.freeze({
  you: "You",
  sending: "Sending",
  pending: "Waiting to send",
  paused: "Sign in to send",
  notSent: "Not sent. Tap to retry.",
  conflict: "Not sent: changed elsewhere. Tap to retry.",
  retryHint: "Double tap to send again",
  discard: "Discard",
  newMessages: "New messages",
  jumpToLatest: "Jump to latest",
  updating: "Updating…",
  internal: "Internal note",
  messageGone: "That message isn't available.",
});

/**
 * A row action's color behind a swipe, as iOS's system colors (Mail and Messages use them):
 * `tint` is the app's primary on the phone (the brand's native primary under a
 * `GenesisThemeProvider`, else the theme's tint role), `red` is for destructive (which
 * `destructive` already gives).
 */
export type RowActionTone = "tint" | "blue" | "green" | "orange" | "purple" | "yellow" | "gray" | "red";

/** Which edge of a row a swipe uncovers an action from: leading is a swipe to the right (in a left-to-right language). */
export type RowActionSide = "leading" | "trailing";

/**
 * One of a row's actions, the same everywhere a row offers it: behind a swipe on the phone, in
 * its long-press menu, and as a screen reader's actions (ADR 0028). Any list uses it: InboxPage's
 * rows, NativeResourceView's, `NativeListItem`'s `actions`, `NativeSwipeRow`.
 */
export interface InboxSwipeAction {
  id: string;
  label: string;
  onPress: () => void;
  /** Destructive tone (delete, leave). */
  destructive?: boolean;
  /** Which side of the row a swipe uncovers it from, on the phone. Default `trailing`. */
  side?: RowActionSide;
  /** A Genesis icon name (`trash`, `pin`, `mail`…) shown behind the swipe and in the menu. */
  icon?: string;
  /** Its color behind the swipe. Default `red` when destructive, else `tint`. */
  tone?: RowActionTone;
  /**
   * A full swipe runs it, as Mail's Delete and Archive do: the row's first action on its side
   * with `full` is the one a drag past 0.6 of the row's width triggers when let go. Off by default.
   * A destructive one should confirm in its `onPress` (or undo): one gesture is easy to make by
   * mistake. Say so with `confirms`; a destructive `full` action without it warns in development.
   */
  full?: boolean;
  /**
   * Its `onPress` asks first (an alert) or can be undone, so a full swipe that runs it by mistake
   * loses nothing. `NativeResourceView` sets it for a view action with a `confirm`.
   */
  confirms?: boolean;
  /**
   * Behind a swipe on the phone. Default `true`; `false` keeps it in the long-press menu and the
   * screen reader's actions only (an action that needs a second look before it runs).
   */
  swipe?: boolean;
}

/** A row's actions as one shape: the name the list primitives use for `InboxSwipeAction`. */
export type RowSwipeAction = InboxSwipeAction;

export interface InboxItem {
  /** Stable id for keying. */
  id: string;
  title: string;
  /** The latest message or a summary, at most two lines. */
  preview?: string;
  /** When it last changed. Shown as a short time or date. */
  timestamp?: string | Date;
  /** Something new the person hasn't read: a dot, and the title in bold. */
  unread?: boolean;
  /** How many unread messages; shown as a count instead of the dot when above 0. */
  unreadCount?: number;
  /** A short status shown under the preview ("In progress", "12 votes"). */
  meta?: string;
  /** Replaces the unread dot (an icon). For a picture of who it is, use `avatar`, which keeps the dot. */
  leading?: ReactNode;
  /**
   * A picture of who or what it is (an avatar, about 40px), between the
   * unread dot and the text. It is hidden from screen readers; when it shows
   * someone `title` doesn't name, say who in `avatarLabel`.
   */
  avatar?: ReactNode;
  /** Who the avatar shows, read before the title, when `title` doesn't name them. */
  avatarLabel?: string;
  /** Shown at the end of the row (a vote button, a badge). Replaces the chevron. */
  trailing?: ReactNode;
  /** Opens the conversation. */
  onPress?: () => void;
  /** Swipe actions on native; a row menu on web. Always reachable as accessibility actions. */
  swipeActions?: InboxSwipeAction[];
  /** The row is the conversation open beside the list (a 3-pane inbox). */
  selected?: boolean;
  /** testID override. Default `<page testID>-row-<id>`. */
  testID?: string;
}
