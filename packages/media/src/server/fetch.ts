/**
 * Fetching a URL a person named, on a server, without letting them aim the
 * server at itself (server-side request forgery): http(s) only, allowed ports
 * only, no credentials in the URL, no address that isn't public (checked on
 * every address a name resolves to, when the connection is made, so DNS
 * rebinding doesn't get past it), a bounded number of redirects, each checked
 * the same way and never from https down to http, a size cap and a time limit.
 */
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { guardedLookup, urlProblems } from "./guard";

/** One HTTP response, unfollowed. */
export interface FetchedResponse {
  status: number;
  /** Lowercase header names. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Stop reading (the size cap was hit). */
  cancel(): void;
}

/** Makes one GET request and doesn't follow redirects. The default is the guarded Node transport. */
export type Transport = (url: URL, signal: AbortSignal) => Promise<FetchedResponse>;

export interface GuardedTransportOptions {
  /** The `Accept` header. Default: images first, then PDF. */
  accept?: string;
  /** The `User-Agent` header. Default `genesis-media/1`. */
  userAgent?: string;
}

/**
 * A transport on Node's http(s) with `guardedLookup` as the socket's DNS
 * lookup and a fresh agent (no pooled sockets, no proxy from the
 * environment), so the address connected to is the address checked.
 *
 * @stability Beta
 */
export function createGuardedTransport(options: GuardedTransportOptions = {}): Transport {
  const accept = options.accept ?? "image/*,application/pdf;q=0.9,*/*;q=0.1";
  const userAgent = options.userAgent ?? "genesis-media/1";
  return (url, signal) =>
    new Promise((resolve, reject) => {
      const secure = url.protocol === "https:";
      const req = (secure ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          lookup: guardedLookup as never,
          agent: secure ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false }),
          headers: { accept, "user-agent": userAgent },
          signal,
        },
        (res: IncomingMessage) => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ status: res.statusCode ?? 0, headers, body: res, cancel: () => res.destroy() });
        },
      );
      req.on("error", reject);
      req.end();
    });
}

/** The default guarded transport. */
export const guardedTransport: Transport = createGuardedTransport();

/**
 * A fetch the guard refused, or a response that wasn't the file (a redirect
 * too many, a non-200, too big). Its message is the reason, worded to follow
 * "not fetched because" ("it redirects from https to http (cdn.example).").
 * It is safe to show the person who asked: it never names an address a host
 * name resolved to.
 */
export class FetchRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchRefusedError";
  }
}

export interface GuardedFetchOptions {
  /** The largest body, in bytes (default 15 MiB). */
  maxBytes?: number;
  /** The time one URL may take, redirects included, in ms (default 20 s). */
  timeoutMs?: number;
  /** At most this many redirects (default 3). */
  maxRedirects?: number;
  /** The ports fetched from (default 80 and 443). */
  allowedPorts?: readonly number[];
  /** The longest URL accepted (default 2048). */
  maxUrlLength?: number;
  /** Replaces the guarded Node transport (tests, another runtime). It must keep the address guard. */
  transport?: Transport;
}

export interface GuardedFetchResult {
  bytes: Uint8Array;
  /** The URL the bytes came from, after redirects. */
  finalUrl: URL;
  /** The final response's headers (lowercase names). Never trust its Content-Type: sniff the bytes. */
  headers: Record<string, string | undefined>;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** A body read to the end, refused once it passes `maxBytes`. */
export async function readCapped(res: FetchedResponse, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.cancel();
    throw new FetchRefusedError(`it is ${declared} bytes; the limit is ${maxBytes}.`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      res.cancel();
      throw new FetchRefusedError(`it is over the ${maxBytes}-byte limit.`);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * GET one URL through the guard, following at most `maxRedirects` checked
 * redirects, and read its body under the size cap. Throws
 * `FetchRefusedError` for anything the guard or the limits refuse; a
 * network failure throws as it came.
 *
 * @stability Beta
 */
export async function fetchGuarded(start: string, options: GuardedFetchOptions = {}): Promise<GuardedFetchResult> {
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const allowedPorts = options.allowedPorts ?? [80, 443];
  const transport = options.transport ?? guardedTransport;
  if (start.length > (options.maxUrlLength ?? 2048)) throw new FetchRefusedError("the URL is too long.");
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    throw new FetchRefusedError("it isn't a URL.");
  }
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  for (let hop = 0; ; hop++) {
    const problems = urlProblems(url, allowedPorts);
    if (problems.length) throw new FetchRefusedError(hop ? `it redirects to ${url.host}: ${problems.join(" ")}` : problems.join(" "));
    const res = await transport(url, signal);
    if (REDIRECTS.has(res.status)) {
      res.cancel();
      const location = res.headers.location;
      if (!location) throw new FetchRefusedError(`a ${res.status} with no Location.`);
      if (hop >= maxRedirects) throw new FetchRefusedError(`more than ${maxRedirects} redirects.`);
      const next = new URL(location, url);
      // Never from https down to http: the copy would come over a connection anyone on the path can change.
      if (url.protocol === "https:" && next.protocol === "http:") throw new FetchRefusedError(`it redirects from https to http (${next.host}).`);
      url = next;
      continue;
    }
    if (res.status !== 200) {
      res.cancel();
      throw new FetchRefusedError(`the server answered ${res.status}.`);
    }
    return { bytes: await readCapped(res, maxBytes), finalUrl: url, headers: res.headers };
  }
}
