/**
 * The setup wizard's request checks (Phase 3 spec §2, "Security"). The server listens on
 * 127.0.0.1 only, and every request must also pass these:
 *
 * - **Host** is `127.0.0.1:<port>` or `localhost:<port>`: a page on another site that rebinds its
 *   own name to 127.0.0.1 (DNS rebinding) sends its own name, and is refused.
 * - **A per-run token.** 32 random bytes, handed to the browser in the URL's fragment (never sent
 *   to the server in a URL), kept in sessionStorage and sent as `Authorization: Bearer`. Compared
 *   in constant time. Only the page's files are served without it; they hold no data.
 * - **Origin**, on every request that isn't a GET: the server's own origin, and the same host the
 *   request names. `Sec-Fetch-Site: cross-site` is refused outright.
 * - **JSON only** for the API: a form post can't reach it (a browser sends one without the
 *   bearer token anyway).
 *
 * No CORS headers are ever sent, so no other origin can read a response.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

/** A fresh token for one run: 32 random bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The hosts the server answers to on this port. */
export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

/** The page's own origins on this port. */
export function allowedOrigins(port: number): string[] {
  return allowedHosts(port).map((h) => `http://${h}`);
}

/** Why a request is refused: the status and a short message (never echoing what was sent). */
export interface Refusal {
  status: 400 | 401 | 403 | 415;
  code: "bad_request" | "unauthenticated" | "forbidden";
  message: string;
}

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value);

/** The Host header is this server's own (DNS rebinding sends another). */
export function checkHost(headers: IncomingHttpHeaders, port: number): Refusal | null {
  const host = one(headers.host)?.toLowerCase();
  if (!host || !allowedHosts(port).includes(host)) return { status: 403, code: "forbidden", message: "This wizard answers only at 127.0.0.1 or localhost on its own port." };
  return null;
}

/**
 * A request that changes or reads data across sites is refused: `Sec-Fetch-Site: cross-site` on
 * any request, and on anything but a GET or HEAD, an Origin that isn't the server's own (or none).
 */
export function checkOrigin(method: string, headers: IncomingHttpHeaders, port: number): Refusal | null {
  const site = one(headers["sec-fetch-site"]);
  if (site === "cross-site") return { status: 403, code: "forbidden", message: "Cross-site requests are refused." };
  if (method === "GET" || method === "HEAD") return null;
  const origin = one(headers.origin)?.toLowerCase();
  const host = one(headers.host)?.toLowerCase();
  if (!origin || !allowedOrigins(port).includes(origin) || origin !== `http://${host}`) return { status: 403, code: "forbidden", message: "The request's origin isn't this wizard's." };
  return null;
}

/** The bearer token matches this run's, compared in constant time. */
export function checkToken(headers: IncomingHttpHeaders, token: string): Refusal | null {
  const auth = one(headers.authorization);
  const m = auth ? /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(auth) : null;
  if (!m) return { status: 401, code: "unauthenticated", message: "Open the wizard from the link the CLI printed." };
  const given = Buffer.from(m[1]!);
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { status: 401, code: "unauthenticated", message: "Open the wizard from the link the CLI printed." };
  return null;
}

/** The body is JSON (`application/json`, any charset). */
export function checkJson(headers: IncomingHttpHeaders): Refusal | null {
  const type = one(headers["content-type"]) ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) return { status: 415, code: "bad_request", message: "The API takes JSON only." };
  return null;
}

/** Every check an API request passes, in order: host, origin, token, then JSON for a body. */
export function checkApiRequest(method: string, headers: IncomingHttpHeaders, port: number, token: string): Refusal | null {
  return checkHost(headers, port) ?? checkOrigin(method, headers, port) ?? checkToken(headers, token) ?? (method === "POST" ? checkJson(headers) : null);
}

/**
 * The headers on every response: no caching, no sniffing, no framing, no referrer, and a CSP that
 * loads only the wizard's own files. No `Access-Control-*` header, ever.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
});
