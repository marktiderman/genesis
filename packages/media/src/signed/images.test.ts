// @feat:media-private-r2-urls
import { describe, expect, it } from "vitest";
import { responsiveImage } from "../image";
import {
  createMediaSigner,
  createMemoryStorage,
  createSignedImageUrls,
  createSignedMediaHandler,
  finishSizes,
  mediaScope,
  mediaSrc,
  parseSignedImagePath,
  type ImageDerivative,
} from "./index";

const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const HOUR = 3600;
const H = Math.floor(1_800_000_000 / HOUR) * HOUR;
const BASE = "https://media.example.com";
const signerAt = (t: number) => createMediaSigner({ secret: SECRET, now: () => t });

const derivatives: ImageDerivative[] = [...finishSizes("color", [800, 2400]), { name: "poster", width: 1920 }];
const A1 = mediaSrc("photos", "a1");
const A2 = mediaSrc("photos", "a2");

/** The handler side: the derivative path back to its key and its file scope, declared derivatives only. */
const names = new Set(derivatives.map((d) => d.name));
function handlerAt(t: number) {
  const objects: Record<string, { body: string; contentType: string }> = {};
  for (const id of ["a1", "a2"]) for (const d of derivatives) objects[`media/photos/${id}/${d.name}.jpg`] = { body: `${id}:${d.name}`, contentType: "image/jpeg" };
  objects["media/photos/a1/original.jpg"] = { body: "a1:original", contentType: "image/jpeg" };
  return createSignedMediaHandler({
    storage: createMemoryStorage(objects),
    signer: signerAt(t),
    now: () => t,
    route: (path) => {
      const p = parseSignedImagePath(path);
      if (!p || !names.has(p.derivative)) return undefined;
      return { key: `media/${path}.jpg`, scope: mediaScope.file(p.collection, p.id, p.derivative) };
    },
  });
}

describe("createSignedImageUrls", () => {
  it("maps each srcset width to the smallest derivative at least that wide, else the widest", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), { base: BASE, derivatives, items: [A1] });
    expect(imageUrl.widths).toEqual([800, 1920, 2400]);
    const derivativeOf = (width?: number) => new URL(imageUrl(A1, width === undefined ? {} : { width })!).pathname;
    expect(derivativeOf(320)).toBe("/photos/a1/color/800");
    expect(derivativeOf(800)).toBe("/photos/a1/color/800");
    expect(derivativeOf(801)).toBe("/photos/a1/poster");
    expect(derivativeOf(1920)).toBe("/photos/a1/poster");
    expect(derivativeOf(2000)).toBe("/photos/a1/color/2400");
    expect(derivativeOf(4000)).toBe("/photos/a1/color/2400");
    expect(derivativeOf()).toBe("/photos/a1/color/2400");
  });

  it("gives responsiveImage a srcset whose widths are the derivatives' own", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), { base: BASE, derivatives: finishSizes("bw", [800, 2400]), items: [A1] });
    const img = responsiveImage({ src: A1, alt: "A photo", width: 6000, height: 4000 }, { imageUrl, widths: imageUrl.widths, sizes: "100vw" });
    const entries = img.srcset!.split(", ").map((e) => {
      const [url, w] = e.split(" ");
      return [new URL(url!).pathname, w];
    });
    expect(entries).toEqual([
      ["/photos/a1/bw/800", "800w"],
      ["/photos/a1/bw/2400", "2400w"],
    ]);
    expect(new URL(img.src).pathname).toBe("/photos/a1/bw/800");
    expect(img.sizes).toBe("100vw");
  });

  it("serves only the items it was given: any other src stays at its own URL", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), { base: BASE, derivatives, items: [A1] });
    expect(imageUrl(A2, { width: 800 })).toBeNull();
    expect(imageUrl("https://elsewhere.example/x.jpg", { width: 800 })).toBeNull();
    const img = responsiveImage({ src: A2, alt: "" }, { imageUrl, widths: imageUrl.widths });
    expect(img.src).toBe(A2);
    expect(img.srcset).toBeUndefined();
  });

  it("signs links the media handler serves, each derivative from its own file", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), { base: BASE, derivatives, items: [A1, A2] });
    const handle = handlerAt(H + 60);
    for (const [src, width, body] of [
      [A1, 800, "a1:color/800"],
      [A1, 1920, "a1:poster"],
      [A2, 2400, "a2:color/2400"],
    ] as const) {
      const res = await handle(new Request(imageUrl(src, { width })!));
      expect(res.status, body).toBe(200);
      expect(await res.text()).toBe(body);
      expect(res.headers.get("content-disposition")).toBeNull();
    }
  });

  it("a link for one derivative can't open another, another item's, or the original", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), { base: BASE, derivatives, items: [A1] });
    const handle = handlerAt(H + 60);
    const small = new URL(imageUrl(A1, { width: 800 })!);
    for (const pathname of ["/photos/a1/color/2400", "/photos/a1/poster", "/photos/a2/color/800", "/photos/a1/original"]) {
      const swapped = new URL(small);
      swapped.pathname = pathname;
      expect((await handle(new Request(swapped))).status, pathname).toBe(403);
    }
  });

  it("is hour-aligned by default: the same URLs all hour, new ones the next hour", async () => {
    const at = async (t: number) => (await createSignedImageUrls(signerAt(t), { base: BASE, derivatives, items: [A1] }))(A1, { width: 800 });
    const first = await at(H);
    for (const t of [H + 1, H + 1800, H + HOUR - 1]) expect(await at(t)).toBe(first);
    expect(await at(H + HOUR)).not.toBe(first);
    expect(new URL(first!).searchParams.get("e")).toBe(String(H + 3 * HOUR)); // the default two hours, to the end of that hour
    // The links still work late in their life, and stop when it ends.
    expect((await handlerAt(H + 3 * HOUR - 1)(new Request(first!))).status).toBe(200);
    expect((await handlerAt(H + 3 * HOUR)(new Request(first!))).status).toBe(403);
  });

  it("takes signing options and a path of the app's own", async () => {
    const imageUrl = await createSignedImageUrls(signerAt(H), {
      base: `${BASE}/m/`,
      derivatives,
      items: [A1],
      sign: { ttl: "10m", align: "none" },
      path: (item, d) => `${item.collection}-${item.id}/${d}`,
    });
    const url = new URL(imageUrl(A1, { width: 800 })!);
    expect(url.pathname).toBe("/m/photos-a1/color/800");
    expect(url.searchParams.get("e")).toBe(String(H + 600));
  });

  it("refuses bad derivatives and items", async () => {
    const signer = signerAt(H);
    const make = (d: ImageDerivative[], items: string[] = [A1]) => createSignedImageUrls(signer, { base: BASE, derivatives: d, items });
    await expect(make([])).rejects.toThrow(/at least one/);
    for (const name of ["Color/800", "color//800", "../x", "color/800/", "a b", ""]) await expect(make([{ name, width: 800 }]), name).rejects.toThrow(TypeError);
    await expect(make([{ name: "poster", width: 0 }])).rejects.toThrow(/width/);
    await expect(make([{ name: "poster", width: 10 }, { name: "poster", width: 20 }])).rejects.toThrow(/twice/);
    await expect(make(derivatives, ["photos"])).rejects.toThrow(/mediaSrc/);
    await expect(make(derivatives, ["photos/a1/x"])).rejects.toThrow(/mediaSrc/);
    expect(() => mediaSrc("photos", "a/1")).toThrow(TypeError);
    expect(() => mediaSrc("photos", "..")).toThrow(TypeError);
  });
});

describe("parseSignedImagePath", () => {
  it("reads the default path back, and nothing else", () => {
    expect(parseSignedImagePath("photos/a1/color/800")).toEqual({ collection: "photos", id: "a1", derivative: "color/800" });
    expect(parseSignedImagePath("photos/a1/poster")).toEqual({ collection: "photos", id: "a1", derivative: "poster" });
    for (const bad of ["photos/a1", "photos", "photos/a1/Color/800", "photos/a1/x y", "photos/../poster"]) expect(parseSignedImagePath(bad), bad).toBeUndefined();
  });
});
