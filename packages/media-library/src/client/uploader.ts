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
  toHex,
  type UploadCopy,
  type UploadError,
  type UploadErrorCode,
  type UploadSkipped,
  type UploadStatus,
} from "../protocol";
import { createMemoryResumeStore, createSpeedLimiter, type ResumeStore } from "./config";
import type { UploadSource } from "./sources";
import { createWorkerFileHasher, isBrowserPage } from "./worker-hasher";

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
  /** The incremental SHA-256 for the whole file. Default `@noble/hashes`; pass hash-wasm's in a browser app that wants the speed. */
  hash?: CreateSha256 | undefined;
  /** Hashes a whole file off the main thread (a Web Worker): `createWorkerFileHasher`. Default: in this thread with `hash`. */
  hashFile?: ((source: UploadSource, onBytes: (n: number) => void) => Promise<string>) | undefined;
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
  /** For tests. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
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
}

/** One upload under way. */
export interface UploadHandle {
  readonly done: Promise<UploadResult>;
  /** Stops after the parts in flight; `resume()` carries on. */
  pause(): void;
  resume(): void;
  /** Stops and aborts the upload on the server. */
  cancel(): Promise<void>;
}

const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const transient = (status: number) => status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;

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

/** @stability Experimental */
export function createUploader(options: UploaderOptions) {
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const hash = options.hash ?? createNobleSha256;
  // Browsers hash in a Web Worker by default (unless the app chose another hash), so the page stays responsive.
  const hashFile = options.hashFile ?? (!options.hash && isBrowserPage() ? createWorkerFileHasher() : undefined);
  const resumeStore = options.resumeStore ?? createMemoryResumeStore();
  const sleep = options.sleep ?? sleepDefault;
  const retries = options.retries ?? 6;
  const partsAtOnce = Math.max(1, options.partsAtOnce ?? 4);
  const filesAtOnce = Math.max(1, options.filesAtOnce ?? 2);
  const pollMs = options.pollMs ?? 2000;
  const limit = createSpeedLimiter(options.bytesPerSecond ?? (() => 0), sleep);

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

  async function call(method: string, path: string, init: { body?: RequestInit["body"]; headers?: Record<string, string> } = {}): Promise<{ status: number; body: unknown }> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${endpoint}${path}`, { method, body: init.body, headers: { ...(await options.headers?.()), ...init.headers } });
      } catch (e) {
        if (attempt >= retries) throw new UploadClientError(e instanceof Error ? e.message : "The network failed.", "network");
        await sleep(Math.min(30_000, 500 * 2 ** attempt));
        continue;
      }
      if (transient(res.status) && attempt < retries) {
        await res.body?.cancel().catch(() => {});
        await sleep(Math.min(30_000, 500 * 2 ** attempt));
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

  async function hashWhole(source: UploadSource, onBytes: (n: number) => void): Promise<string> {
    if (hashFile) return hashFile(source, onBytes);
    const h = hash();
    const chunk = 4 * 1024 * 1024;
    for (let at = 0; at < source.size; at += chunk) {
      const bytes = await source.read(at, Math.min(chunk, source.size - at));
      h.update(bytes);
      onBytes(at + bytes.byteLength);
    }
    return toHex(h.digest());
  }

  /** Waits out a big upload's read-back by polling Resume. */
  async function poll(id: string, progress: (p: UploadProgress) => void, size: number): Promise<UploadStatus> {
    for (;;) {
      const r = await call("GET", `/${id}`);
      if (r.status !== 200) fail(r.status, r.body);
      const s = r.body as UploadStatus;
      if (s.state !== "verifying") return s;
      progress({ phase: "verifying", bytesDone: size, size });
      await sleep(pollMs);
    }
  }

  const resultOf = (s: UploadStatus): UploadResult => {
    if (s.state === "identity_mismatch") throw new UploadClientError("The file that arrived isn't the one described. Start the upload again.", "identity_mismatch", 422);
    return { state: s.state === "partial" ? "partial" : "done", uploadId: s.uploadId, copies: s.copies ?? [], ...(s.failed?.length ? { failed: s.failed } : {}) };
  };

  async function finalize(id: string, sha256: string | undefined, progress: (p: UploadProgress) => void, size: number): Promise<UploadResult | number[]> {
    const r = await call("POST", `/${id}/finalize`, { headers: { "content-type": "application/json" }, body: JSON.stringify(sha256 ? { sha256 } : {}) });
    if (r.status === 409 && (r.body as UploadError)?.code === "missing_parts") return (r.body as UploadError).parts ?? [];
    if (r.status === 202) return resultOf(await poll(id, progress, size));
    if (r.status !== 200) fail(r.status, r.body);
    return resultOf(r.body as UploadStatus);
  }

  async function run(source: UploadSource, o: UploadOptions, pause: ReturnType<typeof gate>, cancelled: { value: boolean; id?: string }): Promise<UploadResult> {
    const progress = (p: UploadProgress) => o.onProgress?.(p);
    const memo = source.key ? `${o.purpose}:${source.key}` : undefined;
    const hashFirst = o.hashFirst ?? true;
    const sha256 = hashFirst ? await hashWhole(source, (n) => progress({ phase: "hashing", bytesDone: n, size: source.size })) : undefined;

    for (let restart = 0; ; restart++) {
      let status: UploadStatus | undefined;
      const remembered = memo ? await resumeStore.get(memo) : null;
      if (remembered) {
        const r = await call("GET", `/${remembered}`);
        if (r.status === 200 && (r.body as UploadStatus).size === source.size) status = r.body as UploadStatus;
        else if (memo) await resumeStore.delete(memo);
      }
      if (!status) {
        const r = await call("POST", "", {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: o.name, contentType: o.contentType, size: source.size, purpose: o.purpose, ...(sha256 ? { sha256 } : {}), ...(o.targets ? { targets: o.targets } : {}) }),
        });
        if (r.status === 200 && (r.body as UploadSkipped).state === "skipped") {
          const skipped = r.body as UploadSkipped;
          progress({ phase: "sending", bytesDone: source.size, size: source.size });
          return { state: "skipped", copies: skipped.copies, ...(skipped.ref ? { ref: skipped.ref } : {}) };
        }
        if (r.status !== 200 && r.status !== 201) fail(r.status, r.body);
        status = r.body as UploadStatus;
        if (memo) await resumeStore.set(memo, status.uploadId);
      }
      const id = status.uploadId;
      cancelled.id = id;
      try {
        if (status.state === "verifying") return resultOf(await poll(id, progress, source.size));
        if (status.state === "done" || status.state === "partial" || status.state === "identity_mismatch") {
          const result = status.state === "partial" ? await finalize(id, undefined, progress, source.size) : resultOf(status);
          if (memo) await resumeStore.delete(memo);
          return result as UploadResult;
        }
        const result = await send(source, status, sha256, o, pause, cancelled, progress);
        if (memo) await resumeStore.delete(memo);
        return result;
      } catch (e) {
        // Another session's bytes for one of our parts, or the session lapsed: abort it and start once more.
        if (restart === 0 && e instanceof UploadClientError && (e.code === "part_conflict" || e.code === "not_found")) {
          await call("DELETE", `/${id}`).catch(() => {});
          if (memo) await resumeStore.delete(memo);
          continue;
        }
        if (e instanceof UploadClientError && e.code === "identity_mismatch" && memo) await resumeStore.delete(memo);
        throw e;
      }
    }
  }

  async function send(
    source: UploadSource,
    status: UploadStatus,
    declared: string | undefined,
    o: UploadOptions,
    pause: ReturnType<typeof gate>,
    cancelled: { value: boolean },
    progress: (p: UploadProgress) => void,
  ): Promise<UploadResult> {
    const id = status.uploadId;
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
        await limit(bytes.byteLength);
        const r = await call("PUT", `/${id}/parts/${n}`, { headers: { "content-digest": digest, "content-length": String(bytes.byteLength) }, body: bytes as Uint8Array<ArrayBuffer> });
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
      await Promise.all([pause.wait(), allPaused.wait()]);
      if (cancelled.value) throw new UploadClientError("The upload was cancelled.", "cancelled");
      if (have.has(n) && !running) continue;
      const bytes = await source.read((n - 1) * status.partSize, plan.sizeOf(n));
      running?.update(bytes);
      if (have.has(n)) continue;
      while (inFlight.size >= partsAtOnce) await Promise.race(inFlight);
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
    if (failure) throw failure;
    const sha256 = declared ?? toHex(running!.digest());

    // Finalize; send anything it says is missing (a part that never landed), a few times.
    for (let round = 0; round < 3; round++) {
      // The SHA-256 goes with finalize when the session doesn't have it from create.
      const result = await finalize(id, status.sha256 ? undefined : sha256, progress, status.size);
      if (!Array.isArray(result)) return result;
      for (const n of result) await put(n, await source.read((n - 1) * status.partSize, plan.sizeOf(n)));
    }
    throw new UploadClientError("Some parts of the file never arrived.", "missing_parts", 409);
  }

  return {
    /** Queues a file. It starts when a slot is free, by priority. */
    upload(source: UploadSource, o: UploadOptions): UploadHandle {
      const pause = gate();
      const cancelled: { value: boolean; id?: string } = { value: false };
      const done = new Promise<UploadResult>((resolve, reject) => {
        waiting.push({
          rank: RANK[o.priority ?? "normal"],
          seq: seq++,
          start: () =>
            run(source, o, pause, cancelled)
              .then(resolve, reject)
              .finally(() => {
                running--;
                void source.close?.();
                pump();
              }),
        });
        pump();
      });
      return {
        done,
        pause: () => pause.close(),
        resume: () => pause.release(),
        async cancel() {
          cancelled.value = true;
          pause.release();
          if (cancelled.id) await call("DELETE", `/${cancelled.id}`).catch(() => {});
        },
      };
    },
    /** Pauses every upload after their parts in flight. */
    pauseAll: () => allPaused.close(),
    resumeAll: () => allPaused.release(),
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
