/**
 * `@marktiderman/genesis-supabase/web-handoff/server`: continue on the web, already signed in.
 * The server half of `migrations/0015_genesis_web_handoff.sql`. Server only: it takes the
 * service-role client; never import it into browser or app code.
 *
 * A native app (or anything else that holds a person's verified session) asks for a link to a
 * page of the web app. The link opens that page signed in as the same person:
 *
 * 1. `mintWebHandoff` (for a person the caller already verified) records a handoff: who, which
 *    path, issued now, good for 60 seconds, used never. Only a SHA-256 digest of its random
 *    token is stored. It returns `<web origin>/auth/handoff#t=<token>&next=<path>`: the token is in
 *    the fragment, which browsers never send to a server, so it stays out of request logs.
 * 2. The page (`completeWebHandoff` from `/web-handoff`) posts the token to `redeem`, which marks
 *    the handoff used in the same statement that checks it (single use, 60 seconds), and only
 *    then asks Supabase Auth for a sign-in token for that person's own email
 *    (`auth.admin.generateLink`, type `magiclink`, which sends nothing). The page exchanges it
 *    at once with `auth.verifyOtp({ token_hash, type: "email" })`.
 *
 * `createWebHandoff` wraps both as two POST routes; the mint route verifies the caller's bearer
 * token with `auth.getUser`.
 *
 * ```ts
 * const handoff = createWebHandoff({ admin: supabaseAdmin });
 * // POST /api/auth/handoff         (the app, with Authorization: Bearer <access token>)
 * export const POST = ({ request }) => handoff.mint(request);
 * // POST /api/auth/redeem-handoff  (the /auth/handoff page)
 * export const POST = ({ request }) => handoff.redeem(request);
 * ```
 *
 * @packageDocumentation
 */
import { appRelativePath } from "./web-handoff-path";

export { appRelativePath } from "./web-handoff-path";

/** A user as Supabase Auth returns one: the fields used here. */
interface HandoffUser {
  id: string;
  email?: string | null;
}

/**
 * The parts of a service-role Supabase client the handoff uses. A `SupabaseClient` made with the
 * secret key fits. Loose on purpose: a client typed by an app's Database narrows `rpc`.
 */
export interface WebHandoffAdmin {
  auth: {
    getUser(jwt: string): PromiseLike<{ data: { user: HandoffUser | null }; error: unknown }>;
    admin: {
      getUserById(id: string): PromiseLike<{ data: { user: HandoffUser | null }; error: unknown }>;
      generateLink(params: { type: "magiclink"; email: string }): PromiseLike<{
        data: { properties?: { hashed_token?: string | null } | null } | null;
        error: unknown;
      }>;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** One line for the server log. Never carries a token or an email. */
export interface WebHandoffLogEvent {
  event: "web_handoff.minted" | "web_handoff.refused" | "web_handoff.redeemed";
  userId?: string;
  path?: string;
  reason?: string;
  at: string;
}

/** @stability Beta */
export interface WebHandoffOptions {
  admin: WebHandoffAdmin;
  /**
   * The web app's origin (`https://app.example.com`), or a function of the request. Default: the
   * mint request's own origin, so a preview deployment hands off to itself.
   */
  webOrigin?: string | ((request: Request) => string);
  /** The page that completes the handoff. Default `/auth/handoff`. */
  pagePath?: string;
  /** How long a link works, 10 to 300 seconds. Default 60. */
  ttlSeconds?: number;
  /** Links one person may mint per window. Default 10 a minute. */
  rateLimit?: { max: number; windowSeconds: number };
  /** Where each handoff is logged (who, which path, when). Default `console.info` as JSON. */
  log?: (event: WebHandoffLogEvent) => void;
}

/** @stability Beta */
export interface MintWebHandoffOptions extends Omit<WebHandoffOptions, "webOrigin"> {
  /** The person, already verified by the caller (a bearer token checked with `auth.getUser`). */
  userId: string;
  /** Where on the web app to land. Must pass {@link appRelativePath}. */
  path: string;
  webOrigin: string;
}

export type MintWebHandoffResult =
  | { ok: true; url: string; expiresAt: string }
  | {
      ok: false;
      reason: "bad_path" | "no_user" | "no_email" | "rate_limited";
      /** For no_email and rate_limited: the page, signed out, where the person can sign in and carry on. */
      fallbackUrl?: string;
    };

export type RedeemWebHandoffResult =
  /** The browser is already signed in as this person: nothing to exchange. */
  | { status: "same_user"; next: string }
  /** Ask "Continue as <email>?", then exchange `tokenHash` with `verifyOtp`. */
  | { status: "confirm"; next: string; email: string; userId: string; tokenHash: string }
  /** Unknown, already used or older than its lifetime. */
  | { status: "expired" }
  | { status: "unavailable" };

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE = "/auth/handoff";

const defaultLog = (event: WebHandoffLogEvent) => console.info(JSON.stringify(event));

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The SHA-256 of a handoff token, hex: what the database keeps instead of the token. */
export async function handoffDigest(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function handoffPage(origin: string, pagePath: string, fragment: Record<string, string>): string {
  const page = appRelativePath(pagePath) ?? DEFAULT_PAGE;
  return `${origin.replace(/\/+$/, "")}${page}#${new URLSearchParams(fragment).toString()}`;
}

/**
 * Record a handoff for a person the caller has already verified and return the link that
 * completes it. Refuses a path that could leave the app, a person without an email (Supabase
 * signs in by email link; there is no phone equivalent), and more than `rateLimit` links a window.
 *
 * @stability Beta
 */
export async function mintWebHandoff(options: MintWebHandoffOptions): Promise<MintWebHandoffResult> {
  const { admin, userId, webOrigin, pagePath = DEFAULT_PAGE, ttlSeconds = 60, log = defaultLog } = options;
  const rateLimit = options.rateLimit ?? { max: 10, windowSeconds: 60 };
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 10 || ttlSeconds > 300) {
    throw new RangeError("ttlSeconds must be a whole number from 10 to 300.");
  }
  const at = new Date().toISOString();
  const path = appRelativePath(options.path);
  const refuse = (reason: "bad_path" | "no_user" | "no_email" | "rate_limited"): MintWebHandoffResult => {
    log({ event: "web_handoff.refused", userId, ...(path ? { path } : {}), reason, at });
    const fallbackUrl =
      path && (reason === "no_email" || reason === "rate_limited") ? handoffPage(webOrigin, pagePath, { next: path }) : undefined;
    return { ok: false, reason, ...(fallbackUrl ? { fallbackUrl } : {}) };
  };
  if (!path) return refuse("bad_path");
  if (!UUID.test(userId)) return refuse("no_user");

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return refuse("no_user");
  if (!data.user.email) return refuse("no_email");

  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const issued = await admin.rpc("genesis_web_handoff_issue", {
    p_user_id: userId,
    p_digest: await handoffDigest(token),
    p_path: path,
    p_ttl_seconds: ttlSeconds,
    p_max: rateLimit.max,
    p_window_seconds: rateLimit.windowSeconds,
  });
  if (issued.error) {
    if (issued.error.code === "GS429") return refuse("rate_limited");
    throw new Error(`genesis_web_handoff_issue: ${issued.error.message}`);
  }
  log({ event: "web_handoff.minted", userId, path, at });
  return { ok: true, url: handoffPage(webOrigin, pagePath, { t: token, next: path }), expiresAt: String(issued.data) };
}

/**
 * Use a handoff token: once, within its lifetime. When the browser is already signed in as that
 * person (`currentUserId`), nothing is minted. Otherwise Supabase Auth makes a sign-in token for
 * the person's own email, looked up by the id the handoff was minted for.
 *
 * @stability Beta
 */
export async function redeemWebHandoff(options: {
  admin: WebHandoffAdmin;
  token: string;
  /** Who this browser is signed in as now, if anyone. Only ever saves minting; never grants anything. */
  currentUserId?: string | null;
  log?: (event: WebHandoffLogEvent) => void;
}): Promise<RedeemWebHandoffResult> {
  const { admin, token, currentUserId, log = defaultLog } = options;
  const at = new Date().toISOString();
  if (!TOKEN.test(token)) return { status: "expired" };
  const { data, error } = await admin.rpc("genesis_web_handoff_redeem", { p_digest: await handoffDigest(token) });
  if (error) throw new Error(`genesis_web_handoff_redeem: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { user_id?: string; path?: string } | null | undefined;
  if (!row?.user_id) {
    log({ event: "web_handoff.refused", reason: "expired", at });
    return { status: "expired" };
  }
  const userId = row.user_id;
  const next = appRelativePath(row.path) ?? "/";
  if (currentUserId && currentUserId === userId) {
    log({ event: "web_handoff.redeemed", userId, path: next, reason: "same_user", at });
    return { status: "same_user", next };
  }
  const found = await admin.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) {
    log({ event: "web_handoff.refused", userId, path: next, reason: "no_email", at });
    return { status: "unavailable" };
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    log({ event: "web_handoff.refused", userId, path: next, reason: "generate_link_failed", at });
    return { status: "unavailable" };
  }
  log({ event: "web_handoff.redeemed", userId, path: next, at });
  return { status: "confirm", next, email, userId, tokenHash };
}

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const raw: unknown = await request.json().catch(() => null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/**
 * The two routes of a web handoff, each `(request) => Response`, POST only:
 *
 * - `mint`: `Authorization: Bearer <access token>` and `{ path }`. 200 `{ url, expiresAt }`;
 *   401 without a valid session; 400 for a path that could leave the app; 409 `no_email` and
 *   429 `rate_limited` with a `fallbackUrl` (the page, signed out) the app may open instead.
 * - `redeem`: `{ t, currentUserId? }` from the page. 200 with a {@link RedeemWebHandoffResult}.
 *
 * Neither sets CORS headers: the app calls `mint` from native code, and the page calls `redeem`
 * from its own origin.
 *
 * @stability Beta
 */
export function createWebHandoff(options: WebHandoffOptions): {
  mint: (request: Request) => Promise<Response>;
  redeem: (request: Request) => Promise<Response>;
} {
  const { admin, log = defaultLog } = options;
  const originOf = (request: Request) =>
    typeof options.webOrigin === "function"
      ? options.webOrigin(request)
      : (options.webOrigin ?? new URL(request.url).origin);
  const postOnly = (request: Request) =>
    request.method === "POST" ? null : json({ error: "Use POST." }, 405, { allow: "POST" });

  return {
    async mint(request) {
      const wrongMethod = postOnly(request);
      if (wrongMethod) return wrongMethod;
      const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!bearer) return json({ error: "Sign in first." }, 401, { "www-authenticate": "Bearer" });
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user) return json({ error: "Sign in first." }, 401, { "www-authenticate": "Bearer" });
      const body = await jsonBody(request);
      if (!body) return json({ error: "Send JSON: { path }." }, 400);
      let result: MintWebHandoffResult;
      try {
        result = await mintWebHandoff({
          ...options,
          admin,
          log,
          userId: data.user.id,
          path: typeof body["path"] === "string" ? body["path"] : "",
          webOrigin: originOf(request),
        });
      } catch (failure) {
        console.error(`[web-handoff] ${failure instanceof Error ? failure.message : String(failure)}`);
        return json({ error: "unavailable" }, 500);
      }
      if (result.ok) return json({ url: result.url, expiresAt: result.expiresAt });
      const status = { bad_path: 400, no_user: 401, no_email: 409, rate_limited: 429 }[result.reason];
      return json({ error: result.reason, ...(result.fallbackUrl ? { fallbackUrl: result.fallbackUrl } : {}) }, status);
    },
    async redeem(request) {
      const wrongMethod = postOnly(request);
      if (wrongMethod) return wrongMethod;
      const body = await jsonBody(request);
      if (!body || typeof body["t"] !== "string") return json({ status: "expired" });
      const current = typeof body["currentUserId"] === "string" ? body["currentUserId"] : null;
      try {
        return json(await redeemWebHandoff({ admin, log, token: body["t"], currentUserId: current }));
      } catch (error) {
        console.error(`[web-handoff] ${error instanceof Error ? error.message : String(error)}`);
        return json({ status: "unavailable" }, 500);
      }
    },
  };
}
