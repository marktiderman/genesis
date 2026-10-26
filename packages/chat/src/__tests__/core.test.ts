/** @feat:chat */
import { describe, expect, it } from "vitest";
import { fileExtension, isAllowedExtension, waveformPeaks, waveformFromMetering, formatDuration, nextPlaybackRate } from "../core/media";
import { mergeThread, startsGroup, parseMentions, previewText, summarizeReactions, activityLine, currentActivity } from "../core/thread";
import type { ChatMessage, PendingMessage } from "../core/types";

const msg = (seq: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${seq}`, conversationId: "c", seq, clientId: `k${seq}`, senderId: "a", senderRole: "member", kind: "text",
  body: `hi ${seq}`, mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null,
  visibility: "everyone", silent: false, meta: {}, createdAt: new Date(2026, 9, 25, 10, seq).toISOString(),
  editedAt: null, deletedAt: null, attachments: [], reactions: [], ...over,
});
const pending = (clientId: string): PendingMessage => ({
  clientId, input: { conversationId: "c", clientId, body: "x" }, senderId: "a", createdAt: new Date(2026, 9, 25, 11).toISOString(), status: "sending",
});

describe("media", () => {
  it("stores files under a safe extension and refuses pages", () => {
    expect(fileExtension("note", "audio/mp4")).toBe("m4a");
    expect(fileExtension("photo.JPG", "")).toBe("jpg");
    expect(isAllowedExtension("svg")).toBe(false);
    expect(isAllowedExtension("html")).toBe(false);
    expect(isAllowedExtension("webm")).toBe(true);
  });
  it("draws a waveform from samples or a level meter", () => {
    const p = waveformPeaks([0, 0.5, -1, 0.25], 2);
    expect(p).toEqual([50, 100]);
    expect(waveformPeaks([], 4)).toEqual([0, 0, 0, 0]);
    expect(waveformFromMetering([-160, -160], 2)).toEqual([0, 0]);
    expect(waveformFromMetering([0, -6], 2)[0]).toBe(100);
  });
  it("formats durations and cycles playback speed", () => {
    expect(formatDuration(42_000)).toBe("0:42");
    expect(formatDuration(3_909_000)).toBe("1:05:09");
    expect(nextPlaybackRate(1)).toBe(1.5);
    expect(nextPlaybackRate(2)).toBe(1);
  });
});

describe("thread", () => {
  it("never shows a message twice once the server has it", () => {
    const items = mergeThread([msg(2), msg(1)], [pending("k2"), pending("new")]);
    expect(items.map((i) => (i.type === "message" ? i.message.id : i.pending.clientId))).toEqual(["m1", "m2", "new"]);
  });
  it("groups a run from one sender", () => {
    const items = mergeThread([msg(1), msg(2), msg(3, { senderId: "b" })], []);
    expect([0, 1, 2].map((i) => startsGroup(items, i))).toEqual([true, false, true]);
  });
  it("reads mentions and previews", () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    expect(parseMentions(`hey @[Sam](user:${id})`)).toEqual([id]);
    expect(previewText(`hey @[Sam](user:${id}) **now**`, null)).toBe("hey @Sam now");
    expect(previewText("", "voice")).toBe("Voice message");
    expect(previewText("x", "image", true)).toBe("Message deleted");
  });
  it("counts reactions and says who is typing", () => {
    const m = msg(1, { reactions: [{ emoji: "👍", userId: "a" }, { emoji: "🔥", userId: "b" }, { emoji: "🔥", userId: "c" }] });
    expect(summarizeReactions(m, "a").map((r) => [r.emoji, r.count, r.mine])).toEqual([["🔥", 2, false], ["👍", 1, true]]);
    const now = Date.now();
    const act = currentActivity([{ userId: "b", activity: "typing", at: now - 10_000 }, { userId: "c", activity: "recording-voice", at: now }], now);
    expect(activityLine(act, (u) => u.toUpperCase())).toBe("C is recording a voice message…");
  });
});

import { belongsTo } from "../react";
describe("a sent message lands in the lists it belongs to", () => {
  const m = msg(3, { conversationId: "c1", threadRootId: null, topic: "lesson-1" });
  it("matches the main timeline and its topic, not another thread or conversation", () => {
    expect(belongsTo(["genesis-chat", "conversation", "c1", "messages", null, null], m)).toBe(true);
    expect(belongsTo(["genesis-chat", "conversation", "c1", "messages", null, "lesson-1"], m)).toBe(true);
    expect(belongsTo(["genesis-chat", "conversation", "c1", "messages", null, "lesson-2"], m)).toBe(false);
    expect(belongsTo(["genesis-chat", "conversation", "c1", "messages", "root-1", null], m)).toBe(false);
    expect(belongsTo(["genesis-chat", "conversation", "c2", "messages", null, null], m)).toBe(false);
    expect(belongsTo(["genesis-chat", "conversation", "c1"], m)).toBe(false);
  });
});

import { createChatClient } from "../core/client";
describe("inbox kinds", () => {
  it("passes kinds and excluded kinds to the inbox and the badge", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const supabase = { schema: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => (calls.push([fn, args]), { data: fn === "inbox" ? [] : 0, error: null }) }) } as never;
    const chat = createChatClient(supabase);
    await chat.inbox({ excludeKinds: ["support"] });
    await chat.unreadTotal({ excludeKinds: ["support"] });
    await chat.inbox();
    expect(calls[0]![1]).toMatchObject({ p_exclude_kinds: ["support"] });
    expect(calls[1]).toEqual(["unread_total", { p_exclude_kinds: ["support"] }]);
    expect(calls[2]![1]).not.toHaveProperty("p_exclude_kinds");
  });
});
