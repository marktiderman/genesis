// @feat:media-resumable-uploads
// Follow-ups from the re-review of #551: each of these failed before its fix.
import { describe, expect, it } from "vitest";
import { bytesOf, setup } from "../../server/__tests__/helpers";
import { createMemoryResumeStore } from "../config";
import { fromBlob, fromBytes } from "../sources";
import { createUploader, type UploaderOptions } from "../uploader";
import { createWorkerFileHasher, type WorkerLike } from "../worker-hasher";

const ENDPOINT = "https://app.example.com/uploads";
type Hook = (method: string, path: string, forward: () => Promise<Response>) => Promise<Response>;

function client(s: ReturnType<typeof setup>, over: Partial<UploaderOptions> & { hook?: Hook } = {}) {
  const log: string[] = [];
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).slice(ENDPOINT.length) || "/";
    log.push(`${method} ${path}`);
    const forward = () => s.handler(new Request(String(input), { ...init, signal: undefined, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }));
    return over.hook ? over.hook(method, path, forward) : forward();
  }) as unknown as typeof globalThis.fetch;
  const sleep = async () => {
    for (const id of s.queued.splice(0)) await s.verifyJob({ payload: { uploadId: id } });
  };
  return { uploader: createUploader({ endpoint: ENDPOINT, fetch, sleep, retries: 3, ...over }), log };
}

describe("cancelling one worker hash", () => {
  it("gives the other files to a fresh worker, not to this thread", async () => {
    const workers: (WorkerLike & { posted: number[]; terminated: boolean })[] = [];
    const hashFile = createWorkerFileHasher(() => {
      const w = { posted: [] as number[], terminated: false, onmessage: null, onerror: null, postMessage: (m: { id: number }) => void w.posted.push(m.id), terminate: () => void (w.terminated = true) } as WorkerLike & { posted: number[]; terminated: boolean };
      workers.push(w);
      return w;
    });
    const abort = new AbortController();
    const first = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {}, abort.signal);
    let readHere = 0;
    const other = { ...fromBlob(new Blob([bytesOf(10)])), read: async () => (readHere++, bytesOf(10)) };
    const second = hashFile(other, () => {});
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
    expect(workers[1]!.posted).toEqual([2]);
    workers[1]!.onmessage!({ data: { id: 2, sha256: "ab" } });
    expect(await second).toBe("ab");
    expect(readHere).toBe(0);
  });
});

describe("a remembered session", () => {
  it("is kept on a refusal that isn't 404 or 410 (an expired token), and used next time", async () => {
    const s = setup();
    const store = createMemoryResumeStore();
    const bytes = bytesOf(40);
    let putsDown = true;
    let tokenExpired = false;
    const { uploader, log } = client(s, {
      resumeStore: store,
      hook: async (m, p, f) => {
        if (m === "PUT" && putsDown) throw new TypeError("down");
        if (tokenExpired && m === "GET") return new Response(JSON.stringify({ error: "Sign in again.", code: "unauthorized" }), { status: 401 });
        return f();
      },
    });
    await uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done.catch(() => {});
    expect(s.store.sessions.size).toBe(1);
    tokenExpired = true;
    await expect(uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done).rejects.toMatchObject({ status: 401 });
    // Not forgotten, and no new session made.
    tokenExpired = false;
    putsDown = false;
    log.length = 0;
    const result = await uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect(s.store.sessions.size).toBe(1);
    expect(log.filter((l) => l === "POST /")).toEqual([]);
  });
});

describe("back-off", () => {
  it("waits what Retry-After asks on a 503", async () => {
    const s = setup();
    const waits: number[] = [];
    // Drive the uploader with a sleep that records its waits.
    const timed = client(s, {
      sleep: async (ms) => void waits.push(ms),
      hook: async (m, _p, f) => {
        if (m === "POST" && waits.length === 0) return new Response("{}", { status: 503, headers: { "retry-after": "7" } });
        return f();
      },
    });
    const result = await timed.uploader.upload(fromBytes(bytesOf(10)), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect(waits[0]).toBe(7000);
  });
});
