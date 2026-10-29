// @feat:media-zip-stream
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ZIP_ENTRIES, createBundleHandler, createMemoryStorage, createMediaSigner, createZipManifest, mediaScope, type MediaStorage, type ZipManifest } from "./index";

const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const H = Math.floor(1_800_000_000 / 3600) * 3600;
const now = () => H;
const signer = createMediaSigner({ secret: SECRET, now });
const BASE = "https://media.example.com";

// ── A small ZIP reader, enough to check what the handler wrote ──────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  size: number;
  data: Uint8Array;
}

/** Reads the central directory (ZIP64 extras included) and each entry's stored bytes. */
function readZip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("no end of central directory");
  let count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    expect(view.getUint32(locator, true)).toBe(0x07064b50);
    const z64 = Number(view.getBigUint64(locator + 8, true));
    expect(view.getUint32(z64, true)).toBe(0x06064b50);
    count = Number(view.getBigUint64(z64 + 32, true));
    offset = Number(view.getBigUint64(z64 + 48, true));
  }
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    let size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    // A ZIP64 extra holds, in order, whichever of size, compressed size and offset are 0xffffffff.
    for (let x = offset + 46 + nameLength; x < offset + 46 + nameLength + extraLength; ) {
      const id = view.getUint16(x, true);
      const len = view.getUint16(x + 2, true);
      if (id === 1) {
        let at = x + 4;
        if (size === 0xffffffff) (size = Number(view.getBigUint64(at, true))), (at += 8);
        if (view.getUint32(offset + 20, true) === 0xffffffff) at += 8;
        if (local === 0xffffffff) local = Number(view.getBigUint64(at, true));
      }
      x += 4 + len;
    }
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.push({ name, method, crc, size, data: zip.subarray(start, start + size) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);
const files = {
  "media/a.jpg": { body: bytes(10, 1), contentType: "image/jpeg" },
  "media/b.mov": { body: bytes(70_000, 2), contentType: "video/quicktime" },
  "media/c.txt": { body: "", contentType: "text/plain" },
  "media/d.pdf": { body: bytes(1, 3), contentType: "application/pdf" },
};

function bundle(manifest: ZipManifest, storage: MediaStorage = createMemoryStorage(files)) {
  const stored = new Map([[manifest.id, JSON.parse(JSON.stringify(manifest))]]);
  return createBundleHandler({ storage, signer, now, readManifest: async (id) => stored.get(id) ?? null });
}

const link = (id: string) => signer.signMediaUrl(BASE, `bundles/${id}`, mediaScope.bundle(id), { ttl: "2h" });

const manifest = (over: Partial<Parameters<typeof createZipManifest>[0]> = {}) =>
  createZipManifest({
    filename: "Selected files",
    entries: [
      { key: "media/a.jpg", path: "photos/a.jpg", size: 10 },
      { key: "media/b.mov", path: "videos/b — final.mov", size: 70_000 },
      { key: "media/c.txt", path: "notes/c.txt", size: 0 },
      { key: "media/d.pdf", path: "d.pdf", size: 1 },
    ],
    expiresAt: new Date((H + 86_400) * 1000),
    ...over,
  });

describe("createZipManifest", () => {
  it("gives the manifest a random id, its filename and its expiry in Unix seconds", () => {
    const a = manifest();
    const b = manifest();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ version: 1, filename: "Selected files", expiresAt: H + 86_400 });
    expect(createZipManifest({ filename: "x", entries: [{ key: "k", path: "n" }], expiresAt: 123 }).expiresAt).toBe(123);
  });

  it("refuses paths that would unzip outside their folder or fail on Windows, and bad sizes", () => {
    const one = (path: string, size?: number) => () => createZipManifest({ filename: "x", entries: [{ key: "k", path, ...(size === undefined ? {} : { size }) }], expiresAt: H });
    const bad = [
      "../x", "a/../../x", "/etc/x", "C:/x", "a:b", "a\\b", "a//b", "./a", "a/", "",
      "a\u0000b", "a\nb", "a\u007fb", "a<b", "a>b", "a|b", "a?b", "a*b", 'a"b',
      "CON", "con", "nul.txt", "folder/PRN.tar.gz", "AUX", "COM1", "com9.log", "LPT1", "lpt9",
      "trailing.", "trailing ", "dir./x", "dir /x",
    ];
    for (const path of bad) expect(one(path), JSON.stringify(path)).toThrow(TypeError);
    for (const path of ["console.txt", "com10", "lpt", "a.b/c d.jpg", "Ünïcode/naïve.jpg", "photos/a1.jpg"]) expect(one(path), path).not.toThrow();
    expect(one("ok.txt", -1)).toThrow(/size/);
    expect(one("ok.txt", 1.5)).toThrow(/size/);
    expect(() => createZipManifest({ filename: "x", entries: [], expiresAt: H })).toThrow(/no entries/);
    expect(() => createZipManifest({ filename: " ", entries: [{ key: "a", path: "a" }], expiresAt: H })).toThrow(/filename/);
  });

  it("refuses duplicates ignoring case after NFC, and a path that is both a file and a folder", () => {
    const two = (a: string, b: string) => () => createZipManifest({ filename: "x", entries: [{ key: "1", path: a }, { key: "2", path: b }], expiresAt: H });
    expect(two("same", "same")).toThrow(/two entries/);
    expect(two("Photo.JPG", "photo.jpg")).toThrow(/two entries/);
    expect(two("caf\u00e9.jpg", "cafe\u0301.jpg")).toThrow(/two entries/); // é precomposed, and e plus a combining accent
    expect(two("a", "a/b")).toThrow(/both a file and a folder/);
    expect(two("A/b", "a")).toThrow(/both a file and a folder/);
    expect(two("a/b", "a/c")).not.toThrow();
  });

  it(`holds at most ${MAX_ZIP_ENTRIES} files`, () => {
    const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, path: `f${i}`, size: 1 }));
    expect(createZipManifest({ filename: "x", entries: entries(MAX_ZIP_ENTRIES), expiresAt: H }).entries).toHaveLength(MAX_ZIP_ENTRIES);
    expect(() => createZipManifest({ filename: "x", entries: entries(MAX_ZIP_ENTRIES + 1), expiresAt: H })).toThrow(/at most 65535/);
  });
});

describe("createBundleHandler", () => {
  it("streams a store-only ZIP of mixed sizes with the exact content-length, its filename and noindex", async () => {
    const m = manifest();
    const res = await bundle(m)(new Request(await link(m.id)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="Selected files.zip"; filename*=UTF-8''Selected%20files.zip`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    const zip = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get("content-length")).toBe(String(zip.byteLength));
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["photos/a.jpg", "videos/b — final.mov", "notes/c.txt", "d.pdf"]);
    for (const [entry, key] of entries.map((e, i) => [e, m.entries[i]!.key] as const)) {
      const want = files[key as keyof typeof files].body;
      const expected = typeof want === "string" ? new TextEncoder().encode(want) : want;
      expect(entry.method).toBe(0); // stored, never compressed
      expect(entry.size).toBe(expected.byteLength);
      expect([...entry.data]).toEqual([...expected]);
      expect(entry.crc).toBe(crc32(expected));
    }
  });

  it("answers HEAD with the length and no body, and leaves the length off when a size is unknown", async () => {
    const m = manifest();
    const head = await bundle(m)(new Request(await link(m.id), { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(70_011);
    expect(await head.text()).toBe("");
    const unsized = manifest({ entries: [{ key: "media/a.jpg", path: "a.jpg" }] });
    const res = await bundle(unsized)(new Request(await link(unsized.id)));
    expect(res.headers.get("content-length")).toBeNull();
    expect(readZip(new Uint8Array(await res.arrayBuffer())).map((e) => e.size)).toEqual([10]);
  });

  it("uses ZIP64 for a set past 4 GB (by its declared sizes)", async () => {
    const big = manifest({ entries: [{ key: "x", path: "a.bin", size: 3 * 2 ** 30 }, { key: "y", path: "b.bin", size: 2 * 2 ** 30 }] });
    const small = manifest({ entries: [{ key: "x", path: "a.bin", size: 3 }, { key: "y", path: "b.bin", size: 2 }] });
    const length = async (m: ZipManifest) => Number((await bundle(m)(new Request(await link(m.id), { method: "HEAD" }))).headers.get("content-length"));
    const overhead = (await length(big)) - 5 * 2 ** 30;
    const smallOverhead = (await length(small)) - 5;
    // The ZIP64 extras, the ZIP64 end record and its locator: the bytes a 32-bit ZIP doesn't have.
    expect(overhead - smallOverhead).toBeGreaterThanOrEqual(56 + 20);
  });

  it("reads one file at a time as the download is read, never the whole set up front", async () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, { body: bytes(1000, i) }]));
    const storage = createMemoryStorage(many);
    const m = manifest({ entries: Object.keys(many).map((key) => ({ key, path: `${key}.bin`, size: 1000 })) });
    const res = await bundle(m, storage)(new Request(await link(m.id)));
    // A stream may fetch its first chunk before anyone reads; never more.
    expect(storage.reads.length).toBeLessThanOrEqual(1);
    const reader = res.body!.getReader();
    for (let i = 0; i < 3; i++) await reader.read();
    expect(storage.reads.length).toBeLessThanOrEqual(3);
    await reader.cancel();
    expect(storage.reads.length).toBeLessThan(50);
  });

  it("cancels the storage read in progress when the download is abandoned, and opens no further file", async () => {
    let cancelled: unknown = "not cancelled";
    let opened = 0;
    const slow: MediaStorage = {
      head: async () => ({ size: 1 << 20 }),
      get: async () => {
        opened++;
        let sent = 0;
        return {
          size: 1 << 20,
          body: new ReadableStream<Uint8Array>({
            pull(c) {
              if (sent >= 1 << 20) return c.close();
              c.enqueue(new Uint8Array(1 << 14));
              sent += 1 << 14;
            },
            cancel(reason) {
              cancelled = reason;
            },
          }),
        };
      },
    };
    const m = manifest({ entries: [{ key: "a", path: "a.bin", size: 1 << 20 }, { key: "b", path: "b.bin", size: 1 << 20 }] });
    const res = await bundle(m, slow)(new Request(await link(m.id)));
    const reader = res.body!.getReader();
    for (let i = 0; i < 4; i++) await reader.read();
    await reader.cancel("gone");
    expect(cancelled).toBe("gone");
    expect(opened).toBe(1);
  });

  const python = (() => {
    try {
      execFileSync("python3", ["-c", "import zipfile"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  it.runIf(python)("writes a ZIP that an independent reader (Python's zipfile) opens and checks", async () => {
    const m = manifest();
    const zip = new Uint8Array(await (await bundle(m)(new Request(await link(m.id)))).arrayBuffer());
    const dir = mkdtempSync(join(tmpdir(), "genesis-media-zip-"));
    try {
      const file = join(dir, "bundle.zip");
      writeFileSync(file, zip);
      const script = [
        "import json, sys, zipfile",
        "z = zipfile.ZipFile(sys.argv[1])",
        "bad = z.testzip()",
        "print(json.dumps({'bad': bad, 'files': [[i.filename, i.file_size, i.compress_type] for i in z.infolist()]}))",
      ].join("\n");
      const out = JSON.parse(execFileSync("python3", ["-I", "-c", script, file], { encoding: "utf8" }));
      expect(out.bad).toBeNull();
      expect(out.files).toEqual([
        ["photos/a.jpg", 10, 0],
        ["videos/b — final.mov", 70_000, 0],
        ["notes/c.txt", 0, 0],
        ["d.pdf", 1, 0],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a bad signature (403) before reading the manifest, and another scope's link", async () => {
    const m = manifest();
    let reads = 0;
    const handle = createBundleHandler({ storage: createMemoryStorage(files), signer, now, readManifest: async () => (reads++, JSON.parse(JSON.stringify(m))) });
    const url = new URL(await link(m.id));
    const bad = new URL(url);
    bad.searchParams.set("s", url.searchParams.get("s")!.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    expect((await handle(new Request(bad))).status).toBe(403);
    for (const scope of [mediaScope.item("bundles", m.id), mediaScope.file("bundles", m.id, "zip"), mediaScope.download(`bundles/${m.id}`, "x.zip")]) {
      const other = new URL(await signer.signMediaUrl(BASE, `bundles/${m.id}`, scope, { ttl: "2h" }));
      expect((await handle(new Request(other))).status).toBe(403);
    }
    expect(reads).toBe(0);
    const expired = createBundleHandler({ storage: createMemoryStorage(files), signer: createMediaSigner({ secret: SECRET, now: () => H + 3 * 3600 }), now, readManifest: async () => m });
    expect((await expired(new Request(url))).status).toBe(403);
  });

  it("is 404 for a missing or expired manifest, or one stored under another id", async () => {
    const m = manifest();
    const missing = createBundleHandler({ storage: createMemoryStorage(files), signer, now, readManifest: async () => null });
    expect((await missing(new Request(await link(m.id)))).status).toBe(404);
    const old = manifest({ expiresAt: H });
    expect((await bundle(old)(new Request(await link(old.id)))).status).toBe(404);
    const other = manifest();
    const wrong = createBundleHandler({ storage: createMemoryStorage(files), signer, now, readManifest: async () => other });
    expect((await wrong(new Request(await link(m.id)))).status).toBe(404);
    const invalid = createBundleHandler({ storage: createMemoryStorage(files), signer, now, readManifest: async () => ({ ...m, entries: [{ key: "a", path: "../x" }] }) });
    expect((await invalid(new Request(await link(m.id)))).status).toBe(500);
  });

  it("takes the manifest id as an argument, like a router param", async () => {
    const m = manifest();
    const url = new URL(await link(m.id));
    url.pathname = "/download";
    expect((await bundle(m)(new Request(url), m.id)).status).toBe(200);
  });

  it("fails the download, rather than sending an incomplete ZIP, when a file is missing or changed size", async () => {
    for (const entries of [
      [{ key: "media/a.jpg", path: "a.jpg", size: 10 }, { key: "media/gone", path: "gone", size: 5 }],
      [{ key: "media/a.jpg", path: "a.jpg", size: 11 }],
    ]) {
      const m = manifest({ entries });
      const res = await bundle(m)(new Request(await link(m.id)));
      expect(res.status).toBe(200);
      await expect(res.arrayBuffer()).rejects.toThrow();
    }
  });

  it("allows GET and HEAD only", async () => {
    const m = manifest();
    expect((await bundle(m)(new Request(await link(m.id), { method: "POST" }))).status).toBe(405);
  });
});

// A real 4 GB+ stream through the handler: about ten seconds of CPU, so it runs only when asked:
// GENESIS_MEDIA_ZIP64=1 pnpm --filter @marktiderman/genesis-media test
describe.runIf(process.env.GENESIS_MEDIA_ZIP64 === "1")("a ZIP past 4 GB, streamed", () => {
  it("writes ZIP64 records and keeps memory flat", { timeout: 600_000 }, async () => {
    const SIZE = 2 ** 32 + 1024;
    const CHUNK = new Uint8Array(1 << 20);
    const zeros: MediaStorage = {
      head: async (key) => ({ size: key === "big" ? SIZE : 1024 }),
      get: async (key) => {
        const size = key === "big" ? SIZE : 1024;
        let sent = 0;
        return {
          size,
          body: new ReadableStream<Uint8Array>({
            pull(c) {
              const n = Math.min(CHUNK.byteLength, size - sent);
              if (n === 0) return c.close();
              c.enqueue(n === CHUNK.byteLength ? CHUNK : CHUNK.subarray(0, n));
              sent += n;
            },
          }),
        };
      },
    };
    const m = manifest({ entries: [{ key: "big", path: "big.bin", size: SIZE }, { key: "small", path: "after.bin", size: 1024 }] });
    const res = await bundle(m, zeros)(new Request(await link(m.id)));
    const reader = res.body!.getReader();
    const before = process.memoryUsage().rss;
    let total = 0;
    let peak = 0;
    let tail = new Uint8Array(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      const joined = new Uint8Array(tail.byteLength + value.byteLength);
      joined.set(tail);
      joined.set(value, tail.byteLength);
      tail = joined.slice(-4096);
      if ((total & 0x3fffffff) < value.byteLength) peak = Math.max(peak, process.memoryUsage().rss - before);
    }
    expect(total).toBe(Number(res.headers.get("content-length")));
    const view = new DataView(tail.buffer);
    const signatures = Array.from({ length: tail.byteLength - 3 }, (_, i) => view.getUint32(i, true));
    expect(signatures).toContain(0x06064b50); // ZIP64 end of central directory
    expect(signatures).toContain(0x07064b50); // its locator
    expect(peak).toBeLessThan(256 * 2 ** 20);
  });
});
