/**
 * One-click unsubscribe (RFC 8058) for mail that isn't transactional: the
 * `List-Unsubscribe` and `List-Unsubscribe-Post` headers, and a signed token
 * that names who, which category and which tenant, so the endpoint needs no
 * sign-in. The token never carries an address: someone with no login is named
 * by the SHA-256 of their lower-cased address (what the suppression list keeps).
 * The unsubscribe is for the tenant the email came from, not every tenant.
 */
import { base64url, fromBase64url, hmacSha256, sha256Hex, timingSafeEqual } from "./crypto";

export interface UnsubscribeClaims {
  /** The login, when the recipient has one. */
  userId?: string;
  /** SHA-256 (hex) of the lower-cased, trimmed address, when they have none (`emailHash`). */
  emailHash?: string;
  category: string;
  /** The tenant the email came from; the unsubscribe holds for it only. */
  tenantId?: string;
}

/** What the suppression list keys an address by: SHA-256 of it lower-cased and trimmed (as `genesis_notifications_email_hash`). */
export function emailHash(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

/** The secret must be at least 32 characters. */
function checkSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("The unsubscribe secret must be at least 32 characters");
}

/** A signed, URL-safe token for `claims`. */
export async function createUnsubscribeToken(secret: string, claims: UnsubscribeClaims): Promise<string> {
  checkSecret(secret);
  if (claims.emailHash !== undefined && !/^[0-9a-f]{64}$/.test(claims.emailHash)) throw new Error("createUnsubscribeToken: emailHash is a SHA-256 hex digest (emailHash(address))");
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ u: claims.userId, h: claims.emailHash, c: claims.category, t: claims.tenantId, v: 2 })));
  const sig = base64url(await hmacSha256(secret, `unsubscribe.${payload}`));
  return `${payload}.${sig}`;
}

/** The claims of a token this secret signed, or null for anything else. */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<UnsubscribeClaims | null> {
  checkSecret(secret);
  if (typeof token !== "string" || token.length > 2000) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  let given: Uint8Array;
  try {
    given = fromBase64url(sig);
  } catch {
    return null;
  }
  const expected = await hmacSha256(secret, `unsubscribe.${payload}`);
  if (!timingSafeEqual(given, expected)) return null;
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { u?: unknown; h?: unknown; c?: unknown; t?: unknown; v?: unknown };
    if (raw.v !== 2 || typeof raw.c !== "string") return null;
    const hash = typeof raw.h === "string" && /^[0-9a-f]{64}$/.test(raw.h) ? raw.h : undefined;
    if (typeof raw.u !== "string" && !hash) return null;
    return {
      category: raw.c,
      ...(typeof raw.u === "string" ? { userId: raw.u } : {}),
      ...(hash ? { emailHash: hash } : {}),
      ...(typeof raw.t === "string" ? { tenantId: raw.t } : {}),
    };
  } catch {
    return null;
  }
}

/** The RFC 8058 headers for one email. `url` is your unsubscribe endpoint; the token goes in its query. */
export function unsubscribeHeaders(url: string, token: string): Record<string, string> {
  const link = new URL(url);
  link.searchParams.set("t", token);
  return {
    "List-Unsubscribe": `<${link.toString()}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
