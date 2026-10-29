// @feat:media-signed-links
import { describe, expect, it } from "vitest";
import { createMemoryStorage, createMediaSigner, createSignedMediaHandler, mediaScope, parseRange, type MediaRoute, type MediaStorage } from "./index";

const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const H = Math.floor(1_800_000_000 / 3600) * 3600;
const now = () => H;
const signer = createMediaSigner({ secret: SECRET, now });
const BASE = "https://media.example.com";

const VIDEO = "0123456789abcdefghij"; // 20 bytes
const objects = {
  "media/videos/v1/poster.jpg": { body: "poster-bytes", contentType: "image/jpeg" },
  "media/videos/v1/web-1080.mp4": { body: VIDEO, contentType: "video/mp4", lastModified: new Date("2026-01-02T03:04:05Z") },
  "media/videos/v1/original.mov": { body: "original", contentType: "video/quicktime" },
  "media/photos/p1/800.jpg": { body: "small", contentType: "image/jpeg" },
};

/** The app's routes: `<collection>/<id>/<variant>.<ext>`. Photos' preview sizes open with an item link; video files each need their own. */
function route(path: string, { download }: { download: string | undefined }): MediaRoute | undefined {
  const m = /^(photos|videos)\/([a-z0-9]+)\/([a-z0-9-]+)\.(jpg|mp4|mov)$/.exec(path);
  if (!m) return undefined;
  const [, collection, id, variant] = m as unknown as [string, string, string, string];
  const key = `media/${path}`;
  if (download !== undefined) return { key, scope: mediaScope.download(path, download) };
  if (collection === "photos") return variant === "800" || variant === "2400" ? { key, scope: mediaScope.item(collection, id) } : undefined;
  return variant === "original" ? undefined : { key, scope: mediaScope.file(collection, id, variant) };
}

function setup(storage: MediaStorage = createMemoryStorage(objects)) {
  return createSignedMediaHandler({ storage, signer, route, now });
}

async function signed(path: string, scope: ReturnType<typeof mediaScope.item>, ttl: `${number}h` = "2h") {
  return signer.signMediaUrl(BASE, path, scope, { ttl });
}

/** Storage that counts every call, to show the signature is checked before storage is touched. */
function counting() {
  const inner = createMemoryStorage(objects);
  const calls: string[] = [];
  const storage: MediaStorage = {
    head: (k) => (calls.push(`head ${k}`), inner.head(k)),
    get: (k, o) => (calls.push(`get ${k}`), inner.get(k, o)),
  };
  return { storage, calls };
}

describe("createSignedMediaHandler", () => {
  it("serves a signed file with its type, length, ETag, ranges, noindex and a cache life no longer than the link", async () => {
    const handle = setup();
    const res = await handle(new Request(await signed("videos/v1/web-1080.mp4", mediaScope.file("videos", "v1", "web-1080"))));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(VIDEO);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("20");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("etag")).toMatch(/^".+"$/);
    expect(res.headers.get("last-modified")).toBe("Fri, 02 Jan 2026 03:04:05 GMT");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("content-disposition")).toBeNull();

    const short = await handle(new Request(await signer.signMediaUrl(BASE, "videos/v1/web-1080.mp4", mediaScope.file("videos", "v1", "web-1080"), { ttl: "10m" })));
    expect(short.headers.get("cache-control")).toBe("private, max-age=600");
    const custom = createSignedMediaHandler({ storage: createMemoryStorage(objects), signer, route, now, cacheControl: "no-store" });
    expect((await custom(new Request(await signed("photos/p1/800.jpg", mediaScope.item("photos", "p1"))))).headers.get("cache-control")).toBe("no-store");
  });

  it("answers HEAD with the headers and no body", async () => {
    const res = await setup()(new Request(await signed("videos/v1/web-1080.mp4", mediaScope.file("videos", "v1", "web-1080")), { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("20");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(await res.text()).toBe("");
  });

  it("answers a single Range with 206: from a start, an open end, a suffix, and an end past the file", async () => {
    const handle = setup();
    const url = await signed("videos/v1/web-1080.mp4", mediaScope.file("videos", "v1", "web-1080"));
    const get = (range: string, method = "GET") => handle(new Request(url, { method, headers: { range } }));
    const cases: [string, string, string][] = [
      ["bytes=2-5", "2345", "bytes 2-5/20"],
      ["bytes=15-", "fghij", "bytes 15-19/20"],
      ["bytes=-3", "hij", "bytes 17-19/20"],
      ["bytes=-50", VIDEO, "bytes 0-19/20"],
      ["bytes=18-99", "ij", "bytes 18-19/20"],
      ["bytes=0-0", "0", "bytes 0-0/20"],
    ];
    for (const [range, body, contentRange] of cases) {
      const res = await get(range);
      expect(res.status, range).toBe(206);
      expect(res.headers.get("content-range"), range).toBe(contentRange);
      expect(res.headers.get("content-length"), range).toBe(String(body.length));
      expect(await res.text(), range).toBe(body);
    }
    const head = await get("bytes=2-5", "HEAD");
    expect(head.status).toBe(206);
    expect(head.headers.get("content-length")).toBe("4");
    expect(await head.text()).toBe("");
  });

  it("answers 416 to a range past the end, and the whole file to several or malformed ranges", async () => {
    const handle = setup();
    const url = await signed("videos/v1/web-1080.mp4", mediaScope.file("videos", "v1", "web-1080"));
    for (const range of ["bytes=20-", "bytes=100-200", "bytes=-0"]) {
      const res = await handle(new Request(url, { headers: { range } }));
      expect(res.status, range).toBe(416);
      expect(res.headers.get("content-range"), range).toBe("bytes */20");
    }
    for (const range of ["bytes=0-1,4-5", "bytes=5-2", "items=0-1", "bytes=-", "bytes=a-b"]) {
      const res = await handle(new Request(url, { headers: { range } }));
      expect(res.status, range).toBe(200);
      expect(await res.text(), range).toBe(VIDEO);
    }
  });

  it("a poster link can't fetch the video, and an item link can't open a video file", async () => {
    const handle = setup();
    const poster = new URL(await signed("videos/v1/poster.jpg", mediaScope.file("videos", "v1", "poster")));
    expect((await handle(new Request(poster))).status).toBe(200);
    const swapped = new URL(poster);
    swapped.pathname = "/videos/v1/web-1080.mp4";
    expect((await handle(new Request(swapped))).status).toBe(403);
    const item = new URL(await signed("videos/v1/web-1080.mp4", mediaScope.item("videos", "v1")));
    expect((await handle(new Request(item))).status).toBe(403);
  });

  it("serves a download under the name bound into its signature (RFC 6266), and refuses another name", async () => {
    const handle = setup();
    const name = 'Final "cut" — v2.mov';
    const url = new URL(await signed("videos/v1/original.mov", mediaScope.download("videos/v1/original.mov", name)));
    const res = await handle(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("original");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="Final _cut_ _ v2.mov"; filename*=UTF-8''Final%20%22cut%22%20%E2%80%94%20v2.mov`);
    const renamed = new URL(url);
    renamed.searchParams.set("d", "other.mov");
    expect((await handle(new Request(renamed))).status).toBe(403);
    const dropped = new URL(url);
    dropped.searchParams.delete("d");
    expect((await handle(new Request(dropped))).status).toBe(404); // the original has no view route
  });

  it("checks the signature before touching storage: 403 for a bad or expired link, and nothing read", async () => {
    const { storage, calls } = counting();
    const handle = setup(storage);
    const url = new URL(await signed("photos/p1/800.jpg", mediaScope.item("photos", "p1")));
    const bad = new URL(url);
    bad.searchParams.set("s", "v1.AAAA");
    const unsigned = new URL(url);
    unsigned.search = "";
    for (const u of [bad, unsigned, new URL(url.href.replace("/p1/", "/p2/"))]) {
      const res = await handle(new Request(u));
      expect(res.status, u.href).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const expired = createSignedMediaHandler({ storage, signer: createMediaSigner({ secret: SECRET, now: () => H + 3 * 3600 }), route, now });
    expect((await expired(new Request(url))).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("is 404 for a missing file, an unknown path and a path that tries to climb, and never lists", async () => {
    const handle = setup();
    expect((await handle(new Request(await signed("photos/p9/800.jpg", mediaScope.item("photos", "p9"))))).status).toBe(404);
    expect((await handle(new Request(await signed("photos/p9/800.jpg", mediaScope.item("photos", "p9")), { method: "HEAD" }))).status).toBe(404);
    const seen: string[] = [];
    const spy = createSignedMediaHandler({ storage: createMemoryStorage(objects), signer, now, route: (p, c) => (seen.push(p), route(p, c)) });
    for (const path of ["/", "/photos/", "/photos/p1/", "/photos/%2e%2e/p1/800.jpg", "/photos/..%2Fx/800.jpg", "/photos/a%5Cb/800.jpg", "/photos/%00/800.jpg", "/photos/%E0%A4%A/800.jpg"]) {
      expect((await spy(new Request(`${BASE}${path}`))).status, path).toBe(404);
    }
    // The URL parser resolves a dot segment, even encoded, before the handler sees it ("/photos/%2e%2e/p1/…" is "/p1/…");
    // a segment that decodes to a slash, a backslash or NUL, or doesn't decode, never reaches the route.
    expect(seen).toEqual(["photos", "photos/p1", "p1/800.jpg"]);
  });

  it("allows GET and HEAD only", async () => {
    const res = await setup()(new Request(await signed("photos/p1/800.jpg", mediaScope.item("photos", "p1")), { method: "POST" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("parseRange", () => {
  it("reads one range and leaves everything else to a full answer", () => {
    expect(parseRange(null, 10)).toBeUndefined();
    expect(parseRange("bytes=0-", 10)).toEqual({ offset: 0, length: 10 });
    expect(parseRange(" bytes=1-2 ", 10)).toEqual({ offset: 1, length: 2 });
    expect(parseRange("bytes=-0", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-5", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1, 3-4", 10)).toBeUndefined();
  });
});
