/**
 * Secrets at rest, with key versioning: a refresh token, a webhook URL, a
 * signing secret. AES-256-GCM (WebCrypto) under a key derived with
 * HKDF-SHA-256 from a 32-byte key and a purpose string, so no two purposes
 * share a key. Every ciphertext is bound to associated data (the row it
 * belongs to), so one copied onto another row does not decrypt.
 *
 * Keys live in a keyring, `{ active: "k2", keys: { k1: "<32 bytes, base64>", k2: "…" } }`,
 * usually one environment variable. New secrets are sealed with the active
 * key and name it: `v2.<key id>.<iv>.<ciphertext and tag>`, base64url. Any
 * key still listed opens what it sealed, so rotation is: add a key, make it
 * active, re-seal rows lazily (`needsRotation`, `reseal`) or in a job, then
 * drop the old key.
 *
 * The older single-key form, `v1.<iv>.<ciphertext>` (genesis-forms'
 * `sealSecret`), still opens, with the keyring key named by `legacyKeyId`.
 *
 * Errors are `SecretError`s whose messages never hold a key, a plaintext or
 * a ciphertext.
 */
import { base64url, fromBase64, utf8, type WebCryptoKey } from "./encoding";

export type { WebCryptoKey } from "./encoding";

/** What went wrong, for code to branch on. */
export type SecretErrorCode =
  /** A key is missing, not base64 or not 32 bytes, or the keyring is malformed. */
  | "key"
  /** The sealed text is not `v1.` or `v2.` in shape. */
  | "format"
  /** The sealed text names a key the keyring no longer has. */
  | "unknown-key"
  /** Wrong key, wrong associated data (another row's secret) or a tampered ciphertext. */
  | "decrypt"
  /** A required argument (purpose, associated data) is missing. */
  | "usage";

/** A failure whose message is safe to log: never a key, a plaintext or a ciphertext. */
export class SecretError extends Error {
  override name = "SecretError";
  readonly code: SecretErrorCode;
  constructor(code: SecretErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Keys ---------------------------------------------------------------------------------------------

/**
 * The 32 key bytes from base64 or base64url text (as `openssl rand -base64 32`
 * prints), or the bytes themselves.
 */
export function secretKeyBytes(
  key: string | Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (typeof key !== "string") {
    if (key.length !== 32)
      throw new SecretError("key", "The encryption key must be 32 bytes");
    return new Uint8Array(key);
  }
  const text = key.trim();
  if (!text) throw new SecretError("key", "The encryption key is not set");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(text);
  } catch {
    throw new SecretError("key", "The encryption key is not base64");
  }
  if (bytes.length !== 32)
    throw new SecretError("key", "The encryption key must be 32 bytes");
  return bytes;
}

/** The HKDF salt: bytes, or text taken as its UTF-8 bytes. */
export type Salt = string | Uint8Array;

/** Options for `deriveSecretKey`. */
export interface DeriveSecretKeyOptions {
  /**
   * The HKDF salt. Default empty. A fixed, app-wide random value is
   * recommended for new keys (RFC 5869); it need not be secret, but must
   * never change once anything is sealed with it.
   */
  salt?: Salt | undefined;
}

/**
 * An AES-GCM key for one purpose, derived from a 32-byte key with
 * HKDF-SHA-256 (`info` naming the purpose; the salt empty unless given).
 * Keep `info` and the salt fixed once anything is sealed with them.
 */
export async function deriveSecretKey(
  key: string | Uint8Array,
  info: string,
  options: DeriveSecretKeyOptions = {},
): Promise<WebCryptoKey> {
  if (!info)
    throw new SecretError("usage", "A sealing key needs its purpose (info)");
  const salt =
    typeof options.salt === "string"
      ? utf8.encode(options.salt)
      : new Uint8Array(options.salt ?? new Uint8Array(0));
  const base = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes(key),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8.encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// The single-key v1 format -------------------------------------------------------------------------

function requireAad(aad: string): void {
  if (typeof aad !== "string" || !aad) {
    throw new SecretError(
      "usage",
      "Associated data (the row the secret belongs to) is required",
    );
  }
}

async function encrypt(
  key: WebCryptoKey,
  plaintext: string,
  additionalData: string,
): Promise<{ iv: string; body: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8.encode(additionalData) },
    key,
    utf8.encode(plaintext),
  );
  return { iv: base64url(iv), body: base64url(new Uint8Array(sealed)) };
}

async function decrypt(
  key: WebCryptoKey,
  iv: string,
  body: string,
  additionalData: string,
): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(iv),
        additionalData: utf8.encode(additionalData),
      },
      key,
      fromBase64(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new SecretError(
      "decrypt",
      "The stored secret could not be decrypted",
    );
  }
}

/**
 * Seals with one derived key in the single-key format, `v1.<iv>.<ciphertext>`.
 * Kept for genesis-forms' `sealSecret`; new code uses `createSecrets`, whose
 * `v2.` form names its key so the key can be rotated.
 */
export async function sealWithKey(
  key: WebCryptoKey,
  plaintext: string,
  aad: string,
): Promise<string> {
  const { iv, body } = await encrypt(key, plaintext, aad);
  return `v1.${iv}.${body}`;
}

/** Opens what `sealWithKey` sealed with the same key and `aad`. */
export async function openWithKey(
  key: WebCryptoKey,
  sealed: string,
  aad: string,
): Promise<string> {
  const parsed = parseSealed(sealed);
  if (!parsed || parsed.version !== "v1")
    throw new SecretError(
      "format",
      "The stored secret is not in a known format",
    );
  return decrypt(key, parsed.iv, parsed.body, aad);
}

// The keyring --------------------------------------------------------------------------------------

/** A key id: letters, digits, `_` and `-`, at most 32 (it is written into every sealed secret). */
export const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

/** A keyring as config: the active key's id and every key that may still be needed to open. */
export interface KeyringInput {
  active: string;
  keys: Readonly<Record<string, string | Uint8Array>>;
}

/** A checked keyring: every key 32 bytes, the active one listed. */
export interface Keyring {
  readonly active: string;
  readonly keys: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}

/**
 * A keyring from config: an object, its JSON text (one environment
 * variable: `{"active":"k2","keys":{"k1":"…","k2":"…"}}`), or a single bare
 * key, which becomes `{ active: "k1", keys: { k1 } }` (how a single-key
 * secret moves onto a keyring). Errors never quote the text.
 */
export function parseKeyring(value: string | KeyringInput | Keyring): Keyring {
  let input: unknown = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) throw new SecretError("key", "The keyring is not set");
    if (text.startsWith("{")) {
      try {
        input = JSON.parse(text) as unknown;
      } catch {
        // JSON.parse's own message quotes the text, which holds keys.
        throw new SecretError("key", "The keyring is not valid JSON");
      }
    } else {
      return { active: "k1", keys: new Map([["k1", secretKeyBytes(text)]]) };
    }
  }
  if (!input || typeof input !== "object")
    throw new SecretError(
      "key",
      "The keyring must be an object with active and keys",
    );
  const { active, keys } = input as { active?: unknown; keys?: unknown };
  if (typeof active !== "string" || !KEY_ID.test(active))
    throw new SecretError(
      "key",
      "The keyring's active key id is missing or malformed",
    );
  const entries: [string, unknown][] =
    keys instanceof Map
      ? [...(keys as Map<string, unknown>).entries()]
      : keys && typeof keys === "object"
        ? Object.entries(keys)
        : [];
  if (entries.length === 0)
    throw new SecretError("key", "The keyring has no keys");
  const out = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [id, key] of entries) {
    if (!KEY_ID.test(id))
      throw new SecretError(
        "key",
        "A keyring key id is malformed (letters, digits, _ and -, at most 32)",
      );
    if (typeof key !== "string" && !(key instanceof Uint8Array))
      throw new SecretError("key", `Keyring key ${id} is not a base64 string`);
    try {
      out.set(id, secretKeyBytes(key));
    } catch (error) {
      throw new SecretError(
        "key",
        `Keyring key ${id}: ${(error as Error).message}`,
      );
    }
  }
  if (!out.has(active))
    throw new SecretError(
      "key",
      `The keyring's active key ${active} is not among its keys`,
    );
  return { active, keys: out };
}

/** Options for `createSecrets`. */
export interface SecretsOptions {
  /**
   * What these secrets are, as the HKDF `info`: `"google-refresh-token"`,
   * `"webhook-url"`. One per kind of secret; fixed once anything is sealed.
   */
  purpose: string;
  /** The HKDF salt (see `DeriveSecretKeyOptions.salt`). Fixed once anything is sealed. */
  salt?: Salt | undefined;
  /**
   * The keyring key that sealed single-key `v1.` secrets (genesis-forms'
   * `sealSecret`, with the same purpose and salt). Default `"k1"`, the id a
   * bare key gets from `parseKeyring`.
   */
  legacyKeyId?: string | undefined;
}

/** Seals and opens one purpose's secrets with a keyring. */
export interface Secrets {
  readonly purpose: string;
  /** The key new secrets are sealed with. */
  readonly activeKeyId: string;
  /** `plaintext` sealed with the active key and bound to `aad`: `v2.<key id>.<iv>.<ciphertext>`. */
  seal(plaintext: string, aad: string): Promise<string>;
  /** Opens a `v2.` secret with the key it names, or a `v1.` one with `legacyKeyId`'s. Needs the same `aad`. */
  open(sealed: string, aad: string): Promise<string>;
  /** The key id a sealed secret names (`legacyKeyId` for `v1.`), or null when it is not one. */
  keyIdOf(sealed: string): string | null;
  /**
   * Whether a sealed secret is anything but `v2.` under the active key: a
   * `v1.` one, another key's, or unreadable (whose `reseal` then throws).
   */
  needsRotation(sealed: string): boolean;
  /**
   * The secret sealed again with the active key, or `sealed` itself when it
   * already is. Store the result in place of the old one.
   */
  reseal(sealed: string, aad: string): Promise<string>;
}

interface ParsedSealed {
  version: "v1" | "v2";
  keyId: string | null;
  iv: string;
  body: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function parseSealed(sealed: unknown): ParsedSealed | null {
  if (typeof sealed !== "string") return null;
  const parts = sealed.split(".");
  if (parts[0] === "v1" && parts.length === 3) {
    const [, iv, body] = parts as [string, string, string];
    return B64URL.test(iv) && B64URL.test(body)
      ? { version: "v1", keyId: null, iv, body }
      : null;
  }
  if (parts[0] === "v2" && parts.length === 4) {
    const [, keyId, iv, body] = parts as [string, string, string, string];
    return KEY_ID.test(keyId) && B64URL.test(iv) && B64URL.test(body)
      ? { version: "v2", keyId, iv, body }
      : null;
  }
  return null;
}

/** The associated data a `v2.` ciphertext is bound to: its version and key id, then the app's. */
const v2Aad = (keyId: string, aad: string) => `v2.${keyId}.${aad}`;

/**
 * Seals and opens secrets of one purpose with a keyring (see `parseKeyring`
 * for what it takes). Derived keys are cached on the returned object.
 */
export function createSecrets(
  keyring: string | KeyringInput | Keyring,
  options: SecretsOptions,
): Secrets {
  const ring = parseKeyring(keyring);
  const { purpose, salt } = options;
  if (!purpose)
    throw new SecretError("usage", "A sealing key needs its purpose (info)");
  const legacyKeyId = options.legacyKeyId ?? "k1";
  const derived = new Map<string, Promise<WebCryptoKey>>();

  const keyFor = (keyId: string): Promise<WebCryptoKey> => {
    const bytes = ring.keys.get(keyId);
    if (!bytes)
      throw new SecretError(
        "unknown-key",
        `The stored secret was sealed with key ${keyId}, which the keyring no longer has`,
      );
    let key = derived.get(keyId);
    if (!key) {
      key = deriveSecretKey(bytes, purpose, { salt });
      derived.set(keyId, key);
    }
    return key;
  };

  const secrets: Secrets = {
    purpose,
    activeKeyId: ring.active,
    async seal(plaintext, aad) {
      requireAad(aad);
      if (typeof plaintext !== "string")
        throw new SecretError("usage", "Only text can be sealed");
      const { iv, body } = await encrypt(
        await keyFor(ring.active),
        plaintext,
        v2Aad(ring.active, aad),
      );
      return `v2.${ring.active}.${iv}.${body}`;
    },
    async open(sealed, aad) {
      requireAad(aad);
      const parsed = parseSealed(sealed);
      if (!parsed)
        throw new SecretError(
          "format",
          "The stored secret is not in a known format",
        );
      if (parsed.version === "v1")
        return decrypt(await keyFor(legacyKeyId), parsed.iv, parsed.body, aad);
      const keyId = parsed.keyId!;
      return decrypt(
        await keyFor(keyId),
        parsed.iv,
        parsed.body,
        v2Aad(keyId, aad),
      );
    },
    keyIdOf(sealed) {
      const parsed = parseSealed(sealed);
      if (!parsed) return null;
      return parsed.version === "v1" ? legacyKeyId : parsed.keyId;
    },
    needsRotation(sealed) {
      const parsed = parseSealed(sealed);
      return !(
        parsed &&
        parsed.version === "v2" &&
        parsed.keyId === ring.active
      );
    },
    async reseal(sealed, aad) {
      if (!secrets.needsRotation(sealed)) {
        // Still checks it opens, so a job never reports a broken row as done.
        await secrets.open(sealed, aad);
        return sealed;
      }
      return secrets.seal(await secrets.open(sealed, aad), aad);
    },
  };
  return secrets;
}
