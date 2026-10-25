// @feat:chat
/**
 * The server's contracts: what the runner hands an app's push sender, and the
 * adapters it takes for transcripts and hosted video. No React, no Node APIs:
 * fetch and Web Crypto only, so it runs in Node, edge functions and Deno.
 */
import type { ChatSupabase } from "../core/client";

/** One person a chat push goes to. */
export interface ChatRecipient {
  userId: string;
  /** Their unread total across conversations (capped at 99 each), for the app badge. */
  badge: number;
  /** The message mentions them. */
  mentioned: boolean;
}

/**
 * One message's push, for every recipient at once. Its shape matches what
 * `notify()` from genesis-notifications takes (type/category, recipients, data,
 * idempotencyKey, threadKey, collapseKey), so an app can hand it on unchanged.
 */
export interface ChatNotification {
  category: "messages";
  messageId: string;
  conversationId: string;
  recipients: ChatRecipient[];
  /** The conversation's title, or the sender's name in a direct conversation. */
  title: string;
  /** The preview; in a group, prefixed with the sender's name ("Ana: see you"). */
  body: string;
  senderId: string | null;
  /**
   * `chat:<conversation id>`, only when the runner's `collapse` is on: a newer push
   * replaces an older one. Off by default, because on iOS it becomes the
   * notification's identifier, so replies from two notifications of one
   * conversation would collide.
   */
  collapseKey?: string | undefined;
  /** The conversation id: groups a conversation's pushes on the lock screen. */
  threadKey: string;
  /** `push:<message id>`: the same message is never pushed twice by a sender that dedupes. */
  idempotencyKey: string;
  data: { url: string; conversationId: string; messageId: string; seq: number | null };
}

/**
 * Sends a message's push. Throw to have the effect retried (with backoff, up
 * to 8 attempts); resolve once it is handed over. What it resolves with is
 * passed back to nobody: keep what you need (tickets) yourself.
 */
export type ChatDeliver = (notification: ChatNotification) => Promise<unknown>;

/** A voice note or video to transcribe. */
export interface TranscribeInput {
  /** A signed URL, valid for 10 minutes. */
  url: string;
  mime: string | null;
  durationMs: number | null;
  /** A BCP-47 code; without one the provider detects the language. */
  language?: string | undefined;
}

export interface TranscribeResult {
  text: string;
  /** The language heard, when the provider says. */
  language?: string | undefined;
}

/** A speech-to-text provider. Throw on failure: the effect is retried. */
export interface Transcriber {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

/** A hosted video service (Mux): direct uploads, removal and its webhook. */
export interface VideoProvider {
  /** The attachments' `provider` value it owns (`mux`). */
  readonly name: "mux" | "cloudflare";
  /** A one-time URL the client uploads the file to. */
  createUpload(options: { corsOrigin: string; passthrough?: string | undefined }): Promise<{ uploadId: string; url: string }>;
  /** Removes a hosted asset. Already gone counts as removed. */
  remove(assetId: string): Promise<void>;
  /** Verifies and applies one of the service's webhooks. */
  handleWebhook(request: Request, context: { supabase: ChatSupabase }): Promise<Response>;
}

/** What moderation decided: `hidden` takes a message from members' view, `flagged` files a report only. */
export type ModerationResult = "clean" | "flagged" | "hidden";

/** A message to moderate: its text and signed URLs (10 minutes) for its photos. */
export interface ModerateInput {
  text: string;
  imageUrls: string[];
}

export interface ModerationVerdict {
  result: ModerationResult;
  /** A short, safe reason for the report observers see ("harassment 0.93"). Never the message itself. */
  reason?: string | undefined;
}

/** A moderation provider. Throw on failure: the effect is retried. */
export interface Moderator {
  readonly name: string;
  moderate(input: ModerateInput): Promise<ModerationVerdict>;
}

/** One link's Open Graph data, as `save_link_preview` stores it. */
export interface LinkPreview {
  url: string;
  /** `blocked`: the URL is not one the server may fetch (private address, not https). */
  status: "ok" | "failed" | "blocked";
  title?: string | null | undefined;
  description?: string | null | undefined;
  /** https only. */
  imageUrl?: string | null | undefined;
  siteName?: string | null | undefined;
}

/** Fetches a link's preview. Resolve `failed` or `blocked` rather than throw; a throw is retried. */
export interface LinkUnfurler {
  unfurl(url: string): Promise<LinkPreview>;
}

/** The outbox kinds the runner works. */
export type ChatEffectKind = "push" | "transcribe" | "storage.remove" | "video.remove" | "moderate" | "unfurl";

/** A claimed row of `genesis_chat.effects`. */
export interface ChatEffect {
  id: number;
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  /** This attempt's number, from 1 (claim_effects counts it). */
  attempts: number;
}

export interface ChatRunReport {
  claimed: number;
  done: number;
  /** Failed this time; retried later with backoff until the 8th attempt. */
  failed: number;
  /** Scheduled messages that were due: posted, or refused (the reason is on the row). Absent with `scheduled: false`. */
  scheduled?: { due: number; posted: number; failed: number } | undefined;
  /** Messages removed past their kind's retention. Present only with `retention: true`. */
  purged?: number | undefined;
  /** Steps besides the outbox that failed this run (scheduled posting, retention), as short messages. */
  errors?: string[] | undefined;
}
