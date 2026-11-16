/**
 * A list answers to its own width (docs/RESPONSIVE.md, rules 1 and 4): useListWidth says whether
 * the frame it measures is under 40rem, and useViewPreference takes a responsive default's narrow
 * side from it before the viewport.
 */
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIST_NARROW_REM, ListNarrowContext, useListWidth } from "../use-list-width";
import { useViewPreference } from "../use-view-preference";

let width = 0;
let resized: (() => void) | undefined;

class FakeResizeObserver {
  el: Element | undefined;
  constructor(cb: (entries: { target: Element }[]) => void) {
    resized = () => this.el && cb([{ target: this.el }]);
  }
  observe(el: Element) {
    this.el = el;
  }
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  resized = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function Frame({ onNarrow }: { onNarrow: (n: boolean | undefined) => void }) {
  const [ref, narrow] = useListWidth<HTMLDivElement>();
  onNarrow(narrow);
  return <div ref={ref} />;
}

describe("useListWidth", () => {
  it("is narrow under 40rem and wide from there, following resizes", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => width);
    width = 343;
    let narrow: boolean | undefined;
    render(<Frame onNarrow={(n) => (narrow = n)} />);
    expect(narrow).toBe(true);
    width = LIST_NARROW_REM * 16;
    act(() => resized?.());
    expect(narrow).toBe(false);
    width = 360;
    act(() => resized?.());
    expect(narrow).toBe(true);
  });

  it("stays undefined without ResizeObserver, so the viewport decides", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    let narrow: boolean | undefined = false;
    render(<Frame onNarrow={(n) => (narrow = n)} />);
    expect(narrow).toBeUndefined();
  });
});

describe("useViewPreference with a measured list", () => {
  const within = (narrow: boolean | undefined) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <ListNarrowContext.Provider value={narrow}>{children}</ListNarrowContext.Provider>;
    };

  it("takes the narrow side in a narrow frame, whatever the viewport", () => {
    const { result } = renderHook(() => useViewPreference("people", { mobile: "list", desktop: "table" }), {
      wrapper: within(true),
    });
    expect(result.current[0]).toBe("list");
  });

  it("takes the wide side in a wide frame", () => {
    const { result } = renderHook(() => useViewPreference("people", { mobile: "list", desktop: "table" }), {
      wrapper: within(false),
    });
    expect(result.current[0]).toBe("table");
  });
});
