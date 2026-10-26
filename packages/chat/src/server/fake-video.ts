// @feat:chat
/**
 * A pretend hosted video service for local development, behind `VideoProvider`, so the hosted
 * path (pending attachment, upload, ready) runs without a Mux account.
 *
 *   createUpload  a local upload URL (`uploadUrl?id=<upload id>`) and its id, `fake_<uuid>`
 *   handler       the fetch handler to mount at `uploadUrl`: takes the PUT body, stores it in
 *                 the genesis-chat bucket, then marks the attachment ready
 *   markReady     what Mux's `video.asset.ready` webhook does: `update_attachment` with status
 *                 ready, a playback id (`fake-<upload id>`) and a fake HLS URL
 *   playbackUrl   a signed link to the stored file (the fake HLS URL when nothing was stored)
 *
 * It refuses to be made when NODE_ENV is `production`, unless `force` is set.
 */
import { CHAT_BUCKET, CHAT_SCHEMA, type ChatSupabase } from "../core/client";
import type { VideoProvider } from "./types";
import { parseChatUploadPassthrough } from "./upload";

export interface FakeVideoProviderOptions {
  /** A service-role client: it writes the bucket and calls `update_attachment`. */
  supabase: ChatSupabase;
  /** Where `handler` is mounted, e.g. `http://localhost:3000/api/chat/fake-video`. */
  uploadUrl: string;
  /** The `provider` value it stands in for. Default `mux`. */
  name?: "mux" | "cloudflare";
  /** Run even when NODE_ENV is `production`. */
  force?: boolean;
  /** NODE_ENV, read from `process.env` by default. */
  env?: string | undefined;
  /** How long `handler` waits for the message carrying the upload to arrive before answering 202 (default 10 s). */
  readyWaitMs?: number;
  newId?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

export interface FakeReadyOptions {
  durationMs?: number;
  /** A poster image already in the genesis-chat bucket. */
  posterPath?: string;
}

interface FakeUpload {
  passthrough: string | undefined;
  corsOrigin: string;
  /** Where the body was stored, once it was. */
  path?: string;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/** No attachment carries the upload yet: its message hasn't been sent. */
class NotSentYet extends Error {}

const nodeEnv = (): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;

export function fakeVideoProvider(options: FakeVideoProviderOptions): VideoProvider & {
  markReady(providerId: string, ready?: FakeReadyOptions): Promise<void>;
  handler(request: Request): Promise<Response>;
  playbackUrl(playbackId: string): Promise<string>;
} {
  const env = "env" in options ? options.env : nodeEnv();
  if (env === "production" && !options.force) {
    throw new Error("fakeVideoProvider is for development: it won't run with NODE_ENV=production (pass `force: true` to override)");
  }
  const name = options.name ?? "mux";
  const db = () => options.supabase.schema(CHAT_SCHEMA);
  const uploads = new Map<string, FakeUpload>();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fakeHls = (providerId: string) => `https://fake-video.invalid/${encodeURIComponent(providerId)}.m3u8`;

  async function find(providerId: string): Promise<{ id: string } | null> {
    const { data, error } = await db()
      .from("attachments")
      .select("id")
      .eq("provider", name)
      .eq("provider_id", providerId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`attachments: ${error.code ?? "error"}`);
    return (data as { id: string } | null) ?? null;
  }

  async function markReady(providerId: string, ready: FakeReadyOptions = {}): Promise<void> {
    const attachment = await find(providerId);
    if (!attachment) throw new NotSentYet(`fakeVideoProvider: no ${name} attachment with provider_id ${providerId} (is its message sent?)`);
    const { error } = await db().rpc("update_attachment", {
      p_attachment_id: attachment.id,
      p_patch: {
        status: "ready",
        playback_id: `fake-${providerId}`,
        url: fakeHls(providerId),
        transcript_status: "off",
        ...(typeof ready.durationMs === "number" ? { duration_ms: Math.round(ready.durationMs) } : {}),
        ...(ready.posterPath ? { poster_path: ready.posterPath } : {}),
      },
    });
    if (error) throw new Error(`update_attachment: ${error.code ?? "error"}`);
  }

  return {
    name,

    async createUpload({ corsOrigin, passthrough }) {
      const uploadId = `fake_${newId()}`;
      uploads.set(uploadId, { passthrough, corsOrigin });
      const url = new URL(options.uploadUrl);
      url.searchParams.set("id", uploadId);
      return { uploadId, url: url.toString() };
    },

    async remove(assetId) {
      const id = assetId.replace(/^fake-/, "");
      const path = uploads.get(id)?.path;
      uploads.delete(id);
      if (path) await options.supabase.storage.from(CHAT_BUCKET).remove([path]);
    },

    /** There is no webhook: `handler` (or `markReady`) does its work. */
    async handleWebhook() {
      return json(200, { ignored: "the fake provider has no webhook; call markReady" });
    },

    markReady,

    async playbackUrl(playbackId) {
      const path = uploads.get(playbackId.replace(/^fake-/, ""))?.path;
      if (!path) return fakeHls(playbackId.replace(/^fake-/, ""));
      const { data, error } = await options.supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new Error("fakeVideoProvider: couldn't sign the stored file");
      return data.signedUrl;
    },

    async handler(request) {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      const upload = uploads.get(id);
      const cors = { "access-control-allow-origin": upload?.corsOrigin ?? "*", vary: "origin" };
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { ...cors, "access-control-allow-methods": "PUT, OPTIONS", "access-control-allow-headers": "content-type, content-range", "access-control-max-age": "600" },
        });
      }
      if (request.method !== "PUT") return json(405, { error: "method not allowed" }, cors);
      if (!upload) return json(404, { error: "no such upload" }, cors);
      const binding = parseChatUploadPassthrough(upload.passthrough);
      const contentType = request.headers.get("content-type") ?? "video/mp4";
      const path = `${binding?.conversationId ?? "fake-video"}/${binding?.userId ?? "fake-video"}/${id}.${EXTENSIONS[contentType] ?? "mp4"}`;
      const body = await request.arrayBuffer();
      const { error } = await options.supabase.storage.from(CHAT_BUCKET).upload(path, body, { contentType, upsert: true });
      if (error) return json(502, { error: `storage: ${error.message}` }, cors);
      upload.path = path;
      // The message carrying it usually lands first; give it a moment when it hasn't.
      const deadline = Date.now() + (options.readyWaitMs ?? 10_000);
      for (;;) {
        try {
          await markReady(id);
          return json(200, { ok: true, providerId: id, path }, cors);
        } catch (e) {
          if (Date.now() >= deadline || !(e instanceof NotSentYet)) {
            return json(202, { stored: true, ready: false, providerId: id, path, error: e instanceof Error ? e.message : String(e) }, cors);
          }
          await sleep(500);
        }
      }
    },
  };
}
