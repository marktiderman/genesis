// @feat:forms-outbox
// The submit outbox: queued with an idempotency key, kept across restarts, sent when
// online with backoff, never dropped silently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSubmitOutbox, memoryStorage, type KeyValueStorage, type OutboxItem, type SubmitOutboxOptions, type SubmitResult } from "../index";

const ok = (id = "resp-1"): SubmitResult => ({ ok: true, id, receivedAt: "2026-10-24T12:00:00.000Z" });
const submission = { answers: { overall: 5 } };

let keys = 0;
function setup(over: Partial<SubmitOutboxOptions> = {}, storage: KeyValueStorage = memoryStorage()) {
  const sent: OutboxItem[] = [];
  const delivered: OutboxItem[] = [];
  const replies: (() => Promise<unknown>)[] = [];
  const send = vi.fn(async (item: OutboxItem) => {
    sent.push(item);
    const next = replies.shift();
    return next ? next() : ok();
  });
  const outbox = createSubmitOutbox({
    storage,
    send,
    createKey: () => `key-${String(++keys).padStart(16, "0")}`,
    random: () => 1,
    backoff: { baseMs: 1_000, maxMs: 60_000 },
    log: () => {},
    onDelivered: (item) => delivered.push(item),
    ...over,
  });
  return { outbox, send, sent, delivered, replies, storage };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSubmitOutbox", () => {
  it("holds a submission while offline and sends it when the device comes online", async () => {
    const { outbox, send, delivered } = setup({ online: false });
    outbox.start();
    const item = await outbox.enqueue({ formId: "visit", submission });
    expect(item.request).toMatchObject({ ...submission, idempotencyKey: item.id });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).not.toHaveBeenCalled();
    expect(outbox.getSnapshot()).toMatchObject({ online: false, pending: 1 });

    outbox.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(delivered.map((d) => d.id)).toEqual([item.id]);
    expect(outbox.getSnapshot()).toMatchObject({ pending: 0, items: [] });
  });

  it("keeps queued submissions across a restart, and sends them with the same key", async () => {
    const storage = memoryStorage();
    const first = setup({ online: false }, storage);
    const queued = await first.outbox.enqueue({ formId: "visit", submission, meta: { title: "Your visit" } });
    first.outbox.stop();

    // The app restarts: a new outbox on the same storage.
    const second = setup({}, storage);
    await second.outbox.ready;
    expect(second.outbox.getSnapshot().items.map((i) => [i.id, i.meta])).toEqual([[queued.id, { title: "Your visit" }]]);
    second.outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sent[0]!.request.idempotencyKey).toBe(queued.id);
    expect(second.outbox.getSnapshot().items).toEqual([]);
    expect(storage.keys().filter((k) => k.includes(":item:"))).toEqual([]);
  });

  it("backs off between tries, doubling up to maxMs, with the same key every time", async () => {
    const { outbox, send, sent, replies } = setup();
    for (let i = 0; i < 3; i++) replies.push(async () => ({ ok: false, reason: "store_failed" }));
    outbox.start();
    const t0 = Date.now();
    await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2); // +1 s
    await vi.advanceTimersByTimeAsync(2_000);
    expect(send).toHaveBeenCalledTimes(3); // +2 s
    await vi.advanceTimersByTimeAsync(4_000);
    expect(send).toHaveBeenCalledTimes(4); // +4 s, and it went through
    expect(Date.now() - t0).toBe(7_000);
    expect(new Set(sent.map((s) => s.request.idempotencyKey)).size).toBe(1);
    expect(outbox.getSnapshot().items).toEqual([]);
  });

  it("stops after maxAttempts and keeps the submission as failed, for retry or discard", async () => {
    const storage = memoryStorage();
    const { outbox, send } = setup({ maxAttempts: 3, send: vi.fn(async () => Promise.reject(new Error("offline"))) }, storage);
    outbox.start();
    const item = await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(600_000);
    const failed = outbox.getSnapshot().items[0]!;
    expect(failed).toMatchObject({ id: item.id, state: "failed", attempts: 3 });
    expect(failed.lastError).toMatch(/Gave up after 3 tries.*offline/);
    expect(outbox.getSnapshot().failed).toBe(1);
    void send;

    outbox.stop();

    // Stored as failed, so it isn't lost; a restart tries it again from the start.
    const reopened = setup({}, storage);
    await reopened.outbox.ready;
    expect(reopened.outbox.getSnapshot().items[0]).toMatchObject({ id: item.id });
    reopened.outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(reopened.send).toHaveBeenCalledTimes(1);
    expect(reopened.outbox.getSnapshot().items).toEqual([]);
  });

  it("retry sends a refused submission again, from its first try", async () => {
    const { outbox, send, replies } = setup();
    replies.push(async () => ({ ok: false, reason: "closed" }));
    outbox.start();
    const item = await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getSnapshot().items[0]).toMatchObject({ state: "failed", attempts: 1 });
    await outbox.retry(item.id);
    expect(send).toHaveBeenCalledTimes(2);
    expect(outbox.getSnapshot().items).toEqual([]);
  });

  it("tries what ran out of tries again when the device comes back online, but not what the server refused", async () => {
    let fail = true;
    const { outbox, replies } = setup({
      maxAttempts: 1,
      send: async () => {
        if (fail) throw new Error("captive portal");
        return replies.shift()?.() ?? ok();
      },
    });
    outbox.start();
    const exhausted = await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getSnapshot().items[0]).toMatchObject({ id: exhausted.id, state: "failed", rejection: null });
    fail = false;
    replies.push(async () => ({ ok: false, reason: "closed" }));
    await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getSnapshot().failed).toBe(2);
    outbox.setOnline(false);
    outbox.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getSnapshot().items).toHaveLength(1);
    expect(outbox.getSnapshot().items[0]).toMatchObject({ state: "failed", rejection: { reason: "closed" } });
  });

  it("keeps a refused submission as failed with the server's errors, and discard removes it", async () => {
    const storage = memoryStorage();
    const { outbox, send, replies } = setup({}, storage);
    replies.push(async () => ({ ok: false, reason: "invalid", errors: { overall: "Choose 1 to 5." } }));
    outbox.start();
    const item = await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.getSnapshot().items[0]).toMatchObject({
      state: "failed",
      rejection: { reason: "invalid", errors: { overall: "Choose 1 to 5." } },
    });
    expect(await outbox.discard(item.id)).toBe(true);
    expect(outbox.getSnapshot().items).toEqual([]);
    expect(storage.keys().filter((k) => k.includes(":item:"))).toEqual([]);
    expect(await outbox.discard(item.id)).toBe(false);
  });

  it("treats a duplicate as delivered and an unreadable answer as a retry, never a drop", async () => {
    const { outbox, send, replies, delivered } = setup();
    replies.push(async () => "<html>502 Bad Gateway</html>");
    replies.push(async () => ({ ok: false, reason: "duplicate", id: "resp-7", receivedAt: "t" }));
    outbox.start();
    await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getSnapshot().items[0]).toMatchObject({ state: "pending", attempts: 1, lastError: expect.stringMatching(/understood/) });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveLength(1);
    expect(outbox.getSnapshot().items).toEqual([]);
  });

  it("queues a key once, however often it is enqueued", async () => {
    const { outbox, send } = setup({ online: false });
    const a = await outbox.enqueue({ formId: "visit", submission, idempotencyKey: "tap-tap-tap-0000001" });
    const b = await outbox.enqueue({ formId: "visit", submission, idempotencyKey: "tap-tap-tap-0000001" });
    expect(b.id).toBe(a.id);
    expect(outbox.getSnapshot().items).toHaveLength(1);
    outbox.setOnline(true);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("aborts a send that hangs, and tries it again", async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const { outbox } = setup({
      timeoutMs: 5_000,
      send: (_item, { signal }) => {
        signals.push(signal);
        return ++calls === 1 ? new Promise(() => {}) : Promise.resolve(ok());
      },
    });
    outbox.start();
    await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(signals[0]!.aborted).toBe(true);
    expect(outbox.getSnapshot().items[0]!.lastError).toMatch(/No answer/);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(2);
    expect(outbox.getSnapshot().items).toEqual([]);
  });

  it("rejects enqueue when storage can't take it, so the app keeps the draft", async () => {
    const storage = memoryStorage();
    const full: KeyValueStorage = {
      ...storage,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const { outbox } = setup({}, full);
    await expect(outbox.enqueue({ formId: "visit", submission })).rejects.toThrow(/Quota/);
    expect(outbox.getSnapshot()).toMatchObject({ items: [], storageError: expect.stringMatching(/Quota/) });
  });

  it("never sends a submission once discard was called, even with slow storage", async () => {
    const map = new Map<string, string>();
    const slow: KeyValueStorage = {
      getItem: async (k) => map.get(k) ?? null,
      setItem: (k, v) => new Promise((r) => setTimeout(() => r(void map.set(k, v)), 50)),
      removeItem: (k) => new Promise((r) => setTimeout(() => r(void map.delete(k)), 50)),
    };
    const { outbox, send, delivered } = setup({ online: false }, slow);
    outbox.start();
    const item = await (async () => {
      const p = outbox.enqueue({ formId: "visit", submission });
      await vi.advanceTimersByTimeAsync(200);
      return p;
    })();
    const discarding = outbox.discard(item.id);
    outbox.setOnline(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(await discarding).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(delivered).toEqual([]);
  });

  it("two outboxes enqueueing at once on one async storage keep both in the index", async () => {
    const map = new Map<string, string>();
    const asyncStorage: KeyValueStorage = {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    };
    const a = setup({ online: false }, asyncStorage);
    const b = setup({ online: false }, asyncStorage);
    const [x, y] = await Promise.all([
      a.outbox.enqueue({ formId: "visit", submission }),
      b.outbox.enqueue({ formId: "visit", submission }),
    ]);
    expect(JSON.parse(map.get("genesis-forms:outbox:index")!).sort()).toEqual([x.id, y.id].sort());
    const later = setup({ online: false }, asyncStorage);
    await later.outbox.ready;
    expect(later.outbox.getSnapshot().items).toHaveLength(2);
  });

  it("sends a submission put off far into the future (the clock moved back) instead of spinning", async () => {
    const storage = memoryStorage();
    const entry = {
      id: "far-future-key-0001",
      formId: "visit",
      request: { ...submission, idempotencyKey: "far-future-key-0001" },
      meta: null,
      createdAt: 0,
      attempts: 1,
      nextAttemptAt: Date.now() + 365 * 24 * 3600 * 1000,
      state: "pending",
      lastError: null,
      rejection: null,
    };
    storage.setItem("genesis-forms:outbox:index", JSON.stringify([entry.id]));
    storage.setItem(`genesis-forms:outbox:item:${entry.id}`, JSON.stringify(entry));
    const { outbox, send } = setup({}, storage);
    outbox.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("waits as long as the server's retryAfterSeconds when it is longer than the backoff", async () => {
    const { outbox, send, replies } = setup();
    replies.push(async () => ({ ok: false, reason: "rate_limited", retryAfterSeconds: 120 }));
    outbox.start();
    await outbox.enqueue({ formId: "visit", submission });
    await vi.advanceTimersByTimeAsync(119_000);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends the attempt id with the submission, and refuses to start without a way to make keys", async () => {
    const { outbox } = setup({ online: false });
    const item = await outbox.enqueue({ formId: "visit", submission, attemptId: "attempt-1" });
    expect(item.request.attemptId).toBe("attempt-1");
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", {});
    try {
      expect(() => createSubmitOutbox({ storage: memoryStorage(), send: async () => ok() })).toThrow(/createKey/);
    } finally {
      vi.stubGlobal("crypto", crypto);
    }
  });

  it("two outboxes on one storage (two tabs) keep each other's submissions", async () => {
    const storage = memoryStorage();
    const tabA = setup({ online: false }, storage);
    const tabB = setup({ online: false }, storage);
    await tabA.outbox.ready;
    await tabB.outbox.ready;
    const a = await tabA.outbox.enqueue({ formId: "visit", submission });
    const b = await tabB.outbox.enqueue({ formId: "visit", submission });
    const later = setup({ online: false }, storage);
    await later.outbox.ready;
    expect(later.outbox.getSnapshot().items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("leaves an unreadable stored entry in storage rather than deleting it", async () => {
    const storage = memoryStorage();
    storage.setItem("genesis-forms:outbox:index", JSON.stringify(["broken-key-000000001"]));
    storage.setItem("genesis-forms:outbox:item:broken-key-000000001", "{oops");
    const logs: string[] = [];
    const { outbox } = setup({ log: (m) => logs.push(m) }, storage);
    await outbox.ready;
    expect(outbox.getSnapshot().unreadable).toEqual(["broken-key-000000001"]);
    await outbox.enqueue({ formId: "visit", submission });
    expect(logs.join()).toMatch(/couldn't be read/);
    expect(storage.getItem("genesis-forms:outbox:item:broken-key-000000001")).toBe("{oops");
    expect(JSON.parse(storage.getItem("genesis-forms:outbox:index") as string)).toContain("broken-key-000000001");
  });

  it("copies the submission as JSON, so later changes to it don't reach the queue", async () => {
    const { outbox } = setup({ online: false });
    const answers: Record<string, unknown> = { overall: 5 };
    const item = await outbox.enqueue({ formId: "visit", submission: { answers: answers as never } });
    answers.overall = 1;
    expect(item.request.answers).toEqual({ overall: 5 });
  });
});
