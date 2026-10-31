/**
 * @feat:sites-renderer
 * Design systems on a site: the brand torture test (six made-up brands,
 * among them a neon, a near-white and a near-black colour, in light and
 * dark, under every shipped design system), and the swap: changing the
 * design system changes the theme's variables and nothing else in the page.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NEUTRAL_DESIGN_SYSTEMS, registerDesignSystem, unregisterDesignSystem } from "@marktiderman/genesis-design-system";
import { checkContrast, contrastRatio, siteTheme, themeCss, type SiteBrand } from "../index";
import { handleSiteRequest } from "../web/index";
import { industryDesignSystems } from "../templates/index";
import { brand, formsResolver, seededStore } from "./fixtures";

const DESIGN_SYSTEMS = [...NEUTRAL_DESIGN_SYSTEMS, ...industryDesignSystems];

/** Six made-up brands that break naive palettes. */
const TORTURE: Record<string, SiteBrand> = {
  neon: { name: "Volt Works", colors: { primary: "#c6ff00" }, fonts: { heading: "bebas-neue", body: "inter" } },
  "near-white": { name: "Paper Lantern", colors: { primary: "#f2f1ea" }, fonts: { heading: "playfair-display", body: "work-sans" } },
  "near-black": { name: "Night Shift", colors: { primary: "#0b0b0f" }, fonts: { heading: "space-grotesk", body: "inter" } },
  red: { name: "Ember Studio", colors: { primary: "#e10600", secondary: "#ffb400" }, fonts: { heading: "oswald", body: "inter" } },
  pastel: { name: "Sage House", colors: { primary: "#a8c3a0" }, fonts: { heading: "lora", body: "dm-sans" } },
  navy: { name: "Harbour Room", colors: { primary: "#1e2a4a", primaryDark: "#8fa3d9" }, fonts: { heading: "poppins", body: "dm-sans" } },
};

beforeAll(() => registerDesignSystem(...industryDesignSystems));
afterAll(() => {
  for (const ds of industryDesignSystems) unregisterDesignSystem(ds.id);
});

const cases = DESIGN_SYSTEMS.flatMap((ds) => Object.entries(TORTURE).map(([name, b]) => [ds.id, name, b] as const));

describe("the brand torture test", () => {
  it.each(cases)("%s with the %s brand passes contrast in light and dark", (id, _name, b) => {
    const theme = siteTheme({ ...b, designSystem: { id } }, { colorScheme: "auto" });
    expect(theme.designSystem).toBe(id);
    expect(theme.pairs.some((p) => p.mode === "light") && theme.pairs.some((p) => p.mode === "dark")).toBe(true);
    // Nothing blocks a publish. (Classic, and the engine too, warn when the fill is too faint to work as a border.)
    expect(checkContrast(theme).filter((i) => i.severity === "error")).toEqual([]);
    // Every pair the colour engine solves reaches its minimum, measured again here.
    for (const pair of theme.pairs.filter((p) => p.severity !== "warning")) {
      expect(contrastRatio(pair.foreground, pair.background), `${pair.mode}: ${pair.name}`).toBeGreaterThanOrEqual(pair.minimum);
    }
  });

  it.each(cases)("%s with the %s brand: its variables", (id, _name, b) => {
    const theme = siteTheme({ ...b, designSystem: { id } }, { colorScheme: "auto" });
    // The brand's own scales (`--color-*`) don't change with the design system; the rest is the look.
    const look = (vars: Record<string, string>) => Object.fromEntries(Object.entries(vars).filter(([k]) => !k.startsWith("--color-")).sort(([a], [z]) => (a < z ? -1 : 1)));
    expect({ light: look(theme.light), dark: look(theme.dark) }).toMatchSnapshot();
  });

  it("gives the neon brand a lime button with dark text, and a darker lime for text", () => {
    const theme = siteTheme({ ...TORTURE.neon!, designSystem: { id: "forge@1" } });
    expect(theme.light["--ds-accent-fill"]).toBe("#c6ff00");
    expect(contrastRatio(theme.light["--ds-on-accent"]!, "#c6ff00")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.light["--ds-accent-text"]!, theme.light["--ds-ground"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps classic@1 exactly today's theme", () => {
    const today = siteTheme(brand, { colorScheme: "auto" });
    const classic = siteTheme({ ...brand, designSystem: { id: "classic@1" } }, { colorScheme: "auto" });
    expect(classic.light).toEqual(today.light);
    expect(classic.dark).toEqual(today.dark);
    expect(classic.pairs).toEqual(today.pairs);
    // So a site that names classic, or nothing, needs no new contrast check; another design system does.
    expect(classic.brandHash).toBe(today.brandHash);
    expect(siteTheme({ ...brand, designSystem: { id: "crisp@1" } }).brandHash).not.toBe(siteTheme(brand).brandHash);
    expect(siteTheme({ ...brand, designSystem: { id: "crisp@1", density: "compact" } }).brandHash).not.toBe(siteTheme({ ...brand, designSystem: { id: "crisp@1" } }).brandHash);
  });

  it("themes with classic, and says so, when the brand names a design system that isn't registered", () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(" "));
    try {
      const theme = siteTheme({ ...brand, designSystem: { id: "missing@1" } });
      expect(theme.designSystem).toBe("classic@1");
      expect(theme.light).toEqual(siteTheme(brand).light);
    } finally {
      console.error = original;
    }
    expect(errors.join("\n")).toContain('"missing@1"');
  });
});

describe("swapping the design system", () => {
  const ORIGIN = "https://riverside.example";
  const STYLE = /<style data-gs-theme="">[\s\S]*?<\/style>/;

  async function render(designSystem?: string) {
    const store = await seededStore();
    const b: SiteBrand = designSystem ? { ...brand, designSystem: { id: designSystem } } : brand;
    const res = (await handleSiteRequest(new Request(`${ORIGIN}/`), { store, brand: { getBrand: () => b }, siteId: "landing", forms: formsResolver, origin: ORIGIN }))!;
    expect(res.status).toBe(200);
    return res.text();
  }

  it("changes only the theme's variables, never the HTML", async () => {
    const pages = await Promise.all([undefined, ...DESIGN_SYSTEMS.map((d) => d.id)].map(render));
    const [base, ...swapped] = pages;
    const withoutTheme = (html: string) => html.replace(STYLE, "<style data-gs-theme></style>");
    expect(base).toMatch(STYLE);
    for (const html of swapped) expect(withoutTheme(html)).toBe(withoutTheme(base!));
    // And the variables do change: every design system but classic prints its own.
    const styles = pages.map((html) => html.match(STYLE)![0]);
    expect(styles[1]).toBe(styles[0]); // classic@1
    expect(new Set(styles.slice(1)).size).toBe(DESIGN_SYSTEMS.length);
  });

  it("prints the design system's tokens in the page's one style", () => {
    const css = themeCss(siteTheme({ ...brand, designSystem: { id: "studio@1" } }));
    expect(css).toContain("--ds-text-display:clamp(2.5rem, 1.75rem + 3.3333vw, 4.75rem)");
    expect(css).toContain("--ds-reveal:ds-rise");
    expect(css).not.toMatch(/[<{};]\s*<|<\/style/);
  });
});
