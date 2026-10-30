/**
 * The upload client: one core for browser, native and server, driving the
 * protocol (hash, create or skip, send the missing parts in parallel,
 * finalize, poll the read-back) and resuming from the server's own record
 * after any failure. Priorities, pause and resume, files and parts at once
 * and the speed cap are this client's configuration, never the protocol's.
 */
import { createNobleSha256, sha256Bytes, type CreateSha256 } from "../hash";
import {
  formatContentDigest,
  partPlan,
  toBase64,
  toHex,
  type UploadCopy,
  type UploadError,
  type UploadErrorCode,
  type UploadSkipped,
  type UploadStatus,
} from "../protocol";
import { createMemoryResumeStore, createSpeedLimiter, type ResumeStore } from "./config";
import type { UploadSource } from "./sources";
import type { HashFile } from "./worker-hasher";

/** A refusal or failure the client won't retry on its own. */
export class UploadClientError extends Error {
  readonly code: UploadErrorCode | "network" | "cancelled";
  readonly status: number;
  constructor(message: string, code: UploadClientError["code"], status = 0) {
    super(message);
    this.name = "UploadClientError";
    this.code = code;
    this.status = status;
  }
}

export type UploadPriority = "now" | "normal" | "background";
const RANK: Record<UploadPriority, number> = { now: 3, normal: 2, background: 1 };

/** Where an upload is: hashing first, sending parts, waiting for the read-back. */
export interface UploadProgress {
  phase: "hashing" | "sending" | "verifying";
  /** Never more than `size`. */
  bytesDone: number;
  size: number;
}

/** How an upload ended. */
export interface UploadResult {
  /** `skipped`: an identical object was already there. `partial`: some targets failed; `uploader.finalize(id)` retries them. */
  state: "done" | "partial" | "skipped";
  uploadId?: string | undefined;
  copies: UploadCopy[];
  failed?: { target: string; code: string }[] | undefined;
  /** For a skip: what the app's `readable` returned. */
  ref?: string | undefined;
}

/** @stability Experimental */
export interface UploaderOptions {
  /** The upload route, such as `https://app.example.com/uploads`. */
  endpoint: string;
  fetch?: typeof fetch;
  /** The app's credential for every request (a bearer token, a respondent's token). Cookies go with `fetch` as usual. */
  headers?: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
  /**
   * Who is signed in, as the app knows them (a user id): part of every resume
   * key, so two people on one browser never resume each other's uploads.
   * Call `clearResume()` at sign-out as well.
   */
  ownerHint?: string | undefined;
  /** The incremental SHA-256 for the whole file. Default `@noble/hashes`; pass hash-wasm's in a browser app that wants the speed. */
  hash?: CreateSha256 | undefined;
  /**
   * Hashes a whole file off the main thread (a Web Worker): `createWorkerFileHasher`. The
   * browser entry does that by default; elsewhere it runs in this thread with `hash`.
   */
  hashFile?: HashFile | undefined;
  /** Remembers each file's upload id (`createIndexedDbResumeStore` in a browser). Default memory. */
  resumeStore?: ResumeStore | undefined;
  /** Uploads sent at once. Default 2. */
  filesAtOnce?: number | undefined;
  /** Parts in flight at once, per upload. Default 4. */
  partsAtOnce?: number | undefined;
  /** The speed cap across every upload, in bytes a second; 0 for none. Asked often, so it can follow a schedule. */
  bytesPerSecond?: (() => number) | undefined;
  /** Attempts per request before a network failure gives up. Default 6. */
  retries?: number | undefined;
  /** How often to ask whether a big upload's read-back is done, in ms. Default 2000. */
  pollMs?: number | undefined;
  /** Stops every upload on this uploader (as `cancel()` does each). */
  signal?: AbortSignal | undefined;
  /** For tests. */
  sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  /** For tests: the jitter in back-off, 0 to 1. Default `Math.random`. */
  random?: (() => number) | undefined;
}

/** What to upload a file as. */
export interface UploadOptions {
  name: string;
  contentType: string;
  /** The app's word for what this is for. */
  purpose: string;
  targets?: string[] | undefined;
  /**
   * Hash the whole file before sending, so it can be skipped when the
   * server already has it (default true). False reads the file once and
   * hashes while sending: no skip, half the reading (a phone with a big file).
   */
  hashFirst?: boolean | undefined;
  priority?: UploadPriority | undefined;
  onProgress?: ((progress: UploadProgress) => void) | undefined;
  /** Stops this upload (as `cancel()` does). */
  signal?: AbortSignal | undefined;
}

/** One upload under way. */
export interface UploadHandle {
  readonly done: Promise<UploadResult>;
  /** Stops before the next part, hash slice or finalize; `resume()` carries on. */
  pause(): void;
  resume(): void;
  /** Stops at once (requests in flight and back-off waits included) and aborts the upload on the server. */
  cancel(): Promise<void>;
}

/** A sleep that a cancel cuts short. */
const sleepDefault = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
const transient = (status: number) => status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
const cancelledError = () => new UploadClientError("The upload was cancelled.", "cancelled");

function randomUploadId(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** A gate a paused upload waits at. */
function gate() {
  let open = true;
  let waiters: (() => void)[] = [];
  return {
    get open() {
      return open;
    },
    close: () => void (open = false),
    release() {
      open = true;
      const w = waiters;
      waiters = [];
      for (const f of w) f();
    },
    wait: () => (open ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
  };
}

/** One upload's controls: its abort, its pause, and the session it is on. */
interface Run {
  abort: AbortController;
  pause: ReturnType<typeof gate>;
  id?: string | undefined;
}

/** @stability Experimental */
export function createUploader(options: UploaderOptions) {
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const hash = options.hash ?? createNobleSha256;
  const hashFile = options.hashFile;
  const store = options.resumeStore ?? createMemoryResumeStore();
  const sleep = options.sleep ?? sleepDefault;
  const random = options.random ?? Math.random;
  const retries = options.retries ?? 6;
  const partsAtOnce = Math.max(1, options.partsAtOnce ?? 4);
  const filesAtOnce = Math.max(1, options.filesAtOnce ?? 2);
  const pollMs = options.pollMs ?? 2000;
  const limit = createSpeedLimiter(options.bytesPerSecond ?? (() => 0), (ms) => sleep(ms));

  // Remembering an id is a convenience: a store that fails (private browsing, a full disk) never stops an upload.
  const resumeStore = {
    get: async (k: string) => {
      try {
        return await store.get(k);
      } catch {
        return null;
      }
    },
    set: async (k: string, uploadId: string, expiresAt: string) => {
      try {
        await store.set(k, { uploadId, expiresAt });
      } catch {
        // Not remembered: a reload starts over.
      }
    },
    delete: async (k: string) => {
      try {
        await store.delete(k);
      } catch {
        // Left behind: it lapses with its session.
      }
    },
  };

  // The queue: by priority, then first come.
  let seq = 0;
  let running = 0;
  const waiting: { rank: number; seq: number; start: () => void }[] = [];
  const pump = () => {
    while (running < filesAtOnce && waiting.length) {
      waiting.sort((a, b) => b.rank - a.rank || a.seq - b.seq);
      running++;
      waiting.shift()!.start();
    }
  };
  const allPaused = gate();

  /** Waits while paused (this upload or all), unless it is cancelled meanwhile. */
  const holdIfPaused = async (run: Run | undefined) => {
    if (!run) return allPaused.wait();
    await Promise.race([Promise.all([run.pause.wait(), allPaused.wait()]), new Promise<void>((r) => run.abort.signal.addEventListener("abort", () => r(), { once: true }))]);
    if (run.abort.signal.aborted) throw cancelledError();
  };

  /** Exponential back-off with jitter (half to the full wait), cut short by a cancel. */
  const backoff = (attempt: number, signal?: AbortSignal) => sleep(Math.min(30_000, 500 * 2 ** attempt) * (0.5 + random() / 2), signal);

  async function call(
    method: string,
    path: string,
    init: { body?: RequestInit["body"]; headers?: Record<string, string> } = {},
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw cancelledError();
      let res: Response;
      try {
        res = await doFetch(`${endpoint}${path}`, { method, body: init.body, headers: { ...(await options.headers?.()), ...init.headers }, ...(signal ? { signal } : {}) });
      } catch (e) {
        if (signal?.aborted) throw cancelledError();
        if (attempt >= retries) throw new UploadClientError(e instanceof Error ? e.message : "The network failed.", "network");
        await backoff(attempt, signal);
        continue;
      }
      if (transient(res.status) && attempt < retries) {
        await res.body?.cancel().catch(() => {});
        await backoff(attempt, signal);
        continue;
      }
      const text = res.status === 204 ? "" : await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return { status: res.status, body };
    }
  }

  const fail = (status: number, body: unknown): never => {
    const e = (body ?? {}) as Partial<UploadError>;
    throw new UploadClientError(e.error ?? `The upload failed (${status}).`, e.code ?? (transient(status) ? "server_error" : "bad_request"), status);
  };

  async function hashWhole(source: UploadSource, onBytes: (n: number) => void, run: Run): Promise<string> {
    if (hashFile) {
      await holdIfPaused(run);
      try {
        return await hashFile(source, onBytes, run.abort.signal);
      } catch (e) {
        if (run.abort.signal.aborted) throw cancelledError();
        throw e;
      }
    }
    const h = hash();
    const chunk = 4 * 1024 * 1024;
    for (let at = 0; at < source.size; at += chunk) {
      await holdIfPaused(run);
      const bytes = await source.read(at, Math.min(chunk, source.size - at));
      h.update(bytes);
      onBytes(at + bytes.byteLength);
    }
    return toHex(h.digest());
  }

  /** Waits out a big upload's read-back by polling Resume. */
  async function poll(id: string, progress: (p: UploadProgress) => void, size: number, run?: Run): Promise<UploadStatus> {
    for (;;) {
      await holdIfPaused(run);
      const r = await call("GET", `/${id}`, {}, run?.abort.signal);
      if (r.status !== 200) fail(r.status, r.body);
      const s = r.body as UploadStatus;
      if (s.state !== "verifying") return s;
      progress({ phase: "verifying", bytesDone: size, size });
      await sleep(pollMs, run?.abort.signal);
    }
  }

  const resultOf = (s: UploadStatus): UploadResult => {
    if (s.state === "identity_mismatch") throw new UploadClientError("The file that arrived isn't the one described. Start the upload again.", "identity_mismatch", 422);
    return { state: s.state === "partial" ? "partial" : "done", uploadId: s.uploadId, copies: s.copies ?? [], ...(s.failed?.length ? { failed: s.failed } : {}) };
  };

  async function finalize(id: string, sha256: string | undefined, progress: (p: UploadProgress) => void, size: number, run?: Run): Promise<UploadResult | number[]> {
    await holdIfPaused(run);
    const r = await call("POST", `/${id}/finalize`, { headers: { "content-type": "application/json" }, body: JSON.stringify(sha256 ? { sha256 } : {}) }, run?.abort.signal);
    if (r.status === 409 && (r.body as UploadError)?.code === "missing_parts") return (r.body as UploadError).parts ?? [];
    if (r.status === 202) return resultOf(await poll(id, progress, size, run));
    if (r.status !== 200) fail(r.status, r.body);
    return resultOf(r.body as UploadStatus);
  }

  /** Whether a remembered session is still this upload's: the same size, SHA-256 (when both know it) and targets (when asked). */
  const fits = (s: UploadStatus, source: UploadSource, sha256: string | undefined, o: UploadOptions) =>
    s.size === source.size && !(sha256 && s.sha256 && s.sha256 !== sha256) && !(o.targets && !sameSet(s.targets, o.targets));

  async function upload(source: UploadSource, o: UploadOptions, run: Run): Promise<UploadResult> {
    const signal = run.abort.signal;
    if (signal.aborted) throw cancelledError();
    const progress = (p: UploadProgress) => o.onProgress?.({ ...p, bytesDone: Math.min(p.bytesDone, p.size) });
    // By endpoint, who is signed in, purpose and file: never another person's or another app's entry.
    const memo = source.key ? JSON.stringify([endpoint, options.ownerHint ?? "", o.purpose, source.key]) : undefined;
    const hashFirst = o.hashFirst ?? true;
    const sha256 = hashFirst ? await hashWhole(source, (n) => progress({ phase: "hashing", bytesDone: n, size: source.size }), run) : undefined;

    for (let restart = 0; ; restart++) {
      if (signal.aborted) throw cancelledError();
      let status: UploadStatus | undefined;
      const remembered = memo ? await resumeStore.get(memo) : null;
      if (remembered) {
        const r = await call("GET", `/${remembered.uploadId}`, {}, signal);
        if (r.status === 200 && fits(r.body as UploadStatus, source, sha256, o)) status = r.body as UploadStatus;
        else {
          // Not this upload any more (other targets, another file under the same name): leave it.
          if (r.status === 200 && (r.body as UploadStatus).state === "open") await call("DELETE", `/${remembered.uploadId}`, {}, signal).catch(() => {});
          if (memo) await resumeStore.delete(memo);
        }
      }
      if (!status) {
        // The id is chosen here, so a create retried after a lost answer finds the session the first try made.
        const r = await call(
          "POST",
          "",
          {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: o.name, contentType: o.contentType, size: source.size, purpose: o.purpose, uploadId: randomUploadId(), ...(sha256 ? { sha256 } : {}), ...(o.targets ? { targets: o.targets } : {}) }),
          },
          signal,
        );
        if (r.status === 200 && (r.body as UploadSkipped).state === "skipped") {
          const skipped = r.body as UploadSkipped;
          progress({ phase: "sending", bytesDone: source.size, size: source.size });
          return { state: "skipped", copies: skipped.copies, ...(skipped.ref ? { ref: skipped.ref } : {}) };
        }
        if (r.status !== 200 && r.status !== 201) fail(r.status, r.body);
        status = r.body as UploadStatus;
        if (memo) await resumeStore.set(memo, status.uploadId, status.expiresAt);
      }
      const id = status.uploadId;
      run.id = id;
      try {
        if (signal.aborted) throw cancelledError();
        if (status.state === "verifying") return done(memo, resultOf(await poll(id, progress, source.size, run)));
        if (status.state === "identity_mismatch") throw new UploadClientError("The file that arrived isn't the one described.", "identity_mismatch", 422);
        if (status.state === "done" || status.state === "partial") {
          const result = status.state === "partial" ? await finalize(id, undefined, progress, source.size, run) : resultOf(status);
          return done(memo, result as UploadResult);
        }
        return done(memo, await send(source, status, sha256, run, progress));
      } catch (e) {
        if (signal.aborted || (e instanceof UploadClientError && e.code === "cancelled")) {
          await call("DELETE", `/${id}`).catch(() => {});
          if (memo) await resumeStore.delete(memo);
          throw cancelledError();
        }
        // Start once more on a fresh session when this one can't finish: other bytes for one of
        // its parts, a lapsed session, or (the file changed under the same key) the wrong identity.
        const again = e instanceof UploadClientError && (e.code === "part_conflict" || e.code === "not_found" || e.code === "identity_mismatch");
        if (again) {
          await call("DELETE", `/${id}`, {}, signal).catch(() => {});
          if (memo) await resumeStore.delete(memo);
          if (restart === 0) continue;
        }
        throw e;
      }
    }
  }

  async function done(memo: string | undefined, result: UploadResult | number[]): Promise<UploadResult> {
    if (memo) await resumeStore.delete(memo);
    return result as UploadResult;
  }

  async function send(source: UploadSource, status: UploadStatus, declared: string | undefined, run: Run, progress: (p: UploadProgress) => void): Promise<UploadResult> {
    const id = status.uploadId;
    const signal = run.abort.signal;
    const plan = partPlan(status.size, status.partSize);
    const have = new Set(status.parts.map((p) => p.n));
    let done = status.parts.reduce((n, p) => n + p.size, 0);
    // Without a SHA-256 at create, the file is hashed as it is read, in order: parts the server
    // already has are read for the hash too.
    const running = declared ? undefined : hash();
    const inFlight = new Set<Promise<void>>();
    let failure: unknown;

    const put = async (n: number, bytes: Uint8Array) => {
      const digest = formatContentDigest(await sha256Bytes(bytes));
      for (let attempt = 1; ; attempt++) {
        // The cap is paced by bytes: the part's bytes are taken before it goes.
        await limit(bytes.byteLength);
        const r = await call("PUT", `/${id}/parts/${n}`, { headers: { "content-digest": digest, "content-length": String(bytes.byteLength) }, body: bytes as Uint8Array<ArrayBuffer> }, signal);
        if (r.status === 200) break;
        // Changed in transit: send it again.
        if (r.status === 422 && (r.body as UploadError)?.code === "digest_mismatch" && attempt < retries) continue;
        fail(r.status, r.body);
      }
      done += bytes.byteLength;
      progress({ phase: "sending", bytesDone: done, size: status.size });
    };

    for (let n = 1; n <= plan.count; n++) {
      if (failure) break;
      await holdIfPaused(run);
      if (have.has(n) && !running) continue;
      // A slot first, then the read: never more than `partsAtOnce` parts in memory.
      while (!have.has(n) && inFlight.size >= partsAtOnce) await Promise.race(inFlight);
      if (failure) break;
      const bytes = await source.read((n - 1) * status.partSize, plan.sizeOf(n));
      running?.update(bytes);
      if (have.has(n)) continue;
      const p: Promise<void> = put(n, bytes).then(
        () => void inFlight.delete(p),
        (e) => {
          inFlight.delete(p);
          failure ??= e;
        },
      );
      inFlight.add(p);
    }
    await Promise.all(inFlight);
    if (signal.aborted) throw cancelledError();
    if (failure) throw failure;
    const sha256 = declared ?? toHex(running!.digest());

    // Finalize; send anything it says is missing (a part that never landed), a few times.
    for (let round = 0; round < 3; round++) {
      // The SHA-256 goes with finalize when the session doesn't have it from create.
      const result = await finalize(id, status.sha256 ? undefined : sha256, progress, status.size, run);
      if (!Array.isArray(result)) return result;
      for (const n of result) await put(n, await source.read((n - 1) * status.partSize, plan.sizeOf(n)));
    }
    throw new UploadClientError("Some parts of the file never arrived.", "missing_parts", 409);
  }

  return {
    /** Queues a file. It starts when a slot is free, by priority. */
    upload(source: UploadSource, o: UploadOptions): UploadHandle {
      const run: Run = { abort: new AbortController(), pause: gate() };
      const outer = [options.signal, o.signal].filter((s): s is AbortSignal => !!s);
      let started = false;
      let rejectQueued: ((e: unknown) => void) | undefined;
      const entry = { rank: RANK[o.priority ?? "normal"], seq: seq++, start: () => {} };
      const cancel = async () => {
        if (run.abort.signal.aborted) return;
        run.abort.abort();
        if (!started) {
          // Still queued: it never starts.
          const at = waiting.indexOf(entry);
          if (at >= 0) waiting.splice(at, 1);
          rejectQueued?.(cancelledError());
          void source.close?.();
          return;
        }
        // Running: it stops at once and removes its session; this makes sure of it.
        if (run.id) await call("DELETE", `/${run.id}`).catch(() => {});
      };
      for (const s of outer) {
        if (s.aborted) void cancel();
        else s.addEventListener("abort", () => void cancel(), { once: true });
      }
      const done = new Promise<UploadResult>((resolve, reject) => {
        rejectQueued = reject;
        entry.start = () => {
          started = true;
          upload(source, o, run)
            .then(resolve, reject)
            .finally(() => {
              running--;
              void source.close?.();
              pump();
            });
        };
        if (!run.abort.signal.aborted) {
          waiting.push(entry);
          pump();
        }
      });
      return { done, pause: () => run.pause.close(), resume: () => run.pause.release(), cancel };
    },
    /** Pauses every upload before their next part, hash slice or finalize. */
    pauseAll: () => allPaused.close(),
    resumeAll: () => allPaused.release(),
    /** Forgets every remembered upload on this device (call it at sign-out). */
    async clearResume(): Promise<void> {
      await store.clear();
    },
    /** Asks for an upload's state (Resume). */
    async status(uploadId: string): Promise<UploadStatus> {
      const r = await call("GET", `/${uploadId}`);
      if (r.status !== 200) fail(r.status, r.body);
      return r.body as UploadStatus;
    },
    /** Finalizes again: retries the targets of a `partial` upload, or waits out a `verifying` one. */
    async finalize(uploadId: string): Promise<UploadResult> {
      const result = await finalize(uploadId, undefined, () => {}, 0);
      if (Array.isArray(result)) throw new UploadClientError("Some parts of the file haven't arrived yet.", "missing_parts", 409);
      return result;
    },
  };
}

export type Uploader = ReturnType<typeof createUploader>;
