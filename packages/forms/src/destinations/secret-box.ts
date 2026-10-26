/**
 * Keeping a destination's secrets at rest: a webhook or Slack URL, a signing
 * secret, a Google refresh token. AES-256-GCM (WebCrypto) under a key derived
 * with HKDF-SHA-256 from one 32-byte app secret and a purpose string, so no
 * two purposes share a key; each ciphertext is bound to associated data (the
 * row it belongs to), so one moved onto another row does not decrypt.
 *
 * The sealed form is `v1.<iv>.<ciphertext and tag>`, base64url. Where it is
 * stored is the app's; the key never is.
 *
 * The cryptography is genesis-connect's (`@marktiderman/genesis-connect/secrets`,
 * bundled in, so forms still installs nothing). Its keyring, `createSecrets`
 * (re-exported from `@marktiderman/genesis-forms/destinations`), seals
 * `v2.<key id>.…` secrets that name their key, so the key can be rotated,
 * and still opens these `v1.` ones: give it the same purpose and salt, with
 * this key under its `legacyKeyId` (`"k1"` by default).
 */
import {
  deriveSecretKey as deriveKey,
  openWithKey,
  sealWithKey,
  SecretError,
  secretKeyBytes as keyBytes,
  type DeriveSecretKeyOptions,
} from "@marktiderman/genesis-connect/secrets";
import { DeliveryError, type WebCryptoKey } from "./types";

export type { DeriveSecretKeyOptions } from "@marktiderman/genesis-connect/secrets";

/** A secret-box failure as a permanent `DeliveryError`, with the same safe message. */
function asDeliveryError(error: unknown): unknown {
  return error instanceof SecretError
    ? new DeliveryError(error.message)
    : error;
}

/**
 * The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32`
 * prints), or the bytes themselves. Throws a `DeliveryError` naming the
 * problem, never the key.
 */
export function secretKeyBytes(
  key: string | Uint8Array,
): Uint8Array<ArrayBuffer> {
  try {
    return keyBytes(key);
  } catch (error) {
    throw asDeliveryError(error);
  }
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
  try {
    return await deriveKey(key, info, options);
  } catch (error) {
    throw asDeliveryError(error);
  }
}

/** Encrypts `plaintext` bound to `aad` (the row it belongs to): `v1.<iv>.<ciphertext>`. */
export async function sealSecret(
  key: WebCryptoKey,
  plaintext: string,
  aad: string,
): Promise<string> {
  return sealWithKey(key, plaintext, aad);
}

/**
 * Decrypts what `sealSecret` sealed with the same key and `aad`. Throws a
 * permanent `DeliveryError` for an unknown format, a wrong key (rotated?) or
 * a ciphertext from another row; never echoes the ciphertext.
 */
export async function openSecret(
  key: WebCryptoKey,
  sealed: string,
  aad: string,
): Promise<string> {
  try {
    return await openWithKey(key, sealed, aad);
  } catch (error) {
    throw asDeliveryError(error);
  }
}
