/**
 * @feat:chat
 * Which actions a message offers this person, from the same rules migration
 * 0001 enforces (react and reply need can_post; pin follows
 * useConversation().canPin: an owner or admin, or a member of a two-person
 * kind; delete needs the sender, an owner or
 * admin, or an observer who may post). The server stays the judge: an action
 * it refuses shows a toast.
 */
import type { ChatMessage, ChatRole } from "../core/types";

export type MessageActionId = "reply" | "copy" | "pin" | "unpin" | "delete";

/** The quick reactions on the long-press sheet. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export interface MessageActionContext {
  me: string;
  role: ChatRole | null;
  canPost: boolean;
  pinned: boolean;
  /** May pin here (`useConversation().canPin`: an owner or admin, or a member of a two-person kind). */
  canPin: boolean;
  /** Copy needs expo-clipboard. */
  canCopy: boolean;
}

export function canReactTo(message: ChatMessage, ctx: Pick<MessageActionContext, "canPost">): boolean {
  return ctx.canPost && !message.deletedAt && message.kind === "text";
}

export function messageActionsFor(message: ChatMessage, ctx: MessageActionContext): MessageActionId[] {
  if (message.deletedAt || message.kind === "system") return [];
  const out: MessageActionId[] = [];
  if (ctx.canPost) out.push("reply");
  if (ctx.canCopy && message.body.trim()) out.push("copy");
  const admin = ctx.role === "owner" || ctx.role === "admin";
  if (message.visibility === "everyone" && ctx.canPin) out.push(ctx.pinned ? "unpin" : "pin");
  const own = message.senderId === ctx.me && ctx.role !== null;
  if (own || admin || (ctx.role === "observer" && ctx.canPost)) out.push("delete");
  return out;
}
