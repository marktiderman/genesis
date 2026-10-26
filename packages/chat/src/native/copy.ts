/**
 * @feat:chat
 * Every word the native chat screens say, in one catalog an app can override
 * (translate, rename "Message" to "Note"). `{name}` and `{count}` are filled in.
 */
import { chatOrganiseCopy, type ChatOrganiseCopy } from "./organise-copy";

/** Topics, scheduled send, availability, broadcast, search and moderation are in `ChatOrganiseCopy`. */
export interface ChatNativeCopy extends ChatOrganiseCopy {
  inboxTitle: string;
  inboxEmptyTitle: string;
  inboxEmptyBody: string;
  inboxErrorTitle: string;
  startConversation: string;
  startConversationTitle: string;
  untitled: string;
  you: string;
  someone: string;
  youPrefix: string;
  mentionedYou: string;
  markRead: string;
  pin: string;
  unpin: string;
  archive: string;
  threadEmptyTitle: string;
  threadEmptyBody: string;
  loadEarlier: string;
  newMessages: string;
  placeholder: string;
  send: string;
  attach: string;
  attachLibrary: string;
  attachCamera: string;
  attachPaste: string;
  removeAttachment: string;
  replyingTo: string;
  cancelReply: string;
  cantPost: string;
  /** Your role in a conversation couldn't be read (offline): with Retry. */
  accessError: string;
  cantPostAdmins: string;
  cantPostClosed: string;
  recordVoice: string;
  recordHint: string;
  slideToCancel: string;
  releaseToCancel: string;
  lockedHint: string;
  stopAndSend: string;
  cancelRecording: string;
  micDenied: string;
  tooShort: string;
  /** A recording whose stop failed or left no file. */
  recordingFailed: string;
  /** A recording ended by a call, Siri, another app or the app leaving the screen. */
  recordingInterrupted: string;
  play: string;
  /** The bubble's VoiceOver actions on a voice note. */
  playVoice: string;
  pauseVoice: string;
  changeSpeed: string;
  /** The bubble's VoiceOver action for the nth of several photos. */
  openPhotoN: string;
  pause: string;
  speed: string;
  voiceMessage: string;
  voice: string;
  photo: string;
  file: string;
  video: string;
  /** Video messages (recorder, upload, player), link previews and app attachment cards. */
  recordVideo: string;
  recordVideoHint: string;
  startVideo: string;
  stopVideo: string;
  flipCamera: string;
  closeRecorder: string;
  cameraDenied: string;
  openSettings: string;
  cameraFailed: string;
  videoTooShort: string;
  /** "0:12 of 2:00", the recorder's timer. */
  videoElapsed: string;
  videoUploading: string;
  videoUploadFailed: string;
  videoOffline: string;
  videoForbidden: string;
  videoCantPlay: string;
  /** A take that the camera didn't hand over. */
  videoTakeFailed: string;
  tryAgain: string;
  cancelUpload: string;
  videoProcessing: string;
  videoFailed: string;
  playVideo: string;
  pauseVideo: string;
  mute: string;
  unmute: string;
  fullScreen: string;
  /** "Video, 0:42". */
  videoMessage: string;
  /** A link preview card's label: "{title}, {site}". */
  linkPreview: string;
  openLink: string;
  /** The bubble's VoiceOver action for its link preview. */
  openLinkAction: string;
  attachmentCard: string;
  openImage: string;
  closeViewer: string;
  photoOf: string;
  sharePhoto: string;
  savePhoto: string;
  photoSaved: string;
  photosDenied: string;
  viewerHint: string;
  sending: string;
  notSent: string;
  retry: string;
  /** On a message whose file didn't survive a relaunch: pick it again. */
  attachAgain: string;
  discard: string;
  deleted: string;
  edited: string;
  react: string;
  /** The long-press sheet's "+": every emoji. */
  moreReactions: string;
  addEmoji: string;
  emojiPicker: string;
  searchEmoji: string;
  noEmoji: string;
  recentEmoji: string;
  emojiSmileys: string;
  emojiPeople: string;
  emojiNature: string;
  emojiFood: string;
  emojiTravel: string;
  emojiActivities: string;
  emojiObjects: string;
  emojiSymbols: string;
  emojiFlags: string;
  reply: string;
  copy: string;
  copied: string;
  delete: string;
  deleteConfirm: string;
  cancel: string;
  actionFailed: string;
  messageActions: string;
  reactions: string;
  tooLarge: string;
  notAllowedType: string;
  tooMany: string;
}

export const chatNativeCopy: ChatNativeCopy = {
  ...chatOrganiseCopy,
  inboxTitle: "Messages",
  inboxEmptyTitle: "No conversations yet",
  inboxEmptyBody: "When someone messages you, or you start a conversation, it shows up here.",
  inboxErrorTitle: "Couldn't load your messages",
  startConversation: "New message",
  startConversationTitle: "Message someone",
  untitled: "Conversation",
  you: "You",
  someone: "Someone",
  youPrefix: "You: ",
  mentionedYou: "Mentioned you",
  markRead: "Mark read",
  pin: "Pin",
  unpin: "Unpin",
  archive: "Archive",
  threadEmptyTitle: "No messages yet",
  threadEmptyBody: "Say hello below.",
  loadEarlier: "Load earlier messages",
  newMessages: "New messages",
  placeholder: "Message",
  send: "Send",
  attach: "Add a photo or file",
  attachLibrary: "Photo library",
  attachCamera: "Take a photo",
  attachPaste: "Paste picture",
  removeAttachment: "Remove {name}",
  replyingTo: "Replying to {name}",
  cancelReply: "Cancel reply",
  cantPost: "You can't post in this conversation.",
  accessError: "This conversation couldn't be loaded. Check your connection and try again.",
  cantPostAdmins: "Only admins can post here.",
  cantPostClosed: "This conversation is closed.",
  recordVoice: "Record a voice message",
  recordHint: "Hold to record, slide left to cancel, slide up to lock.",
  slideToCancel: "‹ Slide to cancel",
  releaseToCancel: "Release to cancel",
  lockedHint: "Recording. Tap send when you're done.",
  stopAndSend: "Send voice message",
  cancelRecording: "Delete recording",
  micDenied: "Turn on the microphone for this app in Settings to record.",
  tooShort: "Hold to record a voice message.",
  recordingFailed: "The voice message couldn't be saved. Try recording it again.",
  recordingInterrupted: "Recording stopped, so it wasn't sent. Hold to record again.",
  play: "Play",
  playVoice: "Play voice message",
  pauseVoice: "Pause voice message",
  changeSpeed: "Change playback speed",
  openPhotoN: "Open photo {n}",
  pause: "Pause",
  speed: "Playback speed {rate}",
  voiceMessage: "Voice message, {duration}",
  voice: "Voice message",
  photo: "Photo",
  file: "File",
  video: "Video",
  recordVideo: "Record a video",
  recordVideoHint: "Tap to start and tap again to send, or hold and let go to send.",
  startVideo: "Start recording",
  stopVideo: "Stop and send",
  flipCamera: "Switch camera",
  closeRecorder: "Close the camera",
  cameraDenied: "Turn on the camera and microphone for this app in Settings to record a video.",
  openSettings: "Open Settings",
  cameraFailed: "The camera couldn't start.",
  videoTooShort: "That was too short to send. Hold longer, or tap to start and tap again to stop.",
  videoElapsed: "{elapsed} of {limit}",
  videoUploading: "Sending video, {percent}%",
  videoUploadFailed: "The video didn't send.",
  videoOffline: "The video didn't send. Check your connection and retry.",
  videoForbidden: "You can't post in this conversation.",
  videoCantPlay: "This video can't play right now.",
  videoTakeFailed: "That take didn't record. Try again.",
  tryAgain: "Try again",
  cancelUpload: "Cancel video",
  videoProcessing: "Processing video",
  videoFailed: "This video couldn't be processed.",
  playVideo: "Play video",
  pauseVideo: "Pause video",
  mute: "Mute",
  unmute: "Unmute",
  fullScreen: "Full screen",
  videoMessage: "Video, {duration}",
  linkPreview: "{title}, {site}",
  openLink: "Opens the link",
  openLinkAction: "Open link",
  attachmentCard: "{title}, {subtitle}",
  openImage: "Open photo",
  closeViewer: "Close",
  photoOf: "Photo {n} of {count}",
  sharePhoto: "Share photo",
  savePhoto: "Save to Photos",
  photoSaved: "Saved to Photos",
  photosDenied: "Allow this app to add to Photos in Settings to save.",
  viewerHint: "Swipe up or down for the next or previous photo.",
  sending: "Sending",
  notSent: "Not sent",
  retry: "Retry",
  attachAgain: "Attach again",
  discard: "Delete",
  deleted: "Message deleted",
  edited: "edited",
  react: "React with {emoji}",
  moreReactions: "More reactions",
  addEmoji: "Add emoji",
  emojiPicker: "Emoji",
  searchEmoji: "Search emoji",
  noEmoji: "No emoji found",
  recentEmoji: "Recent",
  emojiSmileys: "Smileys and emotion",
  emojiPeople: "People and body",
  emojiNature: "Animals and nature",
  emojiFood: "Food and drink",
  emojiTravel: "Travel and places",
  emojiActivities: "Activities",
  emojiObjects: "Objects",
  emojiSymbols: "Symbols",
  emojiFlags: "Flags",
  reply: "Reply",
  copy: "Copy",
  copied: "Copied",
  delete: "Delete",
  deleteConfirm: "Delete this message for everyone?",
  cancel: "Cancel",
  actionFailed: "That didn't work",
  messageActions: "Message actions",
  reactions: "{count} reactions",
  tooLarge: "{name} is too large to send.",
  notAllowedType: "{name} can't be sent.",
  tooMany: "At most {count} attachments in one message.",
};

export type ChatNativeCopyOverrides = Partial<ChatNativeCopy>;

export function resolveChatCopy(overrides?: ChatNativeCopyOverrides): ChatNativeCopy {
  return overrides ? { ...chatNativeCopy, ...overrides } : chatNativeCopy;
}

/** `fill("Replying to {name}", { name: "Sam" })`. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
