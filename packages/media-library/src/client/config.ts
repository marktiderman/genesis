/**
 * Client configuration that is never part of the protocol: where a resumed
 * upload's id is remembered, and the speed cap. (Priorities, pause and
 * resume, and files and parts at once are on the uploader.)
 */

/** What a resume store keeps per file: the session's id, and when it lapses (ISO 8601). */
export interface RememberedUpload {
  uploadId: string;
  expiresAt: string;
}

/**
 * Remembers an upload's id per file, so a reload or a relaunch resumes it.
 * Keys come from the uploader: the endpoint, the owner hint and the file, so
 * two people on one browser never see each other's entries. An entry past
 * its `expiresAt` is gone.
 */
export interface ResumeStore {
  get(key: string): Promise<RememberedUpload | null> | RememberedUpload | null;
  set(key: string, value: RememberedUpload): Promise<void> | void;
  delete(key: string): Promise<void> | void;
  /** Forgets everything (sign-out). */
  clear(): Promise<void> | void;
}

const live = (v: RememberedUpload | null | undefined, now: number) => (v && Date.parse(v.expiresAt) > now ? v : null);

/** In memory: survives a retry, not a reload. The default. */
export function createMemoryResumeStore(now: () => number = Date.now): ResumeStore {
  const ids = new Map<string, RememberedUpload>();
  return {
    get: (k) => {
      const v = live(ids.get(k), now());
      if (!v) ids.delete(k);
      return v;
    },
    set: (k, v) => void ids.set(k, v),
    delete: (k) => void ids.delete(k),
    clear: () => ids.clear(),
  };
}

type IdbRequest<T> = { result: T; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
type IdbStore = {
  get(key: string): IdbRequest<unknown>;
  put(value: unknown, key: string): IdbRequest<unknown>;
  delete(key: string): IdbRequest<unknown>;
  clear(): IdbRequest<unknown>;
};
type IdbDatabase = {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(store: string, mode: "readonly" | "readwrite"): { objectStore(name: string): IdbStore };
};
/** The part of `indexedDB` this uses. */
export type IdbFactoryLike = {
  open(name: string, version?: number): IdbRequest<IdbDatabase> & { onupgradeneeded: (() => void) | null };
};

/**
 * In the browser's IndexedDB: survives a reload, so closing the tab and
 * coming back resumes the upload (the server's Resume says which parts it
 * has). Entries lapse with their session; `clear()` forgets them all, for
 * sign-out. Falls back to memory where there is no IndexedDB.
 */
export function createIndexedDbResumeStore(name = "genesis-media-library", options: { indexedDB?: IdbFactoryLike; now?: () => number } = {}): ResumeStore {
  const idb = options.indexedDB ?? (globalThis as { indexedDB?: IdbFactoryLike }).indexedDB;
  const now = options.now ?? Date.now;
  if (!idb) return createMemoryResumeStore(now);
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
    }).catch((e: unknown) => {
      // Not opened (private browsing, blocked): let a later call try again.
      db = undefined;
      throw e;
    }));
  const run = async <T>(mode: "readonly" | "readwrite", act: (s: IdbStore) => IdbRequest<T>) => {
    const store = (await open()).transaction(STORE, mode).objectStore(STORE);
    return new Promise<T>((resolve, reject) => {
      const req = act(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    async get(k) {
      const raw = (await run("readonly", (s) => s.get(k))) as RememberedUpload | undefined;
      const v = live(raw && typeof raw === "object" && typeof raw.uploadId === "string" ? raw : null, now());
      if (raw && !v) await run("readwrite", (s) => s.delete(k));
      return v;
    },
    set: async (k, v) => void (await run("readwrite", (s) => s.put({ uploadId: v.uploadId, expiresAt: v.expiresAt }, k))),
    delete: async (k) => void (await run("readwrite", (s) => s.delete(k))),
    clear: async () => void (await run("readwrite", (s) => s.clear())),
  };
}

/**
 * A speed cap shared by every part of every upload on one uploader, paced by
 * bytes: each send takes its bytes from a bucket filling at `rate()` bytes a
 * second (0 is no cap), and waits off any debt, so a part bigger than the
 * bucket still averages the rate. `rate` is asked every time, so it can
 * follow a schedule.
 */
export function createSpeedLimiter(rate: () => number, sleep: (ms: number) => Promise<void>, clock: () => number = Date.now) {
  let allowance = 0;
  let last = clock();
  return async (bytes: number) => {
    const r = rate();
    if (!r || r <= 0) {
      allowance = 0;
      last = clock();
      return;
    }
    const now = clock();
    // A second's worth of burst at most; then the bytes are taken, and any debt is waited off.
    allowance = Math.min(r, allowance + ((now - last) / 1000) * r);
    last = now;
    allowance -= bytes;
    if (allowance < 0) {
      const wait = (-allowance / r) * 1000;
      await sleep(wait);
      allowance = 0;
      last = clock();
    }
  };
}
