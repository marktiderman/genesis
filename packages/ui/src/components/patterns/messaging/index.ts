/**
 * Messaging layouts for the web: the twins of ui-native's ThreadPage,
 * ThreadList, ComposerBar and InboxPage, on the shared conversation contract
 * (`@marktiderman/genesis-core/conversation`). genesis-chat's web screens and
 * an app's own threads (a help desk, comments, an AI prompt) build on them.
 *
 * @stability Beta
 */
export { ThreadList, THREAD_AT_BOTTOM_PX, type ThreadListHandle, type ThreadListProps, type ThreadRowInfo } from "./thread-list";
export { ComposerBar, type ComposerBarProps } from "./composer-bar";
export { ThreadPage, type ThreadPageProps, type ThreadPageSlotMap } from "./thread-page";
export { InboxPage, type InboxPageProps, type InboxPageSlotMap } from "./inbox-page";
export { InboxLayout, type InboxLayoutProps } from "./inbox-layout";
export type {
  ComposerMode,
  ComposerTone,
  InboxItem,
  InboxSwipeAction,
  MessageTone,
  ThreadAttachment,
  ThreadComposer,
  ThreadLabels,
  ThreadMessage,
  ThreadMessageStatus,
} from "@marktiderman/genesis-core/conversation";
export { readReceiptFor, formatInboxTime } from "@marktiderman/genesis-core/conversation";
