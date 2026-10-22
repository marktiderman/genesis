import { getChrome, type Port } from "./chrome";

/**
 * A job for a native messaging host (a local helper program the extension
 * talks to, for unpacked or privately distributed builds; the Chrome Web
 * Store build should not declare `nativeMessaging`).
 *
 * The host answers with messages `{ type, ... }`: `progress` messages go to
 * `onProgress`, `done` resolves `done`, `error` rejects it. Any other type can
 * be waited for with `waitFor(type)` (say, "downloaded" before an upload
 * target is known), and answered with `post`. An open native port also keeps
 * the service worker running, so a long job isn't cut off by its idle timer.
 */
export interface NativeJob {
  /** The host's final `done` message. */
  done: Promise<Record<string, unknown>>;
  /** The next message of this type (rejects if the job ends first). */
  waitFor(type: string): Promise<Record<string, unknown>>;
  post(message: unknown): void;
  /** Cancel: disconnects, which ends the host. */
  close(): void;
  onProgress: (message: Record<string, unknown>) => void;
  /** Answer the host's requests of a type (e.g. a fresh token); the answer is posted back. */
  answer(
    type: string,
    reply: (message: Record<string, unknown>) => unknown,
  ): void;
}

/** Whether a native messaging host is installed and answers `ping` (with `pong`). */
export function pingNativeHost(
  host: string,
  timeoutMs = 3000,
): Promise<Record<string, unknown> | null> {
  const api = getChrome();
  if (!api.runtime.connectNative) return Promise.resolve(null);
  return new Promise((resolve) => {
    let port: Port | undefined;
    const finish = (value: Record<string, unknown> | null) => {
      clearTimeout(timer);
      try {
        port?.disconnect();
      } catch {
        /* already gone */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      port = api.runtime.connectNative!(host);
      port.onMessage.addListener((m) => {
        const message = m as Record<string, unknown>;
        if (message?.type === "pong") finish(message);
      });
      port.onDisconnect.addListener(() => finish(null));
      port.postMessage({ type: "ping" });
    } catch {
      finish(null);
    }
  });
}

export interface NativeJobOptions {
  /** Give up (and end the helper) after this long without the job finishing. Default: no limit. */
  timeoutMs?: number;
}

export function startNativeJob(
  host: string,
  message: unknown,
  { timeoutMs }: NativeJobOptions = {},
): NativeJob {
  const api = getChrome();
  if (!api.runtime.connectNative)
    throw new Error("This build can't talk to a local helper.");
  const port = api.runtime.connectNative(host);
  let finished = false;
  let settle!: (value: Record<string, unknown>) => void;
  let fail!: (error: Error) => void;
  const done = new Promise<Record<string, unknown>>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  done.catch(() => undefined); // a job nobody awaits mustn't report an unhandled rejection
  type Waiter = {
    resolve: (m: Record<string, unknown>) => void;
    reject: (e: Error) => void;
  };
  const waiters = new Map<string, Waiter[]>();
  const replies = new Map<string, (m: Record<string, unknown>) => unknown>();
  const timer =
    timeoutMs !== undefined
      ? setTimeout(
          () => finish(new Error("The helper took too long.")),
          timeoutMs,
        )
      : null;
  const release = (type: string, m: Record<string, unknown>) => {
    const list = waiters.get(type);
    if (!list?.length) return;
    waiters.delete(type);
    for (const w of list) w.resolve(m);
  };
  function finish(error: Error | null, value?: Record<string, unknown>) {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    try {
      port.disconnect();
    } catch {
      /* already gone */
    }
    // Waiting for "done" is answered by success; anything else still waited
    // for won't come now.
    if (!error && value) release("done", value);
    for (const list of waiters.values()) {
      for (const w of list)
        w.reject(error || new Error("The helper finished."));
    }
    waiters.clear();
    if (error) fail(error);
    else settle(value!);
  }
  const job: NativeJob = {
    done,
    onProgress: () => {},
    waitFor(type) {
      if (finished) return Promise.reject(new Error("The helper finished."));
      const waiting = new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          waiters.set(type, [
            ...(waiters.get(type) || []),
            { resolve, reject },
          ]);
        },
      );
      return waiting;
    },
    post: (m) => {
      if (!finished) port.postMessage(m);
    },
    close: () => finish(new Error("Cancelled.")),
    answer(type, reply) {
      replies.set(type, reply);
    },
  };
  port.onMessage.addListener(async (raw) => {
    const m = raw as Record<string, unknown>;
    const type = String(m?.type || "");
    if (type === "done") return finish(null, m);
    if (type === "error")
      return finish(new Error(String(m.message || "The helper failed.")));
    if (type === "progress") job.onProgress(m);
    release(type, m);
    const reply = replies.get(type);
    if (reply) {
      try {
        job.post(await reply(m));
      } catch (err) {
        // A reply that fails (no fresh token, say) ends the job, saying why.
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
  port.onDisconnect.addListener(() =>
    finish(
      new Error(
        api.runtime.lastError?.message || "The helper stopped unexpectedly.",
      ),
    ),
  );
  port.postMessage(message);
  return job;
}
