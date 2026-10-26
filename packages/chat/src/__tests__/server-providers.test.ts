/** @feat:chat */
import { createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createExpoDeliver,
  deadTokens,
  deepgramTranscriber,
  chatUploadPassthrough,
  muxPlaybackUrl,
  muxVideo,
  openAiTranscriber,
  verifyMuxSignature,
  type ChatNotification,
} from "../server";
import { fakeFetch, fakeSupabase, jsonResponse } from "./server-fakes";

const SECRET = "mux-webhook-secret";
const NOW = 1_761_400_000_000;
const sign = (body: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("verifyMuxSignature", () => {
  const body = JSON.stringify({ type: "video.asset.ready", data: { id: "asset1" } });
  const t = Math.floor(NOW / 1000);

  it("accepts a valid signature", async () => {
    expect(await verifyMuxSignature(sign(body, t), body, SECRET, { now: NOW })).toBe(true);
  });
  it("refuses a tampered body or a wrong secret", async () => {
    expect(await verifyMuxSignature(sign(body, t), body.replace("asset1", "asset2"), SECRET, { now: NOW })).toBe(false);
    expect(await verifyMuxSignature(sign(body, t, "other"), body, SECRET, { now: NOW })).toBe(false);
    expect(await verifyMuxSignature(null, body, SECRET, { now: NOW })).toBe(false);
  });
  it("refuses a stale timestamp (over 5 minutes)", async () => {
    expect(await verifyMuxSignature(sign(body, t - 301), body, SECRET, { now: NOW })).toBe(false);
    expect(await verifyMuxSignature(sign(body, t - 299), body, SECRET, { now: NOW })).toBe(true);
  });
});

describe("muxVideo", () => {
  const mux = (f = fakeFetch(() => jsonResponse({}))) =>
    muxVideo({ tokenId: "id", tokenSecret: "secret", webhookSecret: SECRET, fetch: f.fetch, now: () => NOW });
  const webhook = (event: unknown, header?: string) => {
    const body = JSON.stringify(event);
    return new Request("https://app.test/api/mux", { method: "POST", body, headers: { "mux-signature": header ?? sign(body, Math.floor(NOW / 1000)) } });
  };
  const CONV = "2d8f2e4a-6b3c-4e5b-9c73-8b2b4d2f6c33";
  const OTHER_CONV = "4fab4a6c-8d5e-4a7d-9e95-ad4d6f4b8e55";
  const SENDER = "5abc5b7d-9e6f-4b8e-8fa6-be5e7a5c9f66";
  const pendingVideo = {
    id: "0b6f0c2e-4f1a-4c39-9a51-6f0f2b0d4a11",
    conversation_id: CONV,
    message_id: "m1",
    provider: "mux",
    provider_id: "upload1",
    playback_id: null,
    transcript_status: "pending",
  };
  const bound = chatUploadPassthrough({ conversationId: CONV });

  it("creates a direct upload with captions and the passthrough", async () => {
    const f = fakeFetch(() => jsonResponse({ data: { id: "upload1", url: "https://storage.mux.test/u" } }, 201));
    expect(await mux(f).createUpload({ corsOrigin: "https://app.test", passthrough: "att1" })).toEqual({ uploadId: "upload1", url: "https://storage.mux.test/u" });
    expect(f.calls[0]!.url).toBe("https://api.mux.com/video/v1/uploads");
    expect((f.calls[0]!.init!.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("id:secret")}`);
    expect(JSON.parse(String(f.calls[0]!.init!.body))).toEqual({
      cors_origin: "https://app.test",
      new_asset_settings: {
        playback_policies: ["public"],
        video_quality: "basic",
        passthrough: "att1",
        inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
      },
    });
  });

  it("removes an asset, and counts 404 as removed", async () => {
    const f = fakeFetch(() => new Response(null, { status: 404 }));
    await expect(mux(f).remove("asset1")).resolves.toBeUndefined();
    expect(f.calls[0]).toMatchObject({ url: "https://api.mux.com/video/v1/assets/asset1", init: { method: "DELETE" } });
    await expect(mux(fakeFetch(() => new Response(null, { status: 500 }))).remove("a")).rejects.toThrow("HTTP 500");
  });

  it("refuses a webhook with a bad signature", async () => {
    const sb = fakeSupabase({ tables: { attachments: [pendingVideo] } });
    const res = await mux().handleWebhook(webhook({ type: "video.asset.ready", data: {} }, "t=1,v1=00"), { supabase: sb.client });
    expect(res.status).toBe(401);
    expect(sb.rpcCalls).toEqual([]);
  });

  it("marks the attachment ready on video.asset.ready, found by upload id", async () => {
    const sb = fakeSupabase({ tables: { attachments: [pendingVideo] } });
    const res = await mux().handleWebhook(
      webhook({
        type: "video.asset.ready",
        data: { id: "asset1", upload_id: "upload1", passthrough: bound, duration: 12.345, playback_ids: [{ id: "play1", policy: "public" }] },
      }),
      { supabase: sb.client },
    );
    expect(res.status).toBe(200);
    expect(sb.rpcCalls).toEqual([
      {
        fn: "update_attachment",
        args: { p_attachment_id: pendingVideo.id, p_patch: { status: "ready", provider_id: "asset1", playback_id: "play1", duration_ms: 12345 } },
      },
    ]);
  });

  it("marks it failed on video.asset.errored", async () => {
    const sb = fakeSupabase({ tables: { attachments: [pendingVideo] } });
    await mux().handleWebhook(webhook({ type: "video.asset.errored", data: { id: "asset1", upload_id: "upload1", passthrough: bound } }), {
      supabase: sb.client,
    });
    expect(sb.rpcCalls[0]!.args).toEqual({ p_attachment_id: pendingVideo.id, p_patch: { status: "failed", provider_id: "asset1" } });
  });

  it("never finds an attachment by passthrough: a passthrough naming another attachment swaps nothing", async () => {
    // The attacker's own upload (upload2) carries the victim attachment's id as passthrough.
    const sb = fakeSupabase({ tables: { attachments: [pendingVideo] } });
    const ready = (data: Record<string, unknown>) =>
      mux().handleWebhook(webhook({ type: "video.asset.ready", data: { id: "asset-evil", playback_ids: [{ id: "evil", policy: "public" }], ...data } }), {
        supabase: sb.client,
      });
    expect((await ready({ upload_id: "upload2", passthrough: pendingVideo.id })).status).toBe(404);
    expect(sb.rpcCalls).toEqual([]);
  });

  it("applies an event only when its passthrough names the attachment's conversation and sender", async () => {
    const sb = fakeSupabase({ tables: { attachments: [pendingVideo], messages: [{ id: "m1", sender_id: SENDER }] } });
    const ready = (passthrough: string | undefined) =>
      mux().handleWebhook(webhook({ type: "video.asset.ready", data: { id: "asset1", upload_id: "upload1", passthrough } }), { supabase: sb.client });
    // An upload minted for another conversation, someone else's, or not by the upload handler at all.
    expect((await ready(chatUploadPassthrough({ conversationId: OTHER_CONV }))).status).toBe(409);
    expect((await ready(chatUploadPassthrough({ conversationId: CONV, userId: "6bcd6c8e-af70-4c9f-9ab7-cf6f8b6daa77" }))).status).toBe(409);
    expect((await ready(pendingVideo.id)).status).toBe(409);
    expect((await ready(undefined)).status).toBe(409);
    expect(sb.rpcCalls).toEqual([]);
    expect((await ready(chatUploadPassthrough({ conversationId: CONV, userId: SENDER }))).status).toBe(200);
    expect(sb.rpcCalls).toHaveLength(1);
  });

  it("answers 404 for an unknown attachment so Mux retries", async () => {
    const sb = fakeSupabase({ tables: { attachments: [] } });
    const res = await mux().handleWebhook(webhook({ type: "video.asset.ready", data: { id: "x", upload_id: "nope" } }), { supabase: sb.client });
    expect(res.status).toBe(404);
  });

  it("keeps generated captions as the transcript", async () => {
    const ready = { ...pendingVideo, provider_id: "asset1", playback_id: "play1" };
    const sb = fakeSupabase({ tables: { attachments: [ready] } });
    const f = fakeFetch(() => new Response("Hello from the gym.\n"));
    const res = await mux(f).handleWebhook(
      webhook({ type: "video.asset.track.ready", data: { id: "track1", asset_id: "asset1", type: "text", text_source: "generated_vod" } }),
      { supabase: sb.client },
    );
    expect(res.status).toBe(200);
    expect(f.calls[0]!.url).toBe("https://stream.mux.com/play1/text/track1.txt");
    expect(sb.rpcCalls[0]!.args).toEqual({ p_attachment_id: ready.id, p_patch: { transcript: "Hello from the gym.", transcript_status: "ready" } });
  });

  it("signs playback URLs with RS256 (Mux's base64 PKCS#1 key)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const url = await muxPlaybackUrl("play1", { signingKeyId: "kid1", privateKey: btoa(pem) }, { now: NOW, expiresInSeconds: 60 });
    const token = new URL(url).searchParams.get("token")!;
    expect(url.startsWith("https://stream.mux.com/play1.m3u8?token=")).toBe(true);
    const [h, c, s] = token.split(".");
    const decode = (x: string) => JSON.parse(Buffer.from(x, "base64url").toString());
    expect(decode(h!)).toEqual({ alg: "RS256", typ: "JWT", kid: "kid1" });
    expect(decode(c!)).toEqual({ sub: "play1", aud: "v", exp: Math.floor(NOW / 1000) + 60 });
    const ok = verify("RSA-SHA256", Buffer.from(`${h}.${c}`), createPublicKey(publicKey.export({ type: "spki", format: "pem" })), Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("transcribers", () => {
  const input = { url: "https://files.test/v.m4a?token=x", mime: "audio/mp4", durationMs: 4000 };

  it("Deepgram: posts the URL and reads the first alternative", async () => {
    const f = fakeFetch(() => jsonResponse({ results: { channels: [{ detected_language: "en", alternatives: [{ transcript: " Hi there. " }] }] } }));
    expect(await deepgramTranscriber({ apiKey: "dg", fetch: f.fetch }).transcribe(input)).toEqual({ text: "Hi there.", language: "en" });
    expect(f.calls[0]!.url).toBe("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true");
    expect((f.calls[0]!.init!.headers as Record<string, string>).authorization).toBe("Token dg");
    expect(JSON.parse(String(f.calls[0]!.init!.body))).toEqual({ url: input.url });
    await expect(deepgramTranscriber({ apiKey: "dg", fetch: fakeFetch(() => new Response("no", { status: 402 })).fetch }).transcribe(input)).rejects.toThrow("HTTP 402");
  });

  it("OpenAI: downloads the file and posts it as multipart", async () => {
    const f = fakeFetch((url) => (url.startsWith("https://files.test") ? new Response(new Uint8Array([1, 2, 3])) : jsonResponse({ text: "Hi." })));
    expect(await openAiTranscriber({ apiKey: "sk", fetch: f.fetch }).transcribe(input)).toEqual({ text: "Hi.", language: undefined });
    const form = f.calls[1]!.init!.body as FormData;
    expect(f.calls[1]!.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect((form.get("file") as File).name).toBe("audio.m4a");
  });
});

describe("createExpoDeliver", () => {
  const notification: ChatNotification = {
    category: "messages",
    messageId: "m1",
    conversationId: "c1",
    recipients: [
      { userId: "bo", badge: 2, mentioned: false },
      { userId: "cy", badge: 5, mentioned: true },
    ],
    title: "Ana",
    body: "see you",
    senderId: "ana",
    collapseKey: "chat:c1",
    threadKey: "c1",
    idempotencyKey: "push:m1",
    data: { url: "/messages/c1", conversationId: "c1", messageId: "m1", seq: 7 },
  };

  it("sends in chunks of 100 with badges, thread and collapse ids, and returns the tickets", async () => {
    const devices = Array.from({ length: 250 }, (_, i) => ({ userId: i % 2 ? "cy" : "bo", token: `ExponentPushToken[${i}]` }));
    const f = fakeFetch((_url, init) => {
      const batch = JSON.parse(String(init!.body)) as { to: string }[];
      return jsonResponse({ data: batch.map((m) => (m.to === "ExponentPushToken[7]" ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `t-${m.to}` })) });
    });
    const deliver = createExpoDeliver({ tokensFor: async () => devices, fetch: f.fetch, accessToken: "expo", collapse: true });
    const tickets = await deliver(notification);
    expect(f.calls.map((c) => (JSON.parse(String(c.init!.body)) as unknown[]).length)).toEqual([100, 100, 50]);
    const first = (JSON.parse(String(f.calls[0]!.init!.body)) as Record<string, unknown>[])[1];
    expect(first).toEqual({
      to: "ExponentPushToken[1]",
      title: "Ana",
      body: "see you",
      data: notification.data,
      sound: "default",
      badge: 5,
      threadId: "c1",
      collapseId: "chat:c1",
      channelId: "messages",
      categoryId: "messages",
    });
    expect((f.calls[0]!.init!.headers as Record<string, string>).authorization).toBe("Bearer expo");
    expect(tickets).toHaveLength(250);
    expect(deadTokens(tickets)).toEqual(["ExponentPushToken[7]"]);
  });

  it("throws when nothing was sent, so the push is retried", async () => {
    const deliver = createExpoDeliver({ tokensFor: async () => [{ userId: "bo", token: "t" }], fetch: fakeFetch(() => new Response(null, { status: 503 })).fetch });
    await expect(deliver(notification)).rejects.toThrow("HTTP 503");
  });
});
