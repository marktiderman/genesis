// @vitest-environment jsdom
// @feat:persisted-ui-state
/**
 * usePersistedUiState: UI state in the app's storage adapter, SSR-safe, in step across hooks on
 * one key, never writing the default, and forgiving of bad values and refused writes.
 */
import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { GenesisProvider } from "../../provider/context";
import type { DataProvider } from "../../provider/types";
import { createLocalStorageAdapter, createMemoryStorageAdapter, createNoopStorageAdapter } from "../../storage/adapters";
import type { StorageAdapter } from "../../storage/types";
import { usePersistedUiState } from "../use-persisted-ui-state";

const provider = {} as DataProvider;
const wrap = (storage: StorageAdapter) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GenesisProvider provider={provider} storage={storage}>
        {children}
      </GenesisProvider>
    );
  };

beforeEach(() => localStorage.clear());

describe("usePersistedUiState", () => {
  it("starts at the default without writing it, then keeps what's set", () => {
    const storage = createMemoryStorageAdapter();
    const { result } = renderHook(() => usePersistedUiState("sidebar", false), { wrapper: wrap(storage) });
    expect(result.current[0]).toBe(false);
    expect(storage.getItem("sidebar")).toBeNull();
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(storage.getItem("sidebar")).toBe("true");
  });

  it("reads a stored value on a client-only render, with no flash of the default", () => {
    localStorage.setItem("widths", JSON.stringify({ name: 240 }));
    const seen: unknown[] = [];
    renderHook(
      () => {
        const [value] = usePersistedUiState<Record<string, number>>("widths", {});
        seen.push(value);
        return value;
      },
      { wrapper: wrap(createLocalStorageAdapter()) },
    );
    expect(seen[0]).toEqual({ name: 240 });
  });

  it("renders the default on the server, whatever storage holds", () => {
    localStorage.setItem("collapsed", "true");
    function Probe() {
      const [collapsed] = usePersistedUiState("collapsed", false);
      return <span>{String(collapsed)}</span>;
    }
    const html = renderToString(
      <GenesisProvider provider={provider} storage={createLocalStorageAdapter()}>
        <Probe />
      </GenesisProvider>,
    );
    expect(html).toContain("false");
  });

  it("keeps every hook on one key in step, and leaves other keys alone", () => {
    const storage = createMemoryStorageAdapter();
    function Pair() {
      const [a, setA] = usePersistedUiState("dock", "small");
      const [b] = usePersistedUiState("dock", "small");
      const [other] = usePersistedUiState("other", "x");
      return (
        <button type="button" onClick={() => setA("large")}>
          {a}/{b}/{other}
        </button>
      );
    }
    render(<Pair />, { wrapper: wrap(storage) });
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("large/large/x");
  });

  it("follows another tab's write (the storage event)", () => {
    const { result } = renderHook(() => usePersistedUiState("theme", "light"), { wrapper: wrap(createLocalStorageAdapter()) });
    act(() => {
      localStorage.setItem("theme", JSON.stringify("dark"));
      window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    });
    expect(result.current[0]).toBe("dark");
  });

  it("set(undefined) clears back to the default; a function sets from the current value", () => {
    const storage = createMemoryStorageAdapter();
    const { result } = renderHook(() => usePersistedUiState("count", 1), { wrapper: wrap(storage) });
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
    act(() => result.current[1](undefined));
    expect(result.current[0]).toBe(1);
    expect(storage.getItem("count")).toBeNull();
  });

  it("two function updates in one tick both apply, as useState's do", () => {
    const storage = createMemoryStorageAdapter();
    const { result } = renderHook(() => usePersistedUiState<string[]>("list", []), { wrapper: wrap(storage) });
    act(() => {
      result.current[1]((list) => [...list, "a"]);
      result.current[1]((list) => [...list, "b"]);
    });
    expect(result.current[0]).toEqual(["a", "b"]);
    expect(JSON.parse(storage.getItem("list")!)).toEqual(["a", "b"]);
  });

  it("falls back to the default for a value it can't read or won't accept", () => {
    const storage = createMemoryStorageAdapter();
    storage.setItem("broken", "{not json");
    storage.setItem("mode", "\"sideways\"");
    const modes = ["grid", "table"] as const;
    const { result } = renderHook(
      () => [
        usePersistedUiState("broken", "ok")[0],
        usePersistedUiState<(typeof modes)[number]>("mode", "grid", {
          parse: (raw) => {
            const value = JSON.parse(raw) as unknown;
            return modes.includes(value as never) ? (value as (typeof modes)[number]) : undefined;
          },
        })[0],
      ],
      { wrapper: wrap(storage) },
    );
    expect(result.current).toEqual(["ok", "grid"]);
  });

  it("reads and writes a plain string with its own parse and serialize (an existing key's format)", () => {
    const storage = createMemoryStorageAdapter();
    storage.setItem("legacy:collapsed", "1");
    const { result } = renderHook(
      () => usePersistedUiState("legacy:collapsed", false, { parse: (raw) => raw === "1", serialize: (v) => (v ? "1" : "0") }),
      { wrapper: wrap(storage) },
    );
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(storage.getItem("legacy:collapsed")).toBe("0");
  });

  it("is plain state with a null key: nothing read or written", () => {
    const storage = createMemoryStorageAdapter();
    storage.setItem("null", "\"stored\"");
    const { result } = renderHook(() => usePersistedUiState<string>(null, "a"), { wrapper: wrap(storage) });
    expect(result.current[0]).toBe("a");
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
    expect(storage.getItem("null")).toBe("\"stored\"");
  });

  it("keeps a value storage refused for this hook's lifetime", () => {
    const { result } = renderHook(() => usePersistedUiState("x", "a"), { wrapper: wrap(createNoopStorageAdapter()) });
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
  });

  it("reads the new key's own value when the key changes, never the last key's unsaved one", () => {
    const storage = createMemoryStorageAdapter();
    storage.setItem("page-b", "\"b-stored\"");
    const { result, rerender } = renderHook(({ key }) => usePersistedUiState<string>(key, "default"), {
      wrapper: wrap(storage),
      initialProps: { key: null as string | null },
    });
    act(() => result.current[1]("typed on a page with no key"));
    rerender({ key: "page-b" });
    expect(result.current[0]).toBe("b-stored");
    rerender({ key: "page-c" });
    expect(result.current[0]).toBe("default");
  });

  it("keeps a value when storage throws on write", () => {
    const throwing: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    const { result } = renderHook(() => usePersistedUiState("x", "a"), { wrapper: wrap(throwing) });
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
  });
});
