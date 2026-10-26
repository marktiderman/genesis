/**
 * @feat:chat
 * `@marktiderman/genesis-chat/native`: chat on genesis-ui-native, over the
 * hooks in `/react`.
 *
 * Rung 1: `ChatInboxScreen` and `ChatThreadScreen` in two routes, under
 * `ChatProvider` (from `/react`) and `ChatNativeProvider` (the native modules,
 * copy and people).
 * Rung 2: the parts (`ChatComposer`, `MessageBubble`, `MessageActionsSheet`,
 * `VoiceNotePlayer`, `ChatPhotoViewer`, `ChatEmojiPicker`, `ChatStartSheet`) in your own screen.
 * Rung 3: the logic (`composerReducer`, `recorderStep`, `buildThreadRows`,
 * `messageActionsFor`, `useVoiceRecorder`, `useChatComposer`).
 * Glue: `createTusUpload` (resumable uploads for `ChatProvider upload`) and
 * the push block's `messages` category, actions and reply handler.
 *
 * Video messages: `ChatVideoRecorder` (expo-camera), `ChatVideoPlayer`
 * (expo-video, HLS), uploads through `ChatProvider videoUpload` with
 * `chunkedPut`; link previews (`ChatLinkPreviewCard`) and the app's own
 * attachment cards (`ChatAttachmentCard`).
 *
 * Optional peers, passed in rather than imported: expo-audio,
 * expo-image-picker, expo-haptics, expo-clipboard, expo-camera, expo-video,
 * expo-web-browser, expo-sharing, expo-media-library, NetInfo, react-native-keyboard-controller; FlashList and expo-image through
 * GenesisNativeApp's `modules`.
 *
 * @stability Beta
 */
export { ChatInboxScreen, inboxRow, type ChatInboxScreenProps } from "./inbox-screen";
export { ChatThreadScreen, threadListMode, nearBottom, AT_BOTTOM_POINTS, type ChatThreadScreenProps } from "./thread-screen";
export { chatThreadStackOptions, useChatThreadStackOptions, type ChatThreadStackOptionsProps } from "./stack-options";
export { ChatStartSheet, ChatStartButton, type ChatStartPerson, type ChatStartSheetProps } from "./start-sheet";
export { ChatComposer, type ChatComposerProps } from "./composer";
export { MessageBubble, displayBody, formatClock, type MessageBubbleProps } from "./message-bubble";
export { MessageActionsSheet, type MessageActionsSheetProps } from "./message-actions-sheet";
export { VoiceNotePlayer, claimPlayback, releasePlayback, activePlaybackId, toggleVoiceNote, cycleVoiceNoteRate, usePlayingVoiceNote, scrubSeconds, waveformBars, barsThatFit, type VoiceNotePlayerProps } from "./voice-player";
export { MessageAttachments, attachmentPaths, type BubbleAttachment } from "./media";
export {
  ChatMediaViewer,
  ChatPhotoViewer,
  galleryFor,
  shouldDismiss,
  pinchScale,
  panLimit,
  isLocalUri,
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  MAX_ZOOM,
  type ChatMediaViewerProps,
  type ChatPhoto,
  type ChatPhotoViewerProps,
} from "./photo-viewer";
export { ChatEmojiPicker, ChatEmojiPickerSheet, forgetRecentEmoji, type ChatEmojiPickerProps, type ChatEmojiPickerSheetProps } from "./emoji-picker";
export {
  EMOJI_CATEGORIES,
  emojiInCategory,
  emojiEntry,
  searchEmoji,
  pushRecentEmoji,
  recentEmojiKey,
  loadRecentEmoji,
  saveRecentEmoji,
  insertAtSelection,
  RECENT_EMOJI_MAX,
  type EmojiCategoryId,
  type EmojiEntry,
} from "./emoji";
export { ChatAccessError, type ChatAccessErrorProps } from "./access-error";
export { ChatAutoRetry, useChatAutoRetry, isOnline, type ChatAutoRetryOptions, type AppStateLike } from "./auto-retry";
export { ChatVideoRecorder, type ChatVideoRecorderProps } from "./video-recorder";
export { videoRecorderStep, initialVideoRecorder, recordingType, VIDEO_HOLD_MS, VIDEO_MIN_MS, type VideoRecorderState, type VideoRecorderEvent, type VideoRecorderEffect, type VideoRecorderPhase } from "./video-recorder-state";
export { ChatVideoPlayer, videoState, videoSource, muxStreamUrl, muxPosterUrl, toggleVideo, fullScreenVideo, isVideoPlaying, usePlayingVideo, toggleVideoMute, cycleVideoRate, type ChatVideoPlayerProps, type ChatVideoState } from "./video-player";
export { chunkedPut, fileSource, nextOffset, createVideoUploads, videoUploads, type VideoUploadError, type MintedUpload, useVideoUploads, recordedVideoFile, VIDEO_CHUNK_BYTES, type ByteSource, type ChunkedPutOptions, type RecordedVideo, type VideoUploadTask, type VideoUploads, type StartVideoInput, type OutboxSend } from "./video-upload";
export { VideoUploadTray, type VideoUploadTrayProps } from "./video-upload-tray";
export { ChatLinkPreviewCard, previewToShow, linkPreviewIds, openChatLink, linkHost, type ChatLinkPreviewCardProps } from "./link-preview";
export { ChatAttachmentCard, splitCardAttachments, isOpenableHref, cardAction, type ChatAttachmentCardProps, type OpenAttachment } from "./attachment-cards";
export { ChatNativeProvider, useChatNative, initials, type ChatNativeProviderProps, type ChatNativeContextValue, type ChatPerson } from "./context";
export { chatNativeCopy, resolveChatCopy, fill, type ChatNativeCopy, type ChatNativeCopyOverrides } from "./copy";
export {
  composerReducer,
  emptyComposer,
  canSend,
  composerDisabledReason,
  toSend,
  replyTargetFor,
  filesFromAssets,
  fileFromDataUri,
  base64ToBytes,
  draftKey,
  clearDrafts,
  loadDraft,
  createDraftSaver,
  memoryDraftStorage,
  type ComposerAction,
  type ComposerAttachment,
  type ComposerDraft,
  type ComposerState,
  type ReplyTarget,
} from "./composer-state";
export { useChatComposer, type ChatComposerHandle } from "./use-composer";
export {
  recorderStep,
  idleRecorder,
  liveBars,
  type RecorderConfig,
  type RecorderEffect,
  type RecorderEvent,
  type RecorderPhase,
  type RecorderState,
  type RecorderNotice,
} from "./recorder-machine";
export { useVoiceRecorder, voiceNoteFile, type UseVoiceRecorderOptions } from "./use-voice-recorder";
export { invertedRows, buildThreadRows, rowKey, type ThreadRow, type BuildRowsOptions } from "./rows";
export { messageActionsFor, canReactTo, QUICK_REACTIONS, type MessageActionId, type MessageActionContext } from "./actions";
export { createTusUpload, base64Utf8, TUS_CHUNK_BYTES, type TusUploadOptions } from "./tus";
export {
  CHAT_PUSH_CATEGORY,
  CHAT_REPLY_ACTION,
  CHAT_MARK_READ_ACTION,
  chatPushCopy,
  chatPath,
  chatPushCategory,
  chatNotificationActions,
  registerChatNotificationActions,
  conversationIdFromData,
  replyClientId,
  replyClientIdFor,
  failedReply,
  PUSH_REPLY_WAIT_MS,
  handleChatPushResponse,
  chatThreadMatch,
  chatPushPayload,
  type ChatPushCopy,
  type ChatPushData,
  type ChatPushPayload,
  type ChatPushPayloadInput,
  type ChatPushOutcome,
  type ChatPushOutboxDeps,
  type ChatPushResponseLike,
  type NotificationCategoriesLike,
} from "./push";
export { haptic, type ChatNativeModules, type ExpoAudioLike, type ImagePickerLike, type HapticsLike, type ClipboardLike, type KeyboardAvoidingLike, type DraftStorageLike, type AudioPlayerLike, type AudioRecorderLike, type AudioStatusLike, type RecorderStateLike, type PickedAssetLike, type PickerResultLike, type HapticEvent, type ExpoCameraLike, type ExpoVideoLike, type WebBrowserLike, type ChunkFileLike, type VideoPlayerLike, type CameraViewHandleLike, type VideoViewHandleLike, type PermissionLike, type SharingLike, type MediaLibraryLike, type NetInfoLike } from "./modules";

// Organising: topics, scheduled send, availability, broadcast, search and moderation.
export { chatOrganiseCopy, type ChatOrganiseCopy } from "./organise-copy";
export { ChatIconButton, type ChatIconButtonProps } from "./icon-button";
export { ChatTopicBar, canManageTopics, topicClosedFor, topicMenuFor, checkTopicName, type ChatTopicBarProps, type TopicMenuAction } from "./topics";
export {
  ChatScheduleSheet,
  ChatScheduledList,
  ChatScheduledBar,
  useScheduleSend,
  scheduleInputFrom,
  defaultScheduleAt,
  withDay,
  withTime,
  type ChatScheduleSheetProps,
  type ChatScheduledListProps,
  type ChatScheduledBarProps,
} from "./schedule-sheet";
export {
  ChatAvailabilityScreen,
  ChatAwayLine,
  useAwayLine,
  awayLineFor,
  defaultWeek,
  weekFromHours,
  hoursFromWeek,
  sameTimeDays,
  formFrom,
  availabilityInput,
  timeZones,
  deviceTimeZone,
  clockToDate,
  dateToClock,
  type ChatAvailabilityScreenProps,
  type ChatAwayLineProps,
  type AvailabilityForm,
  type DayHours,
  type WeekHours,
} from "./availability";
export { ChatBroadcastSheet, broadcastOutcome, broadcastRows, type ChatBroadcastSheetProps } from "./broadcast-sheet";
export { ChatSearchScreen, SearchSnippet, snippetText, type ChatSearchScreenProps } from "./search-screen";
export { ModerationMarker, moderationNote, moderationText, type ModerationNote } from "./moderation";
export { useJumpToMessage, rowIndexOf, type JumpTarget, type UseJumpOptions } from "./use-jump";
