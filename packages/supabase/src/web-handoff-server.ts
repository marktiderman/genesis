/**
 * `@marktiderman/genesis-supabase/web-handoff/server`: continue on the web, already signed in.
 * The server half of `migrations/0015_genesis_web_handoff.sql`. Server only: it takes the
 * service-role client; never import it into browser or app code.
 *
 * A native app (or anything else that holds a person's verified session) asks for a link to a
 * page of the web app. The link opens that page signed in as the same person:
 *
 * 1. `mintWebHandoff` (for a person the caller already verified) records a handoff: who, which
 *    path, good for 60 seconds, from which app session. Only a SHA-256 digest of its random
 *    token is stored. It returns `<web origin>/auth/handoff#t=<token>&next=<path>`: the token is
 *    in the fragment, which browsers never send to a server.
 * 2. The page claims it (`claimWebHandoff`): once, unexpired. It learns whose link it is and gets
 *    a continue nonce that lives 30 seconds. Nothing that signs anyone in exists yet, so a page
 *    left open, or cancelled, never holds a sign-in token.
 * 3. Continue (`continueWebHandoff`, the nonce, once, in time, not after Cancel) is the only step
 *    that asks Supabase Auth for a sign-in token (`auth.admin.generateLink`, type `magiclink`,
 *    which sends nothing), for the person's own email. The page exchanges it at once with
 *    `auth.verifyOtp({ token_hash, type: "email" })`. Cancel (`discardWebHandoff`) burns the nonce.
 * 4. The page reports the session it made (`bindWebHandoffSession`), so signing out of the app
 *    (`signOutWebHandoffs`) ends exactly the web sessions handed off from that app session.
 *
 * `createWebHandoff` wraps it all as three POST routes.
 *
 * ```ts
 * const handoff = createWebHandoff({ admin: supabaseAdmin });
 * // POST /api/auth/handoff          (the app, Bearer)                        → handoff.mint(request)
 * // POST /api/auth/redeem-handoff   (the page: claim, continue, discard, bind) → handoff.redeem(request)
 * // POST /api/auth/handoff-signout  (the app, Bearer, before it signs out)   → handoff.signOut(request)
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

/** One line for the server log. Never carries a token, a nonce or an email. */
export interface WebHandoffLogEvent {
  event:
    | "web_handoff.minted"
    | "web_handoff.refused"
    | "web_handoff.claimed"
    | "web_handoff.continued"
    | "web_handoff.discarded"
    | "web_handoff.signed_out";
  userId?: string;
  path?: string;
  reason?: string;
  count?: number;
  at: string;
}

type Log = (event: WebHandoffLogEvent) => void;

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
  /** How long the page's Continue works after it opened the link, 5 to 120 seconds. Default 30. */
  continueSeconds?: number;
  /** Links one person may mint per window. Default 10 a minute. */
  rateLimit?: { max: number; windowSeconds: number };
  /** Where each step is logged (who, which path, when). Default `console.info` as JSON. */
  log?: Log;
}

/** @stability Beta */
export interface MintWebHandoffOptions extends Omit<WebHandoffOptions, "webOrigin" | "continueSeconds"> {
  /** The person, already verified by the caller (a bearer token checked with `auth.getUser`). */
  userId: string;
  /** Where on the web app to land. Must pass {@link appRelativePath}. */
  path: string;
  webOrigin: string;
  /** The app session asking (the bearer's `session_id`): signing it out later ends the web session. */
  sourceSessionId?: string | null;
}

export type MintWebHandoffResult =
  | { ok: true; url: string; expiresAt: string }
  | {
      ok: false;
      reason: "bad_path" | "no_user" | "no_email" | "rate_limited";
      /** For no_email and rate_limited: the page, signed out, where the person can sign in and carry on. */
      fallbackUrl?: string;
    };

export type ClaimWebHandoffResult =
  /** The browser is already signed in as this person: go to `next`, nothing to exchange. */
  | { status: "same_user"; next: string }
  /** Ask "Continue as <email>?"; `continueNonce` works once, for `continueSeconds`. */
  | { status: "confirm"; next: string; email: string; continueNonce: string }
  /** Unknown, already used or older than its lifetime. */
  | { status: "expired" }
  | { status: "unavailable" };

export type ContinueWebHandoffResult =
  | { status: "ok"; next: string; userId: string; tokenHash: string }
  /** The nonce is unknown, used, cancelled or out of time. */
  | { status: "expired" }
  | { status: "unavailable" };

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE = "/auth/handoff";

const defaultLog: Log = (event) => console.info(JSON.stringify(event));
const now = () => new Date().toISOString();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** The SHA-256 of a handoff token or nonce, hex: what the database keeps instead. */
export async function handoffDigest(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The `session_id` claim of an access token Supabase Auth has already verified (`auth.getUser`),
 * or null. It only reads the payload; never call it on a token nobody verified.
 */
export function sessionIdOf(verifiedAccessToken: string): string | null {
  const payload = verifiedAccessToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: unknown };
    return typeof json.session_id === "string" && UUID.test(json.session_id) ? json.session_id : null;
  } catch {
    return null;
  }
}

function handoffPage(origin: string, pagePath: string, fragment: Record<string, string>): string {
  const page = appRelativePath(pagePath) ?? DEFAULT_PAGE;
  return `${origin.replace(/\/+$/, "")}${page}#${new URLSearchParams(fragment).toString()}`;
}

function firstRow(data: unknown): { user_id?: string; path?: string } | null {
  const row: unknown = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as { user_id?: string; path?: string }) : null;
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
  const at = now();
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

  const token = randomToken();
  const sourceSessionId = options.sourceSessionId && UUID.test(options.sourceSessionId) ? options.sourceSessionId : null;
  const issued = await admin.rpc("genesis_web_handoff_issue", {
    p_user_id: userId,
    p_digest: await handoffDigest(token),
    p_path: path,
    p_ttl_seconds: ttlSeconds,
    p_max: rateLimit.max,
    p_window_seconds: rateLimit.windowSeconds,
    p_source_session_id: sourceSessionId,
  });
  if (issued.error) {
    if (issued.error.code === "GS429") return refuse("rate_limited");
    throw new Error(`genesis_web_handoff_issue: ${issued.error.message}`);
  }
  log({ event: "web_handoff.minted", userId, path, at });
  return { ok: true, url: handoffPage(webOrigin, pagePath, { t: token, next: path }), expiresAt: String(issued.data) };
}

/**
 * The page opened a link: use it (once, within its lifetime) and say whose it is. Mints nothing.
 * When the browser is already that person (`currentUserId`) the handoff is spent and the page
 * simply goes on; otherwise it gets a continue nonce for {@link continueWebHandoff}.
 *
 * @stability Beta
 */
export async function claimWebHandoff(options: {
  admin: WebHandoffAdmin;
  token: string;
  /** Who this browser is signed in as now, if anyone. Only ever skips the question; grants nothing. */
  currentUserId?: string | null;
  continueSeconds?: number;
  log?: Log;
}): Promise<ClaimWebHandoffResult> {
  const { admin, token, currentUserId, continueSeconds = 30, log = defaultLog } = options;
  const at = now();
  if (!TOKEN.test(token)) return { status: "expired" };
  const nonce = randomToken();
  const nonceDigest = await handoffDigest(nonce);
  const { data, error } = await admin.rpc("genesis_web_handoff_claim", {
    p_digest: await handoffDigest(token),
    p_nonce_digest: nonceDigest,
    p_nonce_ttl_seconds: continueSeconds,
  });
  if (error) throw new Error(`genesis_web_handoff_claim: ${error.message}`);
  const row = firstRow(data);
  if (!row?.user_id) {
    log({ event: "web_handoff.refused", reason: "expired", at });
    return { status: "expired" };
  }
  const userId = row.user_id;
  const next = appRelativePath(row.path) ?? "/";
  if (currentUserId && currentUserId === userId) {
    await admin.rpc("genesis_web_handoff_discard", { p_nonce_digest: nonceDigest });
    log({ event: "web_handoff.claimed", userId, path: next, reason: "same_user", at });
    return { status: "same_user", next };
  }
  const found = await admin.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) {
    await admin.rpc("genesis_web_handoff_discard", { p_nonce_digest: nonceDigest });
    log({ event: "web_handoff.refused", userId, path: next, reason: "no_email", at });
    return { status: "unavailable" };
  }
  log({ event: "web_handoff.claimed", userId, path: next, at });
  return { status: "confirm", next, email, continueNonce: nonce };
}

/**
 * The person chose Continue: spend the nonce (once, in time, not after Cancel) and only now ask
 * Supabase Auth for a sign-in token for the handoff's own person.
 *
 * @stability Beta
 */
export async function continueWebHandoff(options: { admin: WebHandoffAdmin; nonce: string; log?: Log }): Promise<ContinueWebHandoffResult> {
  const { admin, nonce, log = defaultLog } = options;
  const at = now();
  if (!TOKEN.test(nonce)) return { status: "expired" };
  const { data, error } = await admin.rpc("genesis_web_handoff_continue", { p_nonce_digest: await handoffDigest(nonce) });
  if (error) throw new Error(`genesis_web_handoff_continue: ${error.message}`);
  const row = firstRow(data);
  if (!row?.user_id) {
    log({ event: "web_handoff.refused", reason: "continue_expired", at });
    return { status: "expired" };
  }
  const userId = row.user_id;
  const next = appRelativePath(row.path) ?? "/";
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
  log({ event: "web_handoff.continued", userId, path: next, at });
  return { status: "ok", next, userId, tokenHash };
}

/** The person chose Cancel: burn the nonce, so Continue is refused from now on. @stability Beta */
export async function discardWebHandoff(options: { admin: WebHandoffAdmin; nonce: string; log?: Log }): Promise<boolean> {
  const { admin, nonce, log = defaultLog } = options;
  if (!TOKEN.test(nonce)) return false;
  const { data, error } = await admin.rpc("genesis_web_handoff_discard", { p_nonce_digest: await handoffDigest(nonce) });
  if (error) throw new Error(`genesis_web_handoff_discard: ${error.message}`);
  if (data === true) log({ event: "web_handoff.discarded", at: now() });
  return data === true;
}

/**
 * The page reports the session Continue made: its access token is verified with `auth.getUser`,
 * and its `session_id` is kept on the handoff (for the same person, within two minutes of
 * Continue), so {@link signOutWebHandoffs} can end it.
 *
 * @stability Beta
 */
export async function bindWebHandoffSession(options: { admin: WebHandoffAdmin; nonce: string; accessToken: string }): Promise<boolean> {
  const { admin, nonce, accessToken } = options;
  if (!TOKEN.test(nonce)) return false;
  const { data, error } = await admin.auth.getUser(accessToken);
  const sessionId = sessionIdOf(accessToken);
  if (error || !data.user || !sessionId) return false;
  const bound = await admin.rpc("genesis_web_handoff_bind_session", {
    p_nonce_digest: await handoffDigest(nonce),
    p_user_id: data.user.id,
    p_session_id: sessionId,
  });
  if (bound.error) throw new Error(`genesis_web_handoff_bind_session: ${bound.error.message}`);
  return bound.data === true;
}

/**
 * The app is signing out: end the web sessions handed off from that app session (and only
 * those; never the person's other devices). Call it before the app's own sign-out, with the
 * app's still-valid access token. Supabase documents a session as signed out once its
 * `auth.sessions` row is gone; that web session's access token works until it expires.
 *
 * @stability Beta
 */
export async function signOutWebHandoffs(options: {
  admin: WebHandoffAdmin;
  userId: string;
  sourceSessionId: string | null;
  log?: Log;
}): Promise<number> {
  const { admin, userId, sourceSessionId, log = defaultLog } = options;
  if (!sourceSessionId) return 0;
  const { data, error } = await admin.rpc("genesis_web_handoff_revoke_sessions", { p_user_id: userId, p_source_session_id: sourceSessionId });
  if (error) throw new Error(`genesis_web_handoff_revoke_sessions: ${error.message}`);
  const count = typeof data === "number" ? data : 0;
  log({ event: "web_handoff.signed_out", userId, count, at: now() });
  return count;
}

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const raw: unknown = await request.json().catch(() => null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

const bearerOf = (request: Request) => /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const fail = (error: unknown) => {
  console.error(`[web-handoff] ${error instanceof Error ? error.message : String(error)}`);
  return json({ status: "unavailable" }, 500);
};

/**
 * The web handoff's routes, each `(request) => Response`, POST only, no CORS headers:
 *
 * - `mint` (the app): `Authorization: Bearer <access token>` and `{ path }`. 200 `{ url, expiresAt }`;
 *   401 without a valid session; 400 for a path that could leave the app; 409 `no_email` and
 *   429 `rate_limited` with a `fallbackUrl` (the page, signed out) the app may open instead.
 * - `redeem` (the page), JSON `{ action, … }`:
 *   `claim` `{ t, currentUserId? }` → {@link ClaimWebHandoffResult};
 *   `continue` `{ nonce }` → {@link ContinueWebHandoffResult};
 *   `discard` `{ nonce }` → `{ status: "discarded" }`;
 *   `bind` `{ nonce }` with `Authorization: Bearer <the new web session's access token>` → `{ status: "bound" | "not_bound" }`.
 * - `signOut` (the app, before its own sign-out): Bearer → `{ status: "signed_out", count }`.
 *
 * @stability Beta
 */
export function createWebHandoff(options: WebHandoffOptions): {
  mint: (request: Request) => Promise<Response>;
  redeem: (request: Request) => Promise<Response>;
  signOut: (request: Request) => Promise<Response>;
} {
  const { admin, log = defaultLog, continueSeconds = 30 } = options;
  const originOf = (request: Request) =>
    typeof options.webOrigin === "function" ? options.webOrigin(request) : (options.webOrigin ?? new URL(request.url).origin);
  const postOnly = (request: Request) => (request.method === "POST" ? null : json({ error: "Use POST." }, 405, { allow: "POST" }));
  const caller = async (request: Request) => {
    const bearer = bearerOf(request);
    if (!bearer) return null;
    const { data, error } = await admin.auth.getUser(bearer);
    return error || !data.user ? null : { user: data.user, sessionId: sessionIdOf(bearer) };
  };
  const unauthorized = () => json({ error: "Sign in first." }, 401, { "www-authenticate": "Bearer" });

  return {
    async mint(request) {
      const wrongMethod = postOnly(request);
      if (wrongMethod) return wrongMethod;
      const who = await caller(request);
      if (!who) return unauthorized();
      const body = await jsonBody(request);
      if (!body) return json({ error: "Send JSON: { path }." }, 400);
      let result: MintWebHandoffResult;
      try {
        result = await mintWebHandoff({
          ...options,
          admin,
          log,
          userId: who.user.id,
          sourceSessionId: who.sessionId,
          path: str(body["path"]),
          webOrigin: originOf(request),
        });
      } catch (error) {
        return fail(error);
      }
      if (result.ok) return json({ url: result.url, expiresAt: result.expiresAt });
      const status = { bad_path: 400, no_user: 401, no_email: 409, rate_limited: 429 }[result.reason];
      return json({ error: result.reason, ...(result.fallbackUrl ? { fallbackUrl: result.fallbackUrl } : {}) }, status);
    },

    async redeem(request) {
      const wrongMethod = postOnly(request);
      if (wrongMethod) return wrongMethod;
      const body = await jsonBody(request);
      if (!body) return json({ status: "expired" });
      try {
        switch (body["action"]) {
          case "claim":
            return json(
              await claimWebHandoff({ admin, log, continueSeconds, token: str(body["t"]), currentUserId: str(body["currentUserId"]) || null }),
            );
          case "continue":
            return json(await continueWebHandoff({ admin, log, nonce: str(body["nonce"]) }));
          case "discard":
            await discardWebHandoff({ admin, log, nonce: str(body["nonce"]) });
            return json({ status: "discarded" });
          case "bind": {
            const accessToken = bearerOf(request);
            const bound = accessToken ? await bindWebHandoffSession({ admin, nonce: str(body["nonce"]), accessToken }) : false;
            return json({ status: bound ? "bound" : "not_bound" });
          }
          default:
            return json({ error: "Unknown action." }, 400);
        }
      } catch (error) {
        return fail(error);
      }
    },

    async signOut(request) {
      const wrongMethod = postOnly(request);
      if (wrongMethod) return wrongMethod;
      const who = await caller(request);
      if (!who) return unauthorized();
      try {
        const count = await signOutWebHandoffs({ admin, log, userId: who.user.id, sourceSessionId: who.sessionId });
        return json({ status: "signed_out", count });
      } catch (error) {
        return fail(error);
      }
    },
  };
}
