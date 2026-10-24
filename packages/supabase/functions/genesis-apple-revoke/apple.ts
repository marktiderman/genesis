/**
 * Sign in with Apple's REST API, for the genesis-apple-revoke Edge Function:
 * the client secret (an ES256 JWT signed with your .p8 key), the
 * authorization-code exchange (/auth/token) and revocation (/auth/revoke).
 *
 * Plain TypeScript over WebCrypto and fetch, with no Deno or Node APIs, so the
 * same file runs in the Edge Function and in the package's unit tests.
 * Nothing here logs or returns a token, a key or a client secret.
 *
 * Apple's docs: developer.apple.com/documentation/signinwithapplerestapi
 * (generate-and-validate-tokens, revoke-tokens) and
 * developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret.
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

/** Apple caps a client secret's lifetime at 15777000 seconds (six months). Each call signs a fresh one, so five minutes is plenty. */
export const CLIENT_SECRET_TTL_SECONDS = 300;
const CLIENT_SECRET_MAX_TTL_SECONDS = 15_777_000;
const REQUEST_TIMEOUT_MS = 10_000;
const CLOCK_SKEW_SECONDS = 30;

/** Apple's error codes (ErrorResponse.error). Anything else reads as "unknown". */
const APPLE_ERRORS = ["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope"] as const;
export type AppleErrorCode = (typeof APPLE_ERRORS)[number] | "unknown" | "network" | "bad_response";

export interface AppleConfig {
  /** APPLE_TEAM_ID: your 10-character Team ID (the secret's `iss`). */
  teamId: string;
  /** APPLE_KEY_ID: the 10-character id of your Sign in with Apple key (the secret's `kid`). */
  keyId: string;
  /** APPLE_PRIVATE_KEY: the .p8 file's contents (PKCS#8 PEM). Escaped `\n` are accepted. */
  privateKey: string;
  /** APPLE_CLIENT_IDS: the bundle ids (App IDs) or Services IDs a code may be exchanged for, comma-separated. The first is the default. */
  clientIds: string[];
}

const TEN_CHARS = /^[A-Z0-9]{10}$/;
const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/;

/**
 * Reads the Apple settings from the environment. Returns the names that are
 * missing or malformed (never their values), so the function can fail loud.
 */
export function readAppleConfig(env: (name: string) => string | undefined): { config: AppleConfig; problems?: undefined } | { config?: undefined; problems: string[] } {
  const problems: string[] = [];
  const teamId = (env("APPLE_TEAM_ID") ?? "").trim();
  const keyId = (env("APPLE_KEY_ID") ?? "").trim();
  const privateKey = normalizePem(env("APPLE_PRIVATE_KEY") ?? "");
  const clientIds = (env("APPLE_CLIENT_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!TEN_CHARS.test(teamId)) problems.push("APPLE_TEAM_ID (10 capital letters or digits)");
  if (!TEN_CHARS.test(keyId)) problems.push("APPLE_KEY_ID (10 capital letters or digits)");
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(privateKey)) problems.push("APPLE_PRIVATE_KEY (the .p8 file's PEM text)");
  if (clientIds.length === 0 || !clientIds.every((id) => CLIENT_ID.test(id))) problems.push("APPLE_CLIENT_IDS (comma-separated bundle ids or Services IDs)");
  return problems.length ? { problems } : { config: { teamId, keyId, privateKey, clientIds } };
}

/** Accepts a PEM pasted with real newlines, escaped `\n`, or surrounding quotes. */
function normalizePem(raw: string): string {
  return raw.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function signingKey(pem: string): Promise<CryptoKey> {
  let key = keyCache.get(pem);
  if (!key) {
    const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    key = crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    // A bad key must not stay cached as a rejected promise.
    key.catch(() => keyCache.delete(pem));
    keyCache.set(pem, key);
  }
  return key;
}

/**
 * The `client_secret` for one client id: a JWT with header `{ alg: "ES256", kid }`
 * and claims `{ iss: teamId, iat, exp, aud: "https://appleid.apple.com", sub: clientId }`,
 * signed with ECDSA P-256 / SHA-256. WebCrypto returns the signature as r‖s
 * (64 bytes), which is the JWS encoding ES256 needs.
 */
export async function appleClientSecret(config: AppleConfig, clientId: string, options: { now?: number; ttlSeconds?: number } = {}): Promise<string> {
  // Backdated a little, so a clock slightly ahead of Apple's doesn't issue a secret "from the future".
  const iat = Math.floor((options.now ?? Date.now()) / 1000) - CLOCK_SKEW_SECONDS;
  const ttl = Math.min(Math.max(1, options.ttlSeconds ?? CLIENT_SECRET_TTL_SECONDS), CLIENT_SECRET_MAX_TTL_SECONDS);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = base64url(JSON.stringify({ iss: config.teamId, iat, exp: iat + ttl, aud: APPLE_ISSUER, sub: clientId }));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(config.privateKey), encoder.encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** The payload of a JWT, unverified, or null if it isn't one. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(base64urlDecode(parts[1]));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function appleError(res: Response): Promise<AppleErrorCode> {
  try {
    const body: unknown = await res.json();
    const code = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    return (APPLE_ERRORS as readonly unknown[]).includes(code) ? (code as AppleErrorCode) : "unknown";
  } catch {
    return "unknown";
  }
}

async function postForm(fetchImpl: typeof fetch, url: string, form: Record<string, string>): Promise<Response | null> {
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

export type ExchangeResult =
  | { ok: true; refreshToken: string; appleUserId: string }
  /** `mintedRefreshToken`: Apple issued a token the checks then refused; revoke it rather than drop it. */
  | { ok: false; error: AppleErrorCode; status?: number; mintedRefreshToken?: string };

/**
 * Exchanges a sign-in's single-use authorization code (valid for five
 * minutes) for Apple's refresh token: `grant_type=authorization_code` with
 * `client_id`, `client_secret` and `code`. A native sign-in sends no
 * `redirect_uri` (Apple wants one only if the authorization request had one).
 *
 * Also checks the returned id token names Apple as `iss` and this client as
 * `aud`, and returns its `sub` (the person's Apple user id) so the caller can
 * tie the token to the right login. The id token comes straight from Apple
 * over TLS in this response, so its claims are read without checking its
 * signature (OpenID Connect Core 3.1.3.7).
 */
export async function exchangeAuthorizationCode(config: AppleConfig, clientId: string, code: string, fetchImpl: typeof fetch = fetch): Promise<ExchangeResult> {
  const res = await postForm(fetchImpl, APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: await appleClientSecret(config, clientId),
    code,
    grant_type: "authorization_code",
  });
  if (!res) return { ok: false, error: "network" };
  if (!res.ok) return { ok: false, error: await appleError(res), status: res.status };
  let body: { refresh_token?: unknown; id_token?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, error: "bad_response", status: res.status };
  }
  const claims = typeof body.id_token === "string" ? decodeJwtPayload(body.id_token) : null;
  const aud = claims?.aud;
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  const minted = typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : undefined;
  if (!minted) return { ok: false, error: "bad_response", status: res.status };
  if (!claims || claims.iss !== APPLE_ISSUER || !audOk || typeof claims.sub !== "string" || !claims.sub) {
    return { ok: false, error: "bad_response", status: res.status, mintedRefreshToken: minted };
  }
  return { ok: true, refreshToken: minted, appleUserId: claims.sub };
}

/**
 * Checks a refresh token is still live with this client's secret:
 * `grant_type=refresh_token` at /auth/token (Apple returns new access and id
 * tokens, which are dropped). This is the proof a revocation needs, because
 * /auth/revoke answers 200 to a token it doesn't know even when the client
 * secret is garbage: a 200 here means the secret is right and the token is
 * live; `invalid_grant` means the token is already dead (nothing left to
 * revoke); `invalid_client` means the secrets are wrong.
 */
export async function checkRefreshToken(config: AppleConfig, clientId: string, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<RevokeResult> {
  const res = await postForm(fetchImpl, APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: await appleClientSecret(config, clientId),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!res) return { ok: false, error: "network" };
  if (res.status === 200) {
    await res.body?.cancel().catch(() => {});
    return { ok: true };
  }
  return { ok: false, error: await appleError(res), status: res.status };
}

export type RevokeResult = { ok: true } | { ok: false; error: AppleErrorCode; status?: number };

/**
 * Revokes a refresh token: `client_id`, `client_secret`, `token` and
 * `token_type_hint=refresh_token`. Apple answers 200 with no body when it
 * revoked the token, and also when the token was already invalid. It also
 * answered 200 to an unknown token with a garbage client secret (seen
 * 2026-10-24), so a 200 alone proves nothing: check the token with
 * {@link checkRefreshToken} first.
 */
export async function revokeRefreshToken(config: AppleConfig, clientId: string, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<RevokeResult> {
  const res = await postForm(fetchImpl, APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: await appleClientSecret(config, clientId),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  if (!res) return { ok: false, error: "network" };
  if (res.status === 200) return { ok: true };
  return { ok: false, error: await appleError(res), status: res.status };
}
