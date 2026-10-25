/**
 * Checks `notify()` runs before anything reaches the database (which checks
 * the same again): recipients are well formed, and `data` holds no secret.
 */
import type { NotificationData } from "./registry";
import type { Recipient } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/**
 * Keys that hold a secret by their name, matched on the key split into words
 * (`inviteToken` is `invite_token`), at its end. The database refuses the
 * same list.
 */
export const SECRET_KEY = /(^|[._-])(token|secret|password|passcode|otp|api_?key|signature|sig|magic_?link|invite_?link|reset_?link|access_?key|client_?secret|auth_?token|access_?token|refresh_?token)$/;

/** A key as words, lower case: `inviteToken` → `invite_token`. */
export function keyWords(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
/** A link that carries a credential in its query (`?token=`, `&sig=`, `code=`). */
export const SECRET_URL = /^[a-z][a-z0-9+.-]*:\/\/[^\s]*[?&#](token|access_token|signature|sig|code|key|secret|otp)=/i;

/** `data` held something that looks like a secret: build such links at send time instead. */
export class SecretInDataError extends Error {
  constructor(readonly path: string) {
    super(`notify: data.${path} looks like a secret. Store a reference and build the link at send time with resolveSecretLink.`);
    this.name = "SecretInDataError";
  }
}

/** Throws a `SecretInDataError` naming the first key (or link) that looks like a secret. */
export function assertNoSecrets(data: NotificationData | undefined, path = ""): void {
  if (!data || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data)) {
    const here = path ? `${path}.${key}` : key;
    if (SECRET_KEY.test(keyWords(key))) throw new SecretInDataError(here);
    if (typeof value === "string" && SECRET_URL.test(value)) throw new SecretInDataError(here);
    if (value && typeof value === "object") assertNoSecrets(value as NotificationData, here);
  }
}

/** The recipients as `genesis_notify` takes them; throws on a malformed one. */
export function recipientsToJson(recipients: readonly Recipient[]): ({ user_id: string; badge?: number } | { email: string; name?: string; ref?: string })[] {
  if (!Array.isArray(recipients) || recipients.length === 0) throw new Error("notify: no recipients");
  if (recipients.length > 1000) throw new Error("notify: at most 1000 recipients a call");
  return recipients.map((r, i) => {
    if (typeof r === "string") {
      if (!UUID.test(r)) throw new Error(`notify: recipient ${i} is not a user id`);
      return { user_id: r };
    }
    if ("userId" in r) {
      if (!UUID.test(r.userId)) throw new Error(`notify: recipient ${i} is not a user id`);
      if (r.badge === undefined) return { user_id: r.userId };
      if (!Number.isInteger(r.badge) || r.badge < 0 || r.badge > 99999) throw new Error(`notify: recipient ${i}'s badge is a whole number from 0`);
      return { user_id: r.userId, badge: r.badge };
    }
    if ("email" in r) {
      const email = r.email.trim();
      if (!EMAIL.test(email) || email.length > 254) throw new Error(`notify: recipient ${i} has no valid email address`);
      return { email, ...(r.name ? { name: r.name.slice(0, 200) } : {}), ...(r.ref ? { ref: r.ref.slice(0, 200) } : {}) };
    }
    throw new Error(`notify: recipient ${i} is neither a user id nor an email`);
  });
}
