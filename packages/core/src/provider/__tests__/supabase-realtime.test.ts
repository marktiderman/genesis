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
  filter?: { event: string; schema: string; table: string; filter?: string };
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
      const record: FakeChannel = { name, removed: false };
      channels.push(record);
      const ch = {
        on(_type: string, filter: FakeChannel["filter"], cb: FakeChannel["change"]) {
          record.filter = filter;
          record.change = cb;
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

  it("gives each subscription its own channel, so removing one leaves the other", () => {
    const { p } = provider({ realtime: true });
    const offA = p.subscribe!("tasks", {}, vi.fn());
    p.subscribe!("tasks", {}, vi.fn());
    expect(channels[0]!.name).not.toBe(channels[1]!.name);
    offA();
    expect(channels[0]!.removed).toBe(true);
    expect(channels[1]!.removed).toBe(false);
  });

  it("filters by id on the server for one record", () => {
    const { p } = provider({ realtime: true });
    p.subscribe!("tasks", { id: "t-1" }, vi.fn());
    expect(channels[0]!.filter?.filter).toBe("id=eq.t-1");
  });

  it("does not put an id needing quotes into the filter, and filters it here instead", () => {
    const { p } = provider({ realtime: true });
    const cb = vi.fn();
    p.subscribe!("tasks", { id: "a,b" }, cb);
    expect(channels[0]!.filter?.filter).toBeUndefined();
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "other" } });
    expect(cb).not.toHaveBeenCalled();
    channels[0]!.change!({ eventType: "UPDATE", new: { id: "a,b" } });
    expect(cb).toHaveBeenCalledWith({ type: "updated", id: "a,b" });
  });
});

describe("subscribe: events", () => {
  it("maps inserts, updates and deletes to hints carrying only the id", () => {
    const { p } = provider({ realtime: true });
    const events: ResourceChangeEvent[] = [];
    p.subscribe!("tasks", {}, (e) => events.push(e));
    const ch = channels[0]!;
    ch.change!({ eventType: "INSERT", new: { id: 1, title: "secret title" } });
    ch.change!({ eventType: "UPDATE", new: { id: 1, title: "x" }, old: { id: 1 } });
    ch.change!({ eventType: "DELETE", new: {}, old: { id: 1 } });
    ch.change!({ eventType: "UPDATE", new: { slug: "no-id" } });
    expect(events).toEqual([
      { type: "created", id: 1 },
      { type: "updated", id: 1 },
      { type: "deleted", id: 1 },
      { type: "updated" },
    ]);
    // No payload row is passed on.
    expect(events.some((e) => "record" in e)).toBe(false);
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
