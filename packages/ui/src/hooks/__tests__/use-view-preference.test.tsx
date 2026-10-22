/**
 * useViewPreference — only an explicit choice is persisted.
 *
 * The defect: the hook wrote its default to storage on mount, so a
 * responsive "cards on phones" default became the user's stored choice the
 * first time the page rendered on a phone — and the desktop then opened in
 * cards too.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { GenesisProvider } from "../../provider";
import { useViewPreference } from "../use-view-preference";

const wrapper = ({ children }: { children: ReactNode }) => (
  <GenesisProvider mock={{ datasets: {} }}>{children}</GenesisProvider>
);

function mockViewport(mobile: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: mobile,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useViewPreference", () => {
  it("does not write the default to storage", () => {
    const { result } = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    expect(result.current[0]).toBe("table");
    expect(localStorage.getItem("genesis-view-choice-posts")).toBeNull();
  });

  it("persists an explicit choice, which then wins over the default", () => {
    const { result, unmount } = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    act(() => result.current[1]("grid"));
    expect(result.current[0]).toBe("grid");
    expect(localStorage.getItem("genesis-view-choice-posts")).toBe("grid");
    unmount();

    const again = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    expect(again.result.current[0]).toBe("grid");
  });

  it("uses the mobile default on a phone, without storing it", () => {
    mockViewport(true);
    const { result } = renderHook(
      () => useViewPreference("posts", { mobile: "grid", desktop: "table" }),
      { wrapper },
    );
    expect(result.current[0]).toBe("grid");
    expect(localStorage.getItem("genesis-view-choice-posts")).toBeNull();
  });

  it("uses the desktop default on a desktop", () => {
    mockViewport(false);
    const { result } = renderHook(
      () => useViewPreference("posts", { mobile: "grid", desktop: "table" }),
      { wrapper },
    );
    expect(result.current[0]).toBe("table");
  });

  it("lets a stored choice beat the responsive default on any viewport", () => {
    localStorage.setItem("genesis-view-choice-posts", "list");
    mockViewport(true);
    const { result } = renderHook(
      () => useViewPreference("posts", { mobile: "grid", desktop: "table" }),
      { wrapper },
    );
    expect(result.current[0]).toBe("list");
  });

  it("honours a legacy stored value for a plain default (old versions stored defaults there)", () => {
    localStorage.setItem("genesis-view-posts", "list");
    const { result } = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    expect(result.current[0]).toBe("list");
  });

  it("ignores the legacy value for a responsive default — it may be a stored default", () => {
    localStorage.setItem("genesis-view-posts", "table");
    mockViewport(true);
    const { result } = renderHook(
      () => useViewPreference("posts", { mobile: "grid", desktop: "table" }),
      { wrapper },
    );
    expect(result.current[0]).toBe("grid");
  });

  it("shares a choice with another instance on the same key", () => {
    const a = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    const b = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    act(() => a.result.current[1]("list"));
    expect(b.result.current[0]).toBe("list");
  });

  it("ignores a stored value that is not a view mode", () => {
    localStorage.setItem("genesis-view-choice-posts", "kanban");
    const { result } = renderHook(() => useViewPreference("posts", "table"), { wrapper });
    expect(result.current[0]).toBe("table");
  });
});
