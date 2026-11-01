// @feat:media-resumable-uploads
// From the review of the upload client follow-ups: each of these failed before its fix.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../../hash";
import { toHex } from "../../protocol";
import { BASE, bytesOf, client, setup, sha256Hex } from "../../server/__tests__/helpers";
import { createIndexedDbResumeStore, createMemoryResumeStore, type IdbFactoryLike } from "../config";
import { fromBlob, fromBytes } from "../sources";
import { createWorkerFileHasher, type WorkerLike } from "../worker-hasher";

const resumeKey = async (...parts: string[]) => toHex(await sha256Bytes(new TextEncoder().encode(JSON.stringify(parts))));

describe("a remembered session answered with a 200 that isn't a status", () => {
  it.each([
    ["no body", () => new Response(null, { status: 200 })],
    ["not JSON", () => new Response("<html>ok</html>", { status: 200 })],
    ["JSON that isn't a status", () => Response.json([1, 2], { status: 200 })],
  ])("%s: is forgotten, and the file goes on a new session", async (_, answer) => {
    const s = setup();
    const resumeStore = createMemoryResumeStore();
    const key = await resumeKey(BASE, "", "media", "a.bin");
    await resumeStore.set(key, { uploadId: "remembered-id", expiresAt: "2099-01-01T00:00:00.000Z" });
    const { uploader, log } = client(s, { resumeStore, hook: async (m, p, _i, f) => (m === "GET" && p === "/remembered-id" ? answer() : f()) });
    const result = await uploader.upload(fromBytes(bytesOf(10), "a.bin"), { name: "a", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect(log.slice(0, 2)).toEqual(["GET /remembered-id", "POST /"]);
    expect(log.some((l) => l.startsWith("DELETE"))).toBe(false);
    expect(await resumeStore.get(key)).toBeNull();
  });
});

describe("the IndexedDB resume store and an older client's entries", () => {
  const entry = { uploadId: "U1", expiresAt: "2099-01-01T00:00:00.000Z" };
  type Factory = InstanceType<typeof IDBFactory>;
  type Database = ReturnType<Factory["open"]>["result"];
  /** Opens the database as an older client does (version 1), seeding entries; resolves the connection. */
  const openAsOlderClient = (idb: Factory, entries: [string, unknown][] = []) =>
    new Promise<Database>((resolve, reject) => {
      const req = idb.open("test", 1);
      req.onupgradeneeded = () => void req.result.createObjectStore("uploads");
      req.onsuccess = () => {
        const tx = req.result.transaction("uploads", "readwrite");
        for (const [k, v] of entries) tx.objectStore("uploads").put(v, k);
        tx.oncomplete = () => resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  const keys = (d: Database) =>
    new Promise<unknown[]>((resolve) => {
      const req = d.transaction("uploads", "readonly").objectStore("uploads").getAllKeys();
      req.onsuccess = () => resolve(req.result);
    });
  const settles = <T>(p: Promise<T> | T) => Promise.race([Promise.resolve(p), new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 1000))]);

  it("deletes entries under plain keys (the user id and file name) when it opens, and keeps digest keys", async () => {
    const idb = new IDBFactory();
    const digest = await resumeKey(BASE, "alice", "media", "a.bin");
    const older = await openAsOlderClient(idb, [
      [JSON.stringify([BASE, "alice", "media", "holiday.mov:10:1"]), entry],
      [digest.toUpperCase(), entry],
      [digest, entry],
    ]);
    older.close();
    const store = createIndexedDbResumeStore("test", { indexedDB: idb as unknown as IdbFactoryLike });
    expect(await store.get(digest)).toEqual(entry);
    const after = await openAsOlderClient(idb);
    expect(await keys(after)).toEqual([digest]);
  });

  it("opens while an older client's tab holds the database, and that client still opens it afterwards", async () => {
    const idb = new IDBFactory();
    const older = await openAsOlderClient(idb);
    const store = createIndexedDbResumeStore("test", { indexedDB: idb as unknown as IdbFactoryLike });
    const digest = await resumeKey(BASE, "", "media", "a.bin");
    await settles(store.set(digest, entry));
    expect(await settles(store.get(digest))).toEqual(entry);
    older.close();
    // A rolled-back or cached older client opens the same version, and reads what is there.
    expect(await keys(await settles(openAsOlderClient(idb)))).toEqual([digest]);
  });
});

describe("cancelling a worker hash when the fresh worker refuses the others", () => {
  type MockWorker = WorkerLike & { posted: number[]; terminated: boolean };
  const mockWorker = (refuses: boolean): MockWorker => {
    const w = {
      posted: [] as number[],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage: (m: { id: number }) => {
        if (refuses) throw new DOMException("could not be cloned", "DataCloneError");
        w.posted.push(m.id);
      },
      terminate: () => void (w.terminated = true),
    } as MockWorker;
    return w;
  };

  it("the cancelled hash rejects, and the others are hashed in this thread", async () => {
    const workers: MockWorker[] = [];
    // The first worker takes jobs; the fresh one started after the cancel throws on postMessage.
    const hashFile = createWorkerFileHasher(() => {
      const w = mockWorker(workers.length > 0);
      workers.push(w);
      return w;
    });
    const abort = new AbortController();
    const first = hashFile(fromBlob(new Blob([bytesOf(10)])), () => {}, abort.signal);
    const bytes = bytesOf(10, 3);
    const second = hashFile(fromBlob(new Blob([bytes])), () => {});
    expect(workers[0]!.posted).toEqual([1, 2]);
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(2);
    expect(await second).toBe(await sha256Hex(bytes));
  });

  it("a worker that refuses the first job: the file is hashed in this thread", async () => {
    const hashFile = createWorkerFileHasher(() => mockWorker(true));
    const bytes = bytesOf(10, 4);
    expect(await hashFile(fromBlob(new Blob([bytes])), () => {})).toBe(await sha256Hex(bytes));
  });
});
