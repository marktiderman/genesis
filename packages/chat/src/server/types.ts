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
  /** `chat:<conversation id>`: a newer push replaces an older one where the platform can. */
  collapseKey: string;
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

/** The outbox kinds the runner works. */
export type ChatEffectKind = "push" | "transcribe" | "storage.remove" | "video.remove";

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
}
