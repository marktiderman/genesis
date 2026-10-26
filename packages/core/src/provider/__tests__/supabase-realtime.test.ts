// @feat:supabase-provider
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseProvider,
  type SupabaseProviderOptions,
  type SupabaseRealtimePayload,
} from "../supabase-provider";
import type { ResourceChangeEvent } from "../types";

// A stand-in Realtime client: each channel records its `on` filter, keeps the
// change and status callbacks so a test can fire them, and notes removal.
interface FakeChannel {
  name: string;
  /** The first binding's filter. */
  filter?: { event: string; schema: string; table: string; filter?: string };
  bindings: { filter: NonNullable<FakeChannel["filter"]>; cb: (payload: SupabaseRealtimePayload) => void }[];
  /** Delivers a payload to every binding listening to its event (filters are the server's job). */
  change?: (payload: SupabaseRealtimePayload) => void;
  status?: (status: string) => void;
  removed: boolean;
}

let channels: FakeChannel[] = [];

function makeClient(withRemove = true) {
  const client = {
    from: () => {
      throw new Error("no reads in these tests");
    },
    channel: vi.fn((name: string) => {
      const record: FakeChannel = { name, removed: false, bindings: [] };
      record.change = (payload) => {
        for (const b of record.bindings) if (b.filter.event === "*" || b.filter.event === payload.eventType) b.cb(payload);
      };
      channels.push(record);
      const ch = {
        on(_type: string, filter: NonNullable<FakeChannel["filter"]>, cb: (payload: SupabaseRealtimePayload) => void) {
          record.filter ??= filter;
          record.bindings.push({ filter, cb });
          return ch;
        },
        subscribe(cb?: (status: string) => void) {
          record.status = cb;
          return ch;
        },
        unsubscribe: vi.fn(async () => {
          record.removed = true;
        }),
        __record: record,
      };
      return ch;
    }),
    ...(withRemove
      ? {
          removeChannel: vi.fn(async (ch: { __record: FakeChannel }) => {
            ch.__record.removed = true;
          }),
        }
      : {}),
  };
  return client;
}

const provider = (options?: SupabaseProviderOptions, withRemove = true) => {
  const client = makeClient(withRemove);
  return { client, p: createSupabaseProvider(client, options) };
};

beforeEach(() => {
  channels = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribe: opt-in", () => {
  it("is off unless the resource or the provider option turns it on", async () => {
    const { client, p } = provider();
    const cb = vi.fn();
    const off = p.subscribe!("tasks", {}, cb);
    expect(client.channel).not.toHaveBeenCalled();
    expect(typeof off).toBe("function");
    off();
    expect((await p.capabilities!("tasks")).realtime).toBe(false);
    expect((await p.capabilities!()).realtime).toBe(false);
  });

  it("is on for a resource with realtime: true, and reported in capabilities", async () => {
    const { client, p } = provider({ resources: { tasks: { realtime: true } } });
    p.subscribe!("tasks", {}, vi.fn());
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect((await p.capabilities!("tasks")).realtime).toBe(true);
    expect((await p.capabilities!("notes")).realtime).toBe(false);
    expect((await p.capabilities!()).realtime).toBe(true);
  });

  it("follows the provider option (true, a list, or a test), and a resource's false wins", async () => {
    const all = provider({ realtime: true, resources: { secrets: { realtime: false } } }).p;
    expect((await all.capabilities!("tasks")).realtime).toBe(true);
    expect((await all.capabilities!("secrets")).realtime).toBe(false);

    const listed = provider({ realtime: ["tasks"] }).p;
    expect((await listed.capabilities!("tasks")).realtime).toBe(true);
    expect((await listed.capabilities!("notes")).realtime).toBe(false);

    const tested = provider({ realtime: (r) => r.startsWith("t") }).p;
    expect((await tested.capabilities!("tasks")).realtime).toBe(true);
    expect((await tested.capabilities!("notes")).realtime).toBe(false);
  });

  it("is off for a client without channel(), even when asked for", async () => {
    const p = createSupabaseProvider({ from: () => ({}) }, { realtime: true });
    expect((await p.capabilities!("tasks")).realtime).toBe(false);
    expect(() => p.subscribe!("tasks", {}, vi.fn())()).not.toThrow();
  });
});

describe("subscribe: the channel", () => {
  it("listens to every postgres change on the table, in public or the named schema", () => {
    const { p } = provider({ realtime: true });
    p.subscribe!("tasks", {}, vi.fn());
    p.subscribe!("crm.clients", {}, vi.fn());
    expect(channels[0]!.filter).toEqual({ event: "*", schema: "public", table: "tasks" });
    expect(channels[1]!.filter).toEqual({ event: "*", schema: "crm", table: "clients" });
  });

  it("shares one channel per resource and filter; the last subscriber to leave removes it", () => {
    const { p } = provider({ realtime: true });
    const a = vi.fn();
    const b = vi.fn();
    const offA = p.subscribe!("tasks", {}, a);
    const offB = p.subscribe!("tasks", {}, b);
    expect(channels).toHaveLength(1);
    channels[0]!.change!({ eventType: "DELETE", new: {}, old: { id: 1 } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    expect(channels[0]!.removed).toBe(false);
    channels[0]!.change!({ eventType: "DELETE", new: {}, old: { id: 2 } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
    expect(channels[0]!.removed).toBe(true);
    // A new subscriber after that gets a fresh channel.
    p.subscribe!("tasks", {}, vi.fn());
    expect(channels).toHaveLength(2);
  });

  it("a list's first equality filter narrows inserts on the server; updates and deletes arrive unfiltered", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", { filters: [{ field: "title", operator: "contains", value: "x" }, { field: "person_id", operator: "eq", value: "p1" }] }, cb);
    expect(channels[0]!.bindings.map((b) => b.filter)).toEqual([
      { event: "INSERT", schema: "public", table: "tasks", filter: "person_id=eq.p1" },
      { event: "UPDATE", schema: "public", table: "tasks" },
      { event: "DELETE", schema: "public", table: "tasks" },
    ]);
    // Another filter value is another channel; the same one is shared.
    p.subscribe!("tasks", { filters: [{ field: "person_id", operator: "eq", value: "p2" }] }, vi.fn());
    p.subscribe!("tasks", { filters: [{ field: "person_id", operator: "eq", value: "p1" }] }, vi.fn());
    expect(channels).toHaveLength(2);
    // A value Realtime's filter grammar can't carry falls back to the whole table.
    p.subscribe!("tasks", { filters: [{ field: "title", operator: "eq", value: "a,b" }] }, vi.fn());
    expect(channels[2]!.filter).toEqual({ event: "*", schema: "public", table: "tasks" });
    // An empty value would make a malformed filter: the whole table instead (same channel as above).
    p.subscribe!("tasks", { filters: [{ field: "title", operator: "eq", value: "" }] }, vi.fn());
    expect(channels).toHaveLength(3);
  });

  it("a row leaving a filtered list is still reported (updates aren't filtered on the new row)", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", { filters: [{ field: "status", operator: "eq", value: "open" }] }, cb);
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "t1", status: "closed" } });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: "updated", id: "t1" }));
  });

  it("no server filter for a resource read from a view: the filter may name a column only the view has", () => {
    const { p } = provider({ realtime: true, resources: { tasks: { source: "tasks_with_people" } } });
    p.subscribe!("tasks", { filters: [{ field: "person_name", operator: "eq", value: "Ann" }] }, vi.fn());
    expect(channels[0]!.bindings.map((b) => b.filter)).toEqual([{ event: "*", schema: "public", table: "tasks" }]);
  });

  it("one record: no server filter (it would drop deletes); the id is matched here, deletes included", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", { id: "t-1" }, cb);
    expect(channels[0]!.filter?.filter).toBeUndefined();
    channels[0]!.change!({ eventType: "DELETE", new: {}, old: { id: "t-2" } });
    expect(cb).not.toHaveBeenCalled();
    channels[0]!.change!({ eventType: "DELETE", new: {}, old: { id: "t-1" } });
    expect(cb).toHaveBeenCalledWith({ type: "deleted", id: "t-1" });
  });

  it("matches an id needing quotes here too", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", { id: "a,b" }, cb);
    expect(channels[0]!.filter?.filter).toBeUndefined();
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "other" } });
    expect(cb).not.toHaveBeenCalled();
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "a,b" } });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: "updated", id: "a,b" }));
  });
});

describe("subscribe: events", () => {
  it("maps inserts, updates and deletes; inserts and updates carry the row, deletes only the id", () => {
    const { p } = provider({ realtime: true });
    const events: ResourceChangeEvent[] = [];
    p.subscribe!("tasks", {}, (e) => events.push(e));
    const ch = channels[0]!;
    ch.change!({ eventType: "INSERT", new: { id: 1, title: "secret title" } });
    ch.change!({ eventType: "UPDATE", new: { id: 1, title: "x" }, old: { id: 1 } });
    ch.change!({ eventType: "DELETE", new: {}, old: { id: 1 } });
    ch.change!({ eventType: "UPDATE", new: { slug: "no-id" } });
    expect(events).toEqual([
      { type: "created", id: 1, record: { id: 1, title: "secret title" } },
      { type: "updated", id: 1, record: { id: 1, title: "x" } },
      { type: "deleted", id: 1 },
      { type: "updated" },
    ]);
  });

  it("a resource read from a view or function gets no row: its columns differ, so it refetches", () => {
    const { p } = provider({ realtime: true, resources: { tasks: { source: "tasks_with_people" } } });
    const events: ResourceChangeEvent[] = [];
    p.subscribe!("tasks", {}, (e) => events.push(e));
    channels[0]!.change!({ eventType: "UPDATE", new: { id: 1, title: "x" } });
    expect(events).toEqual([{ type: "updated", id: 1 }]);
  });

  it("an echo must match the write's kind, and expires", async () => {
    vi.useFakeTimers();
    try {
      const { p } = provider({
        realtime: true,
        resources: { tasks: { update: async (id) => ({ id, title: "mine" }) } },
      });
      const events: ResourceChangeEvent[] = [];
      p.subscribe!("tasks", {}, (e) => events.push(e));
      await p.update("tasks", { id: "t1", data: { title: "mine" } });
      // A delete of that row is someone else's: heard.
      channels[0]!.change!({ eventType: "DELETE", new: {}, old: { id: "t1" } });
      expect(events).toEqual([{ type: "deleted", id: "t1" }]);
      await p.update("tasks", { id: "t3", data: { title: "mine" } });
      vi.advanceTimersByTime(2500);
      channels[0]!.change!({ eventType: "UPDATE", new: { id: "t3", title: "late" } });
      expect(events.at(-1)).toEqual(expect.objectContaining({ type: "updated", id: "t3" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("each channel skips the echo once: two lists of the same table don't refetch for your own write", async () => {
    const { p } = provider({
      realtime: true,
      resources: { tasks: { update: async (id) => ({ id, title: "mine" }) } },
    });
    const a: ResourceChangeEvent[] = [];
    const b: ResourceChangeEvent[] = [];
    p.subscribe!("tasks", { filters: [{ field: "person_id", operator: "eq", value: "p1" }] }, (e) => a.push(e));
    p.subscribe!("tasks", {}, (e) => b.push(e));
    expect(channels).toHaveLength(2);
    await p.update("tasks", { id: "t1", data: { title: "mine" } });
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "t1", title: "mine" } });
    channels[1]!.change!({ eventType: "UPDATE", new: { id: "t1", title: "mine" } });
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    // The next change to t1 on either channel is someone else's.
    channels[1]!.change!({ eventType: "UPDATE", new: { id: "t1", title: "theirs" } });
    expect(b).toHaveLength(1);
  });

  it("forgets old write marks as new writes come in", async () => {
    vi.useFakeTimers();
    try {
      const { p } = provider({ realtime: true, resources: { tasks: { update: async (id) => ({ id }) } } });
      const count = (p as unknown as { __recentWriteCount: () => number }).__recentWriteCount;
      await p.update("tasks", { id: "a", data: {} });
      await p.update("tasks", { id: "b", data: {} });
      expect(count()).toBe(2);
      vi.advanceTimersByTime(2500);
      await p.update("tasks", { id: "c", data: {} });
      expect(count()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the echo of this client's own write, then hears that row again", async () => {
    vi.useFakeTimers();
    try {
      const { p } = provider({
        realtime: true,
        resources: { tasks: { update: async (id) => ({ id, title: "mine" }) } },
      });
      const events: ResourceChangeEvent[] = [];
      p.subscribe!("tasks", {}, (e) => events.push(e));
      await p.update("tasks", { id: "t1", data: { title: "mine" } });
      channels[0]!.change!({ eventType: "UPDATE", new: { id: "t1", title: "mine" } });
      channels[0]!.change!({ eventType: "UPDATE", new: { id: "t2", title: "theirs" } });
      expect(events.map((e) => ("id" in e ? e.id : null))).toEqual(["t2"]);
      // The channel used its mark: a second update to t1 (a trigger, another person) is heard at once.
      channels[0]!.change!({ eventType: "UPDATE", new: { id: "t1", title: "someone else" } });
      expect(events.map((e) => ("id" in e ? e.id : null))).toEqual(["t2", "t1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports `changed` after a reconnect (events may have been missed), not on the first join", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", {}, cb);
    const ch = channels[0]!;
    ch.status!("SUBSCRIBED");
    expect(cb).not.toHaveBeenCalled();
    ch.status!("CHANNEL_ERROR");
    ch.status!("SUBSCRIBED");
    expect(cb).toHaveBeenCalledWith({ type: "changed" });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stops reporting once unsubscribed, and unsubscribing twice is harmless", () => {
    const { client, p } = provider({ realtime: true });
    const cb = vi.fn();
    const off = p.subscribe!("tasks", {}, cb);
    off();
    off();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    channels[0]!.change!({ eventType: "INSERT", new: { id: 1 } });
    expect(cb).not.toHaveBeenCalled();
  });

  it("falls back to channel.unsubscribe() on a client without removeChannel()", () => {
    const { p } = provider({ realtime: true }, false);
    const off = p.subscribe!("tasks", {}, vi.fn());
    off();
    expect(channels[0]!.removed).toBe(true);
  });

  it("keeps the channel when a callback throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { p } = provider({ realtime: true });
    const cb = vi.fn(() => {
      throw new Error("boom");
    });
    p.subscribe!("tasks", {}, cb);
    expect(() => channels[0]!.change!({ eventType: "INSERT", new: { id: 1 } })).not.toThrow();
    expect(() => channels[0]!.change!({ eventType: "INSERT", new: { id: 2 } })).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
