/**
 * A list answers to its own width (docs/RESPONSIVE.md, rules 1 and 4): useListWidth says whether
 * the frame it measures is under 40rem, and useViewPreference takes a responsive default's narrow
 * side from it before the viewport.
 */
import { act, render, renderHook } from "@testing-library/react";
import { useCallback, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIST_NARROW_REM, ListNarrowContext, useListWidth } from "../use-list-width";
import { useViewPreference } from "../use-view-preference";

type Callback = (entries: { contentRect: { width: number } }[]) => void;
let observed: Callback | undefined;

class FakeResizeObserver {
  constructor(cb: Callback) {
    observed = cb;
  }
  observe() {}
  disconnect() {}
}

afterEach(() => {
  observed = undefined;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Frame({ width, onNarrow }: { width: number; onNarrow: (n: boolean | undefined) => void }) {
  const [ref, narrow] = useListWidth();
  onNarrow(narrow);
  // A stable ref, as a component's own is: the frame is measured once, then followed by resizes.
  const measured = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) el.getBoundingClientRect = () => ({ width }) as DOMRect;
      ref(el);
    },
    [ref, width],
  );
  return <div ref={measured} />;
}

describe("useListWidth", () => {
  it("is narrow under 40rem and wide from there, following resizes", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    let narrow: boolean | undefined;
    render(<Frame width={343} onNarrow={(n) => (narrow = n)} />);
    expect(narrow).toBe(true);
    act(() => observed?.([{ contentRect: { width: LIST_NARROW_REM * 16 } }]));
    expect(narrow).toBe(false);
    act(() => observed?.([{ contentRect: { width: 360 } }]));
    expect(narrow).toBe(true);
  });

  it("stays undefined without ResizeObserver, so the viewport decides", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    let narrow: boolean | undefined = false;
    render(<Frame width={343} onNarrow={(n) => (narrow = n)} />);
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
