/**
 * Secret links: a link whose query is a credential (a one-time sign-in, an
 * invite, a response's edit link). They never go in `notifications.data` or
 * a push. The domain stores a reference (`{ response_id }`) and, for a token
 * that exists only hashed, passes the plaintext as `notify({ secret })`; the
 * runner builds the link at send time, for the email only.
 */

/** What a secret link is built from. */
export interface SecretLinkRef {
  /** The notification's `data` (references, never secrets). */
  data: Record<string, unknown>;
  /** The plaintext from `notify({ secret })`, decrypted for this send only. */
  secret: string | null;
  notificationId: string;
  tenantId: string | null;
}

/** Type key → how its link is built. A builder signs the link with its own key, or puts `secret` in it. */
export type SecretLinks = Readonly<Record<string, (ref: SecretLinkRef) => string | Promise<string>>>;

/** No builder for a type whose emails need one, or a builder that gave back something that isn't an https link. */
export class SecretLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretLinkError";
  }
}

/**
 * The secret link for one notification, built server-side at send time.
 * Throws a `SecretLinkError` when there is no builder for `type` or it gives
 * something other than an `https:` URL (`http:` only for localhost).
 *
 * @stability Beta
 */
export async function resolveSecretLink(links: SecretLinks, type: string, ref: SecretLinkRef): Promise<string> {
  const build = Object.prototype.hasOwnProperty.call(links, type) ? links[type] : undefined;
  if (!build) throw new SecretLinkError(`No secret link builder for type ${type}`);
  const link = await build(ref);
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new SecretLinkError(`The secret link for type ${type} is not a URL`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new SecretLinkError(`The secret link for type ${type} is not https`);
  return url.toString();
}

/** What a template puts where the secret link goes; the runner swaps it in at send time, so the stored render never holds it. */
export const SECRET_LINK_PLACEHOLDER = "https://genesis-secret-link.invalid/";
