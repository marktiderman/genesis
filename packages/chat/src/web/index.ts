/**
 * @feat:chat
 * `@marktiderman/genesis-chat/web`: chat on Genesis UI. `ChatPanel` (inbox and
 * thread side by side), `ChatInbox`, `ChatThread` and `ChatComposer`, the
 * voice note player and recorder, topics, scheduled send, availability,
 * broadcast, search, link previews, video, the emoji picker, the safe
 * markdown renderer, and an in-memory client for demos and tests. Render them under `ChatProvider`
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
export { ChatTopicBar, type ChatTopicBarProps } from "./topics";
export { ChatScheduleMenu, ChatScheduledList, toLocalInput, type ChatScheduleMenuProps, type ChatScheduledListProps } from "./schedule";
export { ChatAwayBanner, ChatAvailabilitySettings, type ChatAwayBannerProps, type ChatAvailabilitySettingsProps } from "./availability";
export { ChatBroadcast, type ChatBroadcastProps } from "./broadcast";
export { ChatSearch, SearchSnippet, type ChatSearchProps } from "./search";
export { ChatLinkPreview, ChatAttachmentCard, linkPreviewImageSrc, type ChatLinkPreviewProps, type ChatAttachmentCardProps, type LinkPreviewImages } from "./cards";
export { ChatErrorBoundary, type ChatErrorBoundaryProps } from "./error-boundary";
export { ChatEmojiPicker, canPickEmoji, type ChatEmojiPickerProps } from "./emoji-picker";
export {
  ChatVideoRecorder,
  ChatVideoPlayer,
  useVideoRecorder,
  pickVideoMimeType,
  videoFile,
  uploadVideo,
  muxStreamUrl,
  muxPosterUrl,
  type ChatVideoRecorderProps,
  type ChatVideoPlayerProps,
  type UseVideoRecorderOptions,
  type VideoRecorder,
  type VideoRecorderState,
  type VideoRecording,
} from "./video";
