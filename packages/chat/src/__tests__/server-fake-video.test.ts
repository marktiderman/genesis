/** @feat:chat The dev-only fake hosted video provider. */
import { describe, expect, it } from "vitest";
import { chatUploadPassthrough, createVideoUploadHandler, fakeVideoProvider } from "../server";
import { fakeSupabase, type Row } from "./server-fakes";

const CONV = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function setup(attachments: Row[] = [], over: { readyWaitMs?: number } = {}) {
  const tables = { attachments };
  const sb = fakeSupabase({ tables, rpc: { update_attachment: () => null } });
  const video = fakeVideoProvider({ supabase: sb.client, uploadUrl: "http://localhost:3000/dev/fake-video", env: "development", newId: () => "abc", sleep: async () => undefined, ...over });
  return { sb, video, tables };
}

describe("fakeVideoProvider", () => {
  it("refuses to run in production unless forced", () => {
    const sb = fakeSupabase({});
    expect(() => fakeVideoProvider({ supabase: sb.client, uploadUrl: "http://localhost/x", env: "production" })).toThrow(/production/);
    expect(() => fakeVideoProvider({ supabase: sb.client, uploadUrl: "http://localhost/x", env: "production", force: true })).not.toThrow();
  });

  it("mints a local upload URL and id through the usual upload handler", async () => {
    const { video } = setup();
    const handler = createVideoUploadHandler({ video, authorize: () => ({ userId: USER }), corsOrigin: "http://localhost:3000" });
    const res = await handler(new Request("http://localhost:3000/api/video-upload", { method: "POST", body: JSON.stringify({ conversationId: CONV }) }));
    expect(await res.json()).toEqual({ url: "http://localhost:3000/dev/fake-video?id=fake_abc", providerId: "fake_abc", provider: "mux" });
  });

  it("markReady does what Mux's ready webhook does: ready, a playback id and a fake HLS URL", async () => {
    const { sb, video } = setup([{ id: "att1", provider: "mux", provider_id: "fake_abc" }]);
    await video.markReady("fake_abc", { durationMs: 4200.4, posterPath: `${CONV}/${USER}/p.jpg` });
    expect(sb.rpcCalls).toEqual([
      {
        fn: "update_attachment",
        args: {
          p_attachment_id: "att1",
          p_patch: {
            status: "ready",
            playback_id: "fake-fake_abc",
            url: "https://fake-video.invalid/fake_abc.m3u8",
            transcript_status: "off",
            duration_ms: 4200,
            poster_path: `${CONV}/${USER}/p.jpg`,
          },
        },
      },
    ]);
  });

  it("says so when no message carries the upload yet", async () => {
    const { video } = setup();
    await expect(video.markReady("fake_nope")).rejects.toThrow(/is its message sent/);
  });

  it("its handler stores the PUT body in the genesis-chat bucket, then marks the attachment ready", async () => {
    const { sb, video } = setup([{ id: "att1", provider: "mux", provider_id: "fake_abc" }]);
    const { url } = await video.createUpload({ corsOrigin: "http://localhost:3000", passthrough: chatUploadPassthrough({ conversationId: CONV, userId: USER }) });
    const res = await video.handler(new Request(url, { method: "PUT", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "video/webm" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(sb.uploaded).toEqual([{ bucket: "genesis-chat", path: `${CONV}/${USER}/fake_abc.webm`, bytes: 3, contentType: "video/webm" }]);
    expect(sb.rpcCalls.map((c) => c.fn)).toEqual(["update_attachment"]);
    expect(await video.playbackUrl("fake-fake_abc")).toBe(`https://files.test/${CONV}/${USER}/fake_abc.webm?token=x`);
  });

  it("stores the body and answers 202 when the message hasn't arrived in time", async () => {
    const { sb, video } = setup([], { readyWaitMs: 0 });
    const { url } = await video.createUpload({ corsOrigin: "http://localhost:3000", passthrough: chatUploadPassthrough({ conversationId: CONV }) });
    const res = await video.handler(new Request(url, { method: "PUT", body: new Uint8Array([1]) }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ stored: true, ready: false, providerId: "fake_abc" });
    expect(sb.uploaded).toHaveLength(1);
  });

  it("answers a preflight, and refuses an unknown upload", async () => {
    const { video } = setup();
    expect((await video.handler(new Request("http://localhost:3000/dev/fake-video?id=x", { method: "OPTIONS" }))).status).toBe(204);
    expect((await video.handler(new Request("http://localhost:3000/dev/fake-video?id=x", { method: "PUT", body: "x" }))).status).toBe(404);
  });
});
