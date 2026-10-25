/**
 * Google sign-in for a Sheet: a person's refresh token (from the app's own
 * OAuth consent flow, usually with the `drive.file` scope, which reaches only
 * the files they picked or created through the app) traded for a short-lived
 * access token at Google's token endpoint. Where the refresh token is kept,
 * and how it is encrypted, is the app's (see `sealSecret`); this module only
 * trades it. fetch only, no dependency.
 *
 * Use it with the sheet destination's `accessToken` option:
 *
 *   sheetsDestination({
 *     accessToken: async (config, { destinationId }) =>
 *       googleOAuthAccessToken(client, await refreshTokenFor(destinationId)),
 *   })
 */
import { GOOGLE_TOKEN_URL } from "./google-auth";
import { DeliveryError, discard, httpError, sha256Hex, timedFetch, type HttpDeps } from "./types";

/** Google's scope for files the person picked or created through the app. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The app's OAuth client, from the Google Cloud console. Server-side only. */
export interface GoogleOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleOAuthTokenOptions extends HttpDeps {
  now?: (() => number) | undefined;
  signal?: AbortSignal | undefined;
}

export interface RefreshedGoogleToken {
  accessToken: string;
  /** Seconds the access token is good for. */
  expiresIn: number;
  /** The scopes granted, space-separated. */
  scope: string;
}

/**
 * Trades a refresh token for an access token, uncached. `invalid_grant`
 * (access revoked, or the account gone) is a permanent failure saying to
 * connect the sheet again; 429 and 5xx are retryable. Never puts a token in
 * an error message.
 */
export async function refreshGoogleAccessToken(
  client: GoogleOAuthClient,
  refreshToken: string,
  options: GoogleOAuthTokenOptions = {},
): Promise<RefreshedGoogleToken> {
  if (!client.clientId || !client.clientSecret) throw new DeliveryError("The Google OAuth client id or secret is not set");
  if (!refreshToken) throw new DeliveryError("This sheet's Google connection is gone. Connect the sheet again.");
  const response = await timedFetch(
    options,
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      }).toString(),
    },
    options.signal,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (response.status === 400 && body.error === "invalid_grant") {
      throw new DeliveryError("Google access to this sheet was removed. Connect the sheet again.", { status: 400 });
    }
    discard(response);
    throw httpError("Google token endpoint", response);
  }
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new DeliveryError("Google token endpoint returned no access token", { retryable: true });
  }
  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600,
    scope: typeof body.scope === "string" ? body.scope : DRIVE_FILE_SCOPE,
  };
}

// One per process. Keyed by a digest of the client and the refresh token, so
// a hit is only ever for the same grant.
const cache = new Map<string, { token: string; expiresAt: number }>();

/** Forgets cached OAuth access tokens (tests, or after a sheet is disconnected). */
export function clearGoogleOAuthTokenCache(): void {
  cache.clear();
}

/** A cached or fresh access token for a refresh token, cached until a minute before it expires. */
export async function googleOAuthAccessToken(
  client: GoogleOAuthClient,
  refreshToken: string | null | undefined,
  options: GoogleOAuthTokenOptions = {},
): Promise<string> {
  if (!refreshToken) throw new DeliveryError("This sheet's Google connection is gone. Connect the sheet again.");
  const now = options.now?.() ?? Date.now();
  const key = await sha256Hex(`${client.clientId}\n${refreshToken}`);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - 60_000 > now) return hit.token;
  const fresh = await refreshGoogleAccessToken(client, refreshToken, options);
  cache.set(key, { token: fresh.accessToken, expiresAt: now + fresh.expiresIn * 1000 });
  return fresh.accessToken;
}
