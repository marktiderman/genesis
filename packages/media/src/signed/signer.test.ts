// @feat:media-signed-links
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import * as root from "../index";
import { MAX_MEDIA_TTL, createMediaSigner, mediaScope } from "./index";
import { SIGNATURE_FORMATS, createMediaSignerWithFormats } from "./signer";

const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const OTHER = "another-test-secret-at-least-32-bytes-long!";
const HOUR = 3600;
const H = Math.floor(1_800_000_000 / HOUR) * HOUR; // the start of an hour
const at = (t: number) => () => t;

describe("createMediaSigner: sign and verify", () => {
  it("round-trips, and the token is { e, s } with a v1 signature", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H) });
    const scope = mediaScope.item("photos", "a1");
    const token = await signer.sign(scope, { ttl: "2h" });
    expect(token).toEqual({ e: H + 2 * HOUR, s: expect.stringMatching(/^v1\.[A-Za-z0-9_-]{43}$/) });
    expect(await signer.verify(scope, token)).toBe(true);
    // Raw query strings are accepted too.
    expect(await signer.verify(scope, { e: String(token.e), s: token.s, k: null })).toBe(true);
  });

  it("enforces expiry: refused at and after the expiry second", async () => {
    const scope = mediaScope.item("photos", "a1");
    const token = await createMediaSigner({ secret: SECRET, now: at(H) }).sign(scope, { ttl: 60 });
    expect(await createMediaSigner({ secret: SECRET, now: at(H + 59) }).verify(scope, token)).toBe(true);
    expect(await createMediaSigner({ secret: SECRET, now: at(H + 60) }).verify(scope, token)).toBe(false);
    expect(await createMediaSigner({ secret: SECRET, now: at(H + 9999) }).verify(scope, token)).toBe(false);
  });

  it("can't be extended: a later expiry with the same signature is refused", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H) });
    const scope = mediaScope.item("photos", "a1");
    const token = await signer.sign(scope, { ttl: "2h" });
    expect(await signer.verify(scope, { ...token, e: token.e + HOUR })).toBe(false);
  });

  it("hour-aligned expiry is the same link all hour, and the next hour's is different", async () => {
    const scope = mediaScope.file("videos", "v1", "web-1080");
    const sign = (t: number) => createMediaSigner({ secret: SECRET, now: at(t) }).sign(scope, { ttl: "2h", align: "hour" });
    const first = await sign(H);
    expect(first.e).toBe(H + 3 * HOUR);
    for (const t of [H + 1, H + 1800, H + 3599]) expect(await sign(t)).toEqual(first);
    const next = await sign(H + HOUR);
    expect(next.e).toBe(H + 4 * HOUR);
    expect(next.s).not.toBe(first.s);
  });

  it("refuses a tampered, truncated, padded or missing signature, and a malformed expiry", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H) });
    const scope = mediaScope.item("photos", "a1");
    const { e, s } = await signer.sign(scope, { ttl: "2h" });
    const flip = (c: string) => (c === "A" ? "B" : "A");
    const tampered = [
      s.slice(0, -1) + flip(s.at(-1)!),
      s.slice(0, 3) + flip(s[3]!) + s.slice(4),
      s.slice(0, -1),
      s + "A",
      s + "=",
      s.replace(/^v1\./, ""),
      s.replace(/^v1\./, "v2."),
      s.replace(/^v1\./, "V1."),
      s.replace(/^v1\./, "v1x."),
      s.replace(/^v1\./, "v01."),
      s.replace(/^v1\./, "v1.."),
      "v1",
      "v1.",
      "",
    ];
    for (const bad of tampered) expect(await signer.verify(scope, { e, s: bad }), bad).toBe(false);
    expect(await signer.verify(scope, { e, s: null })).toBe(false);
    for (const badE of [null, "", "abc", `${e}.0`, `+${e}`, `${e} `, `0${e}`, `00${e}`, "0", "1".repeat(13), -1]) {
      expect(await signer.verify(scope, { e: badE, s }), String(badE)).toBe(false);
    }
  });

  it("refuses a token signed with another secret", async () => {
    const scope = mediaScope.item("photos", "a1");
    const token = await createMediaSigner({ secret: OTHER, now: at(H) }).sign(scope, { ttl: "2h" });
    expect(await createMediaSigner({ secret: SECRET, now: at(H) }).verify(scope, token)).toBe(false);
  });
});

describe("scopes", () => {
  const signer = createMediaSigner({ secret: SECRET, now: at(H) });

  it("a file scope can't be widened to another variant: a poster link never opens the video", async () => {
    const poster = await signer.sign(mediaScope.file("videos", "v1", "poster"), { ttl: "2h" });
    expect(await signer.verify(mediaScope.file("videos", "v1", "poster"), poster)).toBe(true);
    expect(await signer.verify(mediaScope.file("videos", "v1", "web-1080"), poster)).toBe(false);
    expect(await signer.verify(mediaScope.file("videos", "v1", "original"), poster)).toBe(false);
    expect(await signer.verify(mediaScope.item("videos", "v1"), poster)).toBe(false);
    expect(await signer.verify(mediaScope.file("videos", "v2", "poster"), poster)).toBe(false);
  });

  it("binds the download filename into the signature", async () => {
    const token = await signer.sign(mediaScope.download("videos/v1/original.mov", "Final cut.mov"), { ttl: "2h" });
    expect(await signer.verify(mediaScope.download("videos/v1/original.mov", "Final cut.mov"), token)).toBe(true);
    expect(await signer.verify(mediaScope.download("videos/v1/original.mov", "other.mov"), token)).toBe(false);
    expect(await signer.verify(mediaScope.download("videos/v1/web.mp4", "Final cut.mov"), token)).toBe(false);
  });

  it("refuses scope confusion between item, file, download and bundle", async () => {
    const scopes = [
      mediaScope.item("c", "x"),
      mediaScope.file("c", "x", "y"),
      mediaScope.download("c", "x"),
      mediaScope.download("c/x", "y"),
      mediaScope.bundle("c"),
      mediaScope.bundle("c/x"),
      mediaScope.item("c/x", "y"),
      mediaScope.item("c", "x/y"),
      mediaScope.file("c", "x/y", "z"),
      mediaScope.file("c/x", "y", "z"),
    ];
    expect(new Set(scopes).size).toBe(scopes.length);
    for (const signedFor of scopes) {
      const token = await signer.sign(signedFor, { ttl: "2h" });
      for (const other of scopes) expect(await signer.verify(other, token), `${signedFor} -> ${other}`).toBe(other === signedFor);
    }
  });

  it("refuses a scope not made by mediaScope, and empty parts", async () => {
    await expect(signer.sign("item:c/x/extra" as never, { ttl: "2h" })).rejects.toThrow(/mediaScope/);
    // verify never throws: a malformed scope is a refusal, so a handler answers 403, not 500.
    for (const bad of ["anything", "item:a b/c", "item:a/b/c", "ITEM:a/b", "thing:a/b", "item:a/%zz", "download:a/%C3", "download:a/%c3%a9", "item:a/"]) {
      expect(await signer.verify(bad as never, { e: H + 10, s: "v1.x" }), bad).toBe(false);
    }
    expect(() => mediaScope.item("", "x")).toThrow(/collection/);
    expect(() => mediaScope.download("p", "")).toThrow(/filename/);
    expect(() => mediaScope.item("c", "\uD800")).toThrow(TypeError);
  });

  it("signMediaUrl encodes the path and carries e, s, and d for a download", async () => {
    const view = new URL(await signer.signMediaUrl("https://media.example.com/", "photos/a 1/800.jpg", mediaScope.item("photos", "a 1"), { ttl: "2h" }));
    expect(view.pathname).toBe("/photos/a%201/800.jpg");
    expect([...view.searchParams.keys()]).toEqual(["e", "s"]);
    const dl = new URL(await signer.signMediaUrl("https://media.example.com/files", "a/b.jpg", mediaScope.download("a/b.jpg", "Ünïcode \"name\".jpg"), { ttl: "1d" }));
    expect(dl.pathname).toBe("/files/a/b.jpg");
    expect(dl.searchParams.get("d")).toBe("Ünïcode \"name\".jpg");
    expect(await signer.verify(mediaScope.download("a/b.jpg", dl.searchParams.get("d")!), { e: dl.searchParams.get("e"), s: dl.searchParams.get("s") })).toBe(true);
  });
});

describe("key rotation", () => {
  const K1 = "k1-secret-that-is-at-least-32-bytes-long!!";
  const K2 = "k2-secret-that-is-at-least-32-bytes-long!!";
  const scope = mediaScope.item("photos", "a1");

  it("signs with the current key and carries its id", async () => {
    const signer = createMediaSigner({ keys: { current: "k2", secrets: { k1: K1, k2: K2 } }, now: at(H) });
    const token = await signer.sign(scope, { ttl: "2h" });
    expect(token.k).toBe("k2");
    expect(await signer.verify(scope, token)).toBe(true);
    const url = new URL(await signer.signMediaUrl("https://m.example", "p", scope, { ttl: "2h" }));
    expect(url.searchParams.get("k")).toBe("k2");
  });

  it("verifies a link from a retiring key, and from the single-secret form it replaced", async () => {
    const old = await createMediaSigner({ keys: { current: "k1", secrets: { k1: K1 } }, now: at(H) }).sign(scope, { ttl: "2h" });
    const legacy = await createMediaSigner({ secret: K1, now: at(H) }).sign(scope, { ttl: "2h" });
    expect(legacy.k).toBeUndefined();
    const rotated = createMediaSigner({ keys: { current: "k2", secrets: { k1: K1, k2: K2 } }, now: at(H) });
    expect(await rotated.verify(scope, old)).toBe(true);
    expect(await rotated.verify(scope, legacy)).toBe(true);
  });

  it("refuses a retired key, an unknown id, and a token whose key id was swapped", async () => {
    const old = await createMediaSigner({ keys: { current: "k1", secrets: { k1: K1 } }, now: at(H) }).sign(scope, { ttl: "2h" });
    const retired = createMediaSigner({ keys: { current: "k2", secrets: { k2: K2 } }, now: at(H) });
    expect(await retired.verify(scope, old)).toBe(false);
    expect(await retired.verify(scope, { ...old, k: "nope" })).toBe(false);
    const both = createMediaSigner({ keys: { current: "k2", secrets: { k1: K1, k2: K2 } }, now: at(H) });
    const fresh = await both.sign(scope, { ttl: "2h" });
    expect(await both.verify(scope, { ...fresh, k: "k1" })).toBe(false);
    // Dropping the key id doesn't help either: the id is part of what was signed.
    expect(await both.verify(scope, { e: fresh.e, s: fresh.s })).toBe(false);
  });

  it("refuses a bad configuration", () => {
    expect(() => createMediaSigner({ keys: { current: "k3", secrets: { k1: K1 } } })).toThrow(/keys.current/);
    expect(() => createMediaSigner({ keys: { current: "a b", secrets: { "a b": K1 } } })).toThrow(/key id/);
    expect(() => createMediaSigner({ keys: { current: "k1", secrets: { k1: "short" } } })).toThrow(/32 bytes/);
    expect(() => createMediaSigner({ secret: "short" })).toThrow(/32 bytes/);
  });
});

describe("format versions", () => {
  it("a v1 link still verifies after the code adds v2 and signs with it", async () => {
    const scope = mediaScope.file("videos", "v1", "poster");
    const v1Token = await createMediaSigner({ secret: SECRET, now: at(H) }).sign(scope, { ttl: "2h" });
    const withV2 = createMediaSignerWithFormats(
      { secret: SECRET, now: at(H) },
      { ...SIGNATURE_FORMATS, v2: ({ scope, e, k }) => `v2|${k ?? "-"}|${e}|${scope}` },
      "v2",
    );
    const v2Token = await withV2.sign(scope, { ttl: "2h" });
    expect(v2Token.s).toMatch(/^v2\./);
    expect(await withV2.verify(scope, v1Token)).toBe(true);
    expect(await withV2.verify(scope, v2Token)).toBe(true);
    // A v1 signature relabelled v2 is refused: the version picks the message format.
    expect(await withV2.verify(scope, { e: v1Token.e, s: v1Token.s.replace(/^v1\./, "v2.") })).toBe(false);
    // Code that knows only v1 refuses v2 links.
    expect(await createMediaSigner({ secret: SECRET, now: at(H) }).verify(scope, v2Token)).toBe(false);
  });
});

describe("TTL", () => {
  const scope = mediaScope.download("a/b.mov", "b.mov");

  it("accepts one minute to 30 days, per call", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H) });
    expect((await signer.sign(scope, { ttl: 60 })).e).toBe(H + 60);
    expect((await signer.sign(scope, { ttl: "1m" })).e).toBe(H + 60);
    expect((await signer.sign(scope, { ttl: "30d" })).e).toBe(H + MAX_MEDIA_TTL);
    expect((await signer.sign(scope, { ttl: MAX_MEDIA_TTL })).e).toBe(H + MAX_MEDIA_TTL);
    // Aligned, a 30-day link may run to the end of that hour.
    expect((await signer.sign(scope, { ttl: "30d", align: "hour" })).e).toBe(H + MAX_MEDIA_TTL + HOUR);
  });

  it("refuses anything outside the bounds", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H) });
    for (const ttl of [59, "59s", 0, -1, MAX_MEDIA_TTL + 1, "31d", "721h", Number.NaN, Infinity, "2 hours", "2H", "h"] as never[]) {
      await expect(signer.sign(scope, { ttl }), String(ttl)).rejects.toThrow(RangeError);
    }
    expect(() => createMediaSigner({ secret: SECRET, ttl: { download: "40d" } })).toThrow(RangeError);
  });

  it("defaults per scope kind: two hours, or the signer's ttl for that kind", async () => {
    const signer = createMediaSigner({ secret: SECRET, now: at(H), ttl: { download: "7d" }, align: "hour" });
    expect((await signer.sign(mediaScope.item("c", "x"))).e).toBe(H + 3 * HOUR);
    expect((await signer.sign(scope)).e).toBe(H + 7 * 86_400 + HOUR);
    expect((await signer.sign(scope, { ttl: "1h", align: "none" })).e).toBe(H + HOUR);
  });
});

describe("server and edge only", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("refuses to run where there is a document (a page)", () => {
    (globalThis as { document?: unknown }).document = {};
    expect(() => createMediaSigner({ secret: SECRET })).toThrow(/server only/);
  });

  it("isn't exported from the package root, and /signed resolves to nothing for browsers", () => {
    expect("createMediaSigner" in root).toBe(false);
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const signed = pkg.exports["./signed"];
    expect(signed.browser).toBeNull();
    // Every server and edge condition comes before `browser`, so Workers bundlers (which also set it) still resolve.
    const order = Object.keys(signed);
    for (const c of ["workerd", "worker", "edge-light", "node", "deno"]) expect(order.indexOf(c)).toBeLessThan(order.indexOf("browser"));
    expect(Object.keys(pkg.exports).filter((k: string) => k !== "./signed").every((k: string) => !String(JSON.stringify(pkg.exports[k])).includes("signed"))).toBe(true);
  });
});
