import { describe, expect, it } from "vitest";
import { isSafePlaceholder, passThroughImageUrl, responsiveImage, srcsetWidths, supabaseImageUrl, type ImageUrlBuilder } from "./index";

const SB = "https://abc.supabase.co";
const supabase = supabaseImageUrl({ url: SB });
const photo = `${SB}/storage/v1/object/public/sites/s1/hero.jpg`;

describe("supabaseImageUrl", () => {
  it("serves a public object through the render endpoint", () => {
    expect(supabase(photo, { width: 640, quality: 70 })).toBe(`${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=640&quality=70`);
  });
  it("clamps to Supabase's limits and keeps the file's format only on request", () => {
    expect(supabase(photo, { width: 4000, quality: 5, format: "origin" })).toBe(`${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=2500&quality=20&format=origin`);
    expect(supabase(photo, { width: 640, format: "avif" })).toBe(`${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=640`);
  });
  it("leaves other hosts, private buckets, queries and site paths alone", () => {
    expect(supabase("https://cdn.example/hero.jpg", { width: 640 })).toBeNull();
    expect(supabase(`${SB}/storage/v1/object/sign/sites/hero.jpg?token=x`, { width: 640 })).toBeNull();
    expect(supabase(`${photo}?v=2`, { width: 640 })).toBeNull();
    expect(supabase("/images/hero.jpg", { width: 640 })).toBeNull();
  });
  it("refuses a project URL that isn't one", () => {
    expect(() => supabaseImageUrl({ url: "nope" })).toThrow(/isn't a URL/);
  });
});

describe("responsiveImage", () => {
  it("is the plain image with pass-through: no srcset, no sizes, lazy", () => {
    const img = responsiveImage({ src: photo, alt: "A coach", width: 1600, height: 900 }, { sizes: "100vw" });
    expect(img).toEqual({ src: photo, width: 1600, height: 900, alt: "A coach", loading: "lazy", decoding: "async" });
    expect(passThroughImageUrl(photo, { width: 320 })).toBeNull();
  });

  it("offers a srcset up to the file's own width, with sizes and a mid-size src", () => {
    const img = responsiveImage({ src: photo, alt: "", width: 1000, height: 500 }, { imageUrl: supabase, sizes: "(min-width: 768px) 50vw, 100vw" });
    const widths = img.srcset!.split(", ").map((e) => e.split(" ")[1]);
    expect(widths).toEqual(["320w", "480w", "640w", "768w", "960w", "1000w"]);
    expect(img.src).toBe(`${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=1000`);
    expect(img.sizes).toBe("(min-width: 768px) 50vw, 100vw");
  });

  it("takes its own widths, and every one when the file's width is unknown", () => {
    const img = responsiveImage({ src: photo }, { imageUrl: supabase, widths: [800, 400, 400] });
    expect(img.srcset).toBe(`${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=400 400w, ${SB}/storage/v1/render/image/public/sites/s1/hero.jpg?width=800 800w`);
    expect(srcsetWidths(500, [320, 640, 1280])).toEqual([320, 500]);
    expect(srcsetWidths(320, [320, 640])).toEqual([320]);
  });

  it("offers a builder's fixed widths only, never the file's own width between them", () => {
    expect(srcsetWidths(1000, [800, 1600, 2400], { fixed: true })).toEqual([800]);
    expect(srcsetWidths(500, [800, 1600], { fixed: true })).toEqual([800]);
    expect(srcsetWidths(undefined, [1600, 800], { fixed: true })).toEqual([800, 1600]);
    const fixed: ImageUrlBuilder = Object.assign((src: string, o: { width?: number }) => `${src}?f=${o.width}`, { widths: [800, 1600] });
    const img = responsiveImage({ src: "/a.jpg", width: 1200 }, { imageUrl: fixed, widths: [320, 1200] });
    expect(img.srcset).toBe("/a.jpg?f=800 800w");
  });

  it("keeps the image's own URL when the builder can't serve it", () => {
    const img = responsiveImage({ src: "https://cdn.example/a.jpg", width: 2000 }, { imageUrl: supabase, sizes: "100vw" });
    expect(img.srcset).toBeUndefined();
    expect(img.sizes).toBeUndefined();
    expect(img.src).toBe("https://cdn.example/a.jpg");
  });

  it("loads a priority image at once and at high priority, an eager one at once only", () => {
    expect(responsiveImage({ src: photo }, { priority: true })).toMatchObject({ loading: "eager", fetchpriority: "high", decoding: "sync" });
    const eager = responsiveImage({ src: photo }, { eager: true });
    expect(eager).toMatchObject({ loading: "eager", decoding: "async" });
    expect(eager.fetchpriority).toBeUndefined();
  });

  it("gives decorative images an empty alt, and the focal point as object-position", () => {
    const img = responsiveImage({ src: photo, alt: "ignored", decorative: true, focal: { x: 30, y: 120 } });
    expect(img.alt).toBe("");
    expect(img.objectPosition).toBe("30% 100%");
  });

  it("adds the phone crop as a source, with its own focal point or the image's", () => {
    const url: ImageUrlBuilder = (src, o) => `${src}?w=${o.width}`;
    const img = responsiveImage({ src: photo, width: 640, focal: { x: 10, y: 20 }, phone: { src: `${SB}/storage/v1/object/public/sites/s1/tall.jpg`, width: 480 } }, { imageUrl: url, sizes: "100vw" });
    expect(img.phone).toMatchObject({ media: "(max-width: 639px)", sizes: "100vw", objectPosition: "10% 20%", width: 480 });
    expect(img.phone!.srcset).toContain("tall.jpg?w=480 480w");
  });

  it("keeps only a small base64 image as a placeholder", () => {
    const ok = "data:image/webp;base64,UklGRhIAAABXRUJQ";
    expect(responsiveImage({ src: photo, placeholder: ok }).placeholder).toBe(ok);
    expect(isSafePlaceholder("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafePlaceholder("data:image/png;base64,AAAA');background:url(https://x.example)")).toBe(false);
    expect(isSafePlaceholder(`data:image/png;base64,${"A".repeat(5000)}`)).toBe(false);
    expect(responsiveImage({ src: photo, placeholder: "https://x.example/p.png" }).placeholder).toBeUndefined();
  });
});
