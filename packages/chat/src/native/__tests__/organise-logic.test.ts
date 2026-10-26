// @feat:chat
import { describe, expect, it } from "vitest";
import type { ChatInboxItem, ChatMessage, ChatTopic } from "../../core/types";
import { availabilityInput, awayLineFor, clockToDate, dateToClock, defaultWeek, formFrom, hoursFromWeek, sameTimeDays, weekFromHours } from "../availability";
import { broadcastOutcome, broadcastRows } from "../broadcast-sheet";
import { emptyComposer, type ComposerState } from "../composer-state";
import { chatNativeCopy } from "../copy";
import { moderationNote } from "../moderation";
import { defaultScheduleAt, scheduleInputFrom, withDay, withTime } from "../schedule-sheet";
import { snippetText } from "../search-screen";
import { canManageTopics, checkTopicName, topicClosedFor, topicMenuFor } from "../topics";
import { rowIndexOf } from "../use-jump";
import type { ThreadRow } from "../rows";

const topic = (key: string, closed = false): ChatTopic => ({
  conversationId: "c", topic: key, title: key, position: 0, closedAt: closed ? "2026-10-01T00:00:00Z" : null, createdBy: null, createdAt: "2026-10-01T00:00:00Z",
});

describe("topics", () => {
  it("are managed by owners and admins only", () => {
    expect(canManageTopics("owner")).toBe(true);
    expect(canManageTopics("admin")).toBe(true);
    expect(canManageTopics("member")).toBe(false);
    expect(canManageTopics("observer")).toBe(false);
    expect(canManageTopics(null)).toBe(false);
  });

  it("closed, take posts only from owners, admins and observers", () => {
    expect(topicClosedFor(topic("a", true), "member")).toBe(true);
    expect(topicClosedFor(topic("a", true), "owner")).toBe(false);
    expect(topicClosedFor(topic("a", true), "admin")).toBe(false);
    expect(topicClosedFor(topic("a", true), "observer")).toBe(false);
    expect(topicClosedFor(topic("a"), "member")).toBe(false);
    expect(topicClosedFor(null, "member")).toBe(false);
  });

  it("offer New always, and Rename with Close or Reopen for the topic shown", () => {
    expect(topicMenuFor(null)).toEqual(["new"]);
    expect(topicMenuFor(topic("a"))).toEqual(["new", "rename", "close"]);
    expect(topicMenuFor(topic("a", true))).toEqual(["new", "rename", "reopen"]);
  });

  it("key a new topic from its name, refuse a clash or an empty name, and keep the key on a rename", () => {
    expect(checkTopicName("Week 1: Habits", [])).toEqual({ key: "week-1-habits" });
    expect(checkTopicName("  ", [])).toEqual({ error: "empty" });
    expect(checkTopicName("Week 1: habits!", [topic("week-1-habits")])).toEqual({ error: "exists" });
    expect(checkTopicName("New name", [topic("week-1-habits")], "week-1-habits")).toEqual({ key: "week-1-habits" });
  });
});

describe("scheduled send", () => {
  const composer = (text: string, files = 0): ComposerState => ({
    ...emptyComposer,
    text,
    attachments: Array.from({ length: files }, (_, i) => ({ key: `k${i}`, file: { data: "file:///a.jpg", name: "a.jpg", contentType: "image/jpeg" } })),
  }) as ComposerState;
  const at = new Date("2026-10-26T09:00:00");

  it("schedules what's written, in the topic shown, with its reply and mentions", () => {
    const state = { ...composer("hi @[Sam](user:22222222-2222-4222-8222-222222222222)"), replyTo: { messageId: "m1", name: "Sam", preview: "x" } } as ComposerState;
    const made = scheduleInputFrom(state, { conversationId: "c", topic: "week-1", at });
    expect(made).toEqual({
      input: { conversationId: "c", body: "hi @[Sam](user:22222222-2222-4222-8222-222222222222)", mentions: ["22222222-2222-4222-8222-222222222222"], replyToId: "m1", topic: "week-1", sendAt: at },
    });
  });

  it("won't schedule nothing, or files (native files are URIs; scheduling uploads bytes only)", () => {
    expect(scheduleInputFrom(composer("   "), { conversationId: "c", at })).toEqual({ error: "empty" });
    expect(scheduleInputFrom(composer("with a photo", 1), { conversationId: "c", at })).toEqual({ error: "files" });
  });

  it("starts the custom time an hour ahead on the next five minutes, and sets day and time apart", () => {
    const d = defaultScheduleAt(new Date("2026-10-25T10:02:30"));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([11, 5, 0]);
    const base = new Date("2026-10-25T14:30:00");
    const day = withDay(base, new Date("2026-12-01T03:00:00"));
    expect([day.getMonth(), day.getDate(), day.getHours(), day.getMinutes()]).toEqual([11, 1, 14, 30]);
    const time = withTime(base, new Date("2020-01-01T08:15:00"));
    expect([time.getDate(), time.getHours(), time.getMinutes()]).toEqual([25, 8, 15]);
  });
});

describe("availability", () => {
  it("reads saved hours as a week and writes the week back, keeping extra ranges", () => {
    const saved = { mon: [["09:00", "12:00"], ["13:00", "17:00"]] as [string, string][], wed: [["10:00", "14:00"]] as [string, string][] };
    const week = weekFromHours(saved);
    expect(week.mon).toEqual({ on: true, from: "09:00", to: "12:00" });
    expect(week.tue.on).toBe(false);
    expect(hoursFromWeek({ ...week, mon: { ...week.mon, from: "08:00" } }, saved)).toEqual({ mon: [["08:00", "12:00"], ["13:00", "17:00"]], wed: [["10:00", "14:00"]] });
    expect(Object.keys(hoursFromWeek(defaultWeek(), null))).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("refuses a day that starts and ends at the same time", () => {
    const week = defaultWeek();
    expect(sameTimeDays(week)).toEqual([]);
    expect(sameTimeDays({ ...week, tue: { on: true, from: "09:00", to: "09:00" }, sat: { on: false, from: "09:00", to: "09:00" } })).toEqual(["tue"]);
  });

  it("saves the form as setAvailability expects (blank message and no hours as null)", () => {
    const until = new Date("2026-11-02T09:00:00Z");
    const form = { ...formFrom(null, "Europe/London"), message: "  Back Monday ", until, useHours: false };
    expect(availabilityInput(form, null)).toEqual({ awayMessage: "Back Monday", awayUntil: until.toISOString(), timeZone: "Europe/London", hours: null });
    expect(availabilityInput({ ...form, message: " ", until: null, useHours: true }, null)).toMatchObject({ awayMessage: null, awayUntil: null, hours: { mon: [["09:00", "17:00"]] } });
  });

  it("round-trips a clock time through a picker's Date", () => {
    expect(dateToClock(clockToDate("07:45"))).toBe("07:45");
    expect(dateToClock(clockToDate("bad"))).toBe("09:00");
  });

  it("names the other person when away, everyone away in a group, and skips you and observers", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const away = { userId: "sam", awayMessage: "On a retreat", awayUntil: null, timeZone: "UTC", hours: null };
    const names: Record<string, string> = { me: "Me", sam: "Sam", lee: "Lee", obs: "Obs" };
    const forUser = (id: string) => (id === "sam" || id === "lee" || id === "obs" || id === "me" ? { ...away, userId: id } : null);
    expect(awayLineFor([{ userId: "me", role: "member" }, { userId: "sam", role: "member" }], "me", forUser, (id) => names[id]!, now)).toBe("Sam is away: On a retreat");
    expect(awayLineFor([{ userId: "me", role: "member" }, { userId: "sam", role: "member" }, { userId: "lee", role: "member" }, { userId: "obs", role: "observer" }], "me", forUser, (id) => names[id]!, now)).toBe("Sam and Lee are away");
    expect(awayLineFor([{ userId: "me", role: "member" }, { userId: "x", role: "member" }], "me", forUser, (id) => id, now)).toBeNull();
  });
});

describe("broadcast", () => {
  const item = (id: string, title: string | null, other: string | null, archived = false) => ({ conversationId: id, title, otherUserId: other, archived }) as ChatInboxItem;
  it("lists the inbox by name, without archived ones, filtered by the query", () => {
    const items = [item("1", null, "zoe"), item("2", "Coaching group", null), item("3", null, "amy"), item("4", null, "old", true)];
    const person = (id: string | null) => (id ? { name: id === "zoe" ? "Zoe" : id === "amy" ? "Amy" : "Old" } : undefined);
    expect(broadcastRows(items, { person, untitled: "Conversation" }).map((r) => r.title)).toEqual(["Amy", "Coaching group", "Zoe"]);
    expect(broadcastRows(items, { person, untitled: "Conversation", query: "zo" }).map((r) => r.title)).toEqual(["Zoe"]);
    expect(broadcastRows(items, { person, untitled: "Conversation", filter: (i) => i.otherUserId !== null }).map((r) => r.title)).toEqual(["Amy", "Zoe"]);
  });

  it("says how many it reached", () => {
    expect(broadcastOutcome(3, 3, chatNativeCopy)).toEqual({ title: "Sent to 3 conversations", partial: false });
    expect(broadcastOutcome(1, 1, chatNativeCopy)).toEqual({ title: "Sent to 1 conversation", partial: false });
    expect(broadcastOutcome(2, 3, chatNativeCopy)).toEqual({ title: "Sent to 2 of 3. You can't post in the others.", partial: true });
  });
});

describe("moderation", () => {
  const m = (moderation: ChatMessage["moderation"], deletedAt: string | null = null) => ({ moderation, deletedAt });
  it("tells a hidden message's sender only they see it, and marks hidden and flagged ones for observers", () => {
    expect(moderationNote(m("hidden"), { mine: true, observer: false })).toBe("hidden-mine");
    expect(moderationNote(m("hidden"), { mine: false, observer: true })).toBe("hidden");
    expect(moderationNote(m("flagged"), { mine: false, observer: true })).toBe("flagged");
    expect(moderationNote(m("flagged"), { mine: true, observer: false })).toBeNull();
    expect(moderationNote(m(null), { mine: false, observer: true })).toBeNull();
    expect(moderationNote(m("hidden", "2026-10-01T00:00:00Z"), { mine: true, observer: false })).toBeNull();
  });
});

describe("search and jumping", () => {
  it("reads a snippet without its marks", () => {
    expect(snippetText("…a «word» here")).toBe("…a word here");
  });
  it("finds a message's row past day and unread rows", () => {
    const rows = [
      { type: "day", key: "d", label: "Today" },
      { type: "unread", key: "u" },
      { type: "message", key: "c1", item: { type: "message", message: { id: "m1" } } },
    ] as unknown as ThreadRow[];
    expect(rowIndexOf(rows, "m1")).toBe(2);
    expect(rowIndexOf(rows, "m9")).toBe(-1);
  });
});
