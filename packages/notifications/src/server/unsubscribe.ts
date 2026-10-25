/**
 * One-click unsubscribe (RFC 8058) for mail that isn't transactional: the
 * `List-Unsubscribe` and `List-Unsubscribe-Post` headers, and a signed token
 * that names who and which category, so the endpoint needs no sign-in.
 */
import { base64url, fromBase64url, hmacSha256, timingSafeEqual } from "./crypto";

export interface UnsubscribeClaims {
  /** The login, when the recipient has one. */
  userId?: string;
  /** The address, when they have none. */
  email?: string;
  category: string;
  tenantId?: string;
}

/** The secret must be at least 32 characters. */
function checkSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("The unsubscribe secret must be at least 32 characters");
}

/** A signed, URL-safe token for `claims`. */
export async function createUnsubscribeToken(secret: string, claims: UnsubscribeClaims): Promise<string> {
  checkSecret(secret);
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ u: claims.userId, e: claims.email, c: claims.category, t: claims.tenantId, v: 1 })));
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
    const raw = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { u?: unknown; e?: unknown; c?: unknown; t?: unknown; v?: unknown };
    if (raw.v !== 1 || typeof raw.c !== "string") return null;
    if (typeof raw.u !== "string" && typeof raw.e !== "string") return null;
    return {
      category: raw.c,
      ...(typeof raw.u === "string" ? { userId: raw.u } : {}),
      ...(typeof raw.e === "string" ? { email: raw.e } : {}),
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
