/**
 * @feat:sites-renderer
 * A published page loads its fonts, images and scripts from the site itself:
 * self-hosted font files under the assets prefix, no third-party font host
 * in the page or its Content-Security-Policy, the new font choices, and the
 * publish check (and strict mode) for images that load from elsewhere.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FONT_FILES } from "../web/assets.generated";
import { ASSETS_PREFIX, fontFaces, handleSiteRequest } from "../web/index";
import {
  BodyFontChoice,
  checkAssetHosts,
  checkPost,
  checkRelease,
  createMemorySiteStore,
  FONT_CHOICES,
  FontChoice,
  fontFileKey,
  isOwnUrl,
  isPublishable,
  onePageSite,
  PublishBlockedError,
  SELF_HOSTED_FONTS,
  siteTheme,
  TokenOverrides,
  type ReleaseSnapshot,
  type SiteBrand,
} from "../index";
import { createSupabaseSiteStore } from "../supabase/index";
import { postDoc } from "./fixtures";

const ORIGIN = "https://hilltop.example";
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const require = createRequire(import.meta.url);

/** A published one-page site with this brand, an image at `heroSrc`, and the site's image mode. */
async function site(brand: Partial<SiteBrand> = {}, opts: { image?: string; images?: "any" | "own"; assetOrigin?: string } = {}) {
  const t = onePageSite({ name: "Hilltop Fitness", message: { headline: "Fitness on the hill", subhead: "Classes for every level." }, colors: { primary: "#b45309" } });
  const b: SiteBrand = { ...t.brand, ...brand };
  if (opts.image) {
    const page = t.pages[0]!;
    page.doc.content.push({ id: "pics", type: "gallery", v: 1, variant: "grid", props: { heading: "Inside", images: [{ src: opts.image, alt: "The rig" }] } });
  }
  const store = Object.assign(createMemorySiteStore(), opts.assetOrigin ? { assetOrigin: opts.assetOrigin } : {});
  await store.createSite({ id: "one", site: { ...t.site, ...(opts.images ? { images: opts.images } : {}) }, pages: t.pages });
  await store.publish("one", { brand: b, ...(opts.assetOrigin ? { assetOrigins: [opts.assetOrigin] } : {}) });
  return { store, brand: b, options: { store, brand: { getBrand: () => b }, siteId: "one" } };
}

describe("self-hosted fonts", () => {
  it("serves every weight of every choice from the package, as immutable woff2", async () => {
    const { options } = await site();
    for (const [id, font] of Object.entries(SELF_HOSTED_FONTS)) {
      for (const weight of font.weights) {
        const name = FONT_FILES[fontFileKey(id, weight)];
        expect(name, `${id} ${weight}`).toMatch(new RegExp(`^font-${id}-${weight}\\.[0-9a-f]{10}\\.woff2$`));
      }
    }
    const name = FONT_FILES["inter-400"]!;
    const res = (await handleSiteRequest(get(`${ASSETS_PREFIX}/${name}`), options))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("font/woff2");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // The bytes are the package's latin file, unchanged ("wOF2" signature).
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("wOF2");
    const source = readFileSync(require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff2"));
    expect(bytes.byteLength).toBe(source.byteLength);
    expect((await handleSiteRequest(get(`${ASSETS_PREFIX}/font-inter-400.0000000000.woff2`), options))!.status).toBe(404);
  });

  it("declares @font-face rules with swap, preloads the heading font, and names no third party", async () => {
    const { options } = await site({ fonts: { heading: "oswald", body: "barlow" } });
    const res = (await handleSiteRequest(get("/"), options))!;
    const html = await res.text();
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).toContain('@font-face{font-family:"Oswald";font-style:normal;font-weight:700;font-display:swap;');
    expect(html).toContain(`src:url("${ASSETS_PREFIX}/${FONT_FILES["barlow-400"]}") format("woff2")`);
    expect(html).toContain(`<link rel="preload" href="${ASSETS_PREFIX}/${FONT_FILES["oswald-700"]}" as="font" type="font/woff2" crossorigin="anonymous"/>`);
    // Only the heading font is preloaded.
    expect(html.match(/rel="preload"/g)).toHaveLength(1);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("font-src 'self';");
    expect(csp).not.toMatch(/googleapis|gstatic/);
    // The CSP pins the one inline style, font faces included.
    const style = html.match(/<style data-gs-theme="">([\s\S]*?)<\/style>/)![1]!;
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(style))).toString("base64");
    expect(csp).toContain(`style-src 'self' 'sha256-${hash}'`);
  });

  it("serves the fonts under the base path, and loads none with `fonts: false`", async () => {
    const { options } = await site();
    const html = await (await handleSiteRequest(new Request(`${ORIGIN}/site/`), { ...options, basePath: "/site" }))!.text();
    expect(html).toContain(`url("/site${ASSETS_PREFIX}/${FONT_FILES["inter-400"]}")`);
    const none = await (await handleSiteRequest(get("/"), { ...options, fonts: false }))!.text();
    expect(none).not.toContain("@font-face");
    expect(none).not.toContain('rel="preload"');
  });

  it("draws a one-weight display face at every weight, so headings get no faux bold", () => {
    const theme = siteTheme({ name: "A", colors: { primary: "#1d4ed8" }, fonts: { heading: "bebas-neue", body: "inter" } });
    const { css, preload } = fontFaces(theme, (key) => `/f/${key}.woff2`);
    expect(css).toContain('font-family:"Bebas Neue";font-style:normal;font-weight:100 900;');
    expect(preload).toEqual(["/f/bebas-neue-400.woff2"]);
    expect(fontFaces(theme, undefined)).toEqual({ css: "", preload: [] });
  });

  it("offers fonts gym and studio sites use, and keeps a one-weight face out of body text", () => {
    for (const id of ["barlow", "barlow-condensed", "oswald", "roboto-condensed", "bebas-neue"] as const) {
      expect(FontChoice.options).toContain(id);
      expect(FONT_CHOICES[id].family).toBeTruthy();
    }
    expect(FONT_CHOICES["bebas-neue"].headingOnly).toBe(true);
    expect(BodyFontChoice.options).not.toContain("bebas-neue");
    expect(TokenOverrides.safeParse({ headingFont: "bebas-neue" }).success).toBe(true);
    expect(TokenOverrides.safeParse({ bodyFont: "bebas-neue" }).success).toBe(false);
    // A brand that asks for it anyway gets Inter for its body text.
    const theme = siteTheme({ name: "A", colors: { primary: "#1d4ed8" }, fonts: { heading: "oswald", body: "bebas-neue" as never } });
    expect(theme.light["--font-sans"]).toBe(FONT_CHOICES.inter.stack);
    expect(theme.headingFont?.id).toBe("oswald");
    // Every served choice lists weights the package ships, and none loads from a third party.
    for (const info of Object.values(FONT_CHOICES)) expect(JSON.stringify(info)).not.toMatch(/google/i);
  });
});

describe("images from elsewhere", () => {
  it("knows the site's own URLs: its paths and the store's asset origin", () => {
    expect(isOwnUrl("/images/rig.jpg")).toBe(true);
    expect(isOwnUrl("//cdn.example/rig.jpg")).toBe(false);
    expect(isOwnUrl("https://cdn.example/rig.jpg")).toBe(false);
    expect(isOwnUrl("https://project.supabase.example/storage/v1/object/public/site-assets/x.jpg", ["https://project.supabase.example"])).toBe(true);
    expect(isOwnUrl("https://project.supabase.example.evil.example/x.jpg", ["https://project.supabase.example"])).toBe(false);
  });

  it("warns by default, and the page's images may load from any https host", async () => {
    const { store, options } = await site({}, { image: "https://old-site.example/rig.jpg" });
    const snapshot = (await store.getLive("one"))!.snapshot as ReleaseSnapshot;
    const issues = checkRelease(snapshot);
    const host = issues.filter((i) => i.code === "asset-host");
    expect(host).toHaveLength(1);
    expect(host[0]).toMatchObject({ severity: "warning", sectionId: "pics", path: "/" });
    expect(host[0]!.message).toContain("old-site.example");
    expect(host[0]!.message).toContain("importAssets");
    expect(isPublishable(issues)).toBe(true);
    const csp = (await handleSiteRequest(get("/"), options))!.headers.get("content-security-policy")!;
    expect(csp).toContain("img-src 'self' https: data:;");
  });

  it("blocks the publish on a site that serves only its own files", async () => {
    const blocked = await site({}, { image: "https://old-site.example/rig.jpg", images: "own" }).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(PublishBlockedError);
    expect((blocked as PublishBlockedError).issues.filter((i) => i.severity === "error").map((i) => i.code)).toEqual(["asset-host"]);
    await expect(site({ logo: { src: "https://old-site.example/logo.png", alt: "Hilltop" } }, { images: "own" })).rejects.toThrow(/logo loads from old-site\.example/);
  });

  it("allows the store's asset origin in strict mode, and pins the page's images to it", async () => {
    const assetOrigin = "https://project.supabase.example";
    const { options } = await site({}, { image: `${assetOrigin}/storage/v1/object/public/site-assets/rig.jpg`, images: "own", assetOrigin });
    const csp = (await handleSiteRequest(get("/"), options))!.headers.get("content-security-policy")!;
    expect(csp).toContain(`img-src 'self' data: ${assetOrigin};`);
    const local = await site({}, { image: "/images/rig.jpg", images: "own" });
    expect((await handleSiteRequest(get("/"), local.options))!.headers.get("content-security-policy")).toContain("img-src 'self' data:;");
  });

  it("names the Supabase store's storage origin as its asset origin, without a request", () => {
    const client = {
      schema: () => ({}),
      storage: { from: (bucket: string) => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://project.supabase.example/storage/v1/object/public/${bucket}/${path}` } }) }) },
    };
    expect(createSupabaseSiteStore(client as never).assetOrigin).toBe("https://project.supabase.example");
  });

  it("checks the header and footer, files to download, and posts", async () => {
    const { store } = await site();
    const snapshot = (await store.getLive("one"))!.snapshot as ReleaseSnapshot;
    const withFile: ReleaseSnapshot = {
      ...snapshot,
      site: { ...snapshot.site, images: "own", footer: [...snapshot.site.footer, { id: "dl", type: "file", v: 1, variant: "list", props: { heading: "Downloads", files: [{ label: "Prices", file: { src: "https://files.example/prices.pdf", mime: "application/pdf" } }] } }] },
    };
    const issues = checkAssetHosts(withFile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", sectionId: "dl" });
    expect(issues[0]!.message).toMatch(/^the site footer: a file in the/);
    const post = postDoc("Hello", { cover: { src: "https://old-site.example/cover.jpg", alt: "A cover" } } as never);
    expect(checkPost("hello", post).find((i) => i.code === "asset-host")?.severity).toBe("warning");
    expect(isPublishable(checkPost("hello", post, { images: "own" }))).toBe(false);
    expect(checkPost("hello", post, { images: "own", assetOrigins: ["https://old-site.example"] }).some((i) => i.code === "asset-host")).toBe(false);
  });
});
