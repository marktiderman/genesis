/**
 * "Connect an outside account" on Web `Request` and `Response`: the OAuth 2.0
 * authorization-code flow with PKCE, for any framework that speaks fetch
 * (Next.js route handlers, TanStack Start, Hono, Remix, Workers).
 *
 *   start     the app has signed the person in and says who they are; the
 *             kit answers the provider's sign-in URL and a cookie. The URL
 *             carries a signed, short-lived state (who, what for, where to
 *             come back to, a nonce); the cookie (HttpOnly, SameSite=Lax)
 *             carries the nonce and the PKCE verifier, so only the browser
 *             that started can finish.
 *   callback  checks the state's signature and age and that the cookie's
 *             nonce matches, handles a refusal, trades the code (PKCE, never
 *             following a redirect), checks every scope asked for was
 *             granted, seals the refresh token with the keyring and hands it
 *             to the app's `store`. Then back to where it started with a
 *             short result: connected, expired, browser, denied, scope or
 *             failed.
 *   accessToken / revoke  open a sealed refresh token to get a fresh access
 *             token (cached in memory until a minute before it expires), or
 *             to revoke the grant.
 *
 * One callback origin can serve many: pin `redirectOrigin` (the one address
 * registered with the provider) and set `sharedDomain`, and a flow started on
 * any https address under that domain finishes on the pinned one and returns
 * to the address it started on, and to no other.
 *
 * Never logs or returns a token, a code, a client secret or a key; token
 * requests never follow redirects.
 */
import {
  base64url,
  fromBase64,
  randomToken,
  sha256Hex,
  utf8,
  type WebCryptoKey,
} from "./encoding";
import type { OAuthProvider } from "./providers";
import { secretKeyBytes, type Secrets } from "./secrets";

/** How a connection attempt ended, as the `connect` query parameter on the way back. */
export type ConnectResult =
  /** Connected; the app's `store` kept the account. */
  | "connected"
  /** The signed state was missing, forged or too old: start again. */
  | "expired"
  /** The browser that came back is not the one that started (no or another cookie). */
  | "browser"
  /** The person said no at the provider (or it sent no code). */
  | "denied"
  /** The person unticked a scope the app needs. */
  | "scope"
  /** The provider or the app's `store` failed. */
  | "failed";

/** Every result `callback` can send back with. */
export const CONNECT_RESULTS: readonly ConnectResult[] = [
  "connected",
  "expired",
  "browser",
  "denied",
  "scope",
  "failed",
];

/** What went wrong outside the callback, for code to branch on. */
export type ConnectErrorCode =
  /** The connector is set up wrong (a missing secret, a bad origin). */
  | "config"
  /** A call was given something it can't use (no subject, an absolute returnTo). */
  | "usage"
  /** The grant is gone (`invalid_grant`): access was removed. Connect again. */
  | "revoked"
  /** The provider is down, limiting, or timed out. Worth retrying. */
  | "unavailable"
  /** The provider refused for another reason. */
  | "failed";

/** A failure with a message safe to show and log: never a token, a code or a secret. */
export class ConnectError extends Error {
  override name = "ConnectError";
  readonly code: ConnectErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  constructor(
    code: ConnectErrorCode,
    message: string,
    options: {
      status?: number | undefined;
      retryAfterSeconds?: number | undefined;
    } = {},
  ) {
    super(message);
    this.code = code;
    this.retryable = code === "unavailable";
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Small app data carried in the signed state. Signed, not encrypted: never put a secret in it. */
export type StateData = Readonly<
  Record<string, string | number | boolean | null>
>;

/** What `start` is told about this attempt. */
export interface StartOptions<D extends StateData = StateData> {
  /** Who is connecting: the app's verified user id. Handed back to `store`. */
  subject: string;
  /** What the connection is for, app-defined (`"sheets"`, `"calendar"`). At most 64 characters. */
  intent?: string | undefined;
  /**
   * Where to come back to: a path on the app (`"/settings/integrations"`),
   * never a full URL. The result is added as `?connect=…`.
   */
  returnTo: string;
  /** Scopes for this attempt, instead of the connector's. */
  scopes?: readonly string[] | undefined;
  /** Small app data to have back in `store` (a form id, a chosen file). Not secret. */
  data?: D | undefined;
  /** Extra authorization parameters (`login_hint`). The flow's own can't be overridden. */
  params?: Readonly<Record<string, string>> | undefined;
}

/** `start`'s answer: send the browser to `url` with `setCookie` set. */
export interface StartResult {
  /** The provider's sign-in URL. */
  url: string;
  /** The `Set-Cookie` header value holding the nonce and the PKCE verifier. */
  setCookie: string;
  /** A 303 to `url` with the cookie: for a start reached by a link or a form post. */
  redirect(): Response;
  /** `{ url }` as JSON with the cookie: for a start the page calls with fetch, then navigates. */
  json(): Response;
}

/** What `store` is handed: the new account, its refresh token already sealed. */
export interface ConnectedAccount<D extends StateData = StateData> {
  /** A new id for this grant (a UUID): the row to keep it under. */
  id: string;
  /** The associated data the refresh token is sealed to (`aad(id)`): pass it to `accessToken` and `revoke`. */
  aad: string;
  /** The refresh token, sealed with the keyring. Store it; it never needs opening by the app. */
  sealedRefreshToken: string;
  /** A fresh access token, to look the account up now (an email, a file). Don't store it. */
  accessToken: string;
  /** Seconds the access token is good for. */
  expiresIn: number;
  /** The granted scopes, as the provider joined them. */
  scope: string;
  /** The granted scopes. */
  scopes: string[];
  /** The OpenID Connect ID token, when the provider sent one (an `openid` scope). */
  idToken?: string | undefined;
  /** From `start`. */
  subject: string;
  intent: string;
  returnTo: string;
  data: D;
}

/** What `store` may add to the way back, as query parameters (a grant id to finish with). */
export type StoreResult = void | undefined | Readonly<Record<string, string>>;

/** A safe log line: never a token, a code, a secret or a provider's error text. */
export interface ConnectLogEvent {
  step: "callback" | "refresh" | "revoke";
  result: ConnectResult | ConnectErrorCode | "revoked";
  /** A short, safe reason: "token endpoint answered 400", "store threw". */
  detail?: string | undefined;
}

/** Options shared by the requests the connector makes. */
export interface HttpOptions {
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
  /** Per request, in milliseconds. Default 10 000. */
  timeoutMs?: number | undefined;
}

export interface ConnectorConfig<
  D extends StateData = StateData,
> extends HttpOptions {
  provider: OAuthProvider;
  /** The app's OAuth client. Server side only. */
  clientId: string;
  clientSecret: string;
  /** 32 random bytes, base64 (`openssl rand -base64 32`): signs the state. Not the keyring's key. */
  stateSecret: string | Uint8Array;
  /** Seals refresh tokens (`createSecrets(keyring, { purpose: "google-refresh-token" })`). */
  secrets: Secrets;
  /** The callback's path on the app (`"/api/connect/google/callback"`). Register `<origin><path>` with the provider. */
  callbackPath: string;
  /** Scopes asked for when `start` names none. Default the provider's `defaultScopes`. */
  scopes?: readonly string[] | undefined;
  /**
   * The one origin the provider sends everyone back to (`https://app.example.com`),
   * when the app runs on many. Without it, each request's own origin.
   */
  redirectOrigin?: string | undefined;
  /**
   * The parent domain the PKCE cookie is shared on (`example.com`), so a flow
   * started on `team.example.com` can finish on the pinned `app.example.com`
   * and come back to `team.example.com`. Only https origins on it are ever
   * returned to. Leave it out to keep the cookie on one host.
   */
  sharedDomain?: string | undefined;
  /** The cookie's name. Default `genesis_connect_<provider id>`. */
  cookieName?: string | undefined;
  /** The cookie's path. Default `callbackPath`, so it is only ever sent to the callback. */
  cookiePath?: string | undefined;
  /** How long the trip to the provider and back may take. Default 600 seconds, at most 3600. */
  stateTtlSeconds?: number | undefined;
  /** The query parameter the result comes back in. Default `"connect"`. */
  resultParam?: string | undefined;
  /** Where to go back to when the state can't be read (so there is no `returnTo`). Default `"/"`. */
  fallbackPath?: string | undefined;
  /** The associated data a grant's refresh token is sealed to. Default `<provider id>-grant:<id>`. */
  aad?: ((id: string) => string) | undefined;
  /** Fail with `failed` when the provider sends no refresh token. Default true. */
  requireRefreshToken?: boolean | undefined;
  /**
   * Keeps the new account: the app's row, under `account.id`. May return
   * query parameters for the way back. Throwing ends the attempt as `failed`.
   */
  store: (
    account: ConnectedAccount<D>,
    context: { request: Request },
  ) => StoreResult | Promise<StoreResult>;
  /** Safe log lines (see `ConnectLogEvent`). */
  log?: ((event: ConnectLogEvent) => void) | undefined;
  now?: (() => number) | undefined;
  randomId?: (() => string) | undefined;
}

/** A fresh access token, and the refresh token again when the provider rotated it. */
export interface RefreshedToken {
  accessToken: string;
  expiresIn: number;
  scope: string;
  /** Set when the provider sent a new refresh token: store it in place of the old one. */
  sealedRefreshToken?: string | undefined;
}

export interface TokenCallOptions {
  signal?: AbortSignal | undefined;
  /** Called with the new sealed refresh token when the provider rotates it. */
  onRotate?: ((sealedRefreshToken: string) => void | Promise<void>) | undefined;
}

export interface Connector<D extends StateData = StateData> {
  readonly provider: OAuthProvider;
  /** The redirect URI for a request: `<redirectOrigin or the request's origin><callbackPath>`. */
  redirectUri(request: Request): string;
  /** Begins a connection (see the module comment). The app checks who is signed in first. */
  start(request: Request, options: StartOptions<D>): Promise<StartResult>;
  /** Finishes one: always a 303 back to the app, with the result and a cleared cookie. */
  callback(request: Request): Promise<Response>;
  /** A fresh access token for a sealed refresh token (cached until a minute before it expires). */
  accessToken(
    sealedRefreshToken: string,
    aad: string,
    options?: TokenCallOptions,
  ): Promise<string>;
  /** Trades a sealed refresh token for an access token, uncached. */
  refresh(
    sealedRefreshToken: string,
    aad: string,
    options?: TokenCallOptions,
  ): Promise<RefreshedToken>;
  /**
   * Revokes the grant at the provider and forgets its cached access token.
   * True when it is gone (revoked now, or already); false when the provider
   * could not be reached or has no revocation endpoint. Some providers
   * (Google) end every token of the person's grant to this client, so call
   * it only when the app no longer uses any.
   */
  revoke(
    sealedRefreshToken: string,
    aad: string,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<boolean>;
}

// Validation ---------------------------------------------------------------------------------------

/** Shared hosting suffixes on the Public Suffix List: a cookie scoped to one is dropped. */
const PUBLIC_SUFFIXES = new Set([
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "github.io",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
  "web.app",
  "firebaseapp.com",
  "azurewebsites.net",
  "appspot.com",
  "co.uk",
  "com.au",
]);

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const RESERVED_PARAMS = new Set([
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
]);

const isLocal = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

function checkOrigin(value: string, what: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConnectError("config", `${what} is not a URL`);
  }
  const origin = value.replace(/\/+$/, "");
  if (url.origin !== origin)
    throw new ConnectError(
      "config",
      `${what} must be an origin only (scheme, host and port)`,
    );
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLocal(url.hostname))
  ) {
    throw new ConnectError(
      "config",
      `${what} must be https (http only on localhost)`,
    );
  }
  return origin;
}

function checkPath(value: string, what: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s\x00-\x1f\x7f]/.test(value) ||
    value.length > 512
  ) {
    throw new ConnectError(
      "usage",
      `${what} must be a path on this app, starting with one /`,
    );
  }
  // Resolved against a placeholder origin it must not leave.
  const url = new URL(value, "https://origin.invalid");
  if (url.origin !== "https://origin.invalid")
    throw new ConnectError(
      "usage",
      `${what} must be a path on this app, starting with one /`,
    );
  return `${url.pathname}${url.search}${url.hash}`;
}

const onDomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/** Whether `origin` is exactly an https origin on `domain`, so it is safe to send the browser back to. */
export function isSafeReturnOrigin(origin: string, domain: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.origin === origin &&
      onDomain(url.hostname, domain)
    );
  } catch {
    return false;
  }
}

function scopeList(scopes: readonly string[] | undefined): string[] {
  const list = [...new Set(scopes ?? [])];
  for (const scope of list) {
    if (typeof scope !== "string" || !SCOPE_TOKEN.test(scope))
      throw new ConnectError(
        "usage",
        "A scope is malformed (no spaces or quotes)",
      );
  }
  return list;
}

// HTTP ---------------------------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

async function timedFetch(
  deps: HttpOptions,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const any = (
    AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any;
  const combined = signal ? (any ? any([timeout, signal]) : signal) : timeout;
  try {
    // Never follow a redirect: the body holds a code, a token or the client secret.
    return await (deps.fetch ?? fetch)(url, {
      ...init,
      redirect: "error",
      signal: combined,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError")
      throw new ConnectError(
        "unavailable",
        "The provider did not answer in time",
      );
    if (name === "AbortError")
      throw new ConnectError("unavailable", "The request was aborted");
    throw new ConnectError("unavailable", "The provider could not be reached");
  }
}

function discard(response: Response): void {
  try {
    void response.body?.cancel().catch(() => {});
  } catch {
    // A mocked or already-read body.
  }
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const value = (await response.json().catch(() => null)) as unknown;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A provider's error code, when it is one (`invalid_grant`), never its free text. */
function errorCode(body: Record<string, unknown>): string | undefined {
  const code = body["error"];
  return typeof code === "string" && /^[a-z_]{1,64}$/.test(code)
    ? code
    : undefined;
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get("retry-after")?.trim();
  return header && /^\d+$/.test(header)
    ? Math.min(86_400, Math.max(1, Number(header)))
    : undefined;
}

const isRetryableStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

// Access-token cache -------------------------------------------------------------------------------

// One per process, shared by connectors: keyed by a digest of the provider, the
// client and the refresh token, so a hit is only ever for the same grant.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_LIMIT = 1000;

/** Forgets every cached access token (tests, or after a key or client change). */
export function clearAccessTokenCache(): void {
  tokenCache.clear();
}

// The connector ------------------------------------------------------------------------------------

interface SignedState {
  subject: string;
  intent: string;
  returnTo: string;
  origin: string;
  nonce: string;
  expiresAt: number;
  scopes: string[];
  data: StateData;
}

/** Sets up a connector for one provider. Checks its config now, so a mistake shows at boot. */
export function createConnector<D extends StateData = StateData>(
  config: ConnectorConfig<D>,
): Connector<D> {
  const { provider } = config;
  if (!provider?.id || !provider.authorizeUrl || !provider.tokenUrl)
    throw new ConnectError(
      "config",
      "The provider needs an id, an authorize URL and a token URL",
    );
  if (!config.clientId || !config.clientSecret)
    throw new ConnectError(
      "config",
      `The ${provider.id} OAuth client id or secret is not set`,
    );
  if (!config.secrets)
    throw new ConnectError(
      "config",
      "The connector needs secrets (createSecrets) to seal refresh tokens",
    );
  if (typeof config.store !== "function")
    throw new ConnectError("config", "The connector needs a store function");
  let stateKeyBytes: Uint8Array<ArrayBuffer>;
  try {
    stateKeyBytes = secretKeyBytes(config.stateSecret);
  } catch (error) {
    throw new ConnectError(
      "config",
      `The state secret: ${(error as Error).message}`,
    );
  }
  const callbackPath = checkPath(config.callbackPath, "callbackPath");
  const redirectOrigin = config.redirectOrigin
    ? checkOrigin(config.redirectOrigin, "redirectOrigin")
    : undefined;
  const sharedDomain =
    config.sharedDomain?.trim().toLowerCase().replace(/^\./, "") || undefined;
  if (sharedDomain) {
    if (!HOSTNAME.test(sharedDomain) || PUBLIC_SUFFIXES.has(sharedDomain)) {
      throw new ConnectError(
        "config",
        "sharedDomain must be a registrable domain such as example.com, not a public suffix",
      );
    }
    if (
      redirectOrigin &&
      !onDomain(new URL(redirectOrigin).hostname, sharedDomain)
    ) {
      throw new ConnectError(
        "config",
        "redirectOrigin must be on sharedDomain",
      );
    }
  }
  const cookieName =
    config.cookieName ??
    `genesis_connect_${provider.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  if (!COOKIE_NAME.test(cookieName))
    throw new ConnectError("config", "cookieName is not a valid cookie name");
  const cookiePath = checkPath(
    config.cookiePath ?? callbackPath,
    "cookiePath",
  ).replace(/[?#].*$/, "");
  if (/[;,]/.test(cookiePath)) {
    throw new ConnectError("config", "cookiePath can't hold ; or ,");
  }
  if (!callbackPath.startsWith(cookiePath))
    throw new ConnectError("config", "cookiePath must cover callbackPath");
  const ttl = Math.floor(config.stateTtlSeconds ?? 600);
  if (!(ttl >= 60 && ttl <= 3600))
    throw new ConnectError(
      "config",
      "stateTtlSeconds must be between 60 and 3600",
    );
  const resultParam = config.resultParam ?? "connect";
  const fallbackPath = checkPath(config.fallbackPath ?? "/", "fallbackPath");
  const aadFor = config.aad ?? ((id: string) => `${provider.id}-grant:${id}`);
  const separator = provider.scopeSeparator ?? " ";
  const defaultScopes = scopeList(config.scopes ?? provider.defaultScopes);
  const now = () => config.now?.() ?? Date.now();
  const log = (event: ConnectLogEvent) => {
    try {
      config.log?.(event);
    } catch {
      // A logger never breaks the flow.
    }
  };

  let stateKey: Promise<WebCryptoKey> | undefined;
  const hmacKey = () =>
    (stateKey ??= crypto.subtle
      .importKey("raw", stateKeyBytes, "HKDF", false, ["deriveKey"])
      .then((base) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: utf8.encode(`genesis-connect/state/${provider.id}`),
          },
          base,
          { name: "HMAC", hash: "SHA-256", length: 256 },
          false,
          ["sign", "verify"],
        ),
      ));

  async function signState(state: SignedState): Promise<string> {
    const body = base64url(
      JSON.stringify({
        v: 1,
        s: state.subject,
        i: state.intent,
        r: state.returnTo,
        o: state.origin,
        n: state.nonce,
        e: state.expiresAt,
        c: state.scopes,
        d: state.data,
      }),
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      await hmacKey(),
      utf8.encode(body),
    );
    return `${body}.${base64url(new Uint8Array(mac))}`;
  }

  /** The state, or null when it is missing, forged, malformed or expired. */
  async function verifyState(
    signed: string | null,
  ): Promise<SignedState | null> {
    if (!signed || signed.length > 4096) return null;
    const [body, mac, extra] = signed.split(".");
    if (!body || !mac || extra !== undefined) return null;
    try {
      if (
        !(await crypto.subtle.verify(
          "HMAC",
          await hmacKey(),
          fromBase64(mac),
          utf8.encode(body),
        ))
      )
        return null;
      const raw = JSON.parse(
        new TextDecoder().decode(fromBase64(body)),
      ) as Record<string, unknown>;
      const state: SignedState = {
        subject: String(raw["s"] ?? ""),
        intent: String(raw["i"] ?? ""),
        returnTo: checkPath(String(raw["r"] ?? ""), "returnTo"),
        origin: String(raw["o"] ?? ""),
        nonce: String(raw["n"] ?? ""),
        expiresAt: Number(raw["e"]),
        scopes: Array.isArray(raw["c"])
          ? raw["c"].filter((s): s is string => typeof s === "string")
          : [],
        data:
          raw["d"] && typeof raw["d"] === "object" && !Array.isArray(raw["d"])
            ? (raw["d"] as StateData)
            : {},
      };
      if (
        raw["v"] !== 1 ||
        !state.subject ||
        !state.nonce ||
        !Number.isFinite(state.expiresAt)
      )
        return null;
      if (state.expiresAt * 1000 <= now()) return null;
      return state;
    } catch {
      return null;
    }
  }

  const originOf = (request: Request) => new URL(request.url).origin;
  const redirectUri = (request: Request) =>
    `${redirectOrigin ?? originOf(request)}${callbackPath}`;

  /** The cookie's Domain: the shared domain when this request is on it, else none (this host only). */
  const cookieDomain = (request: Request) =>
    sharedDomain && onDomain(new URL(request.url).hostname, sharedDomain)
      ? sharedDomain
      : undefined;

  function cookie(request: Request, value: string, maxAge: number): string {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    const domain = cookieDomain(request);
    return `${cookieName}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}${domain ? `; Domain=${domain}` : ""}`;
  }

  /** Every value of our cookie the browser sent (a host-only and a domain one may both be there). */
  function cookieValues(request: Request): string[] {
    const values: string[] = [];
    for (const part of (request.headers.get("cookie") ?? "").split(";")) {
      const at = part.indexOf("=");
      if (at > 0 && part.slice(0, at).trim() === cookieName)
        values.push(part.slice(at + 1).trim());
    }
    return values;
  }

  /** Where to send the browser back to: where it started, when that is this origin or a safe one on the shared domain. */
  function returnOrigin(request: Request, started: string | undefined): string {
    const here = originOf(request);
    if (!started || started === here) return here;
    if (
      sharedDomain &&
      cookieDomain(request) &&
      isSafeReturnOrigin(started, sharedDomain)
    )
      return started;
    return here;
  }

  function back(
    request: Request,
    state: SignedState | null,
    result: ConnectResult,
    extra: Readonly<Record<string, string>> = {},
    detail?: string,
  ): Response {
    const url = new URL(
      state?.returnTo ?? fallbackPath,
      returnOrigin(request, state?.origin),
    );
    for (const [key, value] of Object.entries(extra)) {
      if (key !== resultParam && typeof value === "string")
        url.searchParams.set(key, value);
    }
    url.searchParams.set(resultParam, result);
    log({ step: "callback", result, ...(detail ? { detail } : {}) });
    return new Response(null, {
      status: 303,
      headers: {
        location: url.toString(),
        "set-cookie": cookie(request, "", 0),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }

  function clientAuth(
    body: URLSearchParams,
    headers: Record<string, string>,
  ): void {
    if (provider.tokenAuth === "client_secret_basic") {
      const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
      headers["authorization"] =
        `Basic ${btoa(`${encode(config.clientId)}:${encode(config.clientSecret)}`)}`;
    } else {
      body.set("client_id", config.clientId);
      body.set("client_secret", config.clientSecret);
    }
  }

  async function tokenRequest(
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const body = new URLSearchParams(params);
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    clientAuth(body, headers);
    return timedFetch(
      config,
      provider.tokenUrl,
      { method: "POST", headers, body: body.toString() },
      signal,
    );
  }

  const granted = (body: Record<string, unknown>, asked: readonly string[]) => {
    const scope =
      typeof body["scope"] === "string" ? body["scope"] : asked.join(separator);
    return { scope, scopes: scope.split(separator).filter(Boolean) };
  };

  const expiresIn = (body: Record<string, unknown>) => {
    const value = Number(body["expires_in"]);
    return Number.isFinite(value) && value > 0 ? value : 3600;
  };

  async function cacheKey(refreshToken: string) {
    return sha256Hex(`${provider.id}\n${config.clientId}\n${refreshToken}`);
  }

  async function refreshWith(
    refreshToken: string,
    aad: string,
    options: TokenCallOptions,
  ): Promise<RefreshedToken> {
    const response = await tokenRequest(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      options.signal,
    );
    if (!response.ok) {
      const body = await jsonBody(response);
      const code = errorCode(body);
      if (response.status === 400 && code === "invalid_grant") {
        log({ step: "refresh", result: "revoked" });
        throw new ConnectError(
          "revoked",
          `The ${provider.id} connection was removed. Connect it again.`,
          { status: 400 },
        );
      }
      const detail = `token endpoint answered ${response.status}${code ? ` (${code})` : ""}`;
      if (isRetryableStatus(response.status)) {
        log({ step: "refresh", result: "unavailable", detail });
        throw new ConnectError("unavailable", `The ${provider.id} ${detail}`, {
          status: response.status,
          retryAfterSeconds: retryAfter(response),
        });
      }
      log({ step: "refresh", result: "failed", detail });
      throw new ConnectError("failed", `The ${provider.id} ${detail}`, {
        status: response.status,
      });
    }
    const body = await jsonBody(response);
    const accessToken = body["access_token"];
    if (typeof accessToken !== "string" || !accessToken)
      throw new ConnectError(
        "unavailable",
        `The ${provider.id} token endpoint sent no access token`,
      );
    const rotated =
      typeof body["refresh_token"] === "string" &&
      body["refresh_token"] &&
      body["refresh_token"] !== refreshToken
        ? body["refresh_token"]
        : undefined;
    const sealedRefreshToken = rotated
      ? await config.secrets.seal(rotated, aad)
      : undefined;
    if (sealedRefreshToken) await options.onRotate?.(sealedRefreshToken);
    return {
      accessToken,
      expiresIn: expiresIn(body),
      scope: granted(body, []).scope,
      ...(sealedRefreshToken ? { sealedRefreshToken } : {}),
    };
  }

  return {
    provider,
    redirectUri,

    async start(request, options) {
      const subject =
        typeof options.subject === "string" ? options.subject.trim() : "";
      if (!subject || subject.length > 256)
        throw new ConnectError(
          "usage",
          "start needs the signed-in subject (at most 256 characters)",
        );
      const intent = options.intent ?? "";
      if (typeof intent !== "string" || intent.length > 64)
        throw new ConnectError("usage", "intent must be at most 64 characters");
      const returnTo = checkPath(options.returnTo, "returnTo");
      // The PKCE cookie must reach the pinned callback: this origin is it, or shares its domain.
      if (
        redirectOrigin &&
        originOf(request) !== redirectOrigin &&
        !cookieDomain(request)
      ) {
        throw new ConnectError(
          "config",
          "This origin can't finish on the pinned redirectOrigin: it is not on sharedDomain",
        );
      }
      const scopes = options.scopes ? scopeList(options.scopes) : defaultScopes;
      if (scopes.length === 0)
        throw new ConnectError(
          "usage",
          "No scopes to ask for: give the connector or start some",
        );
      const nonce = randomToken(16);
      const verifier = randomToken(32);
      const state = await signState({
        subject,
        intent,
        returnTo,
        origin: originOf(request),
        nonce,
        expiresAt: Math.floor(now() / 1000) + ttl,
        scopes,
        data: options.data ?? {},
      });
      if (state.length > 2048)
        throw new ConnectError(
          "usage",
          "The state is too large: keep data small",
        );
      const challenge = base64url(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", utf8.encode(verifier)),
        ),
      );
      const url = new URL(provider.authorizeUrl);
      for (const [key, value] of Object.entries(provider.authorizeParams ?? {}))
        url.searchParams.set(key, value);
      for (const [key, value] of Object.entries(options.params ?? {})) {
        if (RESERVED_PARAMS.has(key))
          throw new ConnectError(
            "usage",
            `start can't set the ${key} parameter`,
          );
        url.searchParams.set(key, value);
      }
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri(request));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes.join(separator));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      const href = url.toString();
      const setCookie = cookie(request, `${nonce}.${verifier}`, ttl);
      const headers = { "set-cookie": setCookie, "cache-control": "no-store" };
      return {
        url: href,
        setCookie,
        redirect: () =>
          new Response(null, {
            status: 303,
            headers: { ...headers, location: href },
          }),
        json: () => Response.json({ url: href }, { headers }),
      };
    },

    async callback(request) {
      const query = new URL(request.url).searchParams;
      const state = await verifyState(query.get("state"));
      if (!state) return back(request, null, "expired");
      // Another browser, or the cookie expired: never finish someone else's sign-in.
      const verifier = cookieValues(request)
        .map((value) => value.split("."))
        .find(
          ([nonce, v, extra]) =>
            nonce === state.nonce && v && extra === undefined,
        )?.[1];
      if (!verifier) return back(request, state, "browser");
      if (query.get("error"))
        return back(
          request,
          state,
          query.get("error") === "access_denied" ? "denied" : "failed",
        );
      const code = query.get("code");
      if (!code) return back(request, state, "denied");

      let body: Record<string, unknown>;
      try {
        const response = await tokenRequest({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri(request),
        });
        body = await jsonBody(response);
        if (!response.ok) {
          const code = errorCode(body);
          return back(
            request,
            state,
            "failed",
            {},
            `token endpoint answered ${response.status}${code ? ` (${code})` : ""}`,
          );
        }
      } catch (error) {
        return back(
          request,
          state,
          "failed",
          {},
          error instanceof ConnectError
            ? error.message
            : "token request failed",
        );
      }
      const accessToken = body["access_token"];
      const refreshToken = body["refresh_token"];
      if (typeof accessToken !== "string" || !accessToken) {
        return back(request, state, "failed", {}, "no access token");
      }
      const { scope, scopes } = granted(body, state.scopes);
      // The person can untick scopes on the consent screen; the app needs every one it asked for.
      if (!state.scopes.every((s) => scopes.includes(s)))
        return back(request, state, "scope");
      if (
        (config.requireRefreshToken ?? true) &&
        (typeof refreshToken !== "string" || !refreshToken)
      ) {
        return back(
          request,
          state,
          "failed",
          {},
          "no refresh token (is offline access asked for?)",
        );
      }

      let extra: StoreResult;
      try {
        const id = config.randomId?.() ?? crypto.randomUUID();
        const aad = aadFor(id);
        const sealedRefreshToken =
          typeof refreshToken === "string" && refreshToken
            ? await config.secrets.seal(refreshToken, aad)
            : "";
        extra = await config.store(
          {
            id,
            aad,
            sealedRefreshToken,
            accessToken,
            expiresIn: expiresIn(body),
            scope,
            scopes,
            ...(typeof body["id_token"] === "string"
              ? { idToken: body["id_token"] }
              : {}),
            subject: state.subject,
            intent: state.intent,
            returnTo: state.returnTo,
            data: state.data as D,
          },
          { request },
        );
      } catch {
        return back(request, state, "failed", {}, "store threw");
      }
      return back(request, state, "connected", extra ?? {});
    },

    async refresh(sealedRefreshToken, aad, options = {}) {
      const refreshToken = await config.secrets.open(sealedRefreshToken, aad);
      return refreshWith(refreshToken, aad, options);
    },

    async accessToken(sealedRefreshToken, aad, options = {}) {
      const refreshToken = await config.secrets.open(sealedRefreshToken, aad);
      const key = await cacheKey(refreshToken);
      const at = now();
      const hit = tokenCache.get(key);
      if (hit && hit.expiresAt - 60_000 > at) return hit.token;
      const fresh = await refreshWith(refreshToken, aad, options);
      if (tokenCache.size >= TOKEN_CACHE_LIMIT)
        tokenCache.delete(tokenCache.keys().next().value!);
      tokenCache.set(key, {
        token: fresh.accessToken,
        expiresAt: at + fresh.expiresIn * 1000,
      });
      return fresh.accessToken;
    },

    async revoke(sealedRefreshToken, aad, options = {}) {
      const refreshToken = await config.secrets.open(sealedRefreshToken, aad);
      tokenCache.delete(await cacheKey(refreshToken));
      if (!provider.revokeUrl) return false;
      const body = new URLSearchParams({
        token: refreshToken,
        token_type_hint: "refresh_token",
      });
      const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      };
      if (provider.revokeWithClientAuth) clientAuth(body, headers);
      try {
        const response = await timedFetch(
          config,
          provider.revokeUrl,
          { method: "POST", headers, body: body.toString() },
          options.signal,
        );
        // RFC 7009: 200 for a revoked token and for one that was already invalid; Google says invalid_token.
        const gone =
          response.ok ||
          (response.status === 400 &&
            errorCode(await jsonBody(response)) === "invalid_token");
        if (response.ok) discard(response);
        log({
          step: "revoke",
          result: gone ? "revoked" : "failed",
          ...(gone
            ? {}
            : { detail: `revoke endpoint answered ${response.status}` }),
        });
        return gone;
      } catch {
        log({ step: "revoke", result: "unavailable" });
        return false;
      }
    },
  };
}
