/**
 * An access token for a Google service account by the OAuth 2.0 JWT bearer
 * flow: sign a JWT with the account's private key (RS256, WebCrypto) and
 * trade it at Google's token endpoint. No googleapis dependency, so it runs
 * on Node 20+, edge runtimes and Workers alike.
 */
import { base64url, DeliveryError, discard, fromBase64, httpError, timedFetch, type HttpDeps, type WebCryptoKey } from "./types";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface GoogleServiceAccount {
  /** The service account's `client_email`. */
  clientEmail: string;
  /** Its `private_key`: a PKCS#8 PEM. The `\n`-escaped form env vars often hold is accepted. */
  privateKey: string;
}

/** The PKCS#8 key bytes from a PEM. */
function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const text = pem.replace(/\\n/g, "\n");
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text)) {
    throw new DeliveryError("The Google private key is PKCS#1; convert it to PKCS#8 (BEGIN PRIVATE KEY)");
  }
  const body = text.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return fromBase64(body);
}

/** A signed RS256 JWT. Throws a `DeliveryError` when the key is not a valid PKCS#8 RSA key. */
export async function signJwt(claims: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  let key: WebCryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(privateKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    // Never the key or the platform's message, which may quote it.
    throw new DeliveryError("The Google private key is not a valid PKCS#8 RSA key");
  }
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

// One per process, shared by every destination: a token is good for an hour.
const cache = new Map<string, { token: string; expiresAt: number }>();

/** Forgets cached tokens (tests, or after rotating a key). */
export function clearGoogleTokenCache(): void {
  cache.clear();
}

export interface GoogleTokenOptions extends HttpDeps {
  scope?: string | undefined;
  now?: (() => number) | undefined;
  signal?: AbortSignal | undefined;
}

/** A cached or fresh access token. Throws a `DeliveryError` with a safe message on failure. */
export async function googleAccessToken(account: GoogleServiceAccount, options: GoogleTokenOptions = {}): Promise<string> {
  const { clientEmail, privateKey } = account;
  if (!clientEmail || !privateKey) throw new DeliveryError("The Google service account email or private key is not set");
  const scope = options.scope ?? SHEETS_SCOPE;
  const now = options.now?.() ?? Date.now();
  const cacheKey = `${clientEmail} ${scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt - 60_000 > now) return hit.token;

  const iat = Math.floor(now / 1000);
  const assertion = await signJwt({ iss: clientEmail, scope, aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 }, privateKey);
  const response = await timedFetch(
    options,
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    },
    options.signal,
  );
  if (!response.ok) {
    discard(response);
    throw httpError("Google token endpoint", response);
  }
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new DeliveryError("Google token endpoint returned no access token", { retryable: true });
  const ttl = typeof body.expires_in === "number" ? body.expires_in * 1000 : 3_600_000;
  cache.set(cacheKey, { token: body.access_token, expiresAt: now + ttl });
  return body.access_token;
}
