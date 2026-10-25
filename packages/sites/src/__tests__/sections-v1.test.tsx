// @vitest-environment happy-dom
/**
 * @feat:sites-sections
 * The V1 sections and props, past their snapshots: the timetable's table
 * and day picker, the team's bio in place, a map that loads nothing until
 * asked, outbound links, grouped pricing, numbered steps with a button
 * each, the trust bar, downloads, and the forms resolver's three kinds.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../sections/index";
import { getSection, isPlainEmail, Link, type AnySectionDefinition, type SectionNode } from "../index";
import { createMemorySiteStore, exampleBrands, type FormsResolver, type PageDoc } from "../index";
import { handleSiteRequest } from "../web/index";
import { mapEmbedUrl, formatTime } from "../sections/index";
import { contactForm, sectionProps, testCtx } from "./fixtures";

function render(type: string, variant: string, props: Record<string, unknown> = sectionProps[type]!, ctx = {}) {
  const def = getSection(type) as AnySectionDefinition;
  const parsed = def.schema.parse(props);
  const node: SectionNode = { id: type.replace(/[^a-z]/g, ""), type, v: 1, variant, props: parsed as Record<string, unknown> };
  return renderToStaticMarkup(<>{def.render({ props: parsed, variant, node, ctx: testCtx({ idPrefix: `gs-${node.id}`, ...ctx }) })}</>);
}

const dom = (html: string) => {
  document.body.innerHTML = html;
  return document.body;
};

describe("the timetable", () => {
  it("is a table on wider screens: a caption, a header per day and per time, and empty slots said aloud", () => {
    const body = dom(render("schedule", "grid"));
    const table = body.querySelector("table")!;
    expect(table.querySelector("caption")?.textContent).toBe("Class times: classes by time and day");
    const days = [...table.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent);
    expect(days).toEqual(["Time", "MonMonday", "TueTuesday", "WedWednesday", "ThuThursday", "FriFriday", "SatSaturday"]);
    const rows = [...table.querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent);
    expect(rows).toEqual(["6:00 am", "9:00 am", "6:00 pm"]);
    expect(table.querySelectorAll("tbody td").length).toBe(3 * 6);
    expect([...table.querySelectorAll("td .sr-only")].filter((s) => s.textContent === "No classes").length).toBe(18 - 5);
    expect(table.textContent).toContain("with Sam Lee · Main floor");
    expect(table.closest('[role="region"]')?.getAttribute("tabindex")).toBe("0");
  });

  it("is a day picker on a phone: one radio per day, a list per day, the first day checked, and no script", () => {
    const html = render("schedule", "grid");
    const body = dom(html);
    const radios = [...body.querySelectorAll<HTMLInputElement>('[data-gs-schedule] input[type="radio"]')];
    expect(radios).toHaveLength(6);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios[0]!.defaultChecked).toBe(true);
    // Each radio names the panel it shows.
    for (const r of radios) expect(body.querySelector(`#${r.getAttribute("aria-controls")}`)?.hasAttribute("data-panel")).toBe(true);
    expect(body.querySelectorAll("[data-gs-schedule] [data-panel]")).toHaveLength(6);
    expect(body.querySelector('[data-panel="2"]')?.textContent).toContain("No classes");
    expect(html).not.toContain("<script");
  });

  it("lists every day in the agenda, and says the times as the site's clock does", () => {
    const html = render("schedule", "agenda", { ...sectionProps.schedule, clock: "24h" });
    expect(html).toContain('<time dateTime="18:00">18:00</time>');
    expect(formatTime("00:30", "12h")).toBe("12:30 am");
    expect(formatTime("12:05", "12h")).toBe("12:05 pm");
    expect(() => getSection("schedule")!.schema.parse({ heading: "x", sessions: [{ day: "mon", start: "25:00", title: "Late" }] })).toThrow();
  });
});

describe("the team", () => {
  it("opens each bio in place with no script, links a person's page, and gives each person an anchor", () => {
    const body = dom(render("team", "cards"));
    const details = body.querySelector("details")!;
    expect(details.querySelector("summary")?.textContent).toBe("More about Sam Lee");
    expect(details.querySelectorAll("p").length).toBeGreaterThanOrEqual(2);
    expect(details.querySelector("blockquote")?.textContent).toBe("Strong is a skill.");
    expect(body.querySelector('a[href="/coaches/sam-lee"]')?.textContent).toBe("Sam Lee's page");
    expect(body.querySelector("#sam-lee")).not.toBeNull();
    expect(body.querySelectorAll("details")).toHaveLength(1); // Jane has no bio to open
  });

  it("shows the whole bio in the list", () => {
    const html = render("team", "list");
    expect(html).not.toContain("<details");
    expect(html).toContain("Today Sam runs the strength programme");
  });
});

describe("the map", () => {
  it("puts no frame on the page: an address, a picture, a link, and a button the loader shows", () => {
    const html = render("map", "split");
    expect(html).not.toContain("<iframe");
    const body = dom(html);
    expect(body.querySelector("address")?.textContent).toBe("1 River RoadRiverside, RV1 2AB");
    const box = body.querySelector<HTMLElement>('[data-gs-island="map"]')!;
    expect(box.dataset.gsMapSrc).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/);
    expect(box.querySelector("button[data-gs-map-load]")?.hasAttribute("hidden")).toBe(true);
    const open = box.querySelector<HTMLAnchorElement>('a[href^="https://www.openstreetmap.org/?mlat="]')!;
    expect(open.rel).toBe("noopener noreferrer");
    expect(open.target).toBe("_blank");
    expect(box.querySelector("img")?.getAttribute("alt")).toBe("A map of the streets around the gym");
  });

  it("builds the frame URL itself, for a known provider only", () => {
    expect(mapEmbedUrl({ provider: "google", address: ["1 River Road"], zoom: 15, query: 'x"><script>' })).toBe("https://www.google.com/maps?q=x%22%3E%3Cscript%3E&z=15&output=embed");
    expect(() => getSection("map")!.schema.parse({ heading: "Map", address: ["Somewhere"], provider: "openstreetmap" })).toThrow(/latitude/);
    expect(() => getSection("map")!.schema.parse({ heading: "Map", address: ["Somewhere"], provider: "evil" })).toThrow();
  });

  it("lets the page frame only that provider, and loads the islands script for it", async () => {
    const store = createMemorySiteStore();
    const doc: PageDoc = { schemaVersion: 1, root: { props: { title: "Visit" } }, content: [{ id: "map", type: "map", v: 1, props: sectionProps.map! }], seo: { description: "Find us." } };
    await store.createSite({ id: "m", site: { schemaVersion: 1, name: "Riverside Gym" }, pages: [{ path: "/", doc }] });
    await store.publish("m", { brand: exampleBrands.riverside });
    const res = (await handleSiteRequest(new Request("https://riverside.example/"), { store, brand: { getBrand: () => exampleBrands.riverside }, siteId: "m" }))!;
    expect(res.headers.get("content-security-policy")).toContain("frame-src https://www.openstreetmap.org;");
    expect(await res.text()).toMatch(/<script type="module" src="\/_gs\/islands\.[0-9a-f]+\.js">/);
  });
});

describe("links", () => {
  it("renders an outbound booking link with noopener noreferrer, a new tab when asked, and an analytics hook", () => {
    const html = render("cta", "banner", { heading: "Book", primaryCta: { label: "Book a class", href: "https://booking.example/riverside", external: true, target: "_blank", event: "book-class" } });
    expect(html).toMatch(/<a href="https:\/\/booking\.example\/riverside" target="_blank" rel="noopener noreferrer" data-gs-outbound="" class="[^"]*" data-gs-event="book-class">Book a class<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/);
    const same = render("cta", "banner", { heading: "Book", primaryCta: { label: "Book", href: "https://booking.example/riverside", external: true } });
    expect(same).toContain('rel="noopener noreferrer"');
    expect(same).not.toContain("target=");
  });

  it("allows an outbound link only to http(s), when parsed and again when rendered", () => {
    expect(Link.safeParse({ label: "Mail", href: "mailto:hi@example.com", external: true }).success).toBe(false);
    expect(Link.safeParse({ label: "Home", href: "/", target: "_blank" }).success).toBe(true);
    const def = getSection("cta")!;
    const node: SectionNode = { id: "x", type: "cta", v: 1, variant: "banner", props: {} };
    const html = renderToStaticMarkup(<>{def.render({ props: { heading: "Hi", primaryCta: { label: "Go", href: "/inside", external: true }, surface: "accent" }, variant: "banner", node, ctx: testCtx() })}</>);
    expect(html).toContain('href="#"');
    // A site path never opens a new tab.
    expect(render("cta", "banner", { heading: "Hi", primaryCta: { label: "Go", href: "/inside", target: "_blank" } })).not.toContain("target=");
  });
});

describe("pricing groups", () => {
  it("puts plans under group headings, one level below the section's, with anchors", () => {
    const html = render("pricing", "cards", getSection("pricing")!.presets.find((p) => p.name === "Plan groups")!.props as Record<string, unknown>);
    const body = dom(html);
    expect([...body.querySelectorAll("h2, h3, h4")].map((h) => `${h.tagName}:${h.textContent}`)).toEqual([
      "H2:Memberships",
      "H3:Start here",
      "H4:Single visit",
      "H3:Every week",
      "H4:Monthly",
      "H4:Yearly",
    ]);
    expect(body.querySelector("#weekly")?.getAttribute("aria-labelledby")).toMatch(/group-1$/);
    expect(() => getSection("pricing")!.schema.parse({ heading: "Nothing" })).toThrow(/Add a plan/);
  });

  it("takes up to twelve plans in a group", () => {
    const tiers = Array.from({ length: 12 }, (_, i) => ({ name: `Plan ${i + 1}`, price: `$${i + 10}` }));
    expect(() => render("pricing", "compact", { heading: "All plans", groups: [{ heading: "Everything", tiers }] })).not.toThrow();
  });
});

describe("numbered steps and the trust bar", () => {
  it("numbers steps in an ordered list with a button per step", () => {
    const html = render("features", "steps", getSection("features")!.presets.find((p) => p.variant === "steps")!.props as Record<string, unknown>);
    const body = dom(html);
    expect(body.querySelector("ol")?.children).toHaveLength(3);
    expect([...body.querySelectorAll("ol > li > a")].map((a) => a.textContent)).toEqual(["Book a free class", "See the plans"]);
  });

  it("shows a claim and text badges, with a name for the band", () => {
    const html = render("logos", "trust-bar", getSection("logos")!.presets.find((p) => p.variant === "trust-bar")!.props as Record<string, unknown>);
    const body = dom(html);
    expect(body.querySelector("h2.sr-only")?.textContent).toBe("Why people trust us");
    expect([...body.querySelectorAll("li span")].map((s) => s.textContent)).toEqual(["Small classes", "Friendly coaches", "Free first visit"]);
  });
});

describe("downloads", () => {
  it("says what each file is and how big, and downloads a site file", () => {
    const html = render("file", "list");
    expect(html).toContain("(PDF, 240 KB)");
    expect(html).toContain("(PDF, 2.0 MB)");
    expect(html).toMatch(/<a href="\/sites\/s1\/files\/a1-timetable\.pdf" type="application\/pdf" download=""/);
    expect(html).toMatch(/<a href="https:\/\/files\.example\/prices\.pdf" type="application\/pdf" rel="noopener"/);
    expect(() => getSection("file")!.schema.parse({ heading: "Files", files: [{ label: "Bad", file: { src: "javascript:alert(1)" } }] })).toThrow();
  });
});

describe("the forms resolver's three kinds", () => {
  const forms: FormsResolver = (slug) =>
    slug === "genesis"
      ? { kind: "definition", definition: contactForm.definition, submitUrl: "/api/forms/genesis" }
      : slug === "host"
        ? { kind: "definition", definition: contactForm.definition, submitUrl: "https://crm.example/hooks/riverside" }
        : slug === "mail"
          ? { kind: "mailto", email: "hello@riverside.example", subject: "Free class\r\nBcc: x@evil.example", label: "Email the front desk" }
          : null;

  async function pageWith(slug: string) {
    const store = createMemorySiteStore();
    const doc: PageDoc = { schemaVersion: 1, root: { props: { title: "Contact" } }, content: [{ id: "form", type: "form-embed", v: 1, props: { heading: "Get in touch", form: slug } }], seo: { description: "Contact." } };
    await store.createSite({ id: "f", site: { schemaVersion: 1, name: "Riverside Gym" }, pages: [{ path: "/", doc }] });
    await store.publish("f", { brand: exampleBrands.riverside });
    const res = (await handleSiteRequest(new Request("https://riverside.example/"), { store, brand: { getBrand: () => exampleBrands.riverside }, siteId: "f", forms }))!;
    return { csp: res.headers.get("content-security-policy")!, html: await res.text() };
  }

  it("a Genesis form posts to the app's own endpoint", async () => {
    const { html, csp } = await pageWith("genesis");
    expect(html).toMatch(/<form[^>]*action="\/api\/forms\/genesis"/);
    expect(csp).toContain("form-action 'self';");
  });

  it("a host endpoint elsewhere is allowed by the page's policy, for script and for a plain post", async () => {
    const { html, csp } = await pageWith("host");
    expect(html).toMatch(/<form[^>]*action="https:\/\/crm\.example\/hooks\/riverside"/);
    expect(csp).toContain("connect-src 'self' https://crm.example");
    expect(csp).toContain("form-action 'self' https://crm.example");
  });

  it("a mailto fallback is a button that writes an email: no form, no script, no header injection", async () => {
    const { html } = await pageWith("mail");
    expect(html).not.toContain("<form");
    expect(html).toContain('href="mailto:hello@riverside.example?subject=Free%20class%20Bcc%3A%20x%40evil.example"');
    expect(html).toContain("Email the front desk");
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  it("writes only to a plain address: no display name, no % escapes", () => {
    expect(isPlainEmail("hello@riverside.example")).toBe(true);
    expect(isPlainEmail("a%0d%0abcc%3dx@riverside.example")).toBe(false);
    expect(isPlainEmail("Front desk <hello@riverside.example>")).toBe(false);
  });
});
