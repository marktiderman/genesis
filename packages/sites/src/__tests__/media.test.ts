/** Responsive images on a served page: srcset through the host's builder, and one high-priority image. */
import { describe, expect, it } from "vitest";
import { supabaseImageUrl, type ImageUrlBuilder } from "@marktiderman/genesis-media";
import { handleSiteRequest } from "../web/index";
import { createMemorySiteStore, onePageSite } from "../index";
import { getSection } from "../core/registry";
import "../sections/index";
import { sectionProps } from "./fixtures";

const SB = "https://abc.supabase.co";
const photo = (name: string) => `${SB}/storage/v1/object/public/sites/one/${name}.jpg`;
const get = (path: string) => new Request(`https://hilltop.example${path}`);
const node = (id: string, type: string, variant: string, props: Record<string, unknown>) => ({ id, type, v: getSection(type)!.version, variant, props });

async function page(imageUrl?: ImageUrlBuilder) {
  const store = createMemorySiteStore();
  const t = onePageSite({ name: "Hilltop Collective", message: { headline: "Made on the hill" }, colors: { primary: "#b45309" } });
  const content = [
    node("hero", "hero", "split", { ...sectionProps.hero, image: { src: photo("hero"), alt: "The hall", width: 2000, height: 1500, focal: { x: 25, y: 40 } } }),
    node("features", "features", "alternating", {
      ...sectionProps.features,
      items: [
        { title: "One", body: "First.", image: { src: photo("one"), alt: "One", width: 1200, height: 900 } },
        { title: "Two", body: "Second.", image: { src: photo("two"), alt: "Two", width: 1200, height: 900, phone: { src: photo("two-tall"), width: 600, height: 900, focal: { x: 50, y: 10 } } } },
      ],
    }),
  ];
  await store.createSite({ id: "one", site: t.site, pages: [{ ...t.pages[0]!, doc: { ...t.pages[0]!.doc, content } }] });
  await store.publish("one", { brand: t.brand });
  const res = (await handleSiteRequest(get("/"), { store, brand: { getBrand: () => t.brand }, siteId: "one", ...(imageUrl ? { imageUrl } : {}) }))!;
  expect(res.status).toBe(200);
  const html = await res.text();
  return { html, imgs: html.match(/<img\b[^>]*>/g) ?? [] };
}

describe("responsive images on a page", () => {
  it("serves images at their own URL by default, as before", async () => {
    const { imgs } = await page();
    expect(imgs).toHaveLength(3);
    for (const img of imgs) expect(img).not.toMatch(/srcSet|sizes=/);
    expect(imgs[0]).toContain(`src="${photo("hero")}"`);
  });

  it("builds a srcset and sizes through the host's image URL builder", async () => {
    const { imgs, html } = await page(supabaseImageUrl({ url: SB }));
    const render = `${SB}/storage/v1/render/image/public/sites/one`;
    expect(imgs[0]).toContain(`src="${render}/hero.jpg?width=1280"`);
    expect(imgs[0]).toContain(`${render}/hero.jpg?width=320 320w`);
    expect(imgs[0]).toContain(`${render}/hero.jpg?width=1920 1920w`);
    expect(imgs[0]).not.toContain("2400w");
    expect(imgs[0]).toContain('sizes="(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw"');
    expect(imgs[0]).toContain("object-position:25% 40%");
    // The phone crop is a <picture> source under the phone width, with its own focal point.
    expect(html).toMatch(new RegExp(`<picture class="contents"><source media="\\(max-width: 639px\\)" srcSet="${render}/two-tall.jpg\\?width=320 320w`));
    expect(imgs[2]).toContain("--gs-pos-phone:50% 10%");
    expect(imgs[2]).toContain("data-gs-phone-focal");
  });

  it("gives only the page's first large image priority; the rest load lazily", async () => {
    const { imgs, html } = await page(supabaseImageUrl({ url: SB }));
    expect(imgs[0]).toMatch(/loading="eager"/);
    expect(imgs[0]).toMatch(/fetchPriority="high"/);
    for (const img of imgs.slice(1)) {
      expect(img).toMatch(/loading="lazy"/);
      expect(img).not.toMatch(/fetchPriority/);
    }
    // React preloads the priority image with its srcset, once.
    expect(html.match(/<link rel="preload" as="image"/g)).toHaveLength(1);
    expect(html).toMatch(/<link rel="preload" as="image"[^>]*imageSrcSet="[^"]*hero\.jpg\?width=320 320w/);
  });
});
