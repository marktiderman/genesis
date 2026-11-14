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
    await waitFor(() => expect(write).toHaveBeenCalledWith({ appearance: "dark" }, { previous: null }));
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ appearance: "dark" });
  });

  it("copies a successful read onto the device, for the next visit's first paint", async () => {
    const preferences = defineAppearancePreferences({ store: { read: async () => ({ density: "compact" }), write: vi.fn() } });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ density: "compact" });
  });

  it("holds a choice made while the store's read is in flight, then writes it merged onto the read", async () => {
    let answer: (values: AppearancePreferenceValues) => void = () => undefined;
    const read = () => new Promise<AppearancePreferenceValues>((resolve) => (answer = resolve));
    const write = vi.fn();
    const preferences = defineAppearancePreferences({ store: { read, write } });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    act(() => screen.getByText("dark").click());
    // Nothing goes out before the store has answered: it holds values this device doesn't know.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(write).not.toHaveBeenCalled();
    await act(async () => answer({ appearance: "light", density: "compact" }));
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    expect(screen.getByTestId("appearance").textContent).toBe("dark:person");
    expect(screen.getByTestId("density").textContent).toBe("compact:person");
    // The choice merged onto the store's values, written against them: a compare-and-set store accepts it.
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith({ appearance: "dark", density: "compact" }, { previous: { appearance: "light", density: "compact" } });
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ appearance: "dark", density: "compact" });
  });

  it("writes a held choice onto this device's values when the store can't be read", async () => {
    localStorage.setItem("genesis-appearance", JSON.stringify({ density: "spacious" }));
    let fail: (error: Error) => void = () => undefined;
    const read = () => new Promise<AppearancePreferenceValues>((_, reject) => (fail = reject));
    const write = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const preferences = defineAppearancePreferences({ store: { read, write } });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    act(() => screen.getByText("dark").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fail(new Error("offline"));
    });
    await waitFor(() => expect(write).toHaveBeenCalledWith({ appearance: "dark", density: "spacious" }, { previous: null }));
  });

  it("sends writes one at a time, skips one a newer write replaced, and passes what it replaces", async () => {
    const calls: Array<[AppearancePreferenceValues, AppearancePreferenceValues | null]> = [];
    let release: () => void = () => undefined;
    const write = vi.fn((values: AppearancePreferenceValues, { previous }: { previous: AppearancePreferenceValues | null }) => {
      calls.push([values, previous]);
      if (calls.length === 1) return new Promise<void>((resolve) => (release = resolve));
      return undefined;
    });
    function Three() {
      const p = useAppearancePreferences();
      return (
        <div>
          <span data-testid="ready">{String(p.ready)}</span>
          <button onClick={() => p.setAppearance("dark")}>a</button>
          <button onClick={() => p.setDensity("compact")}>b</button>
          <button onClick={() => p.setDensity("spacious")}>c</button>
        </div>
      );
    }
    const preferences = defineAppearancePreferences({ store: { read: () => ({ appearance: "light" }), write } });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Three />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    act(() => screen.getByText("a").click());
    act(() => screen.getByText("b").click());
    act(() => screen.getByText("c").click());
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => release());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual([
      [{ appearance: "dark" }, { appearance: "light" }],
      [{ appearance: "dark", density: "spacious" }, { appearance: "dark" }],
    ]);
  });

  it("drops a read older than a value the store's subscription delivered, and merges a held choice onto the newer one", async () => {
    let answer: (values: AppearancePreferenceValues) => void = () => undefined;
    let deliver: (values: AppearancePreferenceValues) => void = () => undefined;
    const write = vi.fn();
    const store: AppearancePreferencesStore = {
      read: () => new Promise<AppearancePreferenceValues>((resolve) => (answer = resolve)),
      write,
      subscribe: (listener) => {
        deliver = listener as (values: AppearancePreferenceValues) => void;
        return () => undefined;
      },
    };
    render(
      <AppearancePreferencesProvider preferences={defineAppearancePreferences({ store })}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    act(() => screen.getByText("dark").click());
    // Newer values arrive by subscription while the first read is still out.
    await act(async () => deliver({ density: "spacious" }));
    await act(async () => answer({ density: "compact" }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith({ appearance: "dark", density: "spacious" }, { previous: { density: "spacious" } });
    expect(screen.getByTestId("density").textContent).toBe("spacious:person");
  });

  it("never sends a write queued for one store to the store that replaced it", async () => {
    let release: () => void = () => undefined;
    const writeA = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const writeB = vi.fn();
    const a = defineAppearancePreferences({ store: { read: () => null, write: writeA } });
    let answerB: (values: AppearancePreferenceValues) => void = () => undefined;
    const b = defineAppearancePreferences({ store: { read: () => new Promise<AppearancePreferenceValues>((resolve) => (answerB = resolve)), write: writeB } });
    const { rerender } = render(
      <AppearancePreferencesProvider preferences={a}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    act(() => screen.getByText("dark").click());
    await waitFor(() => expect(writeA).toHaveBeenCalledTimes(1));
    // A second choice waits behind the first write; then the store changes.
    act(() => screen.getByText("compact").click());
    rerender(
      <AppearancePreferencesProvider preferences={b}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await act(async () => release());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // A's waiting write didn't go to B, and B's first read hasn't even answered.
    expect(writeB).not.toHaveBeenCalled();
    await act(async () => answerB({ appearance: "light" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(writeB).not.toHaveBeenCalled();
  });

  it("never writes a choice held during one store's first read to the store that replaced it", async () => {
    const writeA = vi.fn();
    const writeB = vi.fn();
    const a = defineAppearancePreferences({ store: { read: () => new Promise<AppearancePreferenceValues>(() => undefined), write: writeA } });
    const b = defineAppearancePreferences({ store: { read: async () => ({ density: "compact" }), write: writeB } });
    const { rerender } = render(
      <AppearancePreferencesProvider preferences={a}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    // A's first read never answers: the choice waits for it.
    act(() => screen.getByText("dark").click());
    rerender(
      <AppearancePreferencesProvider preferences={b}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(writeB).not.toHaveBeenCalled();
    expect(writeA).not.toHaveBeenCalled();
  });

  it("tells onWriteError about a write the store refused, and keeps the device's copy", async () => {
    const onWriteError = vi.fn();
    const refusal = new Error("stale");
    const preferences = defineAppearancePreferences({ store: { read: () => null, write: () => Promise.reject(refusal) }, onWriteError });
    render(
      <AppearancePreferencesProvider preferences={preferences}>
        <Probe />
      </AppearancePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("true"));
    act(() => screen.getByText("compact").click());
    await waitFor(() => expect(onWriteError).toHaveBeenCalledWith(refusal, { density: "compact" }));
    expect(JSON.parse(localStorage.getItem("genesis-appearance")!)).toEqual({ density: "compact" });
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
