// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import { toHex } from "../../protocol";
import { bytesOf, setup, sha256Hex } from "../../server/__tests__/helpers";
import { createMemoryResumeStore, createSpeedLimiter } from "../config";
import { hashBlob, type HashReply } from "../hash-core";
import { fromBlob, fromBytes, fromFileHandle } from "../sources";
import { UploadClientError, createUploader, type UploaderOptions } from "../uploader";
import { createWorkerFileHasher } from "../worker-hasher";

const ENDPOINT = "https://app.example.com/uploads";

/** An uploader talking to the test handler in-process, as Alice. */
function client(s: ReturnType<typeof setup>, over: Partial<UploaderOptions> & { failAfterParts?: number } = {}) {
  const log: string[] = [];
  let parts = 0;
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).slice(ENDPOINT.length) || "/";
    log.push(`${method} ${path}`);
    if (method === "PUT" && over.failAfterParts !== undefined && parts++ >= over.failAfterParts) throw new TypeError("network down");
    return s.handler(new Request(String(input), { ...init, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }));
  }) as unknown as typeof globalThis.fetch;
  const uploader = createUploader({ endpoint: ENDPOINT, fetch, sleep: async () => {}, retries: 2, ...over });
  return { uploader, log };
}

describe("createUploader", () => {
  it("hashes, creates, sends every part (in parallel) and finalizes", async () => {
    const s = setup();
    const { uploader, log } = client(s, { partsAtOnce: 3 });
    const bytes = bytesOf(10);
    const phases: string[] = [];
    const result = await uploader.upload(fromBytes(bytes), { name: "a.bin", contentType: "a/b", purpose: "media", onProgress: (p) => phases.push(p.phase) }).done;
    expect(result.state).toBe("done");
    expect(result.copies.map((c) => c.target)).toEqual(["working", "archive"]);
    expect(result.copies[0]!.sha256).toBe(await sha256Hex(bytes));
    expect(log.filter((l) => l.startsWith("PUT"))).toHaveLength(3);
    expect(phases[0]).toBe("hashing");
    expect(phases).toContain("sending");
  });

  it("is skipped when the server already has an identical object the person can read", async () => {
    const bytes = bytesOf(10);
    const sha = await sha256Hex(bytes);
    const copies = ["working", "archive"].map((target) => ({ target, key: "old", size: 10, sha256: sha, verifiedAt: "2026-10-01T00:00:00.000Z" }));
    const s = setup({ readableObjects: [{ copies, ref: "m1" }] });
    const { uploader, log } = client(s);
    const result = await uploader.upload(fromBytes(bytes), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result).toEqual({ state: "skipped", copies, ref: "m1" });
    expect(log).toEqual(["POST /"]);
  });

  it("reads the file once with hashFirst: false, and declares the SHA-256 at finalize", async () => {
    const s = setup();
    const { uploader, log } = client(s);
    const bytes = bytesOf(10);
    let reads = 0;
    const source = { ...fromBytes(bytes), read: (o: number, l: number) => (reads++, fromBytes(bytes).read(o, l)) };
    const result = await uploader.upload(source, { name: "a", contentType: "a/b", purpose: "media", hashFirst: false }).done;
    expect(result.state).toBe("done");
    expect(reads).toBe(3);
    expect(log.at(-1)).toMatch(/^POST \/.+\/finalize$/);
    expect(s.store.sessions.values().next().value!.sha256).toBe(await sha256Hex(bytes));
  });

  it("resumes after the tab closed: a new uploader with the same store sends only what's missing", async () => {
    const s = setup();
    const resumeStore = createMemoryResumeStore();
    const bytes = bytesOf(10);
    const source = () => fromBytes(bytes, "a.bin:10:1");
    // One part at a time, so exactly part 1 lands before the network goes.
    const first = client(s, { resumeStore, failAfterParts: 1, partsAtOnce: 1 });
    await expect(first.uploader.upload(source(), { name: "a.bin", contentType: "a/b", purpose: "media" }).done).rejects.toBeInstanceOf(UploadClientError);
    const second = client(s, { resumeStore });
    const result = await second.uploader.upload(source(), { name: "a.bin", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect(second.log[0]).toMatch(/^GET \//);
    expect(second.log.filter((l) => l.startsWith("PUT"))).toEqual(expect.arrayContaining([expect.stringMatching(/\/parts\/2$/), expect.stringMatching(/\/parts\/3$/)]));
    expect(second.log.some((l) => /\/parts\/1$/.test(l))).toBe(false);
    expect(await resumeStore.get("media:a.bin:10:1")).toBeNull();
  });

  it("polls a big upload's read-back until the job has run", async () => {
    const s = setup();
    let polls = 0;
    const { uploader, log } = client(s, {
      sleep: async () => {
        if (++polls === 2) for (const id of s.queued) await s.verifyJob({ payload: { uploadId: id } });
      },
    });
    const phases: string[] = [];
    const result = await uploader.upload(fromBytes(bytesOf(40)), { name: "a", contentType: "a/b", purpose: "media", onProgress: (p) => phases.push(p.phase) }).done;
    expect(result.state).toBe("done");
    expect(phases).toContain("verifying");
    expect(log.filter((l) => /^GET \/[^/]+$/.test(l)).length).toBeGreaterThanOrEqual(2);
  });

  it("never makes a wrong copy: a resumed session holding other bytes for a part ends in identity_mismatch", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const resumeStore = createMemoryResumeStore();
    const created = await (await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" })).json() as { uploadId: string };
    // An earlier run (a changed file) left other bytes for part 1; the client trusts the server's part list.
    await s.alice.part(created.uploadId, 1, bytesOf(4, 77));
    await resumeStore.set("media:k", created.uploadId);
    const { uploader, log } = client(s, { resumeStore });
    const result = await uploader.upload(fromBytes(bytes, "k"), { name: "a", contentType: "a/b", purpose: "media" }).done.catch((e: unknown) => e);
    expect(result).toBeInstanceOf(UploadClientError);
    expect((result as UploadClientError).code).toBe("identity_mismatch");
    expect(log[0]).toBe(`GET /${created.uploadId}`);
    expect(s.archive.locks.size).toBe(0);
    expect(await resumeStore.get("media:k")).toBeNull();
  });

  it("restarts once when a part is refused as part_conflict", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    let conflictOnce = true;
    const fetch = (async (input: string, init: RequestInit = {}) => {
      if (init.method === "PUT" && conflictOnce) {
        conflictOnce = false;
        return Response.json({ error: "x", code: "part_conflict" }, { status: 409 });
      }
      return s.handler(new Request(String(input), { ...init, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }));
    }) as unknown as typeof globalThis.fetch;
    const uploader = createUploader({ endpoint: ENDPOINT, fetch, sleep: async () => {}, partsAtOnce: 1 });
    const result = await uploader.upload(fromBytes(bytes), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect([...s.store.sessions.values()].filter((x) => x.state === "done")).toHaveLength(1);
  });

  it("pauses after the parts in flight, and carries on when resumed", async () => {
    const s = setup();
    const { uploader, log } = client(s, { partsAtOnce: 1 });
    let handle!: ReturnType<typeof uploader.upload>;
    let sentWhilePaused = 0;
    let paused = false;
    handle = uploader.upload(fromBytes(bytesOf(12)), {
      name: "a",
      contentType: "a/b",
      purpose: "media",
      onProgress: (p) => {
        if (p.phase === "sending" && !paused) {
          paused = true;
          handle.pause();
          setTimeout(() => {
            sentWhilePaused = log.filter((l) => l.startsWith("PUT")).length;
            handle.resume();
          }, 20);
        }
      },
    });
    const result = await handle.done;
    expect(result.state).toBe("done");
    expect(sentWhilePaused).toBeLessThanOrEqual(2);
    expect(log.filter((l) => l.startsWith("PUT"))).toHaveLength(3);
  });

  it("starts queued files by priority, then in order", async () => {
    const s = setup();
    const { uploader, log } = client(s, { filesAtOnce: 1 });
    const names: string[] = [];
    const start = (name: string, priority: "now" | "normal" | "background") =>
      uploader.upload(fromBytes(bytesOf(4, name.length)), { name, contentType: "a/b", purpose: "media", priority, onProgress: (p) => p.phase === "hashing" && !names.includes(name) && names.push(name) }).done;
    await Promise.all([start("first", "normal"), start("bg", "background"), start("later", "normal"), start("urgent", "now")]);
    expect(names).toEqual(["first", "urgent", "later", "bg"]);
    expect(log.filter((l) => l === "POST /")).toHaveLength(4);
  });

  it("cancels: stops and aborts the session on the server", async () => {
    const s = setup();
    const { uploader, log } = client(s, { partsAtOnce: 1 });
    let handle!: ReturnType<typeof uploader.upload>;
    handle = uploader.upload(fromBytes(bytesOf(12)), { name: "a", contentType: "a/b", purpose: "media", onProgress: (p) => p.phase === "sending" && void handle.cancel() });
    await expect(handle.done).rejects.toMatchObject({ code: "cancelled" });
    expect(log.some((l) => l.startsWith("DELETE"))).toBe(true);
    expect([...s.store.sessions.values()]).toHaveLength(0);
  });

  it("reports the server's refusal as an UploadClientError with its code", async () => {
    const s = setup({ authorize: () => ({ allow: false, status: 415 }) });
    const { uploader } = client(s);
    await expect(uploader.upload(fromBytes(bytesOf(4)), { name: "a", contentType: "a/b", purpose: "media" }).done).rejects.toMatchObject({ code: "unsupported_type", status: 415 });
  });

  it("retries a partial upload's failed targets with finalize", async () => {
    const s = setup();
    const { uploader } = client(s);
    s.archive.fail();
    const result = await uploader.upload(fromBytes(bytesOf(10)), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("partial");
    s.archive.heal();
    expect((await uploader.finalize(result.uploadId!)).state).toBe("done");
  });
});

describe("cancel and failures that must not stop an upload", () => {
  it("a cancel while still queued: it never starts, and the next one runs", async () => {
    const s = setup();
    const { uploader, log } = client(s, { filesAtOnce: 1 });
    const first = uploader.upload(fromBytes(bytesOf(4)), { name: "first", contentType: "a/b", purpose: "media" });
    const second = uploader.upload(fromBytes(bytesOf(4, 2)), { name: "second", contentType: "a/b", purpose: "media" });
    const third = uploader.upload(fromBytes(bytesOf(4, 3)), { name: "third", contentType: "a/b", purpose: "media" });
    await second.cancel();
    await expect(second.done).rejects.toMatchObject({ code: "cancelled" });
    expect((await first.done).state).toBe("done");
    expect((await third.done).state).toBe("done");
    expect(log.filter((l) => l === "POST /")).toHaveLength(2);
  });

  it("a cancel during hashing stops before any session is made", async () => {
    const s = setup();
    const { uploader, log } = client(s);
    let handle!: ReturnType<typeof uploader.upload>;
    const big = { ...fromBytes(new Uint8Array(9 * 1024 * 1024)) };
    handle = uploader.upload(big, { name: "a", contentType: "a/b", purpose: "media", onProgress: (p) => p.phase === "hashing" && void handle.cancel() });
    await expect(handle.done).rejects.toMatchObject({ code: "cancelled" });
    expect(log).toEqual([]);
  });

  it("a cancel while everything is paused still stops, and removes the session", async () => {
    const s = setup();
    const { uploader } = client(s, { partsAtOnce: 1 });
    let handle!: ReturnType<typeof uploader.upload>;
    handle = uploader.upload(fromBytes(bytesOf(12)), {
      name: "a",
      contentType: "a/b",
      purpose: "media",
      onProgress: (p) => {
        if (p.phase === "sending") {
          uploader.pauseAll();
          setTimeout(() => void handle.cancel(), 5);
        }
      },
    });
    await expect(handle.done).rejects.toMatchObject({ code: "cancelled" });
    expect([...s.store.sessions.values()]).toHaveLength(0);
  });

  it("a resume store that fails never stops the upload", async () => {
    const s = setup();
    const broken = { get: () => Promise.reject(new Error("blocked")), set: () => Promise.reject(new Error("blocked")), delete: () => Promise.reject(new Error("blocked")) };
    const { uploader } = client(s, { resumeStore: broken });
    expect((await uploader.upload(fromBytes(bytesOf(10), "k"), { name: "a", contentType: "a/b", purpose: "media" }).done).state).toBe("done");
  });

  it("a hashing worker that fails: its jobs are hashed in this thread, and so is everything after", async () => {
    const bytes = bytesOf(1000);
    let started = 0;
    const worker = {
      onmessage: null as ((e: { data: HashReply }) => void) | null,
      onerror: null as ((e: unknown) => void) | null,
      terminated: false,
      terminate() {
        this.terminated = true;
      },
      postMessage() {
        queueMicrotask(() => this.onerror?.(new Error("worker crashed")));
      },
    };
    const hashFile = createWorkerFileHasher(() => (started++, worker));
    const want = await sha256Hex(bytes);
    expect(await hashFile(fromBlob(new Blob([bytes])), () => {})).toBe(want);
    expect(worker.terminated).toBe(true);
    expect(await hashFile(fromBlob(new Blob([bytes])), () => {})).toBe(want);
    expect(started).toBe(1);
  });
});

describe("speed cap", () => {
  it("holds parts to the rate, across uploads", async () => {
    let clock = 0;
    const waits: number[] = [];
    const take = createSpeedLimiter(() => 100, async (ms) => void (waits.push(ms), (clock += ms)), () => clock);
    await take(100);
    await take(100);
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const free = createSpeedLimiter(() => 0, async () => void waits.push(-1));
    await free(10_000);
    expect(waits).not.toContain(-1);
  });
});

describe("sources and hashing", () => {
  it("reads a blob and a file handle a slice at a time, and refuses a short read", async () => {
    const bytes = bytesOf(10);
    const blob = fromBlob(Object.assign(new Blob([bytes]), { name: "a.jpg", lastModified: 5 }));
    expect(blob.key).toBe("a.jpg:10:5");
    expect([...(await blob.read(2, 3))]).toEqual([...bytes.subarray(2, 5)]);
    const handle = fromFileHandle({ size: 10, read: (o, l) => bytes.slice(o, o + l) });
    expect([...(await handle.read(8, 4))]).toEqual([...bytes.subarray(8)]);
    const short = fromFileHandle({ size: 10, read: () => new Uint8Array(1) });
    await expect(short.read(0, 4)).rejects.toThrow(/changed/);
  });

  it("hashes a blob in a worker (here a fake one that runs the worker's own code)", async () => {
    const bytes = bytesOf(9_000_000);
    const posted: HashReply[] = [];
    const worker = {
      onmessage: null as ((e: { data: HashReply }) => void) | null,
      onerror: null,
      terminate() {},
      postMessage(m: { id: number; blob: Blob }) {
        void hashBlob(m, (reply) => (posted.push(reply), this.onmessage?.({ data: reply })));
      },
    };
    const hashFile = createWorkerFileHasher(() => worker);
    const seen: number[] = [];
    const sha = await hashFile(fromBlob(new Blob([bytes])), (n) => seen.push(n));
    expect(sha).toBe(toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))));
    expect(seen.at(-1)).toBe(9_000_000);
    // A source that isn't a blob is hashed in this thread.
    expect(await hashFile(fromBytes(bytes.subarray(0, 10)), () => {})).toBe(await sha256Hex(bytes.subarray(0, 10)));
  });
});

