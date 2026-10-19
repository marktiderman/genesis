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
  /** Expected `iss`. Recommended, so a token minted for something else is refused. */
  issuer?: string;
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

/**
 * Verify a bearer JWT with a shared secret or a JWKS endpoint. Exactly one of
 * `secret` and `jwksUrl` is required.
 */
export function jwtAuth(options: JwtAuthOptions): StudioAuth {
  if (Boolean(options.secret) === Boolean(options.jwksUrl)) {
    throw new Error("jwtAuth needs exactly one of `secret` or `jwksUrl`.");
  }
  if (!options.audience || (Array.isArray(options.audience) && options.audience.length === 0)) {
    throw new Error("jwtAuth needs an `audience`.");
  }
  // jose only checks `exp` when it is present, so require it: a token
  // without one would never expire.
  const claimsCheck = {
    issuer: options.issuer,
    audience: options.audience,
    requiredClaims: ["exp", "sub"],
  };
  let verify: (token: string) => Promise<{ payload: JWTPayload }>;
  if (options.secret) {
    const secret = new TextEncoder().encode(options.secret);
    verify = (token) => jwtVerify(token, secret, { ...claimsCheck, algorithms: ["HS256", "HS384", "HS512"] });
  } else {
    const jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(options.jwksUrl!));
    verify = (token) => jwtVerify(token, jwks, claimsCheck);
  }

  return async (request) => {
    const token = bearerToken(request);
    if (!token) return null;
    try {
      const { payload } = await verify(token);
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
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
  const base = options.url.replace(/\/+$/, "");
  return jwtAuth({
    ...(options.jwtSecret ? { secret: options.jwtSecret } : { jwksUrl: `${base}/auth/v1/.well-known/jwks.json` }),
    issuer: `${base}/auth/v1`,
    audience: "authenticated",
  });
}
