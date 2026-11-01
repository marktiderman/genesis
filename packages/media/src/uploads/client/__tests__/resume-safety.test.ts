// @feat:media-resumable-uploads
// From the review of the upload client follow-ups: each of these failed before its fix.
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
  /** An IndexedDB in memory with versions: an upgrade runs before success, with its own transaction and a cursor. */
  function versionedIdb(version: number, entries: [string, unknown][] = []) {
    const data = new Map<string, unknown>(entries);
    let current = version;
    let hasStore = version > 0;
    const upgrades: number[] = [];
    const req = <T>(fn: () => T) => {
      const r = { result: undefined as T, error: null as unknown, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
      queueMicrotask(() => {
        r.result = fn();
        r.onsuccess?.();
      });
      return r;
    };
    const objectStore = () => ({
      get: (k: string) => req(() => data.get(k)),
      put: (v: unknown, k: string) => req(() => void data.set(k, v)),
      delete: (k: string) => req(() => void data.delete(k)),
      clear: () => req(() => data.clear()),
      openCursor: () => {
        const keys = [...data.keys()];
        let i = 0;
        const r = { result: null as unknown, error: null, onsuccess: null as (() => void) | null, onerror: null };
        const step = () =>
          queueMicrotask(() => {
            const k = keys[i];
            r.result = i < keys.length ? { key: k, delete: () => void data.delete(k!), continue: () => (i++, step()) } : null;
            r.onsuccess?.();
          });
        step();
        return r;
      },
    });
    const db = { objectStoreNames: { contains: () => hasStore }, createObjectStore: () => void (hasStore = true), transaction: () => ({ objectStore }) };
    const idb: IdbFactoryLike = {
      open: (_name, want = 1) => {
        const r = { result: db, error: null, onsuccess: null as (() => void) | null, onerror: null, onupgradeneeded: null as ((e: { oldVersion: number }) => void) | null, transaction: null as { objectStore: typeof objectStore } | null };
        queueMicrotask(() => {
          if (want > current) {
            upgrades.push(current);
            r.transaction = { objectStore };
            r.onupgradeneeded?.({ oldVersion: current });
            current = want;
          }
          // Success comes once the upgrade's transaction (and its cursor) has finished.
          setTimeout(() => {
            r.transaction = null;
            r.onsuccess?.();
          }, 0);
        });
        return r as never;
      },
    };
    return { idb, data, upgrades };
  }

  const entry = { uploadId: "U1", expiresAt: "2099-01-01T00:00:00.000Z" };

  it("deletes entries under plain keys (the user id and file name) when it opens, once, and keeps digest keys", async () => {
    const digest = await resumeKey(BASE, "alice", "media", "a.bin");
    const legacy = JSON.stringify([BASE, "alice", "media", "holiday.mov:10:1"]);
    const { idb, data, upgrades } = versionedIdb(1, [
      [legacy, entry],
      ["not-a-digest", entry],
      [digest.toUpperCase().slice(0, 63), entry],
      [digest, entry],
    ]);
    const store = createIndexedDbResumeStore("test", { indexedDB: idb });
    expect(await store.get(digest)).toEqual(entry);
    expect([...data.keys()]).toEqual([digest]);
    expect(upgrades).toEqual([1]);

    // Opened again at the current version: no second sweep.
    const again = createIndexedDbResumeStore("test", { indexedDB: idb });
    expect(await again.get(digest)).toEqual(entry);
    expect(upgrades).toEqual([1]);
  });

  it("creates the store in a new database, with nothing to sweep", async () => {
    const { idb, data, upgrades } = versionedIdb(0);
    const store = createIndexedDbResumeStore("test", { indexedDB: idb });
    const digest = await resumeKey(BASE, "", "media", "a.bin");
    await store.set(digest, entry);
    expect(await store.get(digest)).toEqual(entry);
    expect([...data.keys()]).toEqual([digest]);
    expect(upgrades).toEqual([0]);
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
