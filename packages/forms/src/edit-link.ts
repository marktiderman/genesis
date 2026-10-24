/**
 * Edit links for a sent response: `<id>.<nonce>.<expires>.<sig>`, where sig is the
 * base64url HMAC-SHA256 of `edit-link:v2:<id>.<nonce>.<expires>` under a server-only
 * secret of at least 32 bytes.
 *
 * - id: the response's uuid.
 * - nonce: the response's current edit nonce, kept by the app. The app refuses a link
 *   whose nonce is no longer the response's, so changing the nonce revokes every link
 *   made before (change it after each edit: only the newest link works).
 * - expires: when the link stops working, in Unix seconds, about 30 days after it was
 *   made (`EDIT_LINK_TTL_SECONDS`).
 *
 * Without a usable secret (missing, or shorter than `MIN_EDIT_SECRET_BYTES`) there are no
 * edit links: signing returns null and every token fails to verify.
 *
 * Web Crypto only, no storage: the app keeps the nonce and checks it. Moved up from
 * The host app's src/lib/forms/edit-link.ts unchanged, so links it signed still verify.
 */

/** How long a new edit link works: 30 days. */
export const EDIT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
/** The shortest secret edit links are signed with: 32 bytes (UTF-8), as long as the HMAC. */
export const MIN_EDIT_SECRET_BYTES = 32;
/** The query parameter an edit link's token travels in: `?edit=<token>`. */
export const EDIT_LINK_PARAM = "edit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A uuid, or any other url-safe random string of 16 to 64 characters.
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const EXPIRES = /^[1-9][0-9]{0,11}$/;
const SIG = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url without padding
const DOMAIN = "edit-link:v2:";
/** The longest token looked at: a uuid, a 64-character nonce, 12 digits and a signature fit well within it. */
const MAX_TOKEN_LENGTH = 300;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether `secret` can sign edit links: a string of at least `MIN_EDIT_SECRET_BYTES` bytes. */
export function isUsableEditSecret(secret: string | null | undefined): secret is string {
  return (
    typeof secret === "string" &&
    secret.trim().length > 0 &&
    encoder.encode(secret).length >= MIN_EDIT_SECRET_BYTES
  );
}

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** What an edit link says: the response, its nonce when the link was made, and when it stops working. */
export interface EditLinkClaims {
  /** The response's id, in lower case. */
  id: string;
  nonce: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface EditLinkOptions {
  /** The current time in milliseconds (tests); `Date.now()` by default. */
  now?: number | undefined;
  /** How long the link works, in seconds; `EDIT_LINK_TTL_SECONDS` by default. */
  ttlSeconds?: number | undefined;
}

const payload = (id: string, nonce: string, expiresAt: number) =>
  encoder.encode(`${DOMAIN}${id}.${nonce}.${expiresAt}`);

/**
 * The edit token for a response and its current nonce, working for `ttlSeconds` from
 * now; null when there is no usable secret (no edit links) or the id or nonce is malformed.
 */
export async function signEditToken(
  link: { id: string; nonce: string },
  secret: string | null | undefined,
  options: EditLinkOptions = {},
): Promise<string | null> {
  if (!isUsableEditSecret(secret) || !UUID.test(link.id) || !NONCE.test(link.nonce)) return null;
  const ttl = options.ttlSeconds ?? EDIT_LINK_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0) return null;
  const id = link.id.toLowerCase();
  const expiresAt = Math.floor((options.now ?? Date.now()) / 1000) + Math.floor(ttl);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), payload(id, link.nonce, expiresAt));
  return `${id}.${link.nonce}.${expiresAt}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * What a token says, or null when it is malformed, its signature does not match, it has
 * expired (or claims to last longer than `ttlSeconds` from now), or there is no usable
 * secret. Whether the nonce is still the response's is the caller's check. The
 * comparison is Web Crypto's HMAC verify, which runs in constant time.
 */
export async function verifyEditToken(
  token: string | null | undefined,
  secret: string | null | undefined,
  options: EditLinkOptions = {},
): Promise<EditLinkClaims | null> {
  if (!isUsableEditSecret(secret) || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, nonce, expires, sig] = parts as [string, string, string, string];
  if (!UUID.test(id) || id !== id.toLowerCase() || !NONCE.test(nonce) || !EXPIRES.test(expires)) return null;
  if (!SIG.test(sig)) return null;
  const expiresAt = Number(expires);
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const ttl = options.ttlSeconds ?? EDIT_LINK_TTL_SECONDS;
  if (expiresAt <= now || expiresAt > now + ttl) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64Url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), bytes, payload(id, nonce, expiresAt));
  return ok ? { id, nonce, expiresAt } : null;
}

/**
 * A form link with the edit token added: `<formUrl>?edit=<token>` (or `&edit=` when it
 * has a query). `param` names the parameter; `EDIT_LINK_PARAM` by default.
 */
export function withEditToken(formUrl: string, token: string, param: string = EDIT_LINK_PARAM): string {
  return `${formUrl}${formUrl.includes("?") ? "&" : "?"}${param}=${encodeURIComponent(token)}`;
}

export interface EditLinkUrlOptions extends EditLinkOptions {
  /** The query parameter; `EDIT_LINK_PARAM` by default. */
  param?: string | undefined;
}

/**
 * The link that reopens a response for editing: `formUrl` (the page that shows the form,
 * with any query it needs) plus a token signed for the response's current nonce. Null
 * when there are no edit links (no usable secret) or the id or nonce is malformed.
 */
export async function editLinkUrl(
  formUrl: string,
  link: { id: string; nonce: string },
  secret: string | null | undefined,
  options: EditLinkUrlOptions = {},
): Promise<string | null> {
  const token = await signEditToken(link, secret, options);
  return token ? withEditToken(formUrl, token, options.param) : null;
}

/** Where the edit-secret reader reports a missing or short secret. */
export type EditSecretLog = (message: string) => void;

/** Reads the edit-link secret from an environment, warning once when there is none. */
export interface EditSecretReader {
  /** The secret, or null (no edit links) when it is missing or too short; warns once, never with the secret. */
  (env: Record<string, string | undefined>, log?: EditSecretLog): string | null;
  /** Tests only: warn again. */
  reset(): void;
}

/**
 * A reader for the environment variable that holds the edit-link secret (such as
 * `FEEDBACK_EDIT_SECRET`). Without one of at least `MIN_EDIT_SECRET_BYTES` bytes there are
 * no edit links, and the first read says so through `log` (the call's, else the
 * reader's, else `console.warn`); later reads stay quiet until `reset()`.
 */
export function createEditSecretReader(options: { variable: string; log?: EditSecretLog | undefined }): EditSecretReader {
  const { variable } = options;
  let warned = false;
  const read = (env: Record<string, string | undefined>, log?: EditSecretLog): string | null => {
    const secret = env[variable];
    if (isUsableEditSecret(secret)) return secret;
    if (!warned) {
      warned = true;
      (log ?? options.log ?? ((m: string) => console.warn(m)))(
        `${variable} is ${secret ? `shorter than ${MIN_EDIT_SECRET_BYTES} bytes` : "not set"}: edit links are off.`,
      );
    }
    return null;
  };
  return Object.assign(read, {
    reset: () => {
      warned = false;
    },
  });
}

export interface EditLinkRequestOptions {
  /** The query parameter; `EDIT_LINK_PARAM` by default. */
  param?: string | undefined;
  /**
   * Whether the URL is a page that shows a form (an edit link is only honoured there,
   * such as `/f/<slug>`). Every URL by default.
   */
  isFormPage?: ((url: URL) => boolean) | undefined;
}

/** Whether this request is a form page opened with an edit link (the parameter present, even empty). */
export function isEditLinkRequest(url: URL, options: EditLinkRequestOptions = {}): boolean {
  const isFormPage = options.isFormPage ?? (() => true);
  return isFormPage(url) && url.searchParams.has(options.param ?? EDIT_LINK_PARAM);
}

/**
 * The response, with `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store`
 * added when the request carried an edit link; otherwise the same response, untouched.
 * The link is a credential, so it never leaves in a Referer header (an HTTP header, not
 * only the page's meta tag, so it holds before the page has parsed and for every request
 * the page makes), and the page, prefilled with the response, is never cached.
 */
export function withEditLinkHeaders(request: Request, response: Response, options: EditLinkRequestOptions = {}): Response {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return response;
  }
  if (!isEditLinkRequest(url, options)) return response;
  const headers = new Headers(response.headers);
  headers.set("referrer-policy", "no-referrer");
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
