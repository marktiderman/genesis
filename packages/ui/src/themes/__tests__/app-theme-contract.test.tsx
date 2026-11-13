/**
 * @feat:app-themes
 * The app-theme contract genesis-ui keeps: every theme part is rendered with its data-slot and
 * attributes, every component token is read, and no component reads a token that isn't declared.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayoutDashboard } from "lucide-react";
import { COMPONENT_TOKENS, THEME_PARTS } from "@marktiderman/genesis-design-system/app-styles";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { AppShell } from "../../components/layout/AppShell";
import { appShellOptionsFromTheme } from "../layout";

const SRC = join(__dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(tsx?|css)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ path, text: readFileSync(path, "utf-8") }));
const all = files.map((f) => f.text).join("\n");

/** Attributes Radix or the caller sets (`data-state`), not genesis-ui's source. */
const SET_ELSEWHERE = new Set(["state"]);

describe("theme parts", () => {
  it.each(THEME_PARTS.map((p) => [p.name, p] as const))("%s is rendered with its data-slot and attributes", (name, part) => {
    const owners = files.filter((f) => f.text.includes(`data-slot="${name}"`));
    expect(owners.length, `no component renders data-slot="${name}"`).toBeGreaterThan(0);
    for (const attr of part.attributes) {
      if (SET_ELSEWHERE.has(attr)) continue;
      expect(owners.some((f) => f.text.includes(`data-${attr}=`)), `${name} carries data-${attr}`).toBe(true);
    }
  });
});

describe("component tokens", () => {
  // --radius is a theme role every rounded-* step reads through the Tailwind bridge, not a class here.
  it.each(COMPONENT_TOKENS.filter((t) => !t.role).map((t) => [t.name] as const))("--%s is read by a component", (name) => {
    expect(all).toContain(`var(--${name})`);
  });

  it("are the only ones components read in their groups", () => {
    const declared = new Set(COMPONENT_TOKENS.map((t) => t.name));
    const groups = /^(control|input|focus-ring|card|popover|overlay|badge|table|title|page-title|sidebar-item|shell-frame)-/;
    const read = [...all.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]!).filter((name) => groups.test(name));
    expect([...new Set(read)].filter((name) => !declared.has(name))).toEqual([]);
  });
});

describe("rendered parts", () => {
  it("a button names its variant and size", () => {
    render(<Button variant="outline" size="sm">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button?.getAttribute("data-slot")).toBe("button");
    expect(button?.getAttribute("data-variant")).toBe("outline");
    expect(button?.getAttribute("data-size")).toBe("sm");
    expect(button.className).toContain("h-[var(--control-height-sm)]");
  });

  it("a button's defaults are named too, and a className still wins", () => {
    render(<Button className="h-8 font-semibold">Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button?.getAttribute("data-variant")).toBe("default");
    expect(button?.getAttribute("data-size")).toBe("default");
    expect(button.className).toContain("h-8");
    expect(button.className).not.toContain("h-[var(--control-height)]");
    expect(button.className).not.toContain("font-[number:var(--control-font-weight)]");
  });

  it("a card and its pieces are parts", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    for (const slot of ["card", "card-header", "card-title", "card-content"]) expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
  });

  it("a badge names its variant", () => {
    render(<Badge variant="secondary">New</Badge>);
    expect(screen.getByText("New")?.getAttribute("data-variant")).toBe("secondary");
  });

  it("the shell marks its parts and the active item", () => {
    const { container } = render(
      <AppShell
        appName="Acme"
        navItems={[{ to: "/", label: "Home", icon: LayoutDashboard }]}
        activePath="/"
        options={{ showThemeToggle: false, showCollapse: false, configurable: false, density: "compact" }}
      >
        <p>Page</p>
      </AppShell>,
    );
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("compact");
    expect(container.querySelector('[data-slot="shell-sidebar"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="shell-main"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="shell-nav-item"][data-active]')).not.toBeNull();
  });
});

describe("layout parts", () => {
  const nav = [
    { to: "/", label: "Home", icon: LayoutDashboard, end: true },
    { to: "/docs", label: "Docs", icon: LayoutDashboard, children: [{ to: "/docs/a", label: "A", icon: LayoutDashboard }] },
  ];
  const opts = { showThemeToggle: false, showCollapse: false, configurable: false } as const;

  it("the shell names its navigation, frame and zone, and the inset frame reads its tokens", () => {
    const { container } = render(
      <AppShell
        appName="Acme"
        navigation={{ id: "root", path: "/", label: "Home", items: nav, children: [{ id: "docs", path: "/docs", label: "Docs", items: [], zone: "writing" }] }}
        activePath="/docs/a"
        options={{ ...opts, navigation: "page-tree", frame: "inset", density: "spacious" }}
      >
        <p>Page</p>
      </AppShell>,
    );
    const shell = container.querySelector('[data-slot="shell"]')!;
    expect(shell.getAttribute("data-navigation")).toBe("page-tree");
    expect(shell.getAttribute("data-frame")).toBe("inset");
    expect(shell.getAttribute("data-density")).toBe("spacious");
    expect(shell.getAttribute("data-zone")).toBe("writing");
    const frame = container.querySelector('[data-slot="shell-frame"]')!;
    expect(frame.getAttribute("data-frame")).toBe("inset");
    expect(frame.className).toContain("md:rounded-[var(--shell-frame-radius)]");
    expect(container.querySelector('[data-slot="shell-page-tree"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="shell-nav-item"][data-depth="1"][data-active]')?.textContent).toBe("A");
  });

  it("a flush shell's frame reads no frame tokens", () => {
    const { container } = render(
      <AppShell appName="Acme" navItems={nav} activePath="/" options={opts}>
        <p>Page</p>
      </AppShell>,
    );
    const shell = container.querySelector('[data-slot="shell"]')!;
    expect(shell.getAttribute("data-navigation")).toBe("sidebar");
    expect(shell.getAttribute("data-frame")).toBe("flush");
    expect(shell.hasAttribute("data-zone")).toBe(false);
    expect(container.querySelector('[data-slot="shell-frame"]')!.className).not.toContain("shell-frame");
  });
});

describe("appShellOptionsFromTheme", () => {
  it("passes navigation and frame too", () => {
    expect(appShellOptionsFromTheme({ layout: { navigation: "page-tree", frame: "inset", density: "spacious" } })).toEqual({
      navigation: "page-tree",
      frame: "inset",
      density: "spacious",
    });
  });

  it("passes the theme's shell choices and nothing else", () => {
    expect(appShellOptionsFromTheme({ layout: { density: "compact", railWidth: "wide", defaultCollapsed: false } })).toEqual({
      density: "compact",
      railWidth: "wide",
      defaultCollapsed: false,
    });
    expect(appShellOptionsFromTheme(undefined)).toEqual({});
    expect(appShellOptionsFromTheme({})).toEqual({});
  });
});

describe("genesis-ui's stylesheet", () => {
  it("declares every component token at its default, so components keep their size without genesis.css", () => {
    const css = readFileSync(join(__dirname, "../../styles.css"), "utf-8");
    for (const token of COMPONENT_TOKENS.filter((t) => !t.role)) {
      expect(css, `--${token.name}`).toContain(`--${token.name}: ${token.default};`);
    }
  });
});
