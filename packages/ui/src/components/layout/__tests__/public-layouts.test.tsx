// @feat:page-layouts
/**
 * AuthPage, PublicPage and the brand contrast fallback.
 *
 * What is pinned: the landmarks (one `main`, the headline as the only h1),
 * every slot rendering where it should and being droppable, `embedded`
 * stripping the chrome and the full-viewport height, and the accent maths
 * (a failing accent is darkened until it reaches 4.5:1, a passing one is
 * left alone). Built-in vitest matchers only.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthPage } from "../auth-page";
import { PublicPage } from "../public-page";
import {
  MIN_TEXT_CONTRAST,
  accessibleAccent,
  brandThemeStyle,
  contrastRatio,
  hslToRgb,
  parseColor,
} from "../brand-theme";

const WHITE = { r: 255, g: 255, b: 255 };
// Colours are built from channels so the token-usage guard has nothing to flag.
const EMERALD = "rgb(16, 185, 129)";
const INDIGO = "rgb(67, 56, 202)";

const byTestId = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

/** Parses `"H S% L%"` back to RGB, as the browser would. */
const fromTriplet = (triplet: string) => {
  const [h, s, l] = triplet.replace(/%/g, "").split(" ").map(Number) as [number, number, number];
  return hslToRgb({ h, s, l });
};

/** The same triplet without 8-bit rounding, as a float-precision renderer would see it. */
const fromTripletExact = (triplet: string) => {
  const [h, s, l] = triplet.replace(/%/g, "").split(" ").map(Number) as [number, number, number];
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
};

describe("AuthPage", () => {
  const renderSignIn = (extra: Partial<React.ComponentProps<typeof AuthPage>> = {}) =>
    render(
      <AuthPage
        branding={{ logo: <span>LOGO</span>, headline: "Sign in", subhead: "Welcome back." }}
        social={<button type="button">Continue with Google</button>}
        footer={<a href="/reset">Forgot password?</a>}
        legal={<>By continuing you agree to the terms.</>}
        aside={<p>Illustration</p>}
        {...extra}
      >
        <form aria-label="Sign in form">
          <input aria-label="Email" />
        </form>
      </AuthPage>,
    );

  it("renders a main landmark with the headline as the only h1", () => {
    renderSignIn();
    const main = screen.getByRole("main");
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe("Sign in");
    expect(main.contains(headings[0]!)).toBe(true);
    expect(main.contains(screen.getByLabelText("Email"))).toBe(true);
  });

  it("puts every slot in order: branding, card (social then form), footer, legal", () => {
    const { container } = renderSignIn();
    const ids = ["auth-page-branding", "auth-page-card", "auth-page-footer", "auth-page-legal"];
    const els = ids.map((id) => byTestId(container, id));
    els.forEach((el, i) => expect(el, ids[i]).not.toBeNull());
    const order = (el: Element) => Array.from(container.querySelectorAll("*")).indexOf(el);
    for (let i = 1; i < els.length; i++) {
      expect(order(els[i - 1]!), ids[i]).toBeLessThan(order(els[i]!));
    }
    const card = byTestId(container, "auth-page-card")!;
    const social = byTestId(container, "auth-page-social")!;
    expect(card.contains(social)).toBe(true);
    expect(order(social)).toBeLessThan(order(screen.getByLabelText("Email")));
    expect(byTestId(container, "auth-page-branding-logo")!.textContent).toBe("LOGO");
    expect(byTestId(container, "auth-page-branding-subhead")!.textContent).toBe("Welcome back.");
  });

  it("renders the aside as a complementary landmark hidden below lg", () => {
    const { container } = renderSignIn({ asidePosition: "start" });
    const aside = screen.getByRole("complementary");
    expect(aside.textContent).toBe("Illustration");
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("lg:flex");
    expect(aside.className).toContain("lg:order-first");
    expect(byTestId(container, "auth-page")!.className).toContain("lg:grid-cols-2");
  });

  it("fills the viewport and leaves optional parts out when not given", () => {
    const { container } = render(<AuthPage branding={{ headline: "Check your email" }} />);
    const root = byTestId(container, "auth-page")!;
    expect(root.className).toContain("min-h-dvh");
    expect(root.className).not.toContain("lg:grid");
    for (const id of ["auth-page-social", "auth-page-footer", "auth-page-legal", "auth-page-aside", "auth-page-branding-logo"]) {
      expect(byTestId(container, id), id).toBeNull();
    }
  });

  it("slots replace or drop a part, and slotProps feed the default", () => {
    const { container } = renderSignIn({
      testID: "login",
      slots: { footer: null, branding: ({ headline }) => <h1 data-testid="custom-brand">{headline}!</h1> },
      slotProps: { social: { testID: "providers" } },
    });
    expect(byTestId(container, "login-footer")).toBeNull();
    expect(byTestId(container, "custom-brand")!.textContent).toBe("Sign in!");
    expect(byTestId(container, "providers")).not.toBeNull();
  });
});

describe("PublicPage", () => {
  const brand = { name: "Riverside Physio", logoUrl: "/logo.png", accent: EMERALD, headerImageUrl: "/cover.jpg" };

  it("renders the brand header, a main landmark and the powered-by footer", () => {
    const { container } = render(
      <PublicPage brand={brand} poweredBy="Acme" footer={<a href="/privacy">Privacy</a>} title="Book a call">
        <p>Form here</p>
      </PublicPage>,
    );
    expect(screen.getByRole("banner").textContent).toContain("Riverside Physio");
    expect(screen.getByRole("main").textContent).toContain("Form here");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Book a call");
    expect(screen.getByRole("contentinfo").textContent).toContain("Powered by Acme");
    expect(screen.getByRole("contentinfo").textContent).toContain("Privacy");
    // Logo and cover are decorative: the name is right beside them.
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    imgs.forEach((img) => expect(img.getAttribute("alt")).toBe(""));
    expect(byTestId(container, "public-page")!.className).toContain("min-h-dvh");
  });

  it("has no h1 of its own without a title, and no footer when powered-by is off", () => {
    render(
      <PublicPage brand={brand} poweredBy={false}>
        <h1>Form title</h1>
      </PublicPage>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("embedded: no header or footer, transparent, no full-viewport height", () => {
    const { container } = render(
      <PublicPage brand={brand} poweredBy="Acme" embedded>
        <p>Form here</p>
      </PublicPage>,
    );
    const root = byTestId(container, "public-page")!;
    expect(root.dataset.embedded).toBe("true");
    expect(root.className).not.toContain("min-h-dvh");
    expect(root.className).toContain("bg-transparent");
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.getByRole("main").textContent).toBe("Form here");
    // The accent still themes an embedded page.
    expect(root.style.getPropertyValue("--primary")).not.toBe("");
  });

  it("applies the accent as CSS variables on the root", () => {
    const { container } = render(<PublicPage brand={brand} />);
    const root = byTestId(container, "public-page")!;
    for (const v of ["--brand-accent", "--brand-accent-strong", "--brand-accent-foreground", "--primary", "--primary-foreground", "--ring"]) {
      expect(root.style.getPropertyValue(v), v).not.toBe("");
    }
    expect(root.style.getPropertyValue("--primary")).toBe(root.style.getPropertyValue("--brand-accent-strong"));
  });

  it("sets no variables without a valid accent, so Genesis's primary stays", () => {
    const { container } = render(<PublicPage brand={{ name: "Plain", accent: "not-a-colour" }} />);
    expect(byTestId(container, "public-page")!.style.getPropertyValue("--primary")).toBe("");
  });

  it("maxWidth picks the content column's Container size", () => {
    const { container } = render(<PublicPage maxWidth="md" />);
    expect(container.querySelector("main > div")!.className).toContain("max-w-5xl");
  });

  it("slots replace or drop the header", () => {
    render(<PublicPage brand={brand} slots={{ header: null }} />);
    expect(screen.queryByRole("banner")).toBeNull();
  });
});

describe("contrast fallback", () => {
  it("parses hex and rgb()", () => {
    expect(parseColor("#fff")).toEqual(WHITE);
    expect(parseColor("#10B981")).toEqual({ r: 16, g: 185, b: 129 });
    expect(parseColor(EMERALD)).toEqual({ r: 16, g: 185, b: 129 });
    expect(parseColor("rgb(1 2 3)")).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColor("rgb(300, 0, 0)")).toBeNull();
    expect(parseColor("emerald")).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });

  it("parses rgba(), ignoring alpha", () => {
    expect(parseColor("rgba(16, 185, 129, 0.5)")).toEqual({ r: 16, g: 185, b: 129 });
    expect(parseColor("rgb(16 185 129 / 50%)")).toEqual({ r: 16, g: 185, b: 129 });
  });

  it("parses hsl() with commas", () => {
    expect(parseColor("hsl(160, 84%, 39%)")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
    expect(parseColor("hsl(0, 0%, 100%)")).toEqual(WHITE);
  });

  it("parses hsl() with spaces and a / alpha", () => {
    expect(parseColor("hsl(160 84% 39%)")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
    expect(parseColor("hsl(160deg 84% 39% / 0.8)")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
  });

  it("parses hsla()", () => {
    expect(parseColor("hsla(160, 84%, 39%, 0.5)")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
    expect(parseColor("HSLA(160 84% 39% / 50%)")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
  });

  it("parses bare shadcn-style HSL triplets", () => {
    expect(parseColor("160 84% 39%")).toEqual(hslToRgb({ h: 160, s: 84, l: 39 }));
    expect(parseColor("  221.2 83.2% 53.3%  ")).toEqual(hslToRgb({ h: 221.2, s: 83.2, l: 53.3 }));
    expect(parseColor("0 0% 100%")).toEqual(WHITE);
  });

  it("returns null, never throws, for anything unparseable", () => {
    for (const bad of [
      "",
      "   ",
      "#12",
      "#gggggg",
      "hsl(160, 184%, 39%)",
      "hsl(160, 84%)",
      "160 84 39",
      "160 84% 139%",
      "rgb(1, 2)",
      "hsl(nan, 1%, 1%)",
      "url(javascript:alert(1))",
      "var(--primary)",
    ]) {
      expect(() => parseColor(bad), bad).not.toThrow();
      expect(parseColor(bad), bad).toBeNull();
    }
    expect(parseColor(null)).toBeNull();
    expect(parseColor(42 as unknown as string)).toBeNull();
  });

  it("falls back to the default primary for an unparseable accent", () => {
    for (const accent of ["hsl(oops)", "160 84", "not-a-colour", ""]) {
      expect(accessibleAccent(accent), accent).toBeNull();
      expect(brandThemeStyle({ accent }), accent).toEqual({});
    }
  });

  it("themes from hsl() and bare-triplet accents", () => {
    for (const accent of ["hsl(160, 84%, 39%)", "160 84% 39%", "hsla(160 84% 39% / 1)"]) {
      const style = brandThemeStyle({ accent }) as Record<string, string>;
      expect(style["--primary"], accent).toBeDefined();
      expect(contrastRatio(fromTriplet(style["--primary"]!), WHITE), accent).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it("computes WCAG ratios", () => {
    expect(contrastRatio(WHITE, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    // The case that motivated the fallback: emerald with white text.
    expect(contrastRatio(parseColor(EMERALD)!, WHITE)).toBeCloseTo(2.54, 1);
  });

  it("darkens a failing accent until it reaches 4.5:1, keeping the hue", () => {
    const result = accessibleAccent(EMERALD)!;
    expect(result.adjusted).toBe(true);
    expect(result.ratio).toBeLessThan(MIN_TEXT_CONTRAST);
    expect(result.strongRatio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    // Still green: the darkened shade's green channel leads.
    expect(result.strong.g).toBeGreaterThan(result.strong.r);
    expect(result.strong.g).toBeGreaterThan(result.strong.b);
    // And not darker than it needs to be (within a couple of lightness steps).
    expect(result.strongRatio).toBeLessThan(5);
  });

  it("leaves a passing accent alone", () => {
    const result = accessibleAccent(INDIGO)!;
    expect(result.adjusted).toBe(false);
    expect(result.strong).toEqual(result.accent);
  });

  it("honours a custom background and ratio", () => {
    const result = accessibleAccent(INDIGO, { minRatio: 9 })!;
    expect(result.adjusted).toBe(true);
    expect(result.strongRatio).toBeGreaterThanOrEqual(9);
  });

  it("brandThemeStyle's emitted triplets still pass after the browser re-parses them", () => {
    for (const accent of [EMERALD, "#facc15", "#38bdf8", "#f472b6", "#ffffff", INDIGO]) {
      const style = brandThemeStyle({ accent }) as Record<string, string>;
      const strong = fromTriplet(style["--primary"]!);
      expect(contrastRatio(strong, WHITE), accent).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(style["--primary-foreground"]).toBe("0 0% 100%");
    }
    expect(brandThemeStyle(undefined)).toEqual({});
    expect(brandThemeStyle({})).toEqual({});
  });

  it("the emitted, rounded triplet reaches 4.5:1 across hues and lightness levels", () => {
    // Property-style sweep: every hue in 11-degree steps, several saturations,
    // lightness 0-100 in 1.3% steps (offsets chosen to hit awkward roundings),
    // plus every 8-bit colour on a coarse RGB grid, including the reviewer's
    // counter-example rgb(4, 195, 202) and the cyan band around it, where
    // rounding to 0.1 used to land at 4.48:1.
    const inputs: string[] = ["rgb(4, 195, 202)"];
    for (let h = 0; h < 360; h += 11) {
      for (const s of [15, 47.3, 72.9, 100]) {
        for (let l = 0; l <= 100; l += 1.3) inputs.push(`${h} ${s}% ${Math.round(l * 10) / 10}%`);
      }
    }
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 51) inputs.push(`rgb(${r}, ${g}, ${b})`);
      }
    }
    for (let r = 0; r <= 255; r += 5) {
      for (let g = 150; g <= 255; g += 3) inputs.push(`rgb(${r}, ${g}, 202)`);
    }
    let checked = 0;
    for (const accent of inputs) {
      const result = accessibleAccent(accent)!;
      expect(result, accent).not.toBeNull();
      const style = brandThemeStyle({ accent }) as Record<string, string>;
      expect(style["--primary"], accent).toBe(result.strongTriplet);
      const triplet = style["--primary"]!;
      const ratio = Math.min(contrastRatio(fromTriplet(triplet), WHITE), contrastRatio(fromTripletExact(triplet), WHITE));
      if (ratio < MIN_TEXT_CONTRAST) throw new Error(`${accent} -> ${style["--primary"]} is ${ratio.toFixed(3)}:1`);
      expect(result.strongRatio, accent).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5_000);
  }, 30_000);
});
