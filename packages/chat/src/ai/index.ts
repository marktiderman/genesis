// @feat:chat
/**
 * Chat's AI tasks for `@marktiderman/genesis-ai`: the recap ("catch me up") and a reply draft,
 * promoted from the main app's loader (G4). The only part of chat that imports genesis-ai, an
 * optional peer: install it (and `zod`) to use this subpath. Server only: register the tasks with
 * `createAiHandler` and call them by id from the client (`useAiTask("chat.recap")`).
 *
 * Everything is read as the caller (`ctx.db` is their own Supabase client, so row level security
 * applies): their membership and last-read position, `genesis_chat.i_observe` for whether
 * internal notes and hidden messages are theirs to see, and the latest 200 messages. The client
 * sends only the conversation id. The prompts and request are `createChatAssistant`'s: the same
 * system prompts, transcript fencing, model, effort and refusal fallback.
 */
import { defineTask, GuardrailError, type AiContext, type TaskDefinition } from "@marktiderman/genesis-ai";
// `zod/v4` is Zod 4 in both Zod 3.25+ and Zod 4, so apps on either can install this.
import { z } from "zod/v4";
import { draftPrompt, draftSystem, recapPrompt, recapSystem, type AssistantMessage } from "../server/assistant";

const MAX_MESSAGES = 200;

/** The part of a Supabase client the loaders use: the caller's own, signed in as them. */
export interface ChatAiDb {
  // Loose on purpose: a client typed by an app's Database narrows these to its own names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: (name: "genesis_chat") => any;
}

export interface ChatAiTaskOptions {
  /** Who may run it, such as "coaches only". Default: any member of the conversation. */
  can?: ((ctx: AiContext<ChatAiDb>, args: { conversationId: string }) => boolean | Promise<boolean>) | undefined;
  /** A member's display name, read as the caller (e.g. from the app's `profile_cards`). */
  resolveName?: ((db: ChatAiDb, userId: string) => Promise<string | null | undefined>) | undefined;
  /** The model alias. Default `default`. */
  model?: string | undefined;
  /** The FeatureId the gate checks. Default `chat`. */
  feature?: string | undefined;
  /**
   * What kind of conversation this is, as a noun phrase ("a coaching conversation", "a support
   * ticket"), as `createChatAssistant` takes it. The prompts say "a conversation" without it.
   */
  context?: string | undefined;
}

export interface DraftTaskOptions extends ChatAiTaskOptions {
  /** How the coach writes ("warm, brief, first names, no emoji"), read on the server. */
  voice?: ((ctx: AiContext<ChatAiDb>) => Promise<string | null | undefined>) | undefined;
}

/** What the loaders return and the prompts read. */
export interface LoadedConversation {
  [key: string]: unknown;
  messages: AssistantMessage[];
  since: string | null;
  me: string;
  observer: boolean;
  resolveName: (userId: string) => Promise<string | null | undefined>;
  voice?: string | undefined;
}

export const CHAT_AI_REFUSALS = {
  notMember: "You can only use this on a conversation you're in.",
  empty: "Nothing to catch up on yet.",
} as const;

type MessageRow = {
  id: string;
  seq: number;
  sender_id: string | null;
  body: string | null;
  created_at: string;
  kind: string;
  visibility: string;
  deleted_at: string | null;
  moderation: string | null;
};

const args = z.object({ conversationId: z.uuid() });

const hasText = (m: MessageRow) => m.kind === "text" && m.deleted_at === null && Boolean((m.body ?? "").trim());

/**
 * Reads a conversation as the caller. Stops with `forbidden` when they aren't a member and
 * `invalid_input` when there's nothing to work from (for the recap: nothing new since they read).
 */
async function loadConversation(
  ctx: AiContext<ChatAiDb> & { layer: (name: string, text: string, ids?: readonly string[]) => void },
  conversationId: string,
  options: ChatAiTaskOptions,
  mode: "recap" | "draft",
): Promise<LoadedConversation> {
  const chat = ctx.db.schema("genesis_chat");
  const member = await chat
    .from("members")
    .select("last_read_seq")
    .eq("conversation_id", conversationId)
    .eq("user_id", ctx.personId)
    .is("left_at", null)
    .maybeSingle();
  if (member.error) throw new Error(`chat.${mode}: reading membership failed (${member.error.code ?? "?"})`);
  if (!member.data) throw new GuardrailError(CHAT_AI_REFUSALS.notMember, "forbidden");
  const lastRead = Number((member.data as { last_read_seq: number | null }).last_read_seq ?? 0);

  const observes = await chat.rpc("i_observe", { p_conversation_id: conversationId });
  const observer = !observes.error && observes.data === true;

  const rows = await chat
    .from("messages")
    .select("id, seq, sender_id, body, created_at, kind, visibility, deleted_at, moderation")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: false })
    .limit(MAX_MESSAGES);
  if (rows.error) throw new Error(`chat.${mode}: reading messages failed (${rows.error.code ?? "?"})`);
  const recent = [...((rows.data ?? []) as MessageRow[])].reverse();
  if (!recent.some(hasText)) throw new GuardrailError(CHAT_AI_REFUSALS.empty, "invalid_input");

  let since: string | null = null;
  if (mode === "recap") {
    // The last-read message may be one this person can't see (an internal note, a hidden one):
    // the newest visible one at or before it marks where "new" starts.
    since = recent.filter((m) => m.seq <= lastRead).at(-1)?.created_at ?? null;
    if (lastRead > 0 && !recent.some((m) => m.seq > lastRead && hasText(m))) throw new GuardrailError(CHAT_AI_REFUSALS.empty, "invalid_input");
  }

  const messages: AssistantMessage[] = recent.map((m) => ({
    senderId: m.sender_id,
    body: m.body ?? "",
    createdAt: m.created_at,
    kind: m.kind === "system" ? "system" : "text",
    visibility: m.visibility === "observers" ? "observers" : "everyone",
    deletedAt: m.deleted_at,
    moderation: m.moderation === "hidden" || m.moderation === "flagged" ? m.moderation : null,
  }));
  ctx.layer(
    "messages",
    messages.map((m) => m.body).join("\n"),
    recent.map((m) => m.id),
  );

  const names = new Map<string, string | null | undefined>();
  const resolveName = async (userId: string) => {
    if (!options.resolveName) return null;
    if (!names.has(userId)) names.set(userId, await options.resolveName(ctx.db, userId));
    return names.get(userId);
  };
  return { messages, since, me: ctx.personId, observer, resolveName };
}

/** "Catch me up": a short recap of what came in since the caller last read the conversation. */
export function chatRecapTask(options: ChatAiTaskOptions = {}): TaskDefinition<{ conversationId: string }, LoadedConversation, { text: string }, ChatAiDb> {
  return defineTask<{ conversationId: string }, LoadedConversation, { text: string }, ChatAiDb>({
    id: "chat.recap",
    version: 1,
    feature: options.feature ?? "chat",
    model: options.model ?? "default",
    maxTokens: 4000,
    args,
    ...(options.can ? { can: options.can } : {}),
    load: (ctx, { conversationId }) => loadConversation(ctx, conversationId, options, "recap"),
    system: recapSystem(options.context),
    prompt: (loaded) => recapPrompt(loaded),
    output: "text",
  });
}

/** A draft of the caller's next message, in their voice. Nothing is sent: a person decides. */
export function chatDraftReplyTask(options: DraftTaskOptions = {}): TaskDefinition<{ conversationId: string }, LoadedConversation, { text: string }, ChatAiDb> {
  return defineTask<{ conversationId: string }, LoadedConversation, { text: string }, ChatAiDb>({
    id: "chat.draft-reply",
    version: 1,
    feature: options.feature ?? "chat",
    model: options.model ?? "default",
    maxTokens: 4000,
    args,
    ...(options.can ? { can: options.can } : {}),
    load: async (ctx, { conversationId }) => {
      const loaded = await loadConversation(ctx, conversationId, options, "draft");
      const voice = (await options.voice?.(ctx))?.trim();
      return voice ? { ...loaded, voice } : loaded;
    },
    system: draftSystem(options.context),
    prompt: (loaded) => draftPrompt(loaded),
    output: "text",
  });
}
