/**
 * @feat:chat
 * `@marktiderman/genesis-chat/native`: chat on genesis-ui-native, over the
 * hooks in `/react`.
 *
 * Rung 1: `ChatInboxScreen` and `ChatThreadScreen` in two routes, under
 * `ChatProvider` (from `/react`) and `ChatNativeProvider` (the native modules,
 * copy and people).
 * Rung 2: the parts (`ChatComposer`, `MessageBubble`, `MessageActionsSheet`,
 * `VoiceNotePlayer`, `ChatMediaViewer`, `ChatStartSheet`) in your own screen.
 * Rung 3: the logic (`composerReducer`, `recorderStep`, `invertedRows`,
 * `messageActionsFor`, `useVoiceRecorder`, `useChatComposer`).
 * Glue: `createTusUpload` (resumable uploads for `ChatProvider upload`) and
 * the push block's `messages` category, actions and reply handler.
 *
 * Optional peers, passed in rather than imported: expo-audio,
 * expo-image-picker, expo-haptics, expo-clipboard,
 * react-native-keyboard-controller; FlashList and expo-image through
 * GenesisNativeApp's `modules`.
 *
 * @stability Beta
 */
export { ChatInboxScreen, inboxRow, type ChatInboxScreenProps } from "./inbox-screen";
export { ChatThreadScreen, type ChatThreadScreenProps } from "./thread-screen";
export { chatThreadStackOptions, useChatThreadStackOptions, type ChatThreadStackOptionsProps } from "./stack-options";
export { ChatStartSheet, ChatStartButton, type ChatStartPerson, type ChatStartSheetProps } from "./start-sheet";
export { ChatComposer, type ChatComposerProps } from "./composer";
export { MessageBubble, displayBody, formatClock, type MessageBubbleProps } from "./message-bubble";
export { MessageActionsSheet, type MessageActionsSheetProps } from "./message-actions-sheet";
export { VoiceNotePlayer, claimPlayback, releasePlayback, activePlaybackId, scrubSeconds, waveformBars, barsThatFit, type VoiceNotePlayerProps } from "./voice-player";
export { ChatMediaViewer, MessageAttachments, attachmentPaths, type BubbleAttachment, type ChatMediaViewerProps } from "./media";
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
  handleChatPushResponse,
  chatThreadMatch,
  type ChatPushCopy,
  type ChatPushOutcome,
  type ChatPushResponseLike,
  type NotificationCategoriesLike,
} from "./push";
export { haptic, type ChatNativeModules, type ExpoAudioLike, type ImagePickerLike, type HapticsLike, type ClipboardLike, type KeyboardAvoidingLike, type DraftStorageLike, type AudioPlayerLike, type AudioRecorderLike, type AudioStatusLike, type RecorderStateLike, type PickedAssetLike, type PickerResultLike, type HapticEvent } from "./modules";
