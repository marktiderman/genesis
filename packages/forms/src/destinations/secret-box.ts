/**
 * Keeping a destination's secrets at rest: a webhook or Slack URL, a signing
 * secret, a Google refresh token. AES-256-GCM (WebCrypto) under a key derived
 * with HKDF-SHA-256 from one 32-byte app secret and a purpose string, so no
 * two purposes share a key; each ciphertext is bound to associated data (the
 * row it belongs to), so one moved onto another row does not decrypt.
 *
 * The sealed form is `v1.<iv>.<ciphertext and tag>`, base64url. Where it is
 * stored is the app's; the key never is.
 */
import { base64url, DeliveryError, fromBase64, type WebCryptoKey } from "./types";

const enc = new TextEncoder();

/**
 * The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32`
 * prints), or the bytes themselves. Throws a `DeliveryError` naming the
 * problem, never the key.
 */
export function secretKeyBytes(key: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof key !== "string") {
    if (key.length !== 32) throw new DeliveryError("The encryption key must be 32 bytes");
    return new Uint8Array(key);
  }
  const text = key.trim().replace(/=+$/, "");
  if (!text) throw new DeliveryError("The encryption key is not set");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(text + "=".repeat((4 - (text.length % 4)) % 4));
  } catch {
    throw new DeliveryError("The encryption key is not base64");
  }
  if (bytes.length !== 32) throw new DeliveryError("The encryption key must be 32 bytes");
  return bytes;
}

/** Options for `deriveSecretKey`. */
export interface DeriveSecretKeyOptions {
  /**
   * The HKDF salt: bytes, or text taken as its UTF-8 bytes. Default empty,
   * which is what every key derived before this option existed used, so
   * leave it out to open those. For new keys a fixed, app-wide random value
   * (say 32 bytes from `openssl rand -base64 32`, kept as config) is
   * recommended (RFC 5869). It need not be secret, but must never change
   * once anything is sealed with it.
   */
  salt?: string | Uint8Array | undefined;
}

/**
 * An AES-GCM key for one purpose, derived from the app secret with HKDF-SHA-256
 * (`info` naming the purpose; the salt empty unless `options.salt` is given).
 * Use a different `info` for each kind of secret; keep it, and the salt,
 * fixed once anything is sealed with them.
 */
export async function deriveSecretKey(
  key: string | Uint8Array,
  info: string,
  options: DeriveSecretKeyOptions = {},
): Promise<WebCryptoKey> {
  if (!info) throw new DeliveryError("A sealing key needs its purpose (info)");
  const salt = typeof options.salt === "string" ? enc.encode(options.salt) : new Uint8Array(options.salt ?? new Uint8Array(0));
  const base = await crypto.subtle.importKey("raw", secretKeyBytes(key), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts `plaintext` bound to `aad` (the row it belongs to): `v1.<iv>.<ciphertext>`. */
export async function sealSecret(key: WebCryptoKey, plaintext: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
}

/**
 * Decrypts what `sealSecret` sealed with the same key and `aad`. Throws a
 * permanent `DeliveryError` for an unknown format, a wrong key (rotated?) or
 * a ciphertext from another row; never echoes the ciphertext.
 */
export async function openSecret(key: WebCryptoKey, sealed: string, aad: string): Promise<string> {
  const [version, iv, body, extra] = sealed.split(".");
  if (version !== "v1" || !iv || !body || extra !== undefined) throw new DeliveryError("The stored secret is not in a known format");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: padded(iv), additionalData: enc.encode(aad) },
      key,
      padded(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DeliveryError("The stored secret could not be decrypted");
  }
}

function padded(text: string): Uint8Array<ArrayBuffer> {
  return fromBase64(text + "=".repeat((4 - (text.length % 4)) % 4));
}
