/**
 * @feat:chat
 * Fixes from the review of the phases 2–4 client: malformed working hours, the outbox on
 * sign-out, retry order and refusals, and who owns a preview URL.
 */
import { describe, expect, it, vi } from "vitest";
import { awayLine, awaySummary, hoursSummary, isWithinWorkingHours, normalizeHours } from "../core/availability";
import { ChatError, toAvailability, type ChatClient } from "../core/client";
import { createOutbox, type QueuedMessage } from "../core/outbox";
import { createMemoryChatClient } from "../web/memory-client";

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("someone else's malformed working hours", () => {
  // What a member could store before the database checked it (or the server could still write).
  const bad = {
    mon: [[9, 17]],
    tue: 5,
    wed: [["09:00", "17:00"], ["x"], null, ["1:00", "2:00"], ["3:00", "4:00"], ["5:00", "6:00"], ["7:00", "8:00"]],
    thu: [["9am", "5pm"]],
    funday: [["09:00", "10:00"]],
    constructor: [["09:00", "10:00"]],
  } as never;

  it("keeps only mon..sun days of HH:MM string pairs, at most four a day", () => {
    expect(toAvailability({ user_id: SAM, hours: bad }).hours).toEqual({ wed: [["09:00", "17:00"], ["1:00", "2:00"], ["3:00", "4:00"], ["5:00", "6:00"]] });
    expect(normalizeHours("nope")).toBeNull();
    expect(normalizeHours([["09:00", "17:00"]])).toBeNull();
    expect(normalizeHours({ mon: [[9, 17]] })).toBeNull();
  });

  it("never makes the helpers throw", () => {
    const a = { userId: SAM, awayMessage: null, awayUntil: null, timeZone: "UTC", hours: bad };
    const now = new Date("2026-10-28T12:00:00Z"); // a Wednesday
    expect(() => isWithinWorkingHours(bad, "UTC", now)).not.toThrow();
    expect(isWithinWorkingHours(bad, "UTC", now)).toBe(true);
    expect(hoursSummary(bad)).toBe("Wed, 9–5, 1–2, 3–4, 5–6");
    expect(() => awayLine(a, "Sam", { now, always: true })).not.toThrow();
    expect(() => awaySummary([{ availability: a, name: "Sam" }, { availability: { ...a, hours: { tue: 5 } as never }, name: "Lee" }], { now })).not.toThrow();
    // An away date read in a zone Intl doesn't know falls back to the device's.
    const away = { ...a, awayMessage: "Off", awayUntil: new Date(now.getTime() + 86_400_000).toISOString(), timeZone: "Mars/Olympus" };
    expect(awayLine(away, "Sam", { now })).toMatch(/^Away until .+: Off$/);
  });
});

describe("clearing the outbox (sign-out) mid-send", () => {
  it("stops a send in flight: nothing posts after clear()", async () => {
    const gate = deferred();
    const sent: string[] = [];
    const client = { send: vi.fn(async (i: { body: string }) => (await gate.promise, sent.push(i.body), { id: "x" })), upload: vi.fn() } as unknown as ChatClient;
    const store = { load: async () => [], save: vi.fn(async (_q: QueuedMessage[]) => undefined) };
    const ob = createOutbox({ client, userId: ME, store });
    await ob.send({ conversationId: "c1", body: "from user A" });
    await tick();
    await ob.clear();
    const saves = store.save.mock.calls.length;
    gate.resolve();
    await tick(10);
    // The request had already gone, but the outbox records and reports nothing of it.
    expect(store.save.mock.calls.length).toBe(saves);
    expect(ob.pending()).toEqual([]);
  });

  it("never sends a message whose upload was in flight, and aborts that upload", async () => {
    const gate = deferred<string>();
    let signal: AbortSignal | undefined;
    const client = { send: vi.fn(async () => ({ id: "x" })) } as unknown as ChatClient;
    const upload = vi.fn(async (_c: string, _f: unknown, o?: { signal?: AbortSignal }) => ((signal = o?.signal), gate.promise));
    const ob = createOutbox({ client, userId: ME, upload });
    await ob.send({ conversationId: "c1", body: "with a file" }, [{ data: new Blob(["x"]), name: "a.png", contentType: "image/png" }]);
    await tick();
    await ob.clear();
    expect(signal?.aborted).toBe(true);
    gate.resolve("c1/me/a.png");
    await tick(10);
    expect(client.send).not.toHaveBeenCalled();

    // The next session's messages to the same conversation still go.
    await ob.send({ conversationId: "c1", body: "user B" });
    await tick(10);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect((client.send as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ body: "user B" });
  });

  it("aborts the upload of a discarded message and never sends it", async () => {
    const gate = deferred<string>();
    let signal: AbortSignal | undefined;
    const client = { send: vi.fn(async () => ({ id: "x" })) } as unknown as ChatClient;
    const ob = createOutbox({ client, userId: ME, upload: async (_c, _f, o) => ((signal = o?.signal), gate.promise) });
    const id = await ob.send({ conversationId: "c1", body: "never mind" }, [{ data: new Blob(["x"]), name: "a.png", contentType: "image/png" }]);
    await tick();
    await ob.discard(id);
    expect(signal?.aborted).toBe(true);
    gate.resolve("p");
    await tick(10);
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("retry order and refusals", () => {
  const queued = (clientId: string, body: string, extra: Partial<QueuedMessage> = {}): QueuedMessage => ({
    clientId,
    input: { conversationId: "c1", clientId, body },
    senderId: ME,
    createdAt: "",
    status: "failed",
    previews: {},
    files: [],
    attempts: 1,
    ...extra,
  });

  it("retryAll never lets a later message overtake one waiting for a lost file", async () => {
    const order: string[] = [];
    const lost = { name: "x.jpg", contentType: "image/jpeg", kind: "image" as const, lost: true };
    const store = { load: async () => [queued("a", "first", { pendingFiles: [lost] }), queued("b", "second")], save: async () => undefined };
    const client = { send: async (i: { body: string; clientId: string }) => (order.push(i.body), { id: i.clientId }), upload: async () => "c1/me/x.jpg" } as unknown as ChatClient;
    const ob = createOutbox({ client, userId: ME, store });
    await ob.retryAll();
    await tick(10);
    expect(order).toEqual([]);
    expect(ob.pending("c1").map((p) => p.status)).toEqual(["failed", "failed"]);

    await ob.reattach("a", [{ data: new Blob(["jpg"]), name: "x.jpg", contentType: "image/jpeg" }]);
    await tick(10);
    await ob.retryAll();
    await tick(10);
    expect(order).toEqual(["first", "second"]);
  });

  it("marks a refusal permanent: retryAll skips it (and what follows); a manual retry sends it", async () => {
    const send = vi.fn(async (_i: { body: string }) => {
      throw new ChatError("You can't post here", "42501", "send");
    });
    const ob = createOutbox({ client: { send } as unknown as ChatClient, userId: ME });
    const id = await ob.send({ conversationId: "c1", body: "one" });
    await tick(10);
    expect(ob.pending("c1")[0]).toMatchObject({ status: "failed", permanent: true, error: "You can't post here" });
    await ob.retryAll();
    await ob.retryAll();
    await tick(10);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockImplementationOnce(async () => ({ id: "m" }) as never);
    await ob.retry(id);
    await tick(10);
    expect(send).toHaveBeenCalledTimes(2);
    expect(ob.pending("c1")).toEqual([]);
  });

  it("classes database refusals as permanent and network trouble as not", () => {
    for (const code of ["42501", "22023", "23505", "P0001"]) expect(new ChatError("x", code, "send").permanent).toBe(true);
    for (const code of [undefined, "08006", "PGRST000", "GS429", "GSFILE"]) expect(new ChatError("x", code, "send").permanent).toBe(false);
  });
});

describe("preview URLs", () => {
  it("are let go only once the message has landed (or was discarded)", async () => {
    const gate = deferred();
    const releasePreview = vi.fn();
    const client = { send: async () => (await gate.promise, { id: "m" }) } as unknown as ChatClient;
    const ob = createOutbox({ client, userId: ME, releasePreview, upload: async () => "c1/me/v.webm" });
    await ob.send({ conversationId: "c1" }, [{ data: new Blob(["v"]), name: "v.webm", contentType: "video/webm", previewUrl: "blob:take" }]);
    await tick(10);
    expect(releasePreview).not.toHaveBeenCalled();
    gate.resolve();
    await tick(10);
    expect(releasePreview).toHaveBeenCalledWith("blob:take");

    const id = await ob.send({ conversationId: "c2" }, [{ data: new Blob(["p"]), name: "p.png", contentType: "image/png", previewUrl: "blob:photo" }]);
    await ob.discard(id);
    expect(releasePreview).toHaveBeenCalledWith("blob:photo");
  });
});

describe("search snippets", () => {
  it("can't be faked by a message's own « and »", async () => {
    const client = createMemoryChatClient({
      me: ME,
      conversations: [{ id: "c1", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "m", senderId: SAM, body: "a «fake» mark near quilt", createdAt: new Date().toISOString() }] }],
    });
    const [hit] = await client.search("quilt");
    expect(hit!.snippet).toBe("a ‹fake› mark near «quilt»");
  });
});
