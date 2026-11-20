// ---------------------------------------------------------------------------
// Who is asking. The handler never trusts a claim it did not verify.
// ---------------------------------------------------------------------------

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/** Verified token claims. `sub` is the user; the rest is passed to Postgres. */
export interface StudioClaims extends JWTPayload {
  sub: string;
  role?: string;
  [claim: string]: unknown;
}

/**
 * Turns a request into verified claims, or `null` when nobody is signed in or
 * the token does not verify. Supply your own to read a session cookie.
 */
export type StudioAuth = (request: Request) => Promise<StudioClaims | null>;

export interface JwtAuthOptions {
  /** HS256 shared secret (Supabase's legacy JWT secret, or your own). */
  secret?: string;
  /** JWKS endpoint for asymmetric keys, e.g. `<supabase-url>/auth/v1/.well-known/jwks.json`. */
  jwksUrl?: string;
  /**
   * Expected `iss`: one value, several, or a test. Recommended, so a token
   * minted for something else is refused.
   */
  issuer?: string | string[] | ((issuer: string) => boolean);
  /**
   * Expected `aud`. Required: without it, any token signed with the same key
   * that names a subject would be accepted, including ones the app minted
   * for another purpose. Supabase uses `authenticated`.
   */
  audience: string | string[];
}

/** Read a bearer token from the `Authorization` header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** Turns a raw token into verified claims, or `null` when it doesn't verify. */
export type StudioTokenVerifier = (token: string) => Promise<StudioClaims | null>;

/**
 * Verify a bearer JWT with a shared secret or a JWKS endpoint. Exactly one of
 * `secret` and `jwksUrl` is required.
 */
export function jwtAuth(options: JwtAuthOptions): StudioAuth {
  const verify = jwtVerifier(options);
  return async (request) => {
    const token = bearerToken(request);
    return token ? verify(token) : null;
  };
}

/**
 * `jwtAuth`'s check on a raw token, for a token that doesn't arrive as a
 * bearer header, e.g. a socket handshake's `auth.token`. Same rules: the
 * signature, `exp`, `sub`, the audience and the issuer.
 */
export function jwtVerifier(options: JwtAuthOptions): StudioTokenVerifier {
  if (Boolean(options.secret) === Boolean(options.jwksUrl)) {
    throw new Error("jwtAuth needs exactly one of `secret` or `jwksUrl`.");
  }
  if (!options.audience || (Array.isArray(options.audience) && options.audience.length === 0)) {
    throw new Error("jwtAuth needs an `audience`.");
  }
  // jose only checks `exp` when it is present, so require it: a token
  // without one would never expire.
  const issuerTest = typeof options.issuer === "function" ? options.issuer : null;
  const claimsCheck = {
    ...(issuerTest ? {} : { issuer: options.issuer as string | string[] | undefined }),
    audience: options.audience,
    requiredClaims: issuerTest ? ["exp", "sub", "iss"] : ["exp", "sub"],
  };
  let verify: (token: string) => Promise<{ payload: JWTPayload }>;
  if (options.secret) {
    const secret = new TextEncoder().encode(options.secret);
    verify = (token) => jwtVerify(token, secret, { ...claimsCheck, algorithms: ["HS256", "HS384", "HS512"] });
  } else {
    const jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(options.jwksUrl!));
    verify = (token) => jwtVerify(token, jwks, claimsCheck);
  }

  return async (token) => {
    if (!token) return null;
    try {
      const { payload } = await verify(token);
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
      if (issuerTest && (typeof payload.iss !== "string" || !issuerTest(payload.iss))) return null;
      return payload as StudioClaims;
    } catch {
      return null;
    }
  };
}

export interface SupabaseAuthOptions {
  /** Project URL, e.g. `https://abc.supabase.co`. Used for the JWKS endpoint and issuer. */
  url: string;
  /**
   * The project's legacy JWT secret. Only for projects still signing with
   * HS256; projects on asymmetric signing keys need only `url`.
   */
  jwtSecret?: string;
}

/**
 * Verify Supabase Auth access tokens: JWKS from the project, issuer
 * `<url>/auth/v1`, audience `authenticated`.
 */
export function supabaseAuth(options: SupabaseAuthOptions): StudioAuth {
  return jwtAuth(supabaseJwtOptions(options));
}

/** `supabaseAuth`'s check on a raw token, e.g. a socket handshake's. */
export function supabaseVerifier(options: SupabaseAuthOptions): StudioTokenVerifier {
  return jwtVerifier(supabaseJwtOptions(options));
}

function supabaseJwtOptions(options: SupabaseAuthOptions): JwtAuthOptions {
  const base = options.url.replace(/\/+$/, "");
  const expected = `${base}/auth/v1`;
  // Inside the local Supabase stack, an Edge Function reaches the project as
  // http://kong:8000 while tokens name the address the browser used
  // (http://127.0.0.1:54321). That host name exists only in the local
  // stack, so there, a localhost issuer is accepted too. The signature is
  // still checked against this project's own keys, either way.
  const localStack = /^https?:\/\/kong(:\d+)?$/.test(base);
  return {
    ...(options.jwtSecret ? { secret: options.jwtSecret } : { jwksUrl: `${base}/auth/v1/.well-known/jwks.json` }),
    issuer: localStack
      ? (iss) => iss === expected || /^http:\/\/(127\.0\.0\.1|localhost):\d+\/auth\/v1$/.test(iss)
      : expected,
    audience: "authenticated",
  };
}
