/**
 * Client configuration that is never part of the protocol: where a resumed
 * upload's id is remembered, and the speed cap. (Priorities, pause and
 * resume, and files and parts at once are on the uploader.)
 */

/** Remembers an upload's id per file, so a reload or a relaunch resumes it. */
export interface ResumeStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, uploadId: string): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

/** In memory: survives a retry, not a reload. The default. */
export function createMemoryResumeStore(): ResumeStore {
  const ids = new Map<string, string>();
  return { get: (k) => ids.get(k) ?? null, set: (k, v) => void ids.set(k, v), delete: (k) => void ids.delete(k) };
}

type IdbLike = {
  open(name: string, version?: number): {
    result: IdbDatabase;
    error: unknown;
    onupgradeneeded: (() => void) | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  };
};
type IdbRequest<T> = { result: T; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
type IdbDatabase = {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(store: string, mode: "readonly" | "readwrite"): {
    objectStore(name: string): { get(key: string): IdbRequest<unknown>; put(value: unknown, key: string): IdbRequest<unknown>; delete(key: string): IdbRequest<unknown> };
  };
};

/**
 * In the browser's IndexedDB: survives a reload, so closing the tab and
 * coming back resumes the upload (the server's Resume says which parts it
 * has). Falls back to memory where there is no IndexedDB.
 */
export function createIndexedDbResumeStore(name = "genesis-media-library"): ResumeStore {
  const idb = (globalThis as { indexedDB?: IdbLike }).indexedDB;
  if (!idb) return createMemoryResumeStore();
  const STORE = "uploads";
  let db: Promise<IdbDatabase> | undefined;
  const open = () =>
    (db ??= new Promise<IdbDatabase>((resolve, reject) => {
      const req = idb.open(name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = async <T>(mode: "readonly" | "readwrite", act: (s: ReturnType<ReturnType<IdbDatabase["transaction"]>["objectStore"]>) => IdbRequest<T>) => {
    const store = (await open()).transaction(STORE, mode).objectStore(STORE);
    return new Promise<T>((resolve, reject) => {
      const req = act(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    get: async (k) => ((await run("readonly", (s) => s.get(k))) as string | undefined) ?? null,
    set: async (k, v) => void (await run("readwrite", (s) => s.put(v, k))),
    delete: async (k) => void (await run("readwrite", (s) => s.delete(k))),
  };
}

/**
 * A speed cap shared by every part of every upload on one uploader: a token
 * bucket at `rate()` bytes a second (0 is no cap), asked often, so the rate
 * can follow a schedule (slower in working hours).
 */
export function createSpeedLimiter(rate: () => number, sleep: (ms: number) => Promise<void>, clock: () => number = Date.now) {
  let allowance = 0;
  let last = clock();
  return async (bytes: number) => {
    for (;;) {
      const r = rate();
      if (!r || r <= 0) return;
      const now = clock();
      allowance = Math.min(r * 2, allowance + ((now - last) / 1000) * r);
      last = now;
      if (allowance >= bytes || allowance >= r * 2) {
        allowance -= bytes;
        return;
      }
      await sleep(Math.min(1000, ((bytes - allowance) / r) * 1000));
    }
  };
}
