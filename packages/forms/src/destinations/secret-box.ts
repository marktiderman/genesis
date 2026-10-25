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

/**
 * An AES-GCM key for one purpose, derived from the app secret with HKDF-SHA-256
 * (empty salt, `info` naming the purpose). Use a different `info` for each
 * kind of secret; keep it fixed once anything is sealed with it.
 */
export async function deriveSecretKey(key: string | Uint8Array, info: string): Promise<WebCryptoKey> {
  if (!info) throw new DeliveryError("A sealing key needs its purpose (info)");
  const base = await crypto.subtle.importKey("raw", secretKeyBytes(key), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
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
