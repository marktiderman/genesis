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
 *   moderate        the message's text and photos (signed URLs) → moderator → moderate_message
 *   unfurl          unfurler(url) → save_link_preview (ok, failed or blocked)
 *
 * `moderate` and `unfurl` are claimed only when their adapter is given. Each run
 * also posts due scheduled messages (due_scheduled, then post_scheduled each, as
 * their sender) and, with `retention: true`, removes messages past their kind's
 * retention (purge_expired); a failure there is reported, never thrown.
 *
 * Kinds it doesn't handle are never claimed, so an app's own runner can work
 * them. Effects run concurrently per kind, up to a cap; one failure never
 * stops the others. Errors are stored as short messages, never payloads.
 */
import { CHAT_BUCKET, CHAT_SCHEMA, type ChatSupabase } from "../core/client";
import type {
  ChatDeliver,
  ChatEffect,
  ChatEffectKind,
  ChatNotification,
  ChatRunReport,
  LinkUnfurler,
  Moderator,
  Transcriber,
  VideoProvider,
} from "./types";

/** `claim_effects` stops claiming an effect after this many attempts. */
export const CHAT_MAX_ATTEMPTS = 8;
const BASE_KINDS: readonly ChatEffectKind[] = ["push", "transcribe", "storage.remove", "video.remove"];
const SIGNED_URL_SECONDS = 600;
/** Photos sent to the moderator per message. */
const MODERATED_IMAGES = 4;
/** purge_expired calls per run, each removing up to `retentionBatch`. */
const PURGE_ROUNDS = 10;

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
  /** Moderation for kinds that ask for it (`set_kind_options(kind, p_moderate => true)`): `openAiModerator(...)`. */
  moderator?: Moderator | undefined;
  /** Link previews: `createLinkUnfurler()`. Without one, `unfurl` effects are left unclaimed. */
  unfurler?: LinkUnfurler | undefined;
  /** Post due scheduled messages on each run (default true). */
  scheduled?: boolean | undefined;
  /** Remove messages past their kind's retention on each run (default false: run it once a day). */
  retention?: boolean | undefined;
  /** Messages removed per purge_expired call (default 1000); up to 10 calls a run. */
  retentionBatch?: number | undefined;
  /** The kinds this runner works (default the four base kinds, plus `moderate` and `unfurl` when their adapters are given). */
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
  /**
   * Set `collapseKey` (`chat:<conversation id>`) so a conversation's newer push
   * replaces the older one. Default false: on iOS the collapse id becomes the
   * notification's identifier, and replies from one conversation's notifications collide.
   */
  collapse?: boolean | undefined;
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

interface MessageRow {
  id: string;
  body: string | null;
  deleted_at: string | null;
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
  const kinds = [
    ...(options.kinds ?? [
      ...BASE_KINDS,
      ...(options.moderator ? (["moderate"] as const) : []),
      ...(options.unfurler ? (["unfurl"] as const) : []),
    ]),
  ];
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
    // The message's number, so a tapped notification can open the thread at it.
    const { data: numbered } = (await db().from("messages").select("seq").eq("id", messageId).maybeSingle()) as Result<{ seq: number }>;
    const seq = numbered?.seq ?? null;
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
      ...(options.collapse ? { collapseKey: `chat:${conversationId}` } : {}),
      threadKey: conversationId,
      idempotencyKey: `push:${messageId}`,
      data: { url: options.linkFor?.(conversationId, messageId) ?? `/messages/${conversationId}`, conversationId, messageId, seq },
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

  async function moderate(effect: ChatEffect): Promise<void> {
    const messageId = str(effect.payload.message_id);
    if (!messageId) return;
    if (!options.moderator) throw new Error("moderate: no moderator given");
    const { data: message, error } = (await db()
      .from("messages")
      .select("id, body, deleted_at")
      .eq("id", messageId)
      .maybeSingle()) as Result<MessageRow>;
    if (error) throw errorText("messages", error);
    // Deleted since: nothing left to judge.
    if (!message || message.deleted_at) return;
    const { data: rows, error: attachmentsError } = (await db()
      .from("attachments")
      .select("id, kind, provider, path, mime")
      .eq("message_id", messageId)) as Result<Pick<AttachmentRow, "id" | "kind" | "provider" | "path" | "mime">[]>;
    if (attachmentsError) throw errorText("attachments", attachmentsError);
    const photos = (rows ?? [])
      .filter((a) => a.provider === "storage" && a.path && (a.kind === "image" || (a.mime ?? "").startsWith("image/")))
      .slice(0, MODERATED_IMAGES);
    const imageUrls: string[] = [];
    for (const photo of photos) {
      const signed = (await supabase.storage.from(CHAT_BUCKET).createSignedUrl(photo.path!, SIGNED_URL_SECONDS)) as Result<{ signedUrl: string }>;
      if (signed.error || !signed.data?.signedUrl) throw errorText("createSignedUrl", signed.error);
      imageUrls.push(signed.data.signedUrl);
    }
    const text = message.body ?? "";
    if (!text.trim() && imageUrls.length === 0) return;
    const verdict = await options.moderator.moderate({ text, imageUrls });
    await rpc("moderate_message", { p_message_id: messageId, p_result: verdict.result, p_reason: verdict.reason?.slice(0, 1000) ?? null });
  }

  async function unfurl(effect: ChatEffect): Promise<void> {
    const url = str(effect.payload.url);
    if (!url) return;
    if (!options.unfurler) throw new Error("unfurl: no unfurler given");
    // The table takes https links only; anything else is recorded nowhere.
    if (!/^https:\/\//i.test(url) || url.length > 2000) return;
    const preview = await options.unfurler.unfurl(url);
    const ok = preview.status === "ok";
    await rpc("save_link_preview", {
      p_url: url,
      p_status: preview.status,
      p_title: ok ? (preview.title ?? null) : null,
      p_description: ok ? (preview.description ?? null) : null,
      p_image_url: ok ? (preview.imageUrl ?? null) : null,
      p_site_name: ok ? (preview.siteName ?? null) : null,
    });
  }

  async function postScheduled(report: ChatRunReport, errors: string[]): Promise<void> {
    const counts = { due: 0, posted: 0, failed: 0 };
    report.scheduled = counts;
    let due: string[];
    try {
      due = ((await rpc<unknown[] | null>("due_scheduled", { p_limit: limit })) ?? []).map((row) =>
        typeof row === "string" ? row : String((row as Record<string, unknown>)?.due_scheduled ?? (row as Record<string, unknown>)?.id ?? ""),
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "due_scheduled: error");
      return;
    }
    counts.due = due.length;
    await pool(due, concurrency, async (id) => {
      try {
        // Null: refused (the reason is on the row) or taken by another runner.
        const messageId = await rpc<string | null>("post_scheduled", { p_id: id });
        if (messageId) counts.posted++;
        else counts.failed++;
      } catch (e) {
        counts.failed++;
        log(`genesis-chat: posting scheduled ${id} failed: ${e instanceof Error ? e.message : "error"}`);
      }
    });
  }

  async function purge(report: ChatRunReport, errors: string[]): Promise<void> {
    const batch = Math.min(Math.max(options.retentionBatch ?? 1000, 1), 10_000);
    report.purged = 0;
    try {
      for (let round = 0; round < PURGE_ROUNDS; round++) {
        const n = Number((await rpc<number | null>("purge_expired", { p_limit: batch })) ?? 0);
        report.purged += n;
        if (n < batch) break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "purge_expired: error");
    }
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
      case "moderate":
        return moderate(effect);
      case "unfurl":
        return unfurl(effect);
      default:
        throw new Error(`no handler for ${effect.kind}`);
    }
  }

  async function run(): Promise<ChatRunReport> {
    const claimed = (await rpc<ChatEffect[] | null>("claim_effects", { p_kinds: kinds, p_limit: limit })) ?? [];
    const report: ChatRunReport = { claimed: claimed.length, done: 0, failed: 0 };
    const errors: string[] = [];
    // Due messages go out alongside the outbox; their pushes are queued for the next run.
    const scheduling = options.scheduled === false ? Promise.resolve() : postScheduled(report, errors);
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
    await scheduling;
    if (options.retention) await purge(report, errors);
    if (errors.length > 0) {
      report.errors = errors.map((e) => e.slice(0, 200));
      for (const e of report.errors) log(`genesis-chat: ${e}`);
    }
    return report;
  }

  return { run, handle };
}
