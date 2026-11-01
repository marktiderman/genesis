// @feat:media-resumable-uploads
// Follow-ups from the re-review of #551: each of these failed before its fix.
import { describe, expect, it } from "vitest";
import { bytesOf, client, setup } from "../../server/__tests__/helpers";
import { createMemoryResumeStore } from "../config";
import { fromBlob, fromBytes } from "../sources";
import { createWorkerFileHasher, type WorkerLike } from "../worker-hasher";

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

  it("ends the others the same abort cancelled at once, and starts only one fresh worker", async () => {
    const workers: (WorkerLike & { posted: number[]; terminated: boolean })[] = [];
    const hashFile = createWorkerFileHasher(() => {
      const w = { posted: [] as number[], terminated: false, onmessage: null, onerror: null, postMessage: (m: { id: number }) => void w.posted.push(m.id), terminate: () => void (w.terminated = true) } as WorkerLike & { posted: number[]; terminated: boolean };
      workers.push(w);
      return w;
    });
    const abort = new AbortController();
    const first = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {}, abort.signal);
    const second = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {}, abort.signal);
    const third = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {});
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(2);
    expect(workers[1]!.terminated).toBe(false);
    expect(workers[1]!.posted).toEqual([3]);
    workers[1]!.onmessage!({ data: { id: 3, sha256: "cd" } });
    expect(await third).toBe("cd");
  });
});

describe("a remembered session", () => {
  it("is kept on a 401 (an expired token), and used next time", async () => {
    const s = setup();
    const store = createMemoryResumeStore();
    const bytes = bytesOf(40);
    let putsDown = true;
    let tokenExpired = false;
    const { uploader, log } = client(s, {
      resumeStore: store,
      hook: async (m, _p, _i, f) => {
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

describe("a remembered session refused for good", () => {
  it("is forgotten on a 403, and the create's own refusal is what fails", async () => {
    const s = setup();
    const store = createMemoryResumeStore();
    const bytes = bytesOf(40);
    let putsDown = true;
    let forbidden = false;
    const { uploader, log } = client(s, {
      resumeStore: store,
      hook: async (m, _p, _i, f) => {
        if (m === "PUT" && putsDown) throw new TypeError("down");
        if (forbidden && (m === "GET" || m === "POST")) return Response.json({ error: "Not allowed.", code: "forbidden" }, { status: 403 });
        return f();
      },
    });
    await uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done.catch(() => {});
    putsDown = false;
    forbidden = true;
    log.length = 0;
    await expect(uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done).rejects.toMatchObject({ status: 403, code: "forbidden" });
    // It asked about the remembered session, then tried a fresh create, which was refused too.
    expect(log.map((l) => l.split(" ")[0])).toEqual(["GET", "POST"]);
    // Forgotten: allowed again, the next upload starts on a new session instead of asking about the old one.
    forbidden = false;
    log.length = 0;
    expect((await uploader.upload(fromBytes(bytes, "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done).state).toBe("done");
    expect(log[0]).toBe("POST /");
  });
});

describe("back-off", () => {
  it.each([
    ["waits what Retry-After asks on a 503", "7", (wait: number) => expect(wait).toBe(7000)],
    ["backs off as usual when Retry-After is a past date", "Wed, 21 Oct 2015 07:28:00 GMT", (wait: number) => expect(wait).toBeGreaterThan(0)],
  ])("%s", async (_name, retryAfter, check) => {
    const s = setup();
    const waits: number[] = [];
    // Drive the uploader with a sleep that records its waits.
    const timed = client(s, {
      sleep: async (ms) => void waits.push(ms),
      hook: async (m, _p, _i, f) => (m === "POST" && waits.length === 0 ? new Response("{}", { status: 503, headers: { "retry-after": retryAfter } }) : f()),
    });
    const result = await timed.uploader.upload(fromBytes(bytesOf(10)), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    check(waits[0]!);
  });
});
