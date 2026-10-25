/**
 * @feat:sites-import
 * importAssets: the address guard (every private, loopback, link-local,
 * mapped and reserved form refused, at connect time too), the URL rules,
 * redirects checked hop by hop, the size cap, type by bytes (no SVG or
 * HTML), storage under sites/<id>/ (files/ for a PDF), dimensions, and
 * rewriting imported documents.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemorySiteStore, type PageDoc } from "../index";
import { guardedLookup, guardedTransport, importAssets, isPublicAddress, rewriteUrls, sniff, urlProblems, type FetchedResponse, type Transport } from "../import/index";

// A 2×3 PNG header (enough for the sniffer and the size), a GIF, a PDF, and things that aren't allowed.
const png = (w = 2, h = 3) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const gif = new Uint8Array([...new TextEncoder().encode("GIF89a"), 40, 0, 30, 0, 0, 0]);
const pdf = new TextEncoder().encode("%PDF-1.7\n%stuff");
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

/** A fake web: URL → response. Redirects as `{ status, location }`. */
function fakeTransport(routes: Record<string, { status?: number; body?: Uint8Array; location?: string; headers?: Record<string, string> }>): Transport & { seen: string[] } {
  const seen: string[] = [];
  const t = (async (url: URL) => {
    seen.push(url.href);
    const r = routes[url.href];
    if (!r) return { status: 404, headers: {}, body: (async function* () {})(), cancel() {} } satisfies FetchedResponse;
    const body = r.body ?? new Uint8Array();
    return {
      status: r.status ?? 200,
      headers: { ...(r.location ? { location: r.location } : {}), ...(r.headers ?? {}) },
      body: (async function* () {
        // In small chunks, so the size cap is enforced while reading.
        for (let i = 0; i < body.length; i += 8) yield body.subarray(i, i + 8);
      })(),
      cancel() {},
    } satisfies FetchedResponse;
  }) as unknown as Transport & { seen: string[] };
  t.seen = seen;
  return t;
}

async function site() {
  const store = createMemorySiteStore();
  await store.createSite({ id: "s1", site: { schemaVersion: 1, name: "Riverside Gym" }, pages: [{ path: "/", doc: { schemaVersion: 1, root: { props: { title: "Home" } }, content: [] } }] });
  return store;
}

describe("the address guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1%en0",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "2001::1",
    "3fff:123::1",
    "not-an-ip",
  ])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001::200e"])("allows the public %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("refuses URLs that aren't http(s), carry credentials, use another port, or name a private address or a local name", () => {
    const ports = [80, 443];
    expect(urlProblems(new URL("ftp://files.example/a.png"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("file:///etc/passwd"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("https://user:pw@files.example/a.png"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("https://files.example:8443/a.png"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://169.254.169.254/latest/meta-data"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://2130706433/"), ports)).not.toEqual([]); // 127.0.0.1, spelled as a number
    expect(urlProblems(new URL("http://0x7f.1/"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://[::ffff:127.0.0.1]/"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://localhost/"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://metadata.google.internal/"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://metadata.google.internal./"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("http://localhost./"), ports)).not.toEqual([]);
    expect(urlProblems(new URL("https://files.example/a.png"), ports)).toEqual([]);
  });

  it("checks the address a name resolves to when the socket connects, and doesn't tell the editor what it was", async () => {
    const error = await new Promise<Error | null>((resolve) => guardedLookup("localhost", {}, (err) => resolve(err)));
    expect(error?.message).toBe("localhost isn't a public address.");
    expect((error as Error & { address?: string }).address).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  describe("against a real server on this machine", () => {
    let server: Server;
    let port = 0;
    beforeAll(async () => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.from(png()));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it("refuses it by address before connecting, and by lookup when a name points at it", async () => {
      const store = await site();
      const r = await importAssets(store, "s1", [`http://127.0.0.1:${port}/x.png`], { allowedPorts: [port] });
      expect(r.failed[0]?.reason).toMatch(/127\.0\.0\.1 isn't a public address/);
      // Past the URL check (the transport alone): the connect-time lookup still refuses the name.
      await expect(guardedTransport(new URL(`http://localhost:${port}/x.png`), AbortSignal.timeout(5000))).rejects.toThrow(/isn't a public address/);
    });
  });
});

describe("importAssets", () => {
  it("stores images and PDFs under the site's folder, with their size, and maps old URLs to new", async () => {
    const store = await site();
    const transport = fakeTransport({
      "https://old.example/img/hero.JPG?w=2": { body: png(1600, 900) },
      "https://old.example/anim.gif": { body: gif },
      "https://old.example/files/Price%20List.pdf": { body: pdf },
    });
    const r = await importAssets(store, "s1", ["https://old.example/img/hero.JPG?w=2", "https://old.example/anim.gif", "https://old.example/files/Price%20List.pdf", "https://old.example/anim.gif"], {
      transport,
      alt: (url) => (url.includes("hero") ? "The gym floor" : undefined),
    });
    expect(r.failed).toEqual([]);
    expect(transport.seen).toHaveLength(3); // the repeat is fetched once
    const hero = r.assets["https://old.example/img/hero.JPG?w=2"]!;
    expect(hero).toMatchObject({ mime: "image/png", width: 1600, height: 900, needsAlt: false });
    expect(hero.path).toMatch(/^sites\/s1\/asset_\w+-hero\.png$/); // the extension is what the bytes are
    expect(r.assets["https://old.example/anim.gif"]).toMatchObject({ mime: "image/gif", width: 40, height: 30, needsAlt: true });
    const prices = r.assets["https://old.example/files/Price%20List.pdf"]!;
    expect(prices.path).toMatch(/^sites\/s1\/files\/asset_\w+-price-list\.pdf$/);
    expect(prices.needsAlt).toBe(false);
    expect(r.map["https://old.example/anim.gif"]).toBe(r.assets["https://old.example/anim.gif"]!.url);
  });

  it("refuses SVG, HTML and anything else by its bytes, whatever the name or Content-Type says", async () => {
    const store = await site();
    const transport = fakeTransport({
      "https://old.example/logo.png": { body: svg, headers: { "content-type": "image/png" } },
      "https://old.example/page.jpg": { body: html, headers: { "content-type": "image/jpeg" } },
    });
    const r = await importAssets(store, "s1", ["https://old.example/logo.png", "https://old.example/page.jpg"], { transport });
    expect(r.failed.map((f) => f.reason)).toEqual([expect.stringMatching(/isn't a PNG/), expect.stringMatching(/isn't a PNG/)]);
    expect(r.map).toEqual({});
  });

  it("checks every redirect: a hop to a private address, a non-http scheme, or past the limit is refused", async () => {
    const store = await site();
    const transport = fakeTransport({
      "https://old.example/meta.png": { status: 302, location: "https://169.254.169.254/latest/meta-data/" },
      "https://old.example/mapped.png": { status: 301, location: "https://[::ffff:7f00:1]/x.png" },
      "https://old.example/scheme.png": { status: 307, location: "file:///etc/passwd" },
      "https://old.example/loop.png": { status: 302, location: "/loop.png?again" },
      "https://old.example/loop.png?again": { status: 302, location: "/loop.png" },
      "https://old.example/moved.png": { status: 308, location: "https://cdn.example/moved.png" },
      "https://cdn.example/moved.png": { body: png() },
    });
    const urls = ["https://old.example/meta.png", "https://old.example/mapped.png", "https://old.example/scheme.png", "https://old.example/loop.png", "https://old.example/moved.png"];
    const r = await importAssets(store, "s1", urls, { transport });
    const reasons = Object.fromEntries(r.failed.map((f) => [f.url, f.reason]));
    expect(reasons["https://old.example/meta.png"]).toMatch(/redirects to 169\.254\.169\.254.*isn't a public address/);
    expect(reasons["https://old.example/mapped.png"]).toMatch(/isn't a public address/);
    expect(reasons["https://old.example/scheme.png"]).toMatch(/Only http and https/);
    expect(reasons["https://old.example/loop.png"]).toMatch(/more than 3 redirects/);
    expect(r.map["https://old.example/moved.png"]).toBeDefined();
    const down = await importAssets(store, "s1", ["https://old.example/down.png"], { transport: fakeTransport({ "https://old.example/down.png": { status: 302, location: "http://cdn.example/down.png" }, "http://cdn.example/down.png": { body: png() } }) });
    expect(down.failed[0]?.reason).toMatch(/https to http/);
    expect(transport.seen).not.toContain("https://169.254.169.254/latest/meta-data/");
  });

  it("caps the size: by Content-Length before reading, and while reading when there is none", async () => {
    const store = await site();
    const big = new Uint8Array(2048);
    big.set(png());
    const transport = fakeTransport({
      "https://old.example/declared.png": { body: png(), headers: { "content-length": String(10 * 1024 * 1024 * 1024) } },
      "https://old.example/streamed.png": { body: big },
      "https://old.example/gone.png": { status: 404 },
    });
    const r = await importAssets(store, "s1", ["https://old.example/declared.png", "https://old.example/streamed.png", "https://old.example/gone.png"], { transport, maxBytes: 1024 });
    expect(r.failed.map((f) => f.reason)).toEqual([expect.stringMatching(/the limit is 1024/), expect.stringMatching(/over the 1024-byte limit/), expect.stringMatching(/answered 404/)]);
  });

  it("takes at most 500 URLs a call", async () => {
    const store = await site();
    await expect(importAssets(store, "s1", Array.from({ length: 501 }, (_, i) => `https://old.example/${i}.png`), { transport: fakeTransport({}) })).rejects.toThrow(/at most 500/);
  });

  it("refuses an image too large to be one (a decompression bomb's header)", async () => {
    const store = await site();
    const r = await importAssets(store, "s1", ["https://old.example/bomb.png", "https://old.example/wide.png"], {
      transport: fakeTransport({ "https://old.example/bomb.png": { body: png(65535, 65535) }, "https://old.example/wide.png": { body: png(19000, 19000) } }),
    });
    expect(r.failed.map((f) => f.reason)).toEqual([expect.stringMatching(/20000 a side/), expect.stringMatching(/50 million in all/)]);
  });
});

describe("rewriteUrls", () => {
  it("points an imported page at the copies and changes nothing else", () => {
    const doc: PageDoc = {
      schemaVersion: 1,
      root: { props: { title: "Home" } },
      content: [
        { id: "hero", type: "hero", v: 1, props: { heading: "https://old.example/a.png is not a link here", image: { src: "https://old.example/a.png", alt: "A" } } },
        { id: "files", type: "file", v: 1, props: { heading: "Files", files: [{ label: "Prices", file: { src: "https://old.example/prices.pdf" } }] } },
      ],
    };
    const out = rewriteUrls(doc, { "https://old.example/a.png": "/sites/s1/a1-a.png", "https://old.example/prices.pdf": "/sites/s1/files/a2-p.pdf" });
    expect((out.content[0]!.props.image as { src: string }).src).toBe("/sites/s1/a1-a.png");
    expect(out.content[0]!.props.heading).toBe(doc.content[0]!.props.heading);
    expect(JSON.stringify(out)).toContain("/sites/s1/files/a2-p.pdf");
    expect((doc.content[0]!.props.image as { src: string }).src).toBe("https://old.example/a.png"); // a copy
  });

  it("sniffs only the types a site stores", () => {
    expect(sniff(png())?.mime).toBe("image/png");
    expect(sniff(pdf)?.mime).toBe("application/pdf");
    expect(sniff(svg)).toBeNull();
    expect(sniff(new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypavif"), 0, 0, 0, 0]))?.mime).toBe("image/avif");
  });
});
