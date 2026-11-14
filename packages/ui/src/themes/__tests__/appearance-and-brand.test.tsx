// @feat:appearance-preferences
/**
 * The person's appearance and density reach the shell (ADR 0024), and an app brand's name and
 * images reach AppShell (piece 7). Without preferences, everything works as before.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutDashboard } from "lucide-react";
import { AppearancePreferencesProvider, defineAppearancePreferences } from "@marktiderman/genesis-core";
import { useTheme } from "@marktiderman/genesis-design-system/theme";
import { defineAppBrand, getStarterBrand } from "@marktiderman/genesis-design-system/app-styles";
import { AppShell } from "../../components/layout/AppShell";
import { AppearanceProvider, appShellBrandProps } from "../index";

const genesis = getStarterBrand("tracker")!.brand;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(() => localStorage.clear());

function shell(options = {}) {
  return (
    <AppShell appName="Acme" navItems={[{ to: "/", label: "Home", icon: LayoutDashboard }]} activePath="/" options={{ showCollapse: false, configurable: false, ...options }}>
      <p>Page</p>
    </AppShell>
  );
}

describe("AppShell's density", () => {
  it("is its options' own without preferences", () => {
    const { container } = render(shell({ density: "compact" }));
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("compact");
  });

  it("follows the person over the organization and the theme, and an app lock over all", () => {
    localStorage.setItem("genesis-appearance", JSON.stringify({ density: "compact" }));
    const { container, rerender } = render(
      <AppearancePreferencesProvider organization={{ density: "comfortable" }}>{shell({ density: "comfortable" })}</AppearancePreferencesProvider>,
    );
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("compact");
    rerender(
      <AppearancePreferencesProvider organization={{ density: "comfortable" }}>
        {shell({ density: "comfortable", lockedOptions: ["density"] })}
      </AppearancePreferencesProvider>,
    );
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("comfortable");
  });

  it("draws a person's spacious choice", () => {
    localStorage.setItem("genesis-appearance", JSON.stringify({ density: "spacious" }));
    const { container } = render(<AppearancePreferencesProvider>{shell({ density: "compact" })}</AppearancePreferencesProvider>);
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("spacious");
  });

  it("takes the organization's default over the shell's options when the person hasn't chosen", () => {
    const { container } = render(<AppearancePreferencesProvider organization={{ density: "compact" }}>{shell({ density: "comfortable" })}</AppearancePreferencesProvider>);
    expect(container.querySelector('[data-slot="shell"]')?.getAttribute("data-density")).toBe("compact");
  });
});

describe("the theme toggle and AppearanceProvider", () => {
  it("saves the person's appearance in their preferences", () => {
    render(<AppearancePreferencesProvider>{shell({ showThemeToggle: true })}</AppearancePreferencesProvider>);
    fireEvent.click(screen.getByTestId("app-shell-theme-toggle-desktop"));
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ appearance: "dark" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("is hidden when the app locks the appearance", () => {
    render(<AppearancePreferencesProvider preferences={defineAppearancePreferences({ lock: { appearance: "light" } })}>{shell({ showThemeToggle: true })}</AppearancePreferencesProvider>);
    expect(screen.queryByTestId("app-shell-theme-toggle-desktop")).toBeNull();
  });

  it("feeds GenesisThemeProvider from the preferences and saves setMode there", async () => {
    function Probe() {
      const { mode, setMode } = useTheme();
      return <button onClick={() => setMode("dark")}>{mode}</button>;
    }
    render(
      <AppearancePreferencesProvider organization={{ appearance: "light" }}>
        <AppearanceProvider brand={genesis}>
          <Probe />
        </AppearanceProvider>
      </AppearancePreferencesProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("light");
    act(() => screen.getByRole("button").click());
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("is GenesisThemeProvider as before without preferences", () => {
    function Probe() {
      const { mode, setMode } = useTheme();
      return <button onClick={() => setMode("dark")}>{mode}</button>;
    }
    render(
      <AppearanceProvider brand={genesis} defaultMode="light" syncDocument={false}>
        <Probe />
      </AppearanceProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("dark");
  });
});

describe("appShellBrandProps", () => {
  const brand = defineAppBrand({
    name: "acme",
    label: "Acme brand",
    description: "A test brand.",
    brand: { ...genesis, name: "acme" },
    appName: "Acme Studio",
    logo: { src: "/brand/acme.svg", alt: "Acme Studio" },
    mark: { src: "/brand/mark.svg", alt: "", darkSrc: "/brand/mark-dark.svg" },
  });

  it("gives AppShell the brand's name and its mark, light and dark", () => {
    const { container } = render(
      <AppShell {...appShellBrandProps(brand)} navItems={[]} options={{ showCollapse: false, configurable: false }}>
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.getAllByText("Acme Studio").length).toBeGreaterThan(0);
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/brand/mark.svg");
    expect(srcs).toContain("/brand/mark-dark.svg");
  });

  it("falls back to the logo, then to the name alone", () => {
    expect(appShellBrandProps({ ...brand, mark: undefined }).logo).toBeTruthy();
    expect(appShellBrandProps({ label: "Plain" })).toEqual({ appName: "Plain" });
    expect(appShellBrandProps(null, "Acme")).toEqual({ appName: "Acme" });
  });
});
