/**
 * @feat:chat
 * What every bubble of one thread shares: who you are, how people are named,
 * your role, signed file URLs, and the actions, so a row needs only its item.
 */
import { createContext, useContext, type ComponentType } from "react";
import type { ChatLinkPreview, ChatMessage, ChatRole } from "../core/types";
import type { ChatAttachmentKind } from "../react/index";
import type { ChatAttachmentSlotProps } from "./attachments";
import type { ResolveUser } from "./format";

export interface ThreadContextValue {
  me: string;
  resolveUser: ResolveUser;
  role: ChatRole | null;
  /** More than two people: names and avatars show on others' messages. */
  isGroup: boolean;
  /** Owner or admin: may delete anyone's message. */
  canModerate: boolean;
  canPin: boolean;
  canPost: boolean;
  pins: Set<string>;
  urls: Record<string, string>;
  byId: Map<string, ChatMessage>;
  quickReactions: readonly string[];
  attachmentSlot?: ComponentType<ChatAttachmentSlotProps> | null;
  /** Cards for the app's registered attachment kinds. */
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  /** Link previews by message id, in link order. */
  previews: Record<string, ChatLinkPreview[]>;
  /** Where the full emoji picker loads its data from. */
  emojibaseUrl?: string;
  highlightedId: string | null;
  editingId: string | null;
  reply(m: ChatMessage): void;
  focusComposer(): void;
  startEdit(id: string | null): void;
  saveEdit(m: ChatMessage, body: string): Promise<void>;
  askDelete(m: ChatMessage): void;
  askReport(m: ChatMessage): void;
  react(m: ChatMessage, emoji: string, on: boolean): void;
  pin(m: ChatMessage, on: boolean): void;
  save(m: ChatMessage): void;
  copy(m: ChatMessage): void;
  jumpTo(messageId: string): void;
  retry(clientId: string): void;
  discard(clientId: string): void;
  openThread?: (m: ChatMessage) => void;
}

export const ThreadContext = createContext<ThreadContextValue | null>(null);

export function useThreadContext(): ThreadContextValue {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error("Chat bubbles render inside <ChatThread>.");
  return ctx;
}

/** The six quick reactions. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
