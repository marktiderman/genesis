/** @feat:chat */
import { describe, expect, it, vi } from "vitest";
import { awayLine, awaySummary, namesLine, hoursSummary, isAway, isWithinWorkingHours, localClock, timeZoneLabel } from "../core/availability";
import {
  createChatClient,
  toAvailability,
  toLinkPreview,
  toMessage,
  toScheduled,
  toSearchHit,
  toTopic,
  type ChatSupabase,
} from "../core/client";
import { extractLinks, isHttpsUrl, isSchedulable, scheduleQuickPicks, snippetParts, topicKey } from "../core/extras";
import { createOutbox, type OutboxStore, type QueuedMessage } from "../core/outbox";
import type { ChatAvailability, WorkingHours } from "../core/types";

/** A supabase-js stand-in: records every rpc and table read, and answers from `answers`. */
function fakeSupabase(answers: Record<string, unknown> = {}) {
  const calls: { kind: "rpc" | "from"; name: string; args?: unknown; filters: [string, ...unknown[]][] }[] = [];
  const builder = (name: string) => {
    const call = { kind: "from" as const, name, filters: [] as [string, ...unknown[]][] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "neq", "gt", "lt"]) {
      b[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args]);
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: answers[`${name}:single`] ?? null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data: answers[name] ?? [], error: null });
    return b;
  };
  const supabase = {
    schema: () => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ kind: "rpc", name: fn, args, filters: [] });
        const a = answers[fn];
        return a instanceof Error ? { data: null, error: { message: a.message, code: "42501" } } : { data: a ?? null, error: null };
      },
      from: builder,
    }),
  } as unknown as ChatSupabase;
  return { supabase, calls };
}

describe("mappers for 0002", () => {
  it("reads moderation on a message, and nothing else as moderation", () => {
    const base = { id: "m", conversation_id: "c", seq: 1, client_id: "x", sender_role: "member", created_at: "2026-01-01T00:00:00Z" };
    expect(toMessage({ ...base, moderation: "hidden" }).moderation).toBe("hidden");
    expect(toMessage({ ...base, moderation: "flagged" }).moderation).toBe("flagged");
    expect(toMessage({ ...base, moderation: "weird" }).moderation).toBeNull();
    expect(toMessage(base).moderation).toBeNull();
  });

  it("maps topics, scheduled messages (with their status), availability, hits and previews", () => {
    expect(toTopic({ conversation_id: "c", topic: "w1", title: "Week 1", position: 2, closed_at: null, created_by: "u", created_at: "t" })).toEqual({
      conversationId: "c", topic: "w1", title: "Week 1", position: 2, closedAt: null, createdBy: "u", createdAt: "t",
    });
    const row = { id: "s", conversation_id: "c", client_id: "k", body: "hi", attachments: [{ kind: "file", path: "c/u/a.pdf", duration_ms: 5 }], send_at: "2026-02-01T09:00:00Z", created_at: "t" };
    const s = toScheduled(row);
    expect(s).toMatchObject({ id: "s", status: "scheduled", sendAt: "2026-02-01T09:00:00Z", mentions: [], silent: false });
    expect(s.attachments[0]).toEqual({ kind: "file", path: "c/u/a.pdf", durationMs: 5 });
    expect(toScheduled({ ...row, error: "left" }).status).toBe("failed");
    expect(toScheduled({ ...row, cancelled_at: "t" }).status).toBe("cancelled");
    expect(toScheduled({ ...row, sent_message_id: "m" }).status).toBe("sent");
    expect(toAvailability({ user_id: "u", away_message: "Back Monday", away_until: null, time_zone: "Europe/London", hours: { mon: [["09:00", "17:00"]] } })).toEqual({
      userId: "u", awayMessage: "Back Monday", awayUntil: null, timeZone: "Europe/London", hours: { mon: [["09:00", "17:00"]] },
    });
    expect(toSearchHit({ message_id: "m", conversation_id: "c", seq: "4", sender_id: null, created_at: "t", snippet: "a «b»", in_transcript: true })).toEqual({
      messageId: "m", conversationId: "c", seq: 4, senderId: null, createdAt: "t", snippet: "a «b»", inTranscript: true, threadRootId: null,
    });
    // A reply in a thread says which thread, so the app can open it.
    expect(toSearchHit({ message_id: "m", conversation_id: "c", seq: 5, created_at: "t", snippet: "x", in_transcript: false, thread_root_id: "root" }).threadRootId).toBe("root");
    const p = toLinkPreview({ url: "https://x.test/a", status: "ok", title: "T", image_url: "http://x.test/i.png", fetched_at: "t" });
    expect(p.imageUrl).toBeNull();
    expect(toLinkPreview({ url: "https://x.test/a", image_url: "https://x.test/i.png", fetched_at: "t" }).imageUrl).toBe("https://x.test/i.png");
  });
});

describe("client methods for 0002", () => {
  it("calls each function with its arguments", async () => {
    const { supabase, calls } = fakeSupabase({ schedule_message: "sid", broadcast_message: ["m1", "m2"], search_messages: [], availability_for: [] });
    const chat = createChatClient(supabase);
    await chat.setTopic("c", "w1", { title: "Week 1", closed: true });
    expect(await chat.schedule({ conversationId: "c", clientId: "k", body: "Later", sendAt: new Date("2030-01-01T09:00:00Z"), topic: "w1" })).toBe("sid");
    await chat.cancelScheduled("sid");
    await chat.setAvailability({ awayMessage: "Off", timeZone: "Europe/London" });
    expect(await chat.broadcast(["a", "b"], "k", "Hello all")).toEqual(["m1", "m2"]);
    await chat.search("plan", "c");
    expect(await chat.search("p")).toEqual([]);
    await chat.availabilityFor("c");
    const rpc = Object.fromEntries(calls.filter((c) => c.kind === "rpc").map((c) => [c.name, c.args]));
    expect(rpc.set_topic).toEqual({ p_conversation_id: "c", p_topic: "w1", p_title: "Week 1", p_position: null, p_closed: true });
    expect(rpc.schedule_message).toMatchObject({ p_conversation_id: "c", p_client_id: "k", p_send_at: "2030-01-01T09:00:00.000Z", p_body: "Later", p_topic: "w1", p_attachments: [] });
    expect(rpc.cancel_scheduled).toEqual({ p_id: "sid" });
    expect(rpc.set_availability).toEqual({ p_away_message: "Off", p_away_until: null, p_time_zone: "Europe/London", p_hours: null });
    expect(rpc.broadcast_message).toEqual({ p_conversation_ids: ["a", "b"], p_client_id: "k", p_body: "Hello all", p_attachments: [], p_silent: false });
    expect(rpc.search_messages).toEqual({ p_query: "plan", p_conversation_id: "c", p_limit: 30 });
    // A one-letter query never reaches the database.
    expect(calls.filter((c) => c.name === "search_messages")).toHaveLength(1);
  });

  it("reads topics in order, scheduled ones still waiting, and previews only through link_previews_for", async () => {
    const { supabase, calls } = fakeSupabase({
      topics: [{ conversation_id: "c", topic: "a", title: "A", position: 0, created_at: "t" }],
      link_previews_for: [
        { url: "https://x.test", status: "ok", fetched_at: "t" },
        { url: "https://y.test", status: "failed", fetched_at: "t" },
      ],
    });
    const chat = createChatClient(supabase);
    expect((await chat.topics("c"))[0]!.title).toBe("A");
    await chat.scheduled("c");
    expect(await chat.linkPreviewsFor([])).toEqual({});
    const byMessage = await chat.linkPreviewsFor(["m1", "m2", "m1"]);
    expect(Object.keys(byMessage).sort()).toEqual(["m1", "m2"]);
    expect(byMessage.m1!.map((p) => p.url)).toEqual(["https://x.test"]);
    const scheduled = calls.find((c) => c.name === "scheduled")!;
    expect(scheduled.filters).toContainEqual(["is", "sent_message_id", null]);
    expect(scheduled.filters).toContainEqual(["is", "cancelled_at", null]);
    expect(scheduled.filters).toContainEqual(["eq", "conversation_id", "c"]);
    // One call per message, never a read of the closed table.
    expect(calls.filter((c) => c.name === "link_previews_for").map((c) => c.args)).toEqual([{ p_message_id: "m1" }, { p_message_id: "m2" }]);
    expect(calls.some((c) => c.kind === "from" && c.name === "link_previews")).toBe(false);
  });

  it("calls onJoin on every join, the first included, and onReconnect only on re-joins", async () => {
    let status: ((s: string) => void) | undefined;
    const channel = { on: () => channel, subscribe: (cb: (s: string) => void) => void (status = cb), send: vi.fn() };
    const supabase = { channel: () => channel, removeChannel: vi.fn(), realtime: { setAuth: async () => undefined } } as unknown as ChatSupabase;
    const onJoin = vi.fn();
    const onReconnect = vi.fn();
    createChatClient(supabase).subscribeConversation("c", "me", { onSignal: () => undefined, onJoin, onReconnect });
    await new Promise((r) => setTimeout(r, 0));
    status!("SUBSCRIBED");
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onReconnect).not.toHaveBeenCalled();
    status!("SUBSCRIBED");
    expect(onJoin).toHaveBeenCalledTimes(2);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});

describe("working hours", () => {
  const weekdays: WorkingHours = { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]] };

  it("reads the clock in the person's time zone", () => {
    // 2026-03-02 is a Monday. 14:30 UTC is 09:30 in New York (EST) and 23:30 in Tokyo.
    const now = new Date("2026-03-02T14:30:00Z");
    expect(localClock(now, "America/New_York")).toEqual({ day: "mon", minutes: 9 * 60 + 30 });
    expect(isWithinWorkingHours(weekdays, "America/New_York", now)).toBe(true);
    expect(isWithinWorkingHours(weekdays, "Asia/Tokyo", now)).toBe(false);
    // 13:59 UTC is 08:59 in New York: not yet.
    expect(isWithinWorkingHours(weekdays, "America/New_York", new Date("2026-03-02T13:59:00Z"))).toBe(false);
    // The end is exclusive.
    expect(isWithinWorkingHours(weekdays, "UTC", new Date("2026-03-02T17:00:00Z"))).toBe(false);
  });

  it("follows daylight saving", () => {
    // 2026-07-06 (Monday): New York is EDT (UTC-4), so 13:30 UTC is 09:30.
    expect(isWithinWorkingHours(weekdays, "America/New_York", new Date("2026-07-06T13:30:00Z"))).toBe(true);
    expect(isWithinWorkingHours(weekdays, "America/New_York", new Date("2026-03-02T13:30:00Z"))).toBe(false);
  });

  it("runs an overnight range into the next day", () => {
    const nights: WorkingHours = { fri: [["22:00", "02:00"]] };
    expect(isWithinWorkingHours(nights, "UTC", new Date("2026-03-06T23:00:00Z"))).toBe(true); // Friday 23:00
    expect(isWithinWorkingHours(nights, "UTC", new Date("2026-03-07T01:30:00Z"))).toBe(true); // Saturday 01:30
    expect(isWithinWorkingHours(nights, "UTC", new Date("2026-03-07T02:00:00Z"))).toBe(false);
    expect(isWithinWorkingHours(nights, "UTC", new Date("2026-03-06T21:59:00Z"))).toBe(false);
    // Thursday night isn't covered by Friday's range.
    expect(isWithinWorkingHours(nights, "UTC", new Date("2026-03-06T01:00:00Z"))).toBe(false);
  });

  it("treats no hours as always, and ignores bad values", () => {
    expect(isWithinWorkingHours(null, "UTC", new Date())).toBe(true);
    expect(isWithinWorkingHours({}, "UTC", new Date())).toBe(true);
    // Bad ranges are dropped; a day left with none is no hours at all (never a false "outside hours").
    expect(isWithinWorkingHours({ mon: [["nine", "five"]] }, "UTC", new Date("2026-03-02T10:00:00Z"))).toBe(true);
    expect(isWithinWorkingHours({ mon: [["nine", "five"], ["11:00", "12:00"]] }, "UTC", new Date("2026-03-02T10:00:00Z"))).toBe(false);
  });

  it("summarises hours, grouping days alike", () => {
    expect(hoursSummary(weekdays)).toBe("Mon–Fri, 9–5");
    expect(hoursSummary({ ...weekdays, fri: [["09:00", "13:30"]] })).toBe("Mon–Thu, 9–5; Fri, 9–1:30");
    expect(hoursSummary({ sat: [["10:00", "12:00"]], sun: [["10:00", "12:00"]] })).toBe("Sat, Sun, 10–12");
    expect(hoursSummary(null)).toBe("");
  });

  it("names a zone the way people say it", () => {
    expect(timeZoneLabel("America/New_York")).toBe("Eastern");
    expect(timeZoneLabel(null)).toBe("");
  });
});

describe("awayLine", () => {
  const a = (over: Partial<ChatAvailability>): ChatAvailability => ({ userId: "u", awayMessage: null, awayUntil: null, timeZone: "America/New_York", hours: null, ...over });
  const hours: WorkingHours = { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]] };

  it("says when they reply, outside their hours, and nothing inside them", () => {
    const evening = new Date("2026-03-02T23:00:00Z"); // 18:00 Monday in New York
    expect(awayLine(a({ hours }), "Mark", { now: evening })).toBe("Mark replies Mon–Fri, 9–5 (Eastern)");
    expect(awayLine(a({ hours }), "Mark", { now: new Date("2026-03-02T15:00:00Z") })).toBeNull();
    expect(awayLine(a({ hours }), "Mark", { now: new Date("2026-03-02T15:00:00Z"), always: true })).toBe("Mark replies Mon–Fri, 9–5 (Eastern)");
  });

  it("says until when they're away, with their message", () => {
    const now = new Date("2026-03-04T12:00:00Z"); // Wednesday
    const line = awayLine(a({ awayUntil: "2026-03-09T13:00:00Z", awayMessage: "Back Monday" }), "Mark", { now, locale: "en-US" });
    expect(line).toBe("Away until Monday: Back Monday");
    expect(awayLine(a({ awayMessage: "On retreat" }), "Mark", { now })).toBe("Mark is away: On retreat");
    // An end date already past: not away (and no hours, so nothing to say).
    expect(awayLine(a({ awayUntil: "2026-03-01T00:00:00Z", awayMessage: "Back soon" }), "Mark", { now })).toBeNull();
    expect(isAway(a({ awayUntil: "2026-03-05T00:00:00Z" }), now)).toBe(true);
    expect(isAway(null, now)).toBe(false);
  });
});

describe("awaySummary", () => {
  const away = (name: string) => ({ name, availability: { userId: name, awayMessage: "Off", awayUntil: null, timeZone: null, hours: null } });
  const off = (name: string) => ({ name, availability: { userId: name, awayMessage: null, awayUntil: null, timeZone: "UTC", hours: { mon: [["09:00", "09:01"]] as [string, string][] } } });
  const here = (name: string) => ({ name, availability: null });
  const now = new Date("2026-03-04T12:00:00Z");

  it("names everyone who is away, two at most", () => {
    expect(namesLine(["Sam", "Lee", "Ann", "Bo"])).toBe("Sam, Lee and 2 others");
    expect(namesLine(["Sam", "Lee", "Ann"])).toBe("Sam, Lee and 1 other");
    expect(awaySummary([here("Ann"), away("Sam")], { now })).toBe("Sam is away: Off");
    expect(awaySummary([away("Sam"), away("Lee")], { now })).toBe("Sam and Lee are away");
    expect(awaySummary([off("Sam"), off("Lee"), off("Ann")], { now })).toBe("Sam, Lee and 1 other are outside their hours");
    expect(awaySummary([away("Sam"), off("Lee"), away("Ann"), off("Bo")], { now })).toBe("Sam, Lee and 2 others are away or outside their hours");
    expect(awaySummary([here("Ann")], { now })).toBeNull();
  });
});

describe("small helpers", () => {
  it("finds links the way the database does", () => {
    expect(extractLinks("see https://a.test/x and https://b.test, http://no.test, https://a.test/x")).toEqual(["https://a.test/x", "https://b.test,"]);
    expect(extractLinks("https://1.test https://2.test https://3.test https://4.test")).toHaveLength(3);
    // Credential-looking queries are never previewed (genesis_chat.message_links).
    expect(extractLinks("reset at https://app.test/reset?token=abc and https://ok.test/a?page=2")).toEqual(["https://ok.test/a?page=2"]);
  });

  it("accepts only https images", () => {
    expect(isHttpsUrl("https://x.test/i.png")).toBe(true);
    expect(isHttpsUrl("http://x.test/i.png")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isHttpsUrl(null)).toBe(false);
  });

  it("splits a snippet at its marks", () => {
    expect(snippetParts("the «plan» for «today»")).toEqual([
      { text: "the ", match: false },
      { text: "plan", match: true },
      { text: " for ", match: false },
      { text: "today", match: true },
    ]);
    expect(snippetParts("open « only")).toEqual([{ text: "open « only", match: false }]);
  });

  it("offers tomorrow and Monday at 9, once when they're the same day", () => {
    const wed = new Date(2026, 2, 4, 15, 0);
    const picks = scheduleQuickPicks(wed, "en-US");
    expect(picks.map((p) => p.label)).toEqual(["Tomorrow, 9:00 AM", "Monday, 9:00 AM"]);
    expect(picks[1]!.at).toEqual(new Date(2026, 2, 9, 9, 0));
    const sun = new Date(2026, 2, 8, 15, 0);
    expect(scheduleQuickPicks(sun, "en-US").map((p) => p.label)).toEqual(["Tomorrow, 9:00 AM"]);
    expect(isSchedulable(new Date(Date.now() + 30_000))).toBe(false);
    expect(isSchedulable(new Date(Date.now() + 3_600_000))).toBe(true);
  });

  it("makes topic keys from titles", () => {
    expect(topicKey("Week 1: Habits")).toBe("week-1-habits");
    expect(topicKey("Café Créme")).toBe("cafe-creme");
  });
});

describe("outbox fixes", () => {
  const fakeClient = () => {
    const sent: { clientId: string }[] = [];
    return {
      sent,
      client: {
        upload: vi.fn(),
        send: vi.fn(async (input: { clientId: string; conversationId: string }) => {
          sent.push(input);
          return { id: `m-${input.clientId}`, conversationId: input.conversationId, clientId: input.clientId, seq: sent.length } as never;
        }),
      } as never,
    };
  };
  const saved = (clientId: string): QueuedMessage => ({
    clientId,
    input: { conversationId: "c1", clientId, body: "from before" },
    senderId: "me",
    createdAt: "2026-01-01T00:00:00Z",
    status: "failed",
    files: [],
    attempts: 1,
  });

  it("keeps a message sent while the saved queue is still loading", async () => {
    const { client } = fakeClient();
    let release!: (q: QueuedMessage[]) => void;
    const store: OutboxStore = { load: () => new Promise((r) => (release = r)), save: async () => undefined };
    let seen: QueuedMessage[] = [];
    const outbox = createOutbox({ client, userId: "me", store, onChange: (q) => (seen = q) });
    const first = outbox.send({ conversationId: "c2", body: "one" });
    const second = outbox.send({ conversationId: "c2", body: "two" });
    release([saved("old")]);
    await Promise.all([first, second]);
    // Nothing written during the load is lost; what was saved joins it.
    const bodies = outbox.pending().map((p) => p.input.body);
    expect(bodies).toContain("from before");
    expect(seen.map((q) => q.clientId)).toContain("old");
    await new Promise((r) => setTimeout(r, 0));
    expect((client as { send: ReturnType<typeof vi.fn> }).send.mock.calls.map((c) => (c[0] as { body: string }).body)).toEqual(["one", "two"]);
  });

  it("clears the queue and the store", async () => {
    const { client } = fakeClient();
    const writes: QueuedMessage[][] = [];
    const store: OutboxStore = { load: async () => [saved("a"), saved("b")], save: async (q) => void writes.push(q) };
    const outbox = createOutbox({ client, userId: "me", store });
    await outbox.load();
    expect(outbox.pending()).toHaveLength(2);
    await outbox.clear();
    expect(outbox.pending()).toEqual([]);
    expect(writes[writes.length - 1]).toEqual([]);
  });
});
