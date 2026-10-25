// @feat:chat
/** Web Crypto helpers: constant-time compares, HMAC, base64url and RSA keys. */

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Equal strings, compared in constant time over their digests (so the length doesn't leak either). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** HMAC-SHA256 of `message` under `secret`, as lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64Url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const byte of b) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function der(tag: number, body: Uint8Array): Uint8Array {
  const len = derLength(body.length);
  const out = new Uint8Array(1 + len.length + body.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(body, 1 + len.length);
  return out;
}

/** Wraps a PKCS#1 RSA private key (`BEGIN RSA PRIVATE KEY`) as PKCS#8, which Web Crypto imports. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  // SEQUENCE { INTEGER 0, SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }, OCTET STRING { pkcs1 } }
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const octets = der(0x04, pkcs1);
  const body = new Uint8Array(version.length + algorithm.length + octets.length);
  body.set(version, 0);
  body.set(algorithm, version.length);
  body.set(octets, version.length + algorithm.length);
  return der(0x30, body);
}

/**
 * Imports an RSA private key for RS256 from a PEM (PKCS#1 or PKCS#8), or from
 * the base64 of a PEM as Mux hands out signing keys.
 */
export async function importRsaPrivateKey(key: string): Promise<CryptoKey> {
  const pem = key.includes("-----BEGIN") ? key : new TextDecoder().decode(base64ToBytes(key));
  const match = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----/.exec(pem);
  if (!match) throw new Error("importRsaPrivateKey: not a PEM private key");
  const bytes = base64ToBytes(match[2]!);
  const pkcs8 = match[1] ? pkcs1ToPkcs8(bytes) : bytes;
  return crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** Signs a JWT with RS256. */
export async function signJwtRs256(header: Record<string, unknown>, claims: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const input = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", ...header }))}.${base64Url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(input)));
  return `${input}.${base64Url(signature)}`;
}
