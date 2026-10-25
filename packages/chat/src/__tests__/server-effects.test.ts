/** @feat:chat The runner's phase 2–4 work: moderation and unfurl effects, scheduled posting, retention. */
import { describe, expect, it, vi } from "vitest";
import { createChatRunner, type ChatEffect, type LinkUnfurler, type Moderator } from "../server";
import { fakeSupabase } from "./server-fakes";

const effect = (id: number, kind: string, payload: Record<string, unknown>, attempts = 1): ChatEffect => ({ id, kind, key: `${kind}:${id}`, payload, attempts });
const deliver = async () => {};

describe("createChatRunner: moderate", () => {
  const message = { id: "m1", body: "you are useless", deleted_at: null };
  const photo = { id: "a1", message_id: "m1", kind: "image", provider: "storage", path: "c/u/p.jpg", mime: "image/jpeg" };
  const voice = { id: "a2", message_id: "m1", kind: "voice", provider: "storage", path: "c/u/v.m4a", mime: "audio/mp4" };

  it("claims moderate only with a moderator, sends text and signed photo URLs, and stores the verdict", async () => {
    const moderate = vi.fn(async () => ({ result: "hidden" as const, reason: "Automatic moderation: harassment 0.95" }));
    const moderator: Moderator = { name: "fake", moderate };
    const sb = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "moderate", { message_id: "m1" })] },
      tables: { messages: [message], attachments: [photo, voice] },
    });
    expect(await createChatRunner({ supabase: sb.client, deliver, moderator }).run()).toMatchObject({ claimed: 1, done: 1, failed: 0 });
    expect(sb.rpcCalls[0]!.args.p_kinds).toEqual(["push", "transcribe", "storage.remove", "video.remove", "moderate"]);
    expect(sb.signed).toEqual(["c/u/p.jpg@600"]);
    expect(moderate).toHaveBeenCalledWith({ text: "you are useless", imageUrls: ["https://files.test/c/u/p.jpg?token=x"] });
    expect(sb.rpcCalls).toContainEqual({
      fn: "moderate_message",
      args: { p_message_id: "m1", p_result: "hidden", p_reason: "Automatic moderation: harassment 0.95" },
    });
  });

  it("does not claim moderate without a moderator", async () => {
    const sb = fakeSupabase({ rpc: { claim_effects: () => [] } });
    await createChatRunner({ supabase: sb.client, deliver }).run();
    expect(sb.rpcCalls[0]!.args.p_kinds).not.toContain("moderate");
  });

  it("leaves a deleted message alone, and retries a provider failure", async () => {
    const moderate = vi.fn(async () => ({ result: "clean" as const }));
    const gone = fakeSupabase({
      rpc: { claim_effects: () => [effect(1, "moderate", { message_id: "m1" })] },
      tables: { messages: [{ ...message, deleted_at: "2026-10-25T00:00:00Z" }] },
    });
    expect(await createChatRunner({ supabase: gone.client, deliver, moderator: { name: "fake", moderate } }).run()).toMatchObject({ done: 1 });
    expect(moderate).not.toHaveBeenCalled();

    const down = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "moderate", { message_id: "m1" })] }, tables: { messages: [message] } });
    const failing: Moderator = { name: "fake", moderate: () => Promise.reject(new Error("OpenAI moderation answered HTTP 503")) };
    expect(await createChatRunner({ supabase: down.client, deliver, moderator: failing }).run()).toMatchObject({ failed: 1 });
    expect(down.rpcCalls).toContainEqual({ fn: "complete_effect", args: { p_id: 1, p_error: "OpenAI moderation answered HTTP 503" } });
    expect(down.rpcCalls.some((c) => c.fn === "moderate_message")).toBe(false);
  });
});

describe("createChatRunner: unfurl", () => {
  it("saves an ok preview with its fields", async () => {
    const unfurler: LinkUnfurler = {
      unfurl: vi.fn(async (url: string) => ({ url, status: "ok" as const, title: "Plan", description: "Week 3", imageUrl: "https://x.test/i.png", siteName: "X" })),
    };
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "unfurl", { url: "https://x.test/plan" })] } });
    expect(await createChatRunner({ supabase: sb.client, deliver, unfurler }).run()).toMatchObject({ done: 1 });
    expect(sb.rpcCalls[0]!.args.p_kinds).toContain("unfurl");
    expect(sb.rpcCalls).toContainEqual({
      fn: "save_link_preview",
      args: { p_url: "https://x.test/plan", p_status: "ok", p_title: "Plan", p_description: "Week 3", p_image_url: "https://x.test/i.png", p_site_name: "X" },
    });
  });

  it("saves blocked and failed statuses without fields", async () => {
    const unfurler: LinkUnfurler = { unfurl: async (url) => ({ url, status: "blocked", title: "should not be kept" }) };
    const sb = fakeSupabase({ rpc: { claim_effects: () => [effect(1, "unfurl", { url: "https://10.0.0.1/" })] } });
    await createChatRunner({ supabase: sb.client, deliver, unfurler }).run();
    expect(sb.rpcCalls).toContainEqual({
      fn: "save_link_preview",
      args: { p_url: "https://10.0.0.1/", p_status: "blocked", p_title: null, p_description: null, p_image_url: null, p_site_name: null },
    });
  });
});

describe("createChatRunner: scheduled messages", () => {
  it("posts each due message and counts posted and refused", async () => {
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => [],
        due_scheduled: () => ["s1", "s2", "s3"],
        post_scheduled: (a) => (a.p_id === "s2" ? null : `msg-${String(a.p_id)}`),
      },
    });
    const report = await createChatRunner({ supabase: sb.client, deliver }).run();
    expect(report.scheduled).toEqual({ due: 3, posted: 2, failed: 1 });
    expect(sb.rpcCalls).toContainEqual({ fn: "due_scheduled", args: { p_limit: 50 } });
    expect(sb.rpcCalls.filter((c) => c.fn === "post_scheduled").map((c) => c.args.p_id)).toEqual(["s1", "s2", "s3"]);
  });

  it("reports a failing due_scheduled without failing the run, and can be turned off", async () => {
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => [],
        due_scheduled: () => {
          throw new Error("42501");
        },
      },
    });
    const report = await createChatRunner({ supabase: sb.client, deliver }).run();
    expect(report).toMatchObject({ claimed: 0, scheduled: { due: 0, posted: 0, failed: 0 }, errors: ["due_scheduled: 42501"] });

    const off = fakeSupabase({ rpc: { claim_effects: () => [] } });
    const quiet = await createChatRunner({ supabase: off.client, deliver, scheduled: false }).run();
    expect(quiet.scheduled).toBeUndefined();
    expect(off.rpcCalls.some((c) => c.fn === "due_scheduled")).toBe(false);
  });
});

describe("createChatRunner: retention", () => {
  it("purges only when asked, in batches until a short one", async () => {
    const answers = [1000, 1000, 12];
    const sb = fakeSupabase({ rpc: { claim_effects: () => [], purge_expired: () => answers.shift() ?? 0 } });
    expect((await createChatRunner({ supabase: sb.client, deliver }).run()).purged).toBeUndefined();
    expect(sb.rpcCalls.some((c) => c.fn === "purge_expired")).toBe(false);

    const report = await createChatRunner({ supabase: sb.client, deliver, retention: true }).run();
    expect(report.purged).toBe(2012);
    expect(sb.rpcCalls.filter((c) => c.fn === "purge_expired").map((c) => c.args)).toEqual([{ p_limit: 1000 }, { p_limit: 1000 }, { p_limit: 1000 }]);
  });

  it("reports a purge failure", async () => {
    const sb = fakeSupabase({
      rpc: {
        claim_effects: () => [],
        purge_expired: () => {
          throw new Error("57014");
        },
      },
    });
    expect(await createChatRunner({ supabase: sb.client, deliver, retention: true, scheduled: false }).run()).toMatchObject({ purged: 0, errors: ["purge_expired: 57014"] });
  });
});
