/**
 * @feat:chat
 * Sending bytes with progress, the same on every platform. fetch can't report how much of a
 * request body has gone, so where XMLHttpRequest exists (browsers, React Native) the body goes
 * through it and `onProgress(sent, total)` follows `upload.onprogress`; elsewhere it goes
 * through fetch and reports once, at the end.
 */
import { ChatError } from "./client";

export type UploadProgress = (sent: number, total: number) => void;

export interface SendBytesOptions {
  method?: "PUT" | "POST";
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: UploadProgress;
  /** For tests and runtimes without XMLHttpRequest. */
  fetch?: typeof fetch;
}

const sizeOf = (body: Blob | ArrayBuffer) => (typeof Blob !== "undefined" && body instanceof Blob ? body.size : (body as ArrayBuffer).byteLength);

const aborted = () => new ChatError("The upload was cancelled", "GSABORT", "upload");

/** Sends `body` to `url`; resolves with the response text, throws a ChatError on a non-2xx answer. */
export function sendBytes(url: string, body: Blob | ArrayBuffer, opts: SendBytesOptions = {}): Promise<string> {
  const method = opts.method ?? "PUT";
  const total = sizeOf(body);
  if (opts.signal?.aborted) return Promise.reject(aborted());
  if (typeof XMLHttpRequest === "undefined" || opts.fetch) {
    const f = opts.fetch ?? fetch;
    return f(url, { method, body, headers: opts.headers, signal: opts.signal }).then(async (res) => {
      if (!res.ok) throw new ChatError(`The upload failed (${res.status})`, res.status >= 500 ? undefined : "22023", "upload");
      opts.onProgress?.(total, total);
      return res.text().catch(() => "");
    });
  }
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => opts.signal?.removeEventListener("abort", onAbort);
    xhr.open(method, url);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    if (opts.onProgress && xhr.upload) {
      xhr.upload.onprogress = (e: ProgressEvent) => opts.onProgress?.(e.loaded, e.lengthComputable ? e.total : total);
    }
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(total, total);
        resolve(typeof xhr.responseText === "string" ? xhr.responseText : "");
      } else {
        // A 5xx is worth retrying (transient); a 4xx is a refusal.
        reject(new ChatError(`The upload failed (${xhr.status})`, xhr.status >= 500 || xhr.status === 0 ? undefined : "22023", "upload"));
      }
    };
    // No answer at all: the connection, worth retrying.
    xhr.onerror = () => {
      done();
      reject(new ChatError("The upload didn't reach the server", undefined, "upload"));
    };
    xhr.onabort = () => {
      done();
      reject(aborted());
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}
