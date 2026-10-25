/** @feat:chat */
import { describe, expect, it, vi } from "vitest";
import { createChatRunner, chatRunnerHandler, type ChatEffect, type ChatNotification, type Transcriber } from "../server";
import { fakeSupabase } from "./server-fakes";

const effect = (id: number, kind: string, payload: Record<string, unknown>, attempts = 1): ChatEffect => ({
  id,
  kind,
  key: `${kind}:${id}`,
  payload,
  attempts,
});

const target = (userId: string, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  conversation_id: "c1",
  title: null,
  sender_id: "ana",
  preview: "see you at 6",
  mentioned: false,
  unread_total: 3,
  ...over,
});

const names: Record<string, string> = { ana: "Ana" };

describe("createChatRunner: push", () => {
  it("delivers one notification per message with every recipient, titled by the sender in a direct conversation", async () => {
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => [effect(1, "push", { message_id: "m1", conversation_id: "c1" })],
        push_targets: () => [target("bo"), target("cy", { mentioned: true, unread_total: 7 })],
      },
      tables: { conversations: [{ id: "c1", kind: "direct" }] },
    });
    const deliver = vi.fn(async (_n: ChatNotification) => {});
    const runner = createChatRunner({ supabase: sb.client, deliver, resolveName: (id) => names[id] });
    expect(await runner.run()).toEqual({ claimed: 1, done: 1, failed: 0 });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]![0]).toEqual({
      category: "messages",
      messageId: "m1",
      conversationId: "c1",
      recipients: [
        { userId: "bo", badge: 3, mentioned: false },
        { userId: "cy", badge: 7, mentioned: true },
      ],
      title: "Ana",
      body: "see you at 6",
      senderId: "ana",
      collapseKey: "chat:c1",
      threadKey: "c1",
      idempotencyKey: "push:m1",
      data: { url: "/messages/c1", conversationId: "c1", messageId: "m1", seq: null },
    });
    // Only the kinds it handles are claimed; the effect is settled as done.
    expect(sb.rpcCalls[0]).toEqual({ fn: "claim_effects", args: { p_kinds: ["push", "transcribe", "storage.remove", "video.remove"], p_limit: 50 } });
    expect(sb.rpcCalls.at(-1)).toEqual({ fn: "complete_effect", args: { p_id: 1, p_error: null } });
  });

  it("titles a group by its title and prefixes the preview with the sender", async () => {
    const sb = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "push", { message_id: "m1" })], push_targets: () => [target("bo", { title: "Cohort 4" })] },
      tables: { conversations: [{ id: "c1", kind: "group" }] },
    });
    const deliver = vi.fn(async (_n: ChatNotification) => {});
    await createChatRunner({ supabase: sb.client, deliver, resolveName: (id) => names[id] }).run();
    expect(deliver.mock.calls[0]![0]).toMatchObject({ title: "Cohort 4", body: "Ana: see you at 6" });
  });

  it("opens the app's own route when a notification is tapped", async () => {
    const sb = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "push", { message_id: "m1" })], push_targets: () => [target("bo", { title: "Cohort 4" })] },
      tables: { conversations: [{ id: "c1", kind: "group" }] },
    });
    const deliver = vi.fn(async (_n: ChatNotification) => {});
    await createChatRunner({ supabase: sb.client, deliver, linkFor: (c, m) => `/inbox?c=${c}&m=${m}` }).run();
    expect(deliver.mock.calls[0]![0].data.url).toBe("/inbox?c=c1&m=m1");
  });

  it("settles a message with no targets as done without delivering", async () => {
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "push", { message_id: "m1" })], push_targets: () => [] } });
    const deliver = vi.fn(async () => {});
    expect(await createChatRunner({ supabase: sb.client, deliver }).run()).toEqual({ claimed: 1, done: 1, failed: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("settles a failed delivery with its error, and keeps working the others", async () => {
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => [effect(1, "push", { message_id: "m1" }), effect(2, "push", { message_id: "m2" }), effect(3, "storage.remove", { bucket: "genesis-chat", path: "c/u/a.jpg" })],
        push_targets: (a) => [target("bo", { conversation_id: String(a.p_message_id) })],
      },
    });
    const deliver = vi.fn(async (n: ChatNotification) => {
      if (n.messageId === "m1") throw new Error("push service down");
    });
    expect(await createChatRunner({ supabase: sb.client, deliver }).run()).toEqual({ claimed: 3, done: 2, failed: 1 });
    const settled = sb.rpcCalls.filter((c) => c.fn === "complete_effect").map((c) => c.args);
    expect(settled).toContainEqual({ p_id: 1, p_error: "push service down" });
    expect(settled).toContainEqual({ p_id: 2, p_error: null });
    expect(settled).toContainEqual({ p_id: 3, p_error: null });
  });

  it("caps effects of one kind in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => Array.from({ length: 10 }, (_, i) => effect(i, "push", { message_id: `m${i}` })),
        push_targets: () => [target("bo")],
      },
    });
    const deliver = async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };
    const report = await createChatRunner({ supabase: sb.client, deliver, batch: { concurrency: 3, limit: 10 } }).run();
    expect(report.done).toBe(10);
    expect(most).toBe(3);
  });

  it("claims only the kinds it was given", async () => {
    const sb = fakeSupabase({ rpc: { claim_effects: () => [] } });
    await createChatRunner({ supabase: sb.client, deliver: async () => {}, kinds: ["transcribe"] }).run();
    expect(sb.rpcCalls[0]!.args.p_kinds).toEqual(["transcribe"]);
  });
});

describe("createChatRunner: storage.remove and video.remove", () => {
  it("removes the file, and counts not found as done", async () => {
    const ok = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "storage.remove", { bucket: "genesis-chat", path: "c/u/a.jpg" })] } });
    expect(await createChatRunner({ supabase: ok.client, deliver: async () => {} }).run()).toMatchObject({ done: 1 });
    expect(ok.removed).toEqual([{ bucket: "genesis-chat", paths: ["c/u/a.jpg"] }]);

    const gone = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "storage.remove", { path: "c/u/b.jpg" })] },
      removeError: { message: "Object not found", statusCode: "404" },
    });
    expect(await createChatRunner({ supabase: gone.client, deliver: async () => {} }).run()).toMatchObject({ done: 1, failed: 0 });

    const down = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "storage.remove", { path: "c/u/b.jpg" })] },
      removeError: { message: "Internal", statusCode: "500" },
    });
    expect(await createChatRunner({ supabase: down.client, deliver: async () => {} }).run()).toMatchObject({ done: 0, failed: 1 });
  });

  it("removes a hosted video through the adapter, and is done without one", async () => {
    const remove = vi.fn(async () => {});
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "video.remove", { provider: "mux", provider_id: "asset1" })] } });
    await createChatRunner({ supabase: sb.client, deliver: async () => {}, video: { name: "mux", remove } }).run();
    expect(remove).toHaveBeenCalledWith("asset1");
    const none = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "video.remove", { provider: "mux", provider_id: "asset1" })] } });
    expect(await createChatRunner({ supabase: none.client, deliver: async () => {} }).run()).toMatchObject({ done: 1 });
  });
});

describe("createChatRunner: transcribe", () => {
  const voice = { id: "a1", kind: "voice", provider: "storage", path: "c/u/v.m4a", mime: "audio/mp4", duration_ms: 4200, transcript_status: "pending" };

  it("signs a 10 minute URL, transcribes it and stores the transcript", async () => {
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "transcribe", { attachment_id: "a1" })] }, tables: { attachments: [voice] } });
    const transcribe = vi.fn(async () => ({ text: "Running late, sorry" }));
    const transcriber: Transcriber = { name: "fake", transcribe };
    expect(await createChatRunner({ supabase: sb.client, deliver: async () => {}, transcriber }).run()).toMatchObject({ done: 1 });
    expect(sb.signed).toEqual(["c/u/v.m4a@600"]);
    expect(transcribe).toHaveBeenCalledWith({ url: "https://files.test/c/u/v.m4a?token=x", mime: "audio/mp4", durationMs: 4200, language: undefined });
    expect(sb.rpcCalls).toContainEqual({
      fn: "update_attachment",
      args: { p_attachment_id: "a1", p_patch: { transcript: "Running late, sorry", transcript_status: "ready" } },
    });
  });

  it("turns transcripts off without a transcriber", async () => {
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "transcribe", { attachment_id: "a1" })] }, tables: { attachments: [voice] } });
    expect(await createChatRunner({ supabase: sb.client, deliver: async () => {} }).run()).toMatchObject({ done: 1 });
    expect(sb.rpcCalls).toContainEqual({ fn: "update_attachment", args: { p_attachment_id: "a1", p_patch: { transcript_status: "off" } } });
  });

  it("retries a provider failure, and marks it failed on the last attempt", async () => {
    const transcriber: Transcriber = { name: "fake", transcribe: async () => Promise.reject(new Error("Deepgram answered HTTP 503")) };
    const early = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "transcribe", { attachment_id: "a1" }, 3)] }, tables: { attachments: [voice] } });
    expect(await createChatRunner({ supabase: early.client, deliver: async () => {}, transcriber }).run()).toMatchObject({ failed: 1 });
    expect(early.rpcCalls.filter((c) => c.fn === "update_attachment")).toEqual([]);
    expect(early.rpcCalls).toContainEqual({ fn: "complete_effect", args: { p_id: 1, p_error: "Deepgram answered HTTP 503" } });

    const last = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "transcribe", { attachment_id: "a1" }, 8)] }, tables: { attachments: [voice] } });
    expect(await createChatRunner({ supabase: last.client, deliver: async () => {}, transcriber }).run()).toMatchObject({ failed: 1 });
    expect(last.rpcCalls).toContainEqual({ fn: "update_attachment", args: { p_attachment_id: "a1", p_patch: { transcript_status: "failed" } } });
  });

  it("leaves a hosted video's transcript to its provider, and a deleted attachment alone", async () => {
    const sb = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "transcribe", { attachment_id: "v1" }), effect(2, "transcribe", { attachment_id: "gone" })] },
      tables: { attachments: [{ ...voice, id: "v1", kind: "video", provider: "mux", path: null }] },
    });
    const transcribe = vi.fn();
    expect(await createChatRunner({ supabase: sb.client, deliver: async () => {}, transcriber: { name: "fake", transcribe } }).run()).toMatchObject({ done: 2 });
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe("chatRunnerHandler", () => {
  const secret = "s".repeat(40);
  const runner = { run: vi.fn(async () => ({ claimed: 2, done: 2, failed: 0 })) };
  const handler = chatRunnerHandler({ runner, secret });

  it("rejects a missing or wrong secret without running", async () => {
    expect((await handler(new Request("https://app.test/api/chat-runner", { method: "POST" }))).status).toBe(401);
    const wrong = await handler(new Request("https://app.test/api/chat-runner", { method: "POST", headers: { authorization: `Bearer ${"t".repeat(40)}` } }));
    expect(wrong.status).toBe(401);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("runs with the right secret and answers the counts", async () => {
    const res = await handler(new Request("https://app.test/api/chat-runner", { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 2, done: 2, failed: 0 });
  });

  it("refuses everyone when the secret is too short", async () => {
    const weak = chatRunnerHandler({ runner, secret: "short" });
    expect((await weak(new Request("https://app.test/x", { method: "POST", headers: { authorization: "Bearer short" } }))).status).toBe(500);
  });
});
