/** @feat:chat Hosted uploads joining the outbox at start, and upload progress. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatClient, type ChatClient, type ChatSupabase } from "../core/client";
import { createOutbox, type HostedUpload, type HostedUploadStart, type OutboxStore, type QueuedMessage } from "../core/outbox";
import { sendBytes } from "../core/transfer";
import { installFakeXHR } from "./fake-xhr";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Saves through JSON, as localStorage or MMKV would: nothing is shared with the live queue. */
function jsonStore(): OutboxStore & { raw: () => QueuedMessage[] } {
  let saved = "[]";
  return {
    load: async () => JSON.parse(saved) as QueuedMessage[],
    save: async (q) => void (saved = JSON.stringify(q)),
    raw: () => JSON.parse(saved) as QueuedMessage[],
  };
}

/** A client whose send is idempotent by clientId, like send_message. */
function fakeClient() {
  const posted = new Map<string, { id: string; input: Record<string, unknown> }>();
  const sends: Record<string, unknown>[] = [];
  const client = {
    upload: vi.fn(async (_c: string, _u: string, _d: unknown, o: { name: string; onProgress?: (s: number, t: number) => void }) => {
      o.onProgress?.(5, 10);
      return `c1/me/${o.name}`;
    }),
    send: vi.fn(async (input: Record<string, unknown>) => {
      sends.push(input);
      const clientId = String(input.clientId);
      if (!posted.has(clientId)) posted.set(clientId, { id: `m-${posted.size + 1}`, input });
      const p = posted.get(clientId)!;
      return { id: p.id, conversationId: input.conversationId, clientId, seq: 1 } as never;
    }),
  } as unknown as ChatClient;
  return { client, sends, posted };
}

/** A hosted upload whose bytes finish when the test says. */
function hostedHook() {
  const calls: { file: string; resume?: unknown }[] = [];
  const finishers: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  let n = 0;
  const hook: HostedUpload = vi.fn(async (_conversationId, file, opts) => {
    calls.push({ file: file.name, resume: opts.resume });
    const done = new Promise<void>((resolve, reject) => finishers.push({ resolve, reject }));
    const start: HostedUploadStart = {
      provider: "mux",
      providerId: opts.resume?.providerId ?? `upl_${++n}`,
      status: "pending",
      url: opts.resume?.url ?? `https://up.test/${n}`,
      done,
    };
    return start;
  });
  return { hook, calls, finishers };
}

const video = (name = "clip.mp4") => ({ data: `file:///cache/${name}`, name, contentType: "video/mp4", hosted: true, meta: { kind: "video" as const, durationMs: 3000 } });

describe("a hosted video joins the outbox at start", () => {
  it("is sent in its place, pending, before its bytes are up; text written after it lands after it", async () => {
    const { client, sends } = fakeClient();
    const h = hostedHook();
    const outbox = createOutbox({ client, userId: "me", hostedUpload: h.hook, readFile: async () => new Blob(["v"]) });
    const videoId = await outbox.send({ conversationId: "c1", body: "" }, [video()]);
    const textId = await outbox.send({ conversationId: "c1", body: "Watch this" });
    await tick();
    await tick();
    expect(sends.map((s) => s.clientId)).toEqual([videoId, textId]);
    expect(sends[0]!.attachments).toEqual([
      expect.objectContaining({ kind: "video", provider: "mux", providerId: "upl_1", status: "pending", mime: "video/mp4", durationMs: 3000 }),
    ]);
    // Nothing went to storage.
    expect(client.upload).not.toHaveBeenCalled();
    // Posted, it waits only for its bytes.
    expect(outbox.pending("c1")).toEqual([expect.objectContaining({ clientId: videoId, sentMessageId: "m-1", status: "sending" })]);
    h.finishers[0]!.resolve();
    await tick();
    expect(outbox.pending("c1")).toEqual([]);
  });

  it("carries the upload on after a relaunch and sends the message again with the same clientId and upload id", async () => {
    const store = jsonStore();
    const first = fakeClient();
    const h1 = hostedHook();
    const before = createOutbox({ client: first.client, userId: "me", store, hostedUpload: h1.hook });
    const id = await before.send({ conversationId: "c1", body: "" }, [video()]);
    await tick();
    await tick();
    expect(first.sends).toHaveLength(1);
    expect(store.raw()[0]).toMatchObject({ clientId: id, hosted: { 0: { provider: "mux", providerId: "upl_1", url: "https://up.test/1" } } });

    // The app closes with the bytes half up; it opens again.
    const h2 = hostedHook();
    const after = createOutbox({ client: first.client, userId: "me", store, hostedUpload: h2.hook });
    await after.load();
    await after.retryAll();
    await tick();
    await tick();
    expect(h2.calls).toEqual([{ file: "clip.mp4", resume: expect.objectContaining({ provider: "mux", providerId: "upl_1", url: "https://up.test/1" }) }]);
    expect(first.sends).toHaveLength(2);
    expect(first.sends[1]).toMatchObject({ clientId: id, attachments: [expect.objectContaining({ providerId: "upl_1", status: "pending" })] });
    // Posted once.
    expect(first.posted.size).toBe(1);
    h2.finishers[0]!.resolve();
    await tick();
    expect(after.pending()).toEqual([]);
    expect(store.raw()).toEqual([]);
  });

  it("a failed transfer marks the posted message failed without holding later ones; Retry carries the same upload on", async () => {
    const { client, sends } = fakeClient();
    const h = hostedHook();
    const outbox = createOutbox({ client, userId: "me", hostedUpload: h.hook });
    const videoId = await outbox.send({ conversationId: "c1", body: "" }, [video()]);
    await tick();
    h.finishers[0]!.reject(new Error("network"));
    await tick();
    await tick();
    expect(outbox.pending("c1")[0]).toMatchObject({ clientId: videoId, status: "failed", error: "The video didn't finish uploading" });
    await outbox.send({ conversationId: "c1", body: "Still here" });
    await tick();
    expect(sends.at(-1)).toMatchObject({ body: "Still here" });

    await outbox.retry(videoId);
    await tick();
    await tick();
    expect(h.calls.at(-1)).toEqual({ file: "clip.mp4", resume: expect.objectContaining({ providerId: "upl_1" }) });
    h.finishers.at(-1)!.resolve();
    await tick();
    expect(outbox.pending("c1")).toEqual([]);
  });

  it("goes to storage, as before, without a hostedUpload", async () => {
    const { client, sends } = fakeClient();
    const outbox = createOutbox({ client, userId: "me", readFile: async () => new Blob(["v"]) });
    await outbox.send({ conversationId: "c1", body: "" }, [video()]);
    await tick();
    await tick();
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(sends[0]!.attachments).toEqual([expect.objectContaining({ kind: "video", path: "c1/me/clip.mp4" })]);
  });

  it("discarding the message stops its bytes", async () => {
    const { client } = fakeClient();
    let signal: AbortSignal | undefined;
    const hook: HostedUpload = async (_c, _f, opts) => {
      signal = opts.signal;
      return { provider: "mux", providerId: "upl_x", status: "pending", done: new Promise<void>(() => undefined) };
    };
    const outbox = createOutbox({ client, userId: "me", hostedUpload: hook });
    const id = await outbox.send({ conversationId: "c1", body: "" }, [video()]);
    await tick();
    await outbox.discard(id);
    expect(signal?.aborted).toBe(true);
    expect(outbox.pending()).toEqual([]);
  });
});

describe("upload progress", () => {
  it("shows each storage file's progress on the pending message", async () => {
    const { client } = fakeClient();
    let finish!: () => void;
    let report!: (s: number, t: number) => void;
    (client.upload as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_c: string, _u: string, _d: unknown, o: { name: string; onProgress?: (s: number, t: number) => void }) =>
        new Promise((r) => {
          report = o.onProgress!;
          finish = () => r(`c1/me/${o.name}`);
        }),
    );
    const changes: QueuedMessage[][] = [];
    const outbox = createOutbox({ client, userId: "me", onChange: (q) => changes.push(q) });
    await outbox.send({ conversationId: "c1" }, [{ data: new Blob(["0123456789"]), name: "a.png", contentType: "image/png" }]);
    await tick();
    report(4, 10);
    expect(outbox.pending("c1")[0]!.files?.[0]?.progress).toBe(0.4);
    report(10, 10);
    expect(outbox.pending("c1")[0]!.files?.[0]?.progress).toBe(1);
    finish();
    await tick();
    expect(outbox.pending("c1")).toEqual([]);
  });

  it("passes onProgress to the app's upload hook too", async () => {
    const { client } = fakeClient();
    let seen = 0;
    const outbox = createOutbox({
      client,
      userId: "me",
      upload: async (_c, file, o) => {
        o?.onProgress?.(1, 2);
        seen = outbox.pending("c1")[0]!.files![0]!.progress!;
        return `c1/me/${file.name}`;
      },
    });
    await outbox.send({ conversationId: "c1" }, [{ data: "file:///a.jpg", name: "a.jpg", contentType: "image/jpeg" }]);
    await tick();
    expect(seen).toBe(0.5);
  });
});

describe("client.upload with onProgress", () => {
  function storageFake() {
    const signedFor: string[] = [];
    const plain: string[] = [];
    const supabase = {
      schema: () => ({}),
      storage: {
        from: () => ({
          createSignedUploadUrl: async (path: string) => {
            signedFor.push(path);
            return { data: { signedUrl: `https://sb.test/storage/v1/object/upload/sign/genesis-chat/${path}?token=t`, path, token: "t" }, error: null };
          },
          upload: async (path: string) => {
            plain.push(path);
            return { data: { path }, error: null };
          },
        }),
      },
    } as unknown as ChatSupabase;
    return { supabase, signedFor, plain };
  }

  it("sends the bytes to a signed upload URL through XMLHttpRequest and reports progress", async () => {
    const XHR = installFakeXHR();
    const s = storageFake();
    const client = createChatClient(s.supabase);
    const progress: number[][] = [];
    const going = client.upload("c1", "me", new Blob(["0123456789"]), { name: "a.png", contentType: "image/png", id: "f1", onProgress: (a, b) => progress.push([a, b]) });
    await tick();
    const xhr = XHR.all[0]!;
    expect(xhr).toMatchObject({ method: "PUT", url: "https://sb.test/storage/v1/object/upload/sign/genesis-chat/c1/me/f1.png?token=t", sent: true });
    expect(xhr.headers).toMatchObject({ "content-type": "image/png", "x-upsert": "false" });
    xhr.progress(3, 10);
    xhr.respond(200, "{}");
    expect(await going).toBe("c1/me/f1.png");
    expect(progress).toEqual([
      [3, 10],
      [10, 10],
    ]);
    expect(s.plain).toEqual([]);
  });

  it("uses the plain upload without onProgress", async () => {
    installFakeXHR();
    const s = storageFake();
    const client = createChatClient(s.supabase);
    expect(await client.upload("c1", "me", new Blob(["x"]), { name: "a.png", contentType: "image/png", id: "f2" })).toBe("c1/me/f2.png");
    expect(s.plain).toEqual(["c1/me/f2.png"]);
    expect(s.signedFor).toEqual([]);
  });

  it("a refused PUT is a permanent ChatError; a dropped connection is transient", async () => {
    const XHR = installFakeXHR();
    const refused = sendBytes("https://x.test/a", new Blob(["x"]));
    XHR.all[0]!.respond(403);
    await expect(refused).rejects.toMatchObject({ name: "ChatError", permanent: true });
    const dropped = sendBytes("https://x.test/b", new Blob(["x"]));
    XHR.all[1]!.fail();
    await expect(dropped).rejects.toMatchObject({ name: "ChatError", transient: true });
  });
});
