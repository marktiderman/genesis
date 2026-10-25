/**
 * @feat:chat
 * `@marktiderman/genesis-chat/web`: chat on Genesis UI. `ChatPanel` (inbox and
 * thread side by side), `ChatInbox`, `ChatThread` and `ChatComposer`, the
 * voice note player and recorder, the safe markdown renderer, and an
 * in-memory client for demos and tests. Render them under `ChatProvider`
 * (from `/react`) inside a TanStack QueryClientProvider.
 *
 * @stability Beta
 */
export { ChatPanel, type ChatPanelProps, type ChatPanelNoSelectionProps } from "./panel";
export { ChatInbox, inboxTitle, type ChatInboxProps, type ChatInboxEmptyProps } from "./inbox";
export {
  ChatThread,
  type ChatThreadProps,
  type ChatThreadSlots,
  type ChatThreadHeaderProps,
  type ChatThreadEmptyProps,
  type ChatComposerAccessoryProps,
} from "./thread";
export { ChatComposer, type ChatComposerProps, type ChatComposerHandle } from "./composer";
export { MessageRow, plainText, type MessageRowProps } from "./bubble";
export {
  GenericAttachment,
  ImageGrid,
  Lightbox,
  FileChip,
  VideoAttachment,
  MessageAttachments,
  toAttachmentView,
  type AttachmentView,
  type ChatAttachmentSlotProps,
  type ImageGridProps,
  type LightboxProps,
  type MessageAttachmentsProps,
} from "./attachments";
export { VoiceNote, type VoiceNoteProps } from "./voice-note";
export {
  useVoiceRecorder,
  pickVoiceMimeType,
  voiceFile,
  type UseVoiceRecorderOptions,
  type VoiceRecorder,
  type VoiceRecorderState,
  type VoiceRecording,
} from "./use-voice-recorder";
export { ChatMarkdown, parseMarkdown, isSafeHref, type ChatMarkdownProps, type MarkdownNode } from "./markdown";
export { clockTime, relativeTime, formatBytes, messageLabel, type ChatUser, type ResolveUser } from "./format";
export { QUICK_REACTIONS } from "./thread-context";
export { createMemoryChatClient, type MemoryChatClient, type MemoryChatOptions, type MemoryConversationSeed } from "./memory-client";
