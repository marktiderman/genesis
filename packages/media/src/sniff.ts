/**
 * What a downloaded file is, from its first bytes (never from its name or
 * the server's Content-Type), and an image's size from its header. Only the
 * types an app stores from outside: PNG, JPEG, GIF, WebP, AVIF and PDF. SVG, HTML and
 * everything else are refused, since a browser runs them as a page.
 */

export interface Sniffed {
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "application/pdf";
  ext: string;
  width: number | null;
  height: number | null;
}

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const len = u16be(b, i + 2);
    // Start of frame (not DHT C4, JPG C8 or DAC CC): height then width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 " && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** The file's type and size, or null when it isn't one of those types. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b);
    return { mime: "image/jpeg", ext: "jpg", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (b.length >= 10 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) {
    return { mime: "image/gif", ext: "gif", width: u16le(b, 6), height: u16le(b, 8) };
  }
  if (b.length >= 16 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const size = webpSize(b);
    return { mime: "image/webp", ext: "webp", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const boxEnd = Math.min(u32be(b, 0), b.length, 64);
    const brands = [ascii(b, 8, 4)];
    for (let at = 16; at + 4 <= boxEnd; at += 4) brands.push(ascii(b, at, 4));
    if (brands.includes("avif") || brands.includes("avis")) return { mime: "image/avif", ext: "avif", width: null, height: null };
    return null;
  }
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", width: null, height: null };
  return null;
}
