/**
 * @feat:genesis-sites @feat:sites-landing
 * SEO outputs (meta, sitemap, robots, JSON-LD, redirects) and the publish
 * checks (accessibility, contrast, content).
 */
import { describe, expect, it } from "vitest";
import "../sections/index";
import {
  ReleaseSnapshot,
  breadcrumbJsonLd,
  checkContrast,
  checkHtmlOutline,
  checkRelease,
  contrastRatio,
  hexToHslTriplet,
  isPublishable,
  landingPage,
  matchRedirect,
  onePageSite,
  organizationJsonLd,
  pageMeta,
  redirectsAfterMove,
  robotsTxt,
  safeJsonForHtml,
  siteTheme,
  sitemapXml,
  starterSite,
  themeCss,
  toCanonicalBrand,
  websiteJsonLd,
  type ReleasePage,
} from "../index";
import { brand, sectionProps } from "./fixtures";

const ORIGIN = "https://riverside.example";

function snapshotOf(t: { site: unknown; pages: { path: string; kind: string; doc: unknown }[] }) {
  return ReleaseSnapshot.parse({ schemaVersion: 1, site: t.site, pages: t.pages.map((p, i) => ({ id: `p${i}`, ...p })) });
}

describe("meta tags", () => {
  const snap = snapshotOf(starterSite({ brand, message: { headline: "Come and see us", subhead: "Small groups by the river." } }));
  const about = snap.pages.find((p) => p.path === "/about")!;

  it("titles every page with the site's template, unless the page has an SEO title of its own", () => {
    expect(pageMeta({ site: snap.site, page: about, origin: ORIGIN }).title).toBe("About · Riverside Works");
    expect(pageMeta({ site: snap.site, page: snap.pages[0]!, origin: ORIGIN }).title).toBe("Home · Riverside Works");
    const own = { ...about, doc: { ...about.doc, seo: { title: "Our story, since 2014" } } };
    expect(pageMeta({ site: snap.site, page: own, origin: ORIGIN }).title).toBe("Our story, since 2014");
  });

  it("gives canonical, robots, Open Graph and Twitter values from the primary origin", () => {
    const meta = pageMeta({ site: snap.site, page: about, origin: ORIGIN, basePath: "/site" });
    expect(meta.canonical).toBe("https://riverside.example/site/about");
    expect(meta.robots).toBe("index, follow");
    expect(meta.openGraph).toMatchObject({ "og:url": meta.canonical, "og:site_name": "Riverside Works", "og:type": "website" });
    expect(meta.twitter["twitter:card"]).toBe("summary");
  });

  it("uses the og image (absolute) and the large card when there is one", () => {
    const page: ReleasePage = { ...about, doc: { ...about.doc, seo: { ogImage: { src: "/og.png", alt: "The studio", width: 1200, height: 630 } } } };
    const meta = pageMeta({ site: snap.site, page, origin: ORIGIN });
    expect(meta.openGraph["og:image"]).toBe("https://riverside.example/og.png");
    expect(meta.openGraph["og:image:alt"]).toBe("The studio");
    expect(meta.twitter["twitter:card"]).toBe("summary_large_image");
  });

  it("is noindex in preview, on a noindex page and on a noindex site", () => {
    expect(pageMeta({ site: snap.site, page: about, origin: ORIGIN, preview: true }).robots).toBe("noindex, nofollow");
    expect(pageMeta({ site: snap.site, page: { ...about, doc: { ...about.doc, seo: { noindex: true } } }, origin: ORIGIN }).robots).toBe("noindex, nofollow");
    expect(pageMeta({ site: { ...snap.site, seo: { ...snap.site.seo, noindex: true } }, page: about, origin: ORIGIN }).robots).toBe("noindex, nofollow");
  });
});

describe("sitemap.xml and robots.txt", () => {
  const snap = snapshotOf(starterSite({ brand, message: { headline: "Come and see us" } }));

  it("lists every indexable page, home first, with lastmod", () => {
    const pages = snap.pages.map((p) => (p.path === "/contact" ? { ...p, doc: { ...p.doc, seo: { noindex: true } } } : p));
    const xml = sitemapXml({ site: snap.site, pages, origin: ORIGIN, lastModified: "2026-10-24T12:00:00Z" });
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        "<url><loc>https://riverside.example/</loc><lastmod>2026-10-24T12:00:00.000Z</lastmod></url>" +
        "<url><loc>https://riverside.example/about</loc><lastmod>2026-10-24T12:00:00.000Z</lastmod></url>" +
        "</urlset>\n",
    );
  });

  it("is empty for a noindex site", () => {
    expect(sitemapXml({ site: { ...snap.site, seo: { ...snap.site.seo, noindex: true } }, pages: snap.pages, origin: ORIGIN })).not.toContain("<url>");
  });

  it("points robots at the sitemap, or disallows everything", () => {
    expect(robotsTxt({ origin: ORIGIN })).toBe("User-agent: *\nAllow: /\n\nSitemap: https://riverside.example/sitemap.xml\n");
    expect(robotsTxt({ origin: ORIGIN, disallowAll: true })).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("JSON-LD", () => {
  const snap = snapshotOf(starterSite({ brand, message: { headline: "Come and see us" } }));

  it("describes the Organization and WebSite", () => {
    expect(organizationJsonLd(snap.site, ORIGIN)).toEqual({ "@context": "https://schema.org", "@type": "Organization", name: "Riverside Works", url: "https://riverside.example/" });
    expect(websiteJsonLd(snap.site, ORIGIN)).toMatchObject({ "@type": "WebSite", name: "Riverside Works", inLanguage: "en" });
  });

  it("builds a BreadcrumbList through ancestor pages", () => {
    const pages = [...snap.pages, { id: "x", path: "/about/team", kind: "page" as const, doc: { ...snap.pages[1]!.doc, root: { props: { title: "Team" } } } }];
    const crumbs = breadcrumbJsonLd(pages, pages[3]!, ORIGIN) as { itemListElement: { name: string; position: number }[] };
    expect(crumbs.itemListElement.map((i) => [i.position, i.name])).toEqual([[1, "Home"], [2, "About"], [3, "Team"]]);
    expect(breadcrumbJsonLd(pages, pages[0]!, ORIGIN)).toBeNull();
  });

  it("can't be broken out of: </script>, <!-- and line separators are escaped", () => {
    const json = safeJsonForHtml({ name: "</script><script>alert(1)</script><!--", x: "a\u2028b&" });
    expect(json).not.toMatch(/<|>|&|\u2028/);
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script><!--", x: "a\u2028b&" });
  });
});

describe("redirects on a page move", () => {
  it("redirects the old path, without chains, and undoes itself on a move back", () => {
    let r = redirectsAfterMove([], "/about", "/our-story");
    expect(r).toEqual([{ from: "/about", to: "/our-story", status: 301 }]);
    r = redirectsAfterMove(r, "/our-story", "/story");
    expect(r).toEqual([
      { from: "/about", to: "/story", status: 301 },
      { from: "/our-story", to: "/story", status: 301 },
    ]);
    r = redirectsAfterMove(r, "/story", "/about");
    expect(r).toEqual([
      { from: "/our-story", to: "/about", status: 301 },
      { from: "/story", to: "/about", status: 301 },
    ]);
    expect(matchRedirect(r, "/story")!.to).toBe("/about");
    expect(matchRedirect(r, "/about")).toBeUndefined();
  });
});

describe("the theme", () => {
  it("maps the minimal brand onto themeFromBrand and genesis-ui's roles", () => {
    const canonical = toCanonicalBrand(brand);
    expect(canonical.accent).toEqual({ DEFAULT: "#0f766e", light: "#0f766e", dark: "#2dd4bf" });
    expect(canonical.typography?.fontFamily?.display?.[0]).toBe('"Space Grotesk"');
    const theme = siteTheme(brand);
    expect(theme.light["--color-accent"]).toBe("#0f766e");
    expect(theme.light["--primary"]).toBe(hexToHslTriplet("#0f766e"));
    expect(theme.light["--font-display"]).toContain("Space Grotesk");
    expect(theme.fonts.map((f) => f.label).sort()).toEqual(["Inter", "Space Grotesk"]);
    expect(theme.brandHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("picks the text on the primary for contrast, whatever the primary", () => {
    for (const primary of ["#ffeb3b", "#0f766e", "#3b82f6", "#777777", "#ff5500", "#000000"]) {
      expect(checkContrast(siteTheme({ name: "x", colors: { primary } })).filter((i) => i.severity === "error"), primary).toEqual([]);
    }
  });

  it("warns, without blocking, when the primary is under 3:1 on the page as a border or marker", () => {
    const light = checkContrast(siteTheme({ name: "x", colors: { primary: "#ffeb3b" } }));
    expect(light).toHaveLength(1);
    expect(light[0]).toMatchObject({ severity: "warning", code: "contrast" });
    expect(light[0]!.message).toContain("the primary colour as a border or marker on the page");
    expect(light[0]!.message).toContain("needs 3:1");
    expect(isPublishable(light)).toBe(true);
    expect(checkContrast(siteTheme({ name: "x", colors: { primary: "#0f766e" } }))).toEqual([]);
  });

  it("prints only variables, with nothing that could close the style element", () => {
    const theme = siteTheme(brand);
    theme.light["--evil"] = "red;}</style><script>alert(1)</script>";
    const css = themeCss(theme);
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("<");
    expect(themeCss(siteTheme(brand, { colorScheme: "auto" }))).toContain("@media (prefers-color-scheme: dark)");
  });

  it("refuses a colour that isn't hex", () => {
    expect(() => siteTheme({ name: "x", colors: { primary: "red;}" } })).toThrow(/not a #rgb/);
  });
});

describe("publish checks", () => {
  const snapLanding = () => snapshotOf(landingPage({ brand, message: { headline: "Come and see us", subhead: "By the river." }, form: { slug: "free-class" } }));

  it("refuses the template's placeholder quotes until they are replaced or hidden", () => {
    const snap = snapLanding();
    const issues = checkRelease(snap);
    expect(issues.filter((i) => i.code === "placeholder").map((i) => i.sectionId)).toEqual(["features", "testimonials"]);
    expect(isPublishable(issues)).toBe(false);
    snap.pages[0]!.doc.content = snap.pages[0]!.doc.content.map((n) => (n.placeholder ? { ...n, hidden: true } : n));
    expect(isPublishable(checkRelease(snap))).toBe(true);
  });

  it("refuses an image without alt text unless it is decorative", () => {
    const snap = snapLanding();
    snap.pages[0]!.doc.content = [{ id: "g", type: "gallery", v: 1, props: { images: [{ src: "/a.jpg", alt: "" }, { src: "/b.jpg", alt: "", decorative: true }] } }];
    const issues = checkRelease(snap).filter((i) => i.code === "image-alt");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("images.0");
  });

  it("refuses skipped heading levels and an h1 in rich text", () => {
    const snap = snapLanding();
    const body = (levels: number[]) => ({ type: "doc", content: levels.map((level) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: "H" }] })) });
    snap.pages[0]!.doc.content = [
      { id: "a", type: "rich-text", v: 1, props: { body: body([2, 4]) } },
      { id: "b", type: "rich-text", v: 1, props: { body: body([1]) } },
      { id: "c", type: "rich-text", v: 1, props: { body: body([2, 3, 3, 2]) } },
    ];
    const codes = checkRelease(snap).filter((i) => i.code.startsWith("heading")).map((i) => `${i.sectionId}:${i.code}`);
    expect(codes).toEqual(["a:heading-order", "b:heading-h1"]);
  });

  it("refuses a second hero, a header section in the page, an unknown section and a page with no home", () => {
    const snap = snapLanding();
    const hero = snap.pages[0]!.doc.content[0]!;
    snap.pages[0]!.doc.content = [hero, { ...hero, id: "hero2" }, { id: "n", type: "nav", v: 1, props: {} }, { id: "u", type: "mystery", v: 1, props: {} }];
    snap.pages[0]!.path = "/home";
    const codes = new Set(checkRelease(snap).map((i) => i.code));
    for (const code of ["limit", "placement", "unknown-section", "no-home"]) expect(codes.has(code), code).toBe(true);
  });

  it("refuses reserved paths and redirects from them", () => {
    const snap = snapLanding();
    snap.pages.push({ ...snap.pages[0]!, id: "api", path: "/api" });
    snap.site.redirects.push({ from: "/auth", to: "/", status: 301 });
    const codes = checkRelease(snap).map((i) => i.code);
    expect(codes).toContain("path");
    expect(codes).toContain("redirect-reserved");
  });

  it("refuses brand colours below 4.5:1, naming the pair", () => {
    const theme = siteTheme({ ...toCanonicalBrand(brand), text: { DEFAULT: "#bbbbbb", light: "#bbbbbb", dark: "#fafafa" } });
    const issues = checkContrast(theme);
    expect(issues.some((i) => i.message.includes("body text on the page"))).toBe(true);
    expect(contrastRatio("#bbbbbb", "#ffffff")).toBeLessThan(4.5);
  });

  it("warns, but doesn't block, for a page with no hero or no description", () => {
    const snap = snapshotOf(onePageSite({ name: "Hilltop Collective", message: { headline: "Made on the hill" }, colors: { primary: "#b45309" } }));
    snap.pages[0]!.doc.content = [{ id: "t", type: "stats", v: 1, props: sectionProps.stats! }];
    const issues = checkRelease(snap);
    expect(issues.filter((i) => i.severity === "warning").map((i) => i.code).sort()).toEqual(["no-h1", "seo-description"]);
    expect(isPublishable(issues)).toBe(true);
  });

  it("audits a rendered outline: one h1, no skipped level, alt on every image", () => {
    expect(checkHtmlOutline("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><img alt=\"\" src=x>")).toEqual([]);
    expect(checkHtmlOutline("<h1>a</h1><h1>b</h1>").map((i) => i.code)).toEqual(["h1-count"]);
    expect(checkHtmlOutline("<h1>a</h1><h3>b</h3><img src=x>").map((i) => i.code)).toEqual(["heading-order", "image-alt"]);
  });
});

describe("templates", () => {
  it("makes a one-click landing page: nav, hero, features, testimonials, CTA, form and footer", () => {
    const t = landingPage({ brand, message: { headline: "Come and see us", benefits: [{ title: "A", body: "B" }] }, form: { slug: "free-class" } });
    expect(t.site.header!.map((n) => n.type)).toEqual(["nav"]);
    expect(t.pages[0]!.doc.content.map((n) => n.type)).toEqual(["hero", "features", "testimonials", "cta", "form-embed"]);
    expect(t.site.footer!.map((n) => n.type)).toEqual(["footer"]);
    expect(t.pages[0]!.doc.content.find((n) => n.type === "features")!.placeholder).toBeUndefined();
  });

  it("seeds a one-page site from a name, logo, message and brand colours and fonts", () => {
    const t = onePageSite({ name: "Hilltop Collective", logo: { src: "/logo.png" }, message: { headline: "Made on the hill" }, colors: { primary: "#b45309", primaryDark: "#fbbf24" }, fonts: { heading: "lora", body: "work-sans" }, contact: { email: "hi@hilltop.example" } });
    expect(t.brand).toEqual({ name: "Hilltop Collective", colors: { primary: "#b45309", primaryDark: "#fbbf24" }, fonts: { heading: "lora", body: "work-sans" }, logo: { src: "/logo.png" } });
    const snap = snapshotOf(t);
    expect(isPublishable(checkRelease(snap, { theme: siteTheme(t.brand) }))).toBe(true);
  });

  it("makes a three-page starter site", () => {
    const t = starterSite({ brand, message: { headline: "Come and see us" } });
    expect(t.pages.map((p) => p.path)).toEqual(["/", "/about", "/contact"]);
    expect(t.site.nav!.map((n) => n.href)).toEqual(["/", "/about", "/contact"]);
  });
});

describe("redirect checks", () => {
  it("refuses a redirect from a page's own path, and warns about one to a path with no page", () => {
    const snap = snapshotOf(starterSite({ brand, message: { headline: "Come and see us" } }));
    const site = { ...snap.site, redirects: [{ from: "/about", to: "/contact", status: 301 as const }, { from: "/team", to: "/gone", status: 301 as const }] };
    const issues = checkRelease({ ...snap, site });
    expect(issues.find((i) => i.code === "redirect-shadows-page")?.severity).toBe("error");
    expect(issues.find((i) => i.code === "redirect-to-missing-page")).toMatchObject({ severity: "warning", path: "/team" });
  });
});
