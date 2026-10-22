import { chrome, type Port } from "./chrome";

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
  const api = chrome();
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

export function startNativeJob(host: string, message: unknown): NativeJob {
  const api = chrome();
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
  done.catch(() => undefined);
  const waiters = new Map<
    string,
    {
      resolve: (m: Record<string, unknown>) => void;
      reject: (e: Error) => void;
    }[]
  >();
  const replies = new Map<string, (m: Record<string, unknown>) => unknown>();
  const finish = (error: Error | null, value?: Record<string, unknown>) => {
    if (finished) return;
    finished = true;
    try {
      port.disconnect();
    } catch {
      /* already gone */
    }
    for (const list of waiters.values())
      for (const w of list)
        w.reject(error || new Error("The helper finished."));
    waiters.clear();
    if (error) fail(error);
    else settle(value!);
  };
  const job: NativeJob = {
    done,
    onProgress: () => {},
    waitFor(type) {
      if (finished) return Promise.reject(new Error("The helper finished."));
      return new Promise((resolve, reject) => {
        waiters.set(type, [...(waiters.get(type) || []), { resolve, reject }]);
      });
    },
    post: (m) => port.postMessage(m),
    close: () => finish(new Error("Cancelled.")),
    answer(type, reply) {
      replies.set(type, reply);
    },
  };
  port.onMessage.addListener(async (raw) => {
    const m = raw as Record<string, unknown>;
    const type = String(m?.type || "");
    if (type === "progress") job.onProgress(m);
    else if (type === "done") finish(null, m);
    else if (type === "error")
      finish(new Error(String(m.message || "The helper failed.")));
    else if (replies.has(type)) port.postMessage(await replies.get(type)!(m));
    const list = waiters.get(type);
    if (list?.length) {
      waiters.delete(type);
      for (const w of list) w.resolve(m);
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
