// @feat:chat
/**
 * The outbox runner: claims due effects from `genesis_chat.effects`, does
 * each one, and settles it. Settling with an error has `complete_effect` back
 * it off (30 s × 2^attempts); `claim_effects` gives up after the 8th attempt.
 *
 *   push            push_targets(message) → deliver(notification), once per message
 *   transcribe      signed URL (10 min) → transcriber → update_attachment
 *   storage.remove  storage.from(bucket).remove([path]); not found is done
 *   video.remove    video.remove(provider id), when a video provider is given
 *
 * Kinds it doesn't handle are never claimed, so an app's own runner can work
 * them. Effects run concurrently per kind, up to a cap; one failure never
 * stops the others. Errors are stored as short messages, never payloads.
 */
import { CHAT_BUCKET, CHAT_SCHEMA, type ChatSupabase } from "../core/client";
import type { ChatDeliver, ChatEffect, ChatEffectKind, ChatNotification, ChatRunReport, Transcriber, VideoProvider } from "./types";

/** `claim_effects` stops claiming an effect after this many attempts. */
export const CHAT_MAX_ATTEMPTS = 8;
const ALL_KINDS: readonly ChatEffectKind[] = ["push", "transcribe", "storage.remove", "video.remove"];
const SIGNED_URL_SECONDS = 600;

export interface ChatRunnerOptions {
  /** A service-role supabase-js client (the runner reads past row level security). */
  supabase: ChatSupabase;
  /** Sends a message's push: `createExpoDeliver(...)`, or a function that calls genesis-notifications' `notify`. */
  deliver: ChatDeliver;
  /** Speech to text for voice notes and stored videos. Without one, their transcripts are set `off`. */
  transcriber?: Transcriber | undefined;
  /** The language to transcribe in (BCP-47). Default: detected. */
  transcriptLanguage?: string | undefined;
  /** Hosted video (Mux), to remove an asset when its attachment goes. */
  video?: Pick<VideoProvider, "name" | "remove"> | undefined;
  /** The kinds this runner works (default all four), so separate schedules can split them. */
  kinds?: readonly ChatEffectKind[] | undefined;
  batch?: {
    /** Effects claimed per run (default 50, at most 500). */
    limit?: number | undefined;
    /** Effects of one kind in flight at once (default 4). */
    concurrency?: number | undefined;
  };
  /** A person's display name, for push titles and group previews. */
  resolveName?: ((userId: string) => Promise<string | null | undefined> | string | null | undefined) | undefined;
  /** Kinds that are one-to-one (default `["direct"]`): their push title is the sender's name. */
  directKinds?: readonly string[] | undefined;
  /** Where a tapped notification opens (default `/messages/<conversationId>`). */
  linkFor?: ((conversationId: string, messageId: string) => string) | undefined;
  /** Safe log lines (effect ids, kinds, short errors). Default: nothing is logged. */
  log?: ((line: string) => void) | undefined;
}

export interface ChatRunner {
  /** One claim, its work and its settling. Rejects only when claiming fails. */
  run(): Promise<ChatRunReport>;
  /** Works one effect (exported for tests and for apps that claim themselves). Throws to retry. */
  handle(effect: ChatEffect): Promise<void>;
}

interface PushTarget {
  user_id: string;
  conversation_id: string;
  title: string | null;
  sender_id: string | null;
  preview: string | null;
  mentioned: boolean | null;
  unread_total: number | null;
}

interface AttachmentRow {
  id: string;
  kind: string;
  provider: string;
  path: string | null;
  mime: string | null;
  duration_ms: number | null;
  transcript_status: string | null;
}

type Result<T> = { data: T | null; error: { message?: string; code?: string; statusCode?: string | number } | null };

function errorText(fn: string, error: { message?: string; code?: string } | null | undefined): Error {
  // The code where there is one: a database message can quote the row it refused.
  return new Error(`${fn}: ${error?.code ?? error?.message ?? "error"}`);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Runs `work` over `items`, at most `limit` at a time. */
async function pool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  });
  await Promise.all(lanes);
}

export function createChatRunner(options: ChatRunnerOptions): ChatRunner {
  const { supabase, deliver } = options;
  const kinds = [...(options.kinds ?? ALL_KINDS)];
  const limit = Math.min(Math.max(options.batch?.limit ?? 50, 1), 500);
  const concurrency = Math.max(options.batch?.concurrency ?? 4, 1);
  const directKinds = new Set(options.directKinds ?? ["direct"]);
  const log = options.log ?? (() => {});
  const db = () => supabase.schema(CHAT_SCHEMA);

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = (await db().rpc(fn, args)) as Result<T>;
    if (error) throw errorText(fn, error);
    return data as T;
  }

  async function nameOf(userId: string | null): Promise<string | null> {
    if (!userId || !options.resolveName) return null;
    try {
      return str(await options.resolveName(userId));
    } catch {
      return null;
    }
  }

  async function push(effect: ChatEffect): Promise<void> {
    const messageId = str(effect.payload.message_id);
    if (!messageId) return;
    const targets = (await rpc<PushTarget[] | null>("push_targets", { p_message_id: messageId })) ?? [];
    // Deleted, silent, or nobody to tell: done.
    if (targets.length === 0) return;
    const first = targets[0]!;
    const conversationId = first.conversation_id;
    const { data: conversation, error } = (await db()
      .from("conversations")
      .select("kind")
      .eq("id", conversationId)
      .maybeSingle()) as Result<{ kind: string }>;
    if (error) throw errorText("conversations", error);
    const direct = conversation ? directKinds.has(conversation.kind) : false;
    const senderName = await nameOf(first.sender_id);
    const preview = first.preview ?? "New message";
    // The conversation's title; a direct conversation (or an untitled group) shows who wrote.
    const title = str(first.title) ?? senderName ?? "New message";
    const body = !direct && senderName ? `${senderName}: ${preview}` : preview;
    const notification: ChatNotification = {
      category: "messages",
      messageId,
      conversationId,
      recipients: targets.map((t) => ({ userId: t.user_id, badge: t.unread_total ?? 0, mentioned: t.mentioned === true })),
      title,
      body,
      senderId: first.sender_id,
      collapseKey: `chat:${conversationId}`,
      threadKey: conversationId,
      idempotencyKey: `push:${messageId}`,
      data: { url: options.linkFor?.(conversationId, messageId) ?? `/messages/${conversationId}`, conversationId, messageId },
    };
    await deliver(notification);
  }

  async function storageRemove(effect: ChatEffect): Promise<void> {
    const path = str(effect.payload.path);
    if (!path) return;
    const bucket = str(effect.payload.bucket) ?? CHAT_BUCKET;
    const { error } = (await supabase.storage.from(bucket).remove([path])) as Result<unknown>;
    if (!error) return;
    const status = String(error.statusCode ?? "");
    if (status === "404" || /not.?found/i.test(error.message ?? "")) return;
    throw new Error(`storage.remove: ${status || error.message || "error"}`);
  }

  async function transcribe(effect: ChatEffect): Promise<void> {
    const id = str(effect.payload.attachment_id);
    if (!id) return;
    const { data: row, error } = (await db()
      .from("attachments")
      .select("id, kind, provider, path, mime, duration_ms, transcript_status")
      .eq("id", id)
      .maybeSingle()) as Result<AttachmentRow>;
    if (error) throw errorText("attachments", error);
    // Deleted, or already settled: nothing to do.
    if (!row || (row.transcript_status !== "pending" && row.transcript_status !== null)) return;
    // A hosted video's captions come from its provider's webhook (Mux generated subtitles).
    if (row.provider !== "storage") return;
    if (!options.transcriber || !row.path) {
      await rpc("update_attachment", { p_attachment_id: id, p_patch: { transcript_status: "off" } });
      return;
    }
    const signed = (await supabase.storage.from(CHAT_BUCKET).createSignedUrl(row.path, SIGNED_URL_SECONDS)) as Result<{ signedUrl: string }>;
    if (signed.error || !signed.data?.signedUrl) throw errorText("createSignedUrl", signed.error);
    try {
      const result = await options.transcriber.transcribe({
        url: signed.data.signedUrl,
        mime: row.mime,
        durationMs: row.duration_ms,
        language: options.transcriptLanguage,
      });
      await rpc("update_attachment", { p_attachment_id: id, p_patch: { transcript: result.text.slice(0, 100_000), transcript_status: "ready" } });
    } catch (e) {
      // The last attempt: say so, so the player stops waiting for it.
      if (effect.attempts >= CHAT_MAX_ATTEMPTS) {
        await rpc("update_attachment", { p_attachment_id: id, p_patch: { transcript_status: "failed" } }).catch(() => {});
      }
      throw e;
    }
  }

  async function videoRemove(effect: ChatEffect): Promise<void> {
    const providerId = str(effect.payload.provider_id);
    if (!providerId || !options.video) return;
    const provider = str(effect.payload.provider);
    if (provider && provider !== options.video.name) {
      throw new Error(`video.remove: no adapter for ${provider} (this runner has ${options.video.name})`);
    }
    await options.video.remove(providerId);
  }

  async function handle(effect: ChatEffect): Promise<void> {
    switch (effect.kind) {
      case "push":
        return push(effect);
      case "transcribe":
        return transcribe(effect);
      case "storage.remove":
        return storageRemove(effect);
      case "video.remove":
        return videoRemove(effect);
      default:
        throw new Error(`no handler for ${effect.kind}`);
    }
  }

  async function run(): Promise<ChatRunReport> {
    const claimed = (await rpc<ChatEffect[] | null>("claim_effects", { p_kinds: kinds, p_limit: limit })) ?? [];
    const report: ChatRunReport = { claimed: claimed.length, done: 0, failed: 0 };
    const byKind = new Map<string, ChatEffect[]>();
    for (const effect of claimed) byKind.set(effect.kind, [...(byKind.get(effect.kind) ?? []), effect]);
    await Promise.all(
      [...byKind.values()].map((effects) =>
        pool(effects, concurrency, async (effect) => {
          let failure: string | null = null;
          try {
            await handle({ ...effect, payload: effect.payload ?? {} });
          } catch (e) {
            failure = (e instanceof Error ? e.message : String(e)).slice(0, 500) || "error";
          }
          try {
            await rpc("complete_effect", { p_id: effect.id, p_error: failure });
          } catch (e) {
            // Unsettled: its five-minute claim runs out and it is claimed again.
            log(`genesis-chat: settling effect ${effect.id} failed: ${e instanceof Error ? e.message : "error"}`);
            failure ??= "unsettled";
          }
          if (failure) {
            report.failed++;
            log(`genesis-chat: ${effect.kind} effect ${effect.id} (attempt ${effect.attempts}) failed: ${failure}`);
          } else report.done++;
        }),
      ),
    );
    return report;
  }

  return { run, handle };
}
