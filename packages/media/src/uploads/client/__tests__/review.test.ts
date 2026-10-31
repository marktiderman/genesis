// @feat:media-resumable-uploads
// From the review of #551: each of these failed on 6aaa6d60.
import { describe, expect, it } from "vitest";
import { bytesOf, setup, sha256Hex } from "../../server/__tests__/helpers";
import { createIndexedDbResumeStore, createMemoryResumeStore, createSpeedLimiter, type IdbFactoryLike } from "../config";
import { fromBlob, fromBytes } from "../sources";
import { UploadClientError, createUploader, type UploaderOptions } from "../uploader";
import { createWorkerFileHasher, type WorkerLike } from "../worker-hasher";

const ENDPOINT = "https://app.example.com/uploads";

type Hook = (method: string, path: string, init: RequestInit, forward: () => Promise<Response>) => Promise<Response>;

/** An uploader talking to the test handler in-process, as Alice; `hook` can delay, fail or watch any request. */
function client(s: ReturnType<typeof setup>, over: Partial<UploaderOptions> & { hook?: Hook } = {}) {
  const log: string[] = [];
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).slice(ENDPOINT.length) || "/";
    log.push(`${method} ${path}`);
    const forward = () => s.handler(new Request(String(input), { ...init, signal: undefined, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }));
    return over.hook ? over.hook(method, path, init, forward) : forward();
  }) as unknown as typeof globalThis.fetch;
  // A wait runs the verify jobs queued meanwhile, as the job runner would.
  const sleep = async () => {
    for (const id of s.queued.splice(0)) await s.verifyJob({ payload: { uploadId: id } });
  };
  const uploader = createUploader({ endpoint: ENDPOINT, fetch, sleep, retries: 3, ...over });
  return { uploader, log };
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 1));
};

describe("2. a remembered session is trusted only when it is still this upload", () => {
  it("asked for more targets than the remembered session has: a new session, with every copy", async () => {
    const s = setup();
    const resumeStore = createMemoryResumeStore();
    const bytes = bytesOf(10);
    const first = client(s, { resumeStore, hook: async (m, p, i, f) => (m === "PUT" ? Promise.reject(new TypeError("network down")) : f()) });
    await first.uploader.upload(fromBytes(bytes, "k"), { name: "a", contentType: "a/b", purpose: "media", targets: ["working"] }).done.catch(() => {});
    const second = client(s, { resumeStore });
    const result = await second.uploader.upload(fromBytes(bytes, "k"), { name: "a", contentType: "a/b", purpose: "media", targets: ["working", "archive"] }).done;
    expect(result.state).toBe("done");
    expect(result.copies.map((c) => c.target)).toEqual(["working", "archive"]);
  });
});

describe("3. cancel stops requests in flight and back-off waits", () => {
  it("a part in flight is aborted, not waited for, and the session goes", async () => {
    const s = setup();
    let sawAbort = false;
    const { uploader } = client(s, {
      hook: (m, _p, init, forward) =>
        m === "PUT"
          ? new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => ((sawAbort = true), reject(new DOMException("aborted", "AbortError")))))
          : forward(),
    });
    const handle = uploader.upload(fromBytes(bytesOf(12)), { name: "a", contentType: "a/b", purpose: "media" });
    await waitFor(() => s.store.sessions.size === 1);
    await new Promise((r) => setTimeout(r, 5));
    await handle.cancel();
    await expect(handle.done).rejects.toMatchObject({ code: "cancelled" });
    expect(sawAbort).toBe(true);
    expect(s.store.sessions.size).toBe(0);
  });

  it("the uploader's and the upload's own `signal` cancel too, during a back-off", async () => {
    const s = setup();
    const outer = new AbortController();
    let slept = 0;
    const { uploader } = client(s, {
      signal: outer.signal,
      retries: 10,
      sleep: (ms, signal) => {
        slept++;
        if (slept === 1) outer.abort();
        return new Promise((r) => (signal?.aborted ? r() : setTimeout(r, ms)));
      },
      hook: async (m, _p, _i, f) => (m === "POST" ? new Response(null, { status: 503 }) : f()),
    });
    const t0 = Date.now();
    await expect(uploader.upload(fromBytes(bytesOf(4)), { name: "a", contentType: "a/b", purpose: "media" }).done).rejects.toMatchObject({ code: "cancelled" });
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe("4. a changed file under the same key", () => {
  it("identity_mismatch: the bad session is aborted and a new one sends the file", async () => {
    const s = setup();
    const resumeStore = createMemoryResumeStore();
    const v1 = bytesOf(12, 1);
    const v2 = bytesOf(12, 2);
    // The first run sends every part of v1 and dies before finalize.
    const first = client(s, { resumeStore, hook: async (m, p, i, f) => (p.endsWith("/finalize") ? Promise.reject(new TypeError("gone")) : f()) });
    await first.uploader.upload(fromBytes(v1, "same-name"), { name: "a", contentType: "a/b", purpose: "media", hashFirst: false }).done.catch(() => {});
    const old = [...s.store.sessions.keys()];
    // The file changed on disk, same name and size: the server's read-back finds the wrong identity.
    const second = client(s, { resumeStore });
    const result = await second.uploader.upload(fromBytes(v2, "same-name"), { name: "a", contentType: "a/b", purpose: "media", hashFirst: false }).done;
    expect(result.state).toBe("done");
    expect(result.copies[0]!.sha256).toBe(await sha256Hex(v2));
    for (const id of old) expect(s.store.sessions.has(id)).toBe(false);
  });
});

describe("5. resume entries are private and lapse", () => {
  /** A small IndexedDB in memory: one store, enough for the resume store. */
  function fakeIdb(): IdbFactoryLike & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>();
    const req = <T>(fn: () => T) => {
      const r: { result: T; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = { result: undefined as T, error: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        r.result = fn();
        r.onsuccess?.();
      });
      return r;
    };
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      transaction: () => ({
        objectStore: () => ({
          get: (k: string) => req(() => data.get(k)),
          put: (v: unknown, k: string) => req(() => void data.set(k, v)),
          delete: (k: string) => req(() => void data.delete(k)),
          clear: () => req(() => data.clear()),
        }),
      }),
    };
    return {
      data,
      open: () => {
        const r = { result: db, error: null, onsuccess: null as (() => void) | null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => r.onsuccess?.());
        return r as never;
      },
    };
  }

  it("keys entries by endpoint, owner and file, lapses them with the session, and clearResume forgets all", async () => {
    let clock = Date.parse("2026-11-01T00:00:00Z");
    const idb = fakeIdb();
    const store = createIndexedDbResumeStore("test", { indexedDB: idb, now: () => clock });
    await store.set("k", { uploadId: "U1", expiresAt: "2026-11-02T00:00:00.000Z" });
    expect(await store.get("k")).toEqual({ uploadId: "U1", expiresAt: "2026-11-02T00:00:00.000Z" });
    clock = Date.parse("2026-11-03T00:00:00Z");
    expect(await store.get("k")).toBeNull();
    expect(idb.data.has("k")).toBe(false);

    const s = setup();
    const bytes = bytesOf(10);
    const shared = createIndexedDbResumeStore("test", { indexedDB: idb });
    const alice = client(s, { resumeStore: shared, ownerHint: "alice", hook: async (m, p, i, f) => (m === "PUT" ? Promise.reject(new TypeError("down")) : f()) });
    await alice.uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done.catch(() => {});
    const keys = [...idb.data.keys()];
    expect(keys).toHaveLength(1);
    expect(JSON.parse(keys[0]!)).toEqual([ENDPOINT, "alice", "media", "a.bin"]);
    expect((idb.data.get(keys[0]!) as { expiresAt: string }).expiresAt).toMatch(/^2026-11-08/);
    await alice.uploader.clearResume();
    expect(idb.data.size).toBe(0);
  });
});

describe("6. smaller items", () => {
  it("waits for a slot before reading a part: never more than partsAtOnce parts in memory", async () => {
    const s = setup();
    let inMemory = 0;
    let most = 0;
    const bytes = bytesOf(40);
    const source = { ...fromBytes(bytes), read: async (o: number, l: number) => ((inMemory++, (most = Math.max(most, inMemory))), bytes.slice(o, o + l)) };
    const { uploader } = client(s, {
      partsAtOnce: 2,
      hook: async (m, _p, _i, f) => {
        if (m !== "PUT") return f();
        await new Promise((r) => setTimeout(r, 3));
        const res = await f();
        inMemory--;
        return res;
      },
    });
    await uploader.upload(source, { name: "a", contentType: "a/b", purpose: "media", hashFirst: false }).done;
    expect(most).toBeLessThanOrEqual(2);
  });

  it("sends parts in parallel: they overlap", async () => {
    const s = setup();
    let now = 0;
    let most = 0;
    const { uploader } = client(s, {
      partsAtOnce: 3,
      hook: async (m, _p, _i, f) => {
        if (m !== "PUT") return f();
        now++;
        most = Math.max(most, now);
        await new Promise((r) => setTimeout(r, 5));
        const res = await f();
        now--;
        return res;
      },
    });
    await uploader.upload(fromBytes(bytesOf(40)), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(most).toBe(3);
  });

  it("never reports more bytes than the file has, even when finalize asks for a part again", async () => {
    const s = setup();
    let once = true;
    const seen: number[] = [];
    const { uploader } = client(s, {
      hook: async (_m, p, _i, f) => {
        if (p.endsWith("/finalize") && once) {
          once = false;
          return Response.json({ error: "x", code: "missing_parts", parts: [1] }, { status: 409 });
        }
        return f();
      },
    });
    await uploader.upload(fromBytes(bytesOf(10)), { name: "a", contentType: "a/b", purpose: "media", onProgress: (p) => p.phase === "sending" && seen.push(p.bytesDone) }).done;
    expect(Math.max(...seen)).toBe(10);
  });

  it("backs off with jitter", async () => {
    const s = setup();
    const waits: number[] = [];
    let tries = 0;
    const { uploader } = client(s, {
      random: () => 0,
      sleep: async (ms) => void waits.push(ms),
      hook: async (m, _p, _i, f) => (m === "POST" && tries++ < 2 ? new Response(null, { status: 503 }) : f()),
    });
    await uploader.upload(fromBytes(bytesOf(4)), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(waits.slice(0, 2)).toEqual([500, 1000]); // half of 1 s and 2 s at jitter 0
  });

  it("a create retried after a lost answer finds the session it made, even without a SHA-256", async () => {
    const s = setup();
    let lost = true;
    const { uploader } = client(s, {
      hook: async (m, p, _i, f) => {
        if (m === "POST" && p === "/" && lost) {
          lost = false;
          await f();
          throw new TypeError("connection reset");
        }
        return f();
      },
    });
    const result = await uploader.upload(fromBytes(bytesOf(10)), { name: "a", contentType: "a/b", purpose: "media", hashFirst: false }).done;
    expect(result.state).toBe("done");
    expect(s.store.sessions.size).toBe(1);
  });

  it("a cancelled hash terminates the worker, and the next hash gets a fresh one", async () => {
    const workers: { terminated: boolean }[] = [];
    const hashFile = createWorkerFileHasher(() => {
      const w = { terminated: false, onmessage: null, onerror: null, postMessage() {}, terminate() { w.terminated = true; } } as WorkerLike & { terminated: boolean };
      workers.push(w);
      return w;
    });
    const abort = new AbortController();
    const p = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {}, abort.signal);
    abort.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.terminated).toBe(true);
    void hashFile(fromBlob(new Blob([bytesOf(10)])), () => {});
    expect(workers).toHaveLength(2);
  });

  it("a worker that goes silent is given up on, and the file is hashed in this thread", async () => {
    const bytes = bytesOf(1000);
    const hashFile = createWorkerFileHasher(() => ({ onmessage: null, onerror: null, postMessage() {}, terminate() {} }), { silentMs: 10 });
    expect(await hashFile(fromBlob(new Blob([bytes])), () => {})).toBe(await sha256Hex(bytes));
  });

  it("paces the speed cap by bytes: a part bigger than the bucket still averages the rate", async () => {
    let clock = 0;
    let slept = 0;
    const take = createSpeedLimiter(() => 1_000_000, async (ms) => void ((slept += ms), (clock += ms)), () => clock);
    for (let i = 0; i < 4; i++) await take(8_000_000);
    // 32 MB at 1 MB/s: 32 s, whatever the part size (the old limiter let a part past the bucket through after 2 s).
    expect(slept).toBeCloseTo(32_000, -2);
  });

  it("a cancel ends a speed-cap wait at once, and the bucket keeps its bytes (CodeRabbit)", async () => {
    let clock = 0;
    const waits: number[] = [];
    const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((r) => (waits.push(ms), signal?.aborted ? r() : signal?.addEventListener("abort", () => r(), { once: true })));
    const take = createSpeedLimiter(() => 1000, sleep, () => clock);
    const abort = new AbortController();
    const p = take(5000, abort.signal);
    abort.abort();
    await p;
    expect(waits).toEqual([5000]);
    // The next 1000 bytes wait 1 s (its own), not 6 s: the cancelled 5000 were given back.
    void take(1000);
    expect(waits.at(-1)).toBe(1000);
  });

  it("a retried create whose session lapsed meanwhile gets a new session, not the lapsed one (CodeRabbit)", async () => {
    const s = setup({ sessionTtlSeconds: 60 });
    const id = "AAAAAAAAAAAAAAAAAAAAA1";
    const body = { name: "a", contentType: "a/b", size: 4, purpose: "media", uploadId: id };
    expect((await s.alice.create(body)).status).toBe(201);
    s.tick(61_000);
    const again = await s.alice.create(body);
    expect(again.status).toBe(201);
    expect(s.working.openUploads.size).toBe(1);
  });

  it("pause covers hashing and finalize", async () => {
    const s = setup();
    const { uploader, log } = client(s);
    const handle = uploader.upload(fromBytes(bytesOf(9 * 1024 * 1024 + 3)), {
      name: "a",
      contentType: "a/b",
      purpose: "media",
      onProgress: (p) => {
        if (p.phase === "hashing" && p.bytesDone < p.size) handle.pause();
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(log).toEqual([]); // still hashing, paused
    uploader.pauseAll();
    handle.resume();
    await new Promise((r) => setTimeout(r, 20));
    expect(log).toEqual([]);
    uploader.resumeAll();
    // Pause again once sending: finalize waits.
    await waitFor(() => log.some((l) => l.startsWith("PUT")));
    handle.pause();
    await new Promise((r) => setTimeout(r, 20));
    expect(log.some((l) => l.endsWith("/finalize"))).toBe(false);
    handle.resume();
    expect((await handle.done).state).toBe("done");
  });
});

void UploadClientError;
