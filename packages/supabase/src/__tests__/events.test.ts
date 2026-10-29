// @feat:product-events
import { describe, expect, it, vi } from "vitest";
import { createEventTracker, eventsSink, type EventsClient } from "../events";

function fakeClient(results: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const calls: Array<{ fn: string; events: unknown[] }> = [];
  const client: EventsClient = {
    rpc: async (fn: string, args: { events: unknown[] }) => {
      calls.push({ fn, events: args.events });
      const next = results.shift() ?? { data: args.events.length, error: null };
      return { data: next.data ?? null, error: next.error ?? null };
    },
  };
  return { client, calls };
}

const at = () => new Date("2026-10-29T12:00:00Z");

describe("createEventTracker", () => {
  it("batches events with the session, platform, version and flags, and drops bad names", async () => {
    const { client, calls } = fakeClient([]);
    const t = createEventTracker({ client, platform: "native", appVersion: "1.2.0", sessionId: "s1", flags: () => ({ "new-list": true }), flushIntervalMs: 0, now: at });
    t.track("task.completed", { feature: "tasks", tenantId: "t1", properties: { count: 3 } });
    t.track("Not A Name");
    t.track("app.opened");
    expect(t.pending).toBe(2);
    expect(await t.flush()).toBe(2);
    expect(calls).toEqual([
      {
        fn: "genesis_track_events",
        events: [
          { name: "task.completed", feature: "tasks", tenantId: "t1", properties: { count: 3 }, flags: { "new-list": true }, occurredAt: "2026-10-29T12:00:00.000Z", platform: "native", appVersion: "1.2.0", sessionId: "s1" },
          { name: "app.opened", flags: { "new-list": true }, occurredAt: "2026-10-29T12:00:00.000Z", platform: "native", appVersion: "1.2.0", sessionId: "s1" },
        ],
      },
    ]);
    expect(t.pending).toBe(0);
  });

  it("keeps a failed batch and retries it after a backoff", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { client, calls } = fakeClient([{ error: { message: "offline" } }]);
    const t = createEventTracker({ client, flushIntervalMs: 0, onError });
    t.track("app.opened");
    expect(await t.flush()).toBe(0);
    expect(onError).toHaveBeenCalledWith({ message: "offline" });
    expect(t.pending).toBe(1);
    expect(await t.flush()).toBe(0); // still backing off
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    expect(await t.flush()).toBe(1);
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it("drops events it can never send: signed out drops all, a refused batch drops itself", async () => {
    const signedOut = fakeClient([{ error: { message: "sign in first", code: "42501" } as { message: string } }]);
    const a = createEventTracker({ client: signedOut.client, flushIntervalMs: 0 });
    a.track("a.one");
    a.track("a.two");
    await a.flush();
    expect(a.pending).toBe(0);
    const refused = fakeClient([{ error: { message: "missing", code: "PGRST202" } as { message: string } }]);
    const b = createEventTracker({ client: refused.client, flushIntervalMs: 0 });
    b.track("b.one");
    await b.flush();
    expect(b.pending).toBe(0);
    b.track("b.two");
    b.reset();
    expect(b.pending).toBe(0);
    await b.close();
    b.track("b.three");
    expect(b.pending).toBe(0);
  });

  it("sends a full batch at once, caps the queue, and uses the server function for server code", async () => {
    const { client, calls } = fakeClient([{ error: { message: "down" } }]);
    const t = createEventTracker({ client, batchSize: 2, maxQueue: 3, flushIntervalMs: 0, server: true });
    t.track("a.one", { userId: "u1", personId: "p1" });
    t.track("a.two");
    t.track("a.three");
    t.track("a.four");
    await Promise.resolve();
    expect(t.pending).toBe(3);
    await t.close();
    const last = calls.at(-1)!;
    expect(last.fn).toBe("genesis_track_server_events");
    expect((last.events as Array<{ name: string }>).map((e) => e.name)).toEqual(["a.two", "a.three", "a.four"]);
    expect(calls[0]!.events[0]).toMatchObject({ name: "a.one", userId: "u1", personId: "p1", platform: "server" });
  });
});

describe("eventsSink", () => {
  it("turns observability events into tracked ones with their feature and tenant", async () => {
    const { client, calls } = fakeClient([]);
    const t = createEventTracker({ client, flushIntervalMs: 0, now: at, sessionId: "s" });
    const sink = eventsSink(t, { feature: (n) => (n.startsWith("task.") ? "tasks" : undefined), tenantId: () => "t1" });
    sink.event("task.completed", { count: 2 });
    expect(await sink.flush(1000)).toBe(true);
    expect(calls[0]!.events[0]).toMatchObject({ name: "task.completed", feature: "tasks", tenantId: "t1", properties: { count: 2 } });
  });
});
