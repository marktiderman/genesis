/** Small byte helpers on web APIs only (no Buffer), so the package runs on Node, edge and Workers. */

export const utf8 = new TextEncoder();

/** Bytes (or UTF-8 text) as base64url, no padding. */
export function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? utf8.encode(bytes) : bytes;
  let s = "";
  for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Standard base64 or base64url, padded or not, as bytes. Throws on anything else. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const plain = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(plain + "=".repeat((4 - (plain.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `bytes` random bytes as base64url. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256 of a text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8.encode(text));
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** WebCrypto's key type, named without depending on the DOM lib. */
export type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
