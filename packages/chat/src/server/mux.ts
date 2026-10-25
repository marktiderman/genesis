// @feat:chat
/**
 * Mux Video behind `VideoProvider` (https://www.mux.com/docs):
 *
 *   createUpload   POST /video/v1/uploads: a direct upload, its asset with English
 *                  auto-generated captions and the attachment's id as passthrough
 *   remove         DELETE /video/v1/assets/{id}; 404 counts as removed
 *   handleWebhook  verifies `mux-signature` (HMAC-SHA256 of `t.body`, 5 minutes'
 *                  tolerance) and applies:
 *                    video.asset.ready         status ready, provider_id = asset id,
 *                                              playback_id, duration_ms
 *                    video.asset.errored       status failed
 *                    video.asset.track.ready   a generated text track: its plain
 *                                              text becomes the transcript
 *                    video.asset.track.errored a generated text track: transcript failed
 *
 * The attachment is found by passthrough (its id) or by provider_id (the upload
 * id the client sent with it, or the asset id once ready). An event for an
 * attachment not there yet answers 404, so Mux retries it.
 */
import { CHAT_SCHEMA, type ChatSupabase } from "../core/client";
import { hmacSha256Hex, importRsaPrivateKey, safeEqual, signJwtRs256 } from "./crypto";
import type { VideoProvider } from "./types";

const API = "https://api.mux.com/video/v1";
const TOLERANCE_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MuxSigningKey {
  /** The signing key's id (`kid`). */
  signingKeyId: string;
  /** The private key as Mux gives it: base64 of a PEM. A PEM works too. */
  privateKey: string;
}

export interface MuxVideoOptions {
  tokenId: string;
  tokenSecret: string;
  /** The webhook endpoint's signing secret (Settings → Webhooks). */
  webhookSecret: string;
  /** `public` (default) or `signed`; signed playback needs `signing` to build URLs. */
  playbackPolicy?: "public" | "signed" | undefined;
  /** Mux's auto-generated captions, kept as the transcript (default English; false turns them off). */
  captions?: { languageCode?: string; name?: string } | false | undefined;
  /** For signed playback: fetching generated captions as the transcript. */
  signing?: MuxSigningKey | undefined;
  /** Mux `video_quality` (default `basic`). */
  videoQuality?: "basic" | "plus" | "premium" | undefined;
  fetch?: typeof fetch | undefined;
  now?: (() => number) | undefined;
}

/** Verifies a `mux-signature` header (`t=<unix>,v1=<hex>`) over the raw body. */
export async function verifyMuxSignature(
  header: string | null,
  body: string,
  secret: string,
  options: { now?: number; toleranceSeconds?: number } = {},
): Promise<boolean> {
  if (!header || !secret) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s.trim());
    if (k === "t" && v) timestamp = v;
    else if (k === "v1" && v) signatures.push(v.toLowerCase());
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return false;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > (options.toleranceSeconds ?? TOLERANCE_SECONDS)) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`);
  let ok = false;
  for (const signature of signatures) if (await safeEqual(signature, expected)) ok = true;
  return ok;
}

/**
 * A signed playback URL (RS256 JWT with `sub` = playback id, `aud` = v, `kid`
 * in the header), valid for `expiresInSeconds` (default 6 hours).
 */
export async function muxPlaybackUrl(
  playbackId: string,
  key: MuxSigningKey,
  options: { expiresInSeconds?: number; now?: number; path?: string } = {},
): Promise<string> {
  const token = await muxPlaybackToken(playbackId, key, options);
  return `https://stream.mux.com/${playbackId}${options.path ?? ".m3u8"}?token=${token}`;
}

export async function muxPlaybackToken(
  playbackId: string,
  key: MuxSigningKey,
  options: { expiresInSeconds?: number; now?: number; audience?: "v" | "t" | "g" | "s" } = {},
): Promise<string> {
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const privateKey = await importRsaPrivateKey(key.privateKey);
  return signJwtRs256(
    { kid: key.signingKeyId },
    { sub: playbackId, aud: options.audience ?? "v", exp: now + (options.expiresInSeconds ?? 6 * 3600) },
    privateKey,
  );
}

interface MuxEvent {
  type?: string;
  data?: {
    id?: string;
    asset_id?: string;
    upload_id?: string;
    passthrough?: string;
    duration?: number;
    playback_ids?: { id?: string; policy?: string }[];
    type?: string;
    text_source?: string;
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function muxVideo(options: MuxVideoOptions): VideoProvider & {
  playbackUrl(playbackId: string, opts?: { expiresInSeconds?: number }): Promise<string>;
} {
  const fetchFn = options.fetch ?? fetch;
  const policy = options.playbackPolicy ?? "public";
  const captions = options.captions === false ? null : { languageCode: options.captions?.languageCode ?? "en", name: options.captions?.name ?? "English (auto)" };
  const auth = `Basic ${btoa(`${options.tokenId}:${options.tokenSecret}`)}`;

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    return fetchFn(`${API}${path}`, {
      method,
      headers: { authorization: auth, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  }

  async function update(supabase: ChatSupabase, id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.schema(CHAT_SCHEMA).rpc("update_attachment", { p_attachment_id: id, p_patch: patch });
    if (error) throw new Error(`update_attachment: ${error.code ?? "error"}`);
  }

  /** The attachment an event is about, by passthrough (its id) or provider_id. */
  async function find(supabase: ChatSupabase, ids: { passthrough?: string | undefined; providerIds: (string | undefined)[] }) {
    const table = () => supabase.schema(CHAT_SCHEMA).from("attachments").select("id, playback_id, transcript_status").eq("provider", "mux");
    if (ids.passthrough && UUID.test(ids.passthrough)) {
      const { data, error } = await table().eq("id", ids.passthrough).maybeSingle();
      if (error) throw new Error(`attachments: ${error.code ?? "error"}`);
      if (data) return data as { id: string; playback_id: string | null; transcript_status: string | null };
    }
    for (const providerId of ids.providerIds) {
      if (!providerId) continue;
      const { data, error } = await table().eq("provider_id", providerId).limit(1).maybeSingle();
      if (error) throw new Error(`attachments: ${error.code ?? "error"}`);
      if (data) return data as { id: string; playback_id: string | null; transcript_status: string | null };
    }
    return null;
  }

  async function transcriptOf(playbackId: string, trackId: string): Promise<string | null> {
    let url = `https://stream.mux.com/${playbackId}/text/${trackId}.txt`;
    if (policy === "signed") {
      if (!options.signing) return null;
      url += `?token=${await muxPlaybackToken(playbackId, options.signing, { expiresInSeconds: 600 })}`;
    }
    const response = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Mux text track answered HTTP ${response.status}`);
    }
    return (await response.text()).trim();
  }

  return {
    name: "mux",

    async createUpload({ corsOrigin, passthrough }) {
      const response = await api("POST", "/uploads", {
        cors_origin: corsOrigin,
        new_asset_settings: {
          playback_policies: [policy],
          video_quality: options.videoQuality ?? "basic",
          ...(passthrough ? { passthrough: passthrough.slice(0, 255) } : {}),
          ...(captions ? { inputs: [{ generated_subtitles: [{ language_code: captions.languageCode, name: captions.name }] }] } : {}),
        },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`Mux uploads answered HTTP ${response.status}`);
      }
      const body = (await response.json()) as { data?: { id?: string; url?: string } };
      if (!body.data?.id || !body.data.url) throw new Error("Mux uploads answered without an upload");
      return { uploadId: body.data.id, url: body.data.url };
    },

    async remove(assetId) {
      const response = await api("DELETE", `/assets/${encodeURIComponent(assetId)}`);
      await response.body?.cancel().catch(() => {});
      if (response.ok || response.status === 404) return;
      throw new Error(`Mux delete asset answered HTTP ${response.status}`);
    },

    playbackUrl(playbackId, opts) {
      if (policy !== "signed") return Promise.resolve(`https://stream.mux.com/${playbackId}.m3u8`);
      if (!options.signing) return Promise.reject(new Error("muxVideo: signed playback needs `signing`"));
      return muxPlaybackUrl(playbackId, options.signing, opts);
    },

    async handleWebhook(request, { supabase }) {
      if (request.method !== "POST") return json(405, { error: "method not allowed" });
      const body = await request.text();
      const ok = await verifyMuxSignature(request.headers.get("mux-signature"), body, options.webhookSecret, {
        ...(options.now ? { now: options.now() } : {}),
      });
      if (!ok) return json(401, { error: "bad signature" });
      let event: MuxEvent;
      try {
        event = JSON.parse(body) as MuxEvent;
      } catch {
        return json(400, { error: "bad json" });
      }
      const data = event.data ?? {};
      switch (event.type) {
        case "video.asset.ready":
        case "video.asset.errored": {
          const attachment = await find(supabase, { passthrough: data.passthrough, providerIds: [data.upload_id, data.id] });
          if (!attachment) return json(404, { error: "attachment not found" });
          if (event.type === "video.asset.errored") {
            await update(supabase, attachment.id, { status: "failed", ...(data.id ? { provider_id: data.id } : {}) });
          } else {
            const playback = data.playback_ids?.find((p) => p.policy === policy) ?? data.playback_ids?.[0];
            await update(supabase, attachment.id, {
              status: "ready",
              ...(data.id ? { provider_id: data.id } : {}),
              ...(playback?.id ? { playback_id: playback.id } : {}),
              ...(typeof data.duration === "number" ? { duration_ms: Math.round(data.duration * 1000) } : {}),
              // No captions asked for: nothing will fill the transcript.
              ...(!captions ? { transcript_status: "off" } : {}),
            });
          }
          return json(200, { ok: true });
        }
        case "video.asset.track.ready":
        case "video.asset.track.errored": {
          if (data.type !== "text" || data.text_source !== "generated_vod") return json(200, { ignored: true });
          const attachment = await find(supabase, { providerIds: [data.asset_id] });
          if (!attachment) return json(404, { error: "attachment not found" });
          if (event.type === "video.asset.track.errored") {
            await update(supabase, attachment.id, { transcript_status: "failed" });
            return json(200, { ok: true });
          }
          // The asset's ready event comes first; until it has, Mux retries this one.
          if (!attachment.playback_id || !data.id) return json(404, { error: "no playback id yet" });
          const text = await transcriptOf(attachment.playback_id, data.id);
          if (text === null) return json(200, { ignored: "signed playback without a signing key" });
          await update(supabase, attachment.id, { transcript: text.slice(0, 100_000), transcript_status: "ready" });
          return json(200, { ok: true });
        }
        default:
          return json(200, { ignored: true });
      }
    },
  };
}
