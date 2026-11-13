// @vitest-environment happy-dom
// @feat:appearance-preferences
/**
 * Who sets the appearance and density: app lock > person > organization default > theme
 * default > Genesis default, with the person's choice kept in the app's store and on the device.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppearancePreferencesProvider,
  defineAppearancePreferences,
  resolveAppearancePreferences,
  toAppearancePreferenceValues,
  useAppearancePreferences,
  useOptionalAppearancePreferences,
  type AppearancePreferenceValues,
  type AppearancePreferencesStore,
} from "../index";
import { resolveWorkspaceAppearance, resolveWorkspaceBrand, type Workspace } from "../workspaces";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("resolveAppearancePreferences", () => {
  it("takes each value from the first layer that sets it, in the written order", () => {
    const layers = {
      lock: { density: "compact" as const },
      person: { appearance: "dark" as const, density: "spacious" as const },
      organization: { appearance: "light" as const, density: "comfortable" as const },
      theme: { density: "comfortable" as const },
    };
    expect(resolveAppearancePreferences(layers)).toEqual({
      appearance: "dark",
      density: "compact",
      source: { appearance: "person", density: "app" },
    });
    expect(resolveAppearancePreferences({ organization: { appearance: "light" }, theme: { density: "compact" } })).toEqual({
      appearance: "light",
      density: "compact",
      source: { appearance: "organization", density: "theme" },
    });
    expect(resolveAppearancePreferences({})).toEqual({
      appearance: "system",
      density: "comfortable",
      source: { appearance: "genesis", density: "genesis" },
    });
  });

  it("skips a value that isn't an appearance or a density", () => {
    const person = { appearance: "sepia", density: "cosy" } as unknown as AppearancePreferenceValues;
    expect(resolveAppearancePreferences({ person, theme: { appearance: "dark" } }).source).toEqual({ appearance: "theme", density: "genesis" });
    expect(toAppearancePreferenceValues({ appearance: "dark", density: "huge", other: 1 })).toEqual({ appearance: "dark" });
  });
});

describe("defineAppearancePreferences", () => {
  it("refuses a lock that isn't a value, and a store without read and write", () => {
    expect(() => defineAppearancePreferences({ lock: { appearance: "dim" as "dark" } })).toThrow(/lock.appearance/);
    expect(() => defineAppearancePreferences({ store: { read: () => null } as unknown as AppearancePreferencesStore })).toThrow(/store/);
    expect(defineAppearancePreferences().storageKey).toBe("genesis-appearance");
  });
});

function Probe() {
  const p = useAppearancePreferences();
  return (
    <div>
      <span data-testid="appearance">{`${p.appearance}:${p.source.appearance}`}</span>
      <span data-testid="density">{`${p.density}:${p.source.density}`}</span>
      <span data-testid="ready">{String(p.ready)}</span>
      <button onClick={() => p.setAppearance("dark")}>dark</button>
      <button onClick={() => p.setDensity("compact")}>compact</button>
    </div>
  );
}

describe("AppearancePreferencesProvider", () => {
  it("reads the person's choice from the store, over the organization and theme", async () => {
    const store: AppearancePreferencesStore = { read: async () => ({ appearance: "dark" }), write: vi.fn() };
    render(
      <AppearancePreferencesProvider preferences={defineAppearancePreferences({ store })} organization={{ appearance: "light", density: "spacious" }} theme={{ density: "compact" }}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    expect(screen.getByTestId("appearance").textContent).toBe("dark:person");
    expect(screen.getByTestId("density").textContent).toBe("spacious:organization");
  });

  it("writes a change to the store and the device", async () => {
    const write = vi.fn();
    const preferences = defineAppearancePreferences({ store: { read: () => null, write } });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    act(() => screen.getByText("dark").click());
    expect(screen.getByTestId("appearance").textContent).toBe("dark:person");
    await waitFor(() => expect(write).toHaveBeenCalledWith({ appearance: "dark" }));
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ appearance: "dark" });
  });

  it("keeps a locked value whatever the person picks", () => {
    render(
      <AppearancePreferencesProvider preferences={defineAppearancePreferences({ lock: { density: "comfortable" } })}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    act(() => screen.getByText("compact").click());
    expect(screen.getByTestId("density").textContent).toBe("comfortable:app");
  });

  it("is optional: null outside a provider, and the strict hook says what's missing", () => {
    function Optional() {
      return <span data-testid="opt">{String(useOptionalAppearancePreferences())}</span>;
    }
    render(<Optional />);
    expect(screen.getByTestId("opt").textContent).toBe("null");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/AppearancePreferencesProvider/);
  });
});

describe("organization brands", () => {
  const acme: Workspace = { id: "acme", kind: "tenant", label: "Acme", path: "/o/acme", scope: {}, theme: { brand: "harbor", defaults: { density: "compact", appearance: "oops" as "dark" } } };

  it("picks the workspace's brand when the app ships it, else the fallback", () => {
    expect(resolveWorkspaceBrand(acme)).toBe("harbor");
    expect(resolveWorkspaceBrand(acme, { available: [{ id: "harbor" }, "press"] })).toBe("harbor");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveWorkspaceBrand(acme, { available: ["press"], fallback: "genesis" })).toBe("genesis");
    expect(resolveWorkspaceBrand(undefined, { fallback: "genesis" })).toBe("genesis");
  });

  it("gives the organization's known appearance defaults", () => {
    expect(resolveWorkspaceAppearance(acme)).toEqual({ density: "compact" });
    expect(resolveWorkspaceAppearance(null)).toEqual({});
  });
});
