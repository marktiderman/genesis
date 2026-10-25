/**
 * @feat:chat
 * The chat contract: what the genesis_chat schema (migration 0001) stores, in
 * the app's words. Everything here is plain data, shared by web, native and
 * the server.
 */

/** owner, admin or member of a conversation; observer when the kind's observer check lets you read it. */
export type ChatRole = "owner" | "admin" | "member" | "observer";

/** Built in: image, file, voice, video, link. Apps add their own (form, lesson, worksheet…). */
export type AttachmentKind = "image" | "file" | "voice" | "video" | "link" | (string & {});

export type AttachmentProvider = "storage" | "mux" | "cloudflare" | "external" | "none";

export interface ChatAttachment {
  id: string;
  messageId: string;
  position: number;
  kind: AttachmentKind;
  /** The app's reference for its own kinds, e.g. `{ formId, versionHash }`. */
  ref: Record<string, unknown>;
  provider: AttachmentProvider;
  /** The object in the genesis-chat bucket (`<conversation>/<uploader>/<name>.<ext>`). */
  path: string | null;
  providerId: string | null;
  playbackId: string | null;
  url: string | null;
  status: "pending" | "ready" | "failed";
  name: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Peaks 0–100, at most 128, drawn before the audio loads. */
  waveform: number[] | null;
  posterPath: string | null;
  thumbhash: string | null;
  transcript: string | null;
  transcriptStatus: "pending" | "ready" | "failed" | "off" | null;
}

export interface ChatReaction {
  emoji: string;
  userId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  seq: number;
  clientId: string;
  senderId: string | null;
  senderRole: ChatRole | "system";
  kind: "text" | "system";
  /** Markdown. Empty for a deleted message. */
  body: string;
  mentions: string[];
  replyToId: string | null;
  threadRootId: string | null;
  threadCount: number;
  threadLastAt: string | null;
  topic: string | null;
  visibility: "everyone" | "observers";
  silent: boolean;
  meta: Record<string, unknown>;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
}

export interface ChatConversation {
  id: string;
  kind: string;
  title: string | null;
  subjectType: string | null;
  subjectId: string | null;
  settings: { who_posts?: "members" | "admins" } & Record<string, unknown>;
  status: "open" | "pending" | "solved" | "closed" | null;
  assigneeId: string | null;
  lastSeq: number;
  lastMessageAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface ChatMember {
  conversationId: string;
  userId: string;
  role: ChatRole;
  lastReadSeq: number;
  joinedAt: string;
}

/** A kind's rules, as genesis_chat.kinds holds them. */
export interface ChatKindRules {
  kind: string;
  label: string;
  /** 2 for a direct conversation. */
  maxMembers: number | null;
  whoPosts: "members" | "admins";
  membership: "app" | "admins";
  threads: boolean;
  observersPost: boolean;
}

/** The latest message, as the inbox previews it. */
export interface ChatPreview {
  id: string;
  seq: number;
  senderId: string | null;
  kind: "text" | "system";
  body: string;
  deleted: boolean;
  createdAt: string;
  attachment: AttachmentKind | null;
}

export interface ChatInboxItem {
  conversationId: string;
  kind: string;
  title: string | null;
  subjectType: string | null;
  subjectId: string | null;
  status: ChatConversation["status"];
  role: ChatRole;
  /** The other person, in a two-person kind. */
  otherUserId: string | null;
  memberCount: number;
  lastSeq: number;
  lastReadSeq: number;
  /** Counted to 99. */
  unread: number;
  mentioned: boolean;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: string | null;
  lastMessage: ChatPreview | null;
}

/** What a sender attaches; files are uploaded first (ChatClient.upload). */
export interface AttachmentInput {
  kind: AttachmentKind;
  path?: string;
  provider?: AttachmentProvider;
  providerId?: string;
  url?: string;
  ref?: Record<string, unknown>;
  status?: "pending" | "ready";
  name?: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  waveform?: number[];
  posterPath?: string;
  thumbhash?: string;
}

export interface SendInput {
  conversationId: string;
  /** Made once per message on the device, so a retry never posts twice. */
  clientId: string;
  body?: string;
  attachments?: AttachmentInput[];
  replyToId?: string | null;
  threadRootId?: string | null;
  topic?: string | null;
  mentions?: string[];
  visibility?: "everyone" | "observers";
  silent?: boolean;
}

/** A message on its way: shown at once, swapped for the server's when it lands. */
export interface PendingMessage {
  clientId: string;
  input: SendInput;
  senderId: string;
  createdAt: string;
  status: "sending" | "failed";
  error?: string;
  /** Local previews for files still uploading (object URLs or file URIs). */
  previews?: Record<number, string>;
  /** What each file is, in order, so a pending bubble can draw it (a voice note's duration and waveform, a file's name). */
  files?: PendingFile[];
}

export interface PendingFile {
  name: string;
  contentType: string;
  kind: AttachmentKind;
  meta?: Partial<AttachmentInput>;
  /** Not kept between launches (bytes with nowhere to save them): attach it again. */
  lost?: boolean;
}

/** A live hint from Realtime: something changed; fetch to see what. */
export type ChatSignal =
  | { type: "message"; conversationId: string; id: string; seq?: number; op: "insert" | "update" }
  | { type: "reaction"; conversationId: string; messageId: string }
  | { type: "members"; conversationId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "inbox"; conversationId: string; seq?: number };

/** Ephemeral, never stored: someone typing or recording. */
export interface ChatActivity {
  userId: string;
  activity: "typing" | "recording-voice" | "recording-video";
  at: number;
}
