/**
 * useKeyboardNavigation — j/k/Enter/x behavior (pre-existing) plus the new
 * Backspace ("go back") wiring added for ResourcePage's default-on keyboard
 * navigation (genesis MASTER_PLAN item U7).
 */
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useKeyboardNavigation } from "../use-keyboard-navigation";

/** Dispatches the key and returns the event, so callers can assert on
 *  `defaultPrevented` — i.e. whether the hook swallowed the keystroke. */
function pressKey(
  key: string,
  target: EventTarget = document,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("useKeyboardNavigation", () => {
  it("moves focusedIndex down/up with j/k", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3 }),
    );

    expect(result.current.focusedIndex).toBe(-1);

    pressKey("j");
    expect(result.current.focusedIndex).toBe(0);

    pressKey("j");
    expect(result.current.focusedIndex).toBe(1);

    pressKey("k");
    expect(result.current.focusedIndex).toBe(0);
  });

  it("clamps focusedIndex to the item count bounds", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 2 }),
    );

    pressKey("j");
    pressKey("j");
    pressKey("j"); // past the end
    expect(result.current.focusedIndex).toBe(1);

    pressKey("k");
    pressKey("k");
    pressKey("k"); // past the start
    expect(result.current.focusedIndex).toBe(0);
  });

  it("calls onOpen with the focused index on Enter, only once focused", () => {
    const onOpen = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onOpen }));

    pressKey("Enter");
    expect(onOpen).not.toHaveBeenCalled();

    pressKey("j");
    pressKey("Enter");
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("calls onToggleSelect with the focused index on x", () => {
    const onToggleSelect = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onToggleSelect }),
    );

    pressKey("x");
    expect(onToggleSelect).not.toHaveBeenCalled();

    pressKey("j");
    pressKey("j");
    pressKey("x");
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("calls onBack on Backspace even when nothing is focused", () => {
    const onBack = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onBack }));

    pressKey("Backspace");
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledWith(-1);
  });

  it("calls onBack with the current focused index once navigation is active", () => {
    const onBack = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onBack }));

    pressKey("j");
    pressKey("j");
    pressKey("Backspace");
    expect(onBack).toHaveBeenCalledWith(1);
  });

  it("does not intercept Backspace (or any nav key) while typing in an input", () => {
    const onBack = vi.fn();
    const onOpen = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onBack, onOpen }));

    const input = document.createElement("input");
    document.body.appendChild(input);

    pressKey("Backspace", input);
    pressKey("Enter", input);

    expect(onBack).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("does nothing when disabled", () => {
    const onBack = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onBack, enabled: false }),
    );

    pressKey("j");
    pressKey("Backspace");

    expect(result.current.focusedIndex).toBe(-1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("resets focus on Escape without requiring onBack", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3 }),
    );

    pressKey("j");
    pressKey("j");
    expect(result.current.focusedIndex).toBe(1);

    // Never prevented: Radix's DismissableLayer owns Escape, and swallowing
    // it would leave an open dialog trapped with its focus trap armed.
    const escape = pressKey("Escape");
    expect(escape.defaultPrevented).toBe(false);
    expect(result.current.focusedIndex).toBe(-1);
    expect(result.current.isActive).toBe(false);
  });

  it("leaves Backspace alone when no onBack is supplied", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3 }),
    );

    // Not merely a no-op: the default must survive, or a page with nothing
    // to close would still swallow the browser/app's Backspace.
    const event = pressKey("Backspace");
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.focusedIndex).toBe(-1);
  });
});

describe("useKeyboardNavigation — modified chords are never captured", () => {
  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
    ["altKey", { altKey: true }],
  ])("ignores %s combinations so app shortcuts keep working", (_label, mods) => {
    const onToggleSelect = vi.fn();
    const onBack = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onToggleSelect, onBack }),
    );

    // Cmd/Ctrl+K is the canonical command-palette chord.
    const k = pressKey("k", document, mods);
    const j = pressKey("j", document, mods);
    const x = pressKey("x", document, mods);
    const down = pressKey("ArrowDown", document, mods);
    const back = pressKey("Backspace", document, mods);

    for (const event of [k, j, x, down, back]) {
      expect(event.defaultPrevented).toBe(false);
    }
    expect(result.current.focusedIndex).toBe(-1);
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("useKeyboardNavigation — overlayOpen", () => {
  it("suspends cursor movement and activation while an overlay is open", () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 3,
        onOpen,
        onToggleSelect,
        overlayOpen: true,
      }),
    );

    const j = pressKey("j");
    const enter = pressKey("Enter");
    const x = pressKey("x");

    expect(result.current.focusedIndex).toBe(-1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleSelect).not.toHaveBeenCalled();
    for (const event of [j, enter, x]) {
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("keeps onBack live while an overlay is open — that is what dismisses it", () => {
    const onBack = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onBack, overlayOpen: true }),
    );

    const event = pressKey("Backspace");
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("useKeyboardNavigation — focused controls keep their own keys", () => {
  it("does not steal Enter from a focused button (would re-open the row)", () => {
    const onOpen = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onOpen }));

    pressKey("j"); // focus row 0
    const button = document.createElement("button");
    document.body.appendChild(button);

    const event = pressKey("Enter", button);
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(button);
  });

  it("does not drive the list from inside a dialog", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onOpen }),
    );

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("span");
    dialog.appendChild(inner);
    document.body.appendChild(dialog);

    pressKey("j", inner);
    pressKey("Enter", inner);

    expect(result.current.focusedIndex).toBe(-1);
    expect(onOpen).not.toHaveBeenCalled();

    document.body.removeChild(dialog);
  });

  it("still dismisses via Backspace when focus is inside the dialog", () => {
    const onBack = vi.fn();
    renderHook(() => useKeyboardNavigation({ itemCount: 3, onBack }));

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    pressKey("Backspace", dialog);
    expect(onBack).toHaveBeenCalledTimes(1);

    document.body.removeChild(dialog);
  });
});

describe("useKeyboardNavigation — rendered-batch ceiling", () => {
  /** Mirrors DataGrid: a container holding only the rendered slice. */
  function mountContainer(
    result: { current: { containerRef: { current: HTMLDivElement | null } } },
    renderedCount: number,
  ) {
    const container = document.createElement("div");
    for (let i = 0; i < renderedCount; i++) {
      const item = document.createElement("div");
      item.setAttribute("data-nav-item", "");
      container.appendChild(item);
    }
    document.body.appendChild(container);
    result.current.containerRef.current = container;
    return container;
  }

  it("stops at the last rendered item rather than walking into unrendered rows", () => {
    // 10 rows in the data, only 3 rendered so far (batched grid).
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 10 }),
    );
    const container = mountContainer(result, 3);

    for (let i = 0; i < 8; i++) pressKey("j");

    // Without the DOM ceiling this would be 9 — a row with no element, so no
    // focus ring, and Enter/x acting on something invisible.
    expect(result.current.focusedIndex).toBe(2);

    document.body.removeChild(container);
  });

  it("continues once the next batch has rendered", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 10 }),
    );
    const container = mountContainer(result, 3);

    for (let i = 0; i < 5; i++) pressKey("j");
    expect(result.current.focusedIndex).toBe(2);

    // Batch observer expands the rendered slice.
    for (let i = 3; i < 6; i++) {
      const item = document.createElement("div");
      item.setAttribute("data-nav-item", "");
      container.appendChild(item);
    }

    pressKey("j");
    expect(result.current.focusedIndex).toBe(3);

    document.body.removeChild(container);
  });

  it("falls back to itemCount when the container marks up no nav items", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 4 }),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    result.current.containerRef.current = container;

    for (let i = 0; i < 6; i++) pressKey("j");
    expect(result.current.focusedIndex).toBe(3);

    document.body.removeChild(container);
  });

  it("does not invent focus when nothing is navigable", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 0 }),
    );

    // Without the max<=0 guard, k from focusedIndex=-1 clamps to 0.
    pressKey("j");
    pressKey("k");
    expect(result.current.focusedIndex).toBe(-1);
  });

  it("does not open or toggle a focus index past the rendered ceiling", () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 10, onOpen, onToggleSelect }),
    );
    const container = mountContainer(result, 3);

    for (let i = 0; i < 5; i++) pressKey("j");
    expect(result.current.focusedIndex).toBe(2);

    // Batch shrinks (filter/reset) without itemCount changing — focus is
    // now past the live DOM ceiling.
    while (container.childElementCount > 1) {
      container.removeChild(container.lastChild!);
    }

    pressKey("Enter");
    pressKey("x");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleSelect).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it("uses instant scroll during key-repeat so batch observers can catch up", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 10 }),
    );
    const container = mountContainer(result, 5);
    const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    pressKey("j");
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );

    pressKey("j", document, { repeat: true });
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );

    spy.mockRestore();
    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Grid column stride (CMT-366-002)
// ---------------------------------------------------------------------------

/**
 * Builds a container of `[data-nav-item]` rows, optionally laid out as a CSS
 * grid so the hook can measure its column count the way it does in a browser.
 */
function mountGrid(
  result: { current: { containerRef: { current: HTMLDivElement | null } } },
  itemCount: number,
  gridTemplateColumns?: string,
): HTMLDivElement {
  const container = document.createElement("div");
  if (gridTemplateColumns) {
    container.style.display = "grid";
    container.style.gridTemplateColumns = gridTemplateColumns;
  }
  for (let i = 0; i < itemCount; i++) {
    const item = document.createElement("div");
    item.setAttribute("data-nav-item", "");
    container.appendChild(item);
  }
  document.body.appendChild(container);
  result.current.containerRef.current = container;
  return container;
}

describe("useKeyboardNavigation — vertical keys follow the grid", () => {
  it("steps a whole row with ArrowDown/ArrowUp in a multi-column grid", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 9, columns: 3 }),
    );

    // First move always lands on the first item, whatever the stride.
    pressKey("ArrowDown");
    expect(result.current.focusedIndex).toBe(0);

    // Row 0 -> row 1 -> row 2, i.e. +3 each, NOT +1.
    pressKey("ArrowDown");
    expect(result.current.focusedIndex).toBe(3);
    pressKey("ArrowDown");
    expect(result.current.focusedIndex).toBe(6);

    pressKey("ArrowUp");
    expect(result.current.focusedIndex).toBe(3);
  });

  it("j/k use the same row stride as the arrows", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 9, columns: 3 }),
    );

    pressKey("j");
    pressKey("j");
    expect(result.current.focusedIndex).toBe(3);
    pressKey("k");
    expect(result.current.focusedIndex).toBe(0);
  });

  it("ArrowLeft/ArrowRight move a single cell within the row", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 9, columns: 3 }),
    );

    pressKey("ArrowDown"); // index 0
    pressKey("ArrowRight");
    expect(result.current.focusedIndex).toBe(1);
    pressKey("ArrowRight");
    expect(result.current.focusedIndex).toBe(2);
    pressKey("ArrowLeft");
    expect(result.current.focusedIndex).toBe(1);
  });

  it("clamps a downward row step to the last item instead of overshooting", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 8, columns: 3 }),
    );

    pressKey("j"); // 0
    pressKey("j"); // 3
    pressKey("j"); // 6
    expect(result.current.focusedIndex).toBe(6);
    pressKey("j"); // 9 would overshoot 7
    expect(result.current.focusedIndex).toBe(7);
  });

  it("measures the live column count off the container when `columns` is unset", () => {
    const { result } = renderHook(() => useKeyboardNavigation({ itemCount: 9 }));
    const container = mountGrid(result, 9, "100px 100px 100px");

    pressKey("j");
    expect(result.current.focusedIndex).toBe(0);
    pressKey("j");
    // Measured 3-up grid: a row step, not a single card.
    expect(result.current.focusedIndex).toBe(3);

    document.body.removeChild(container);
  });

  it("treats a non-grid container as a single column (flat-list stepping)", () => {
    const { result } = renderHook(() => useKeyboardNavigation({ itemCount: 9 }));
    // No display:grid — a list view's stacked rows.
    const container = mountGrid(result, 9);

    pressKey("j");
    pressKey("j");
    expect(result.current.focusedIndex).toBe(1);

    // Horizontal keys stay inert in a single column.
    const right = pressKey("ArrowRight");
    expect(right.defaultPrevented).toBe(false);
    expect(result.current.focusedIndex).toBe(1);

    document.body.removeChild(container);
  });

  it("does not guess a column count from an unresolved track list", () => {
    const { result } = renderHook(() => useKeyboardNavigation({ itemCount: 9 }));
    // A *specified* value rather than a browser's resolved track list; its
    // spaces are not tracks, so it must not be counted as 2 columns.
    const container = mountGrid(result, 9, "repeat(3, minmax(0, 1fr))");

    pressKey("j");
    pressKey("j");
    expect(result.current.focusedIndex).toBe(1);

    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// R2 — never swallow a key that does nothing
// ---------------------------------------------------------------------------

describe("useKeyboardNavigation — page scrolling survives", () => {
  it("leaves ArrowUp/ArrowDown to the browser on an empty list", () => {
    renderHook(() => useKeyboardNavigation({ itemCount: 0 }));

    // Regression: these were preventDefault()ed unconditionally, so an empty
    // ResourcePage silently lost page scrolling with no cursor to move.
    expect(pressKey("ArrowDown").defaultPrevented).toBe(false);
    expect(pressKey("ArrowUp").defaultPrevented).toBe(false);
    expect(pressKey("j").defaultPrevented).toBe(false);
    expect(pressKey("k").defaultPrevented).toBe(false);
  });

  it("claims the key only while the cursor actually moves", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 2 }),
    );

    expect(pressKey("ArrowDown").defaultPrevented).toBe(true); // -1 -> 0
    expect(pressKey("ArrowDown").defaultPrevented).toBe(true); // 0 -> 1
    // Already on the last item: nothing to move, so the page scrolls.
    expect(pressKey("ArrowDown").defaultPrevented).toBe(false);
    expect(result.current.focusedIndex).toBe(1);

    expect(pressKey("ArrowUp").defaultPrevented).toBe(true); // 1 -> 0
    // Already on the first item.
    expect(pressKey("ArrowUp").defaultPrevented).toBe(false);
  });

  it("still claims ArrowDown at the rendered-batch ceiling, where it does work", () => {
    // 10 rows of data, 3 rendered: stopping here is not "nothing happened" —
    // it scrolls the last rendered row into view to trip the batch observer.
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 10 }),
    );
    const container = mountGrid(result, 3);
    const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    pressKey("j");
    pressKey("j");
    pressKey("j");
    expect(result.current.focusedIndex).toBe(2);

    spy.mockClear();
    const pinned = pressKey("j");
    expect(pinned.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
    document.body.removeChild(container);
  });

  it("adopts the first item still in view rather than jumping back to index 0", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation({ itemCount: 6 }),
    );
    const container = mountGrid(result, 6);
    const items = container.querySelectorAll("[data-nav-item]");
    items.forEach((el, i) => {
      // Items 0 and 1 are scrolled off the top; item 2 is the first visible.
      const top = (i - 2) * 100;
      (el as HTMLElement).getBoundingClientRect = () =>
        ({
          top,
          bottom: top + 90,
          left: 0,
          right: 100,
          width: 100,
          height: 90,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    pressKey("ArrowDown");
    expect(result.current.focusedIndex).toBe(2);

    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Backspace: composite widgets keep it
// ---------------------------------------------------------------------------

describe("useKeyboardNavigation — Backspace ownership", () => {
  /**
   * Mounts a fragment of overlay markup and hands back the element marked
   * `data-target` — the thing the keydown is dispatched from, which is what
   * the Backspace ownership rules are decided on.
   */
  function mountIn(html: string): { host: HTMLDivElement; target: HTMLElement } {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return { host, target: host.querySelector("[data-target]") as HTMLElement };
  }

  it("leaves Backspace to a composite widget inside the open panel", () => {
    const onBack = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onBack, overlayOpen: true }),
    );

    // A Radix Select's open listbox, a tree, a canvas editor — all run their
    // own Backspace handling; hijacking it to close the panel loses the key.
    const { host, target } = mountIn(
      '<div role="dialog"><div role="listbox"><div role="option" data-target tabindex="-1"></div></div></div>',
    );

    const event = pressKey("Backspace", target);
    expect(event.defaultPrevented).toBe(false);
    expect(onBack).not.toHaveBeenCalled();

    document.body.removeChild(host);
  });

  it("honours the data-keyboard-nav=off escape hatch", () => {
    const onBack = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onBack, overlayOpen: true }),
    );
    const { host, target } = mountIn(
      '<div role="dialog" data-keyboard-nav="off"><span data-target></span></div>',
    );

    expect(pressKey("Backspace", target).defaultPrevented).toBe(false);
    expect(onBack).not.toHaveBeenCalled();

    document.body.removeChild(host);
  });

  it("still dismisses from a plain button inside the panel", () => {
    const onBack = vi.fn();
    renderHook(() =>
      useKeyboardNavigation({ itemCount: 3, onBack, overlayOpen: true }),
    );
    const { host, target } = mountIn(
      '<div role="dialog"><button data-target type="button">Edit</button></div>',
    );

    expect(pressKey("Backspace", target).defaultPrevented).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);

    document.body.removeChild(host);
  });
});

// ---------------------------------------------------------------------------
// CMT-366-001 — state updaters stay pure
// ---------------------------------------------------------------------------

describe("useKeyboardNavigation — StrictMode safety", () => {
  it("scrolls once per keypress even when StrictMode double-invokes updaters", () => {
    const { result } = renderHook(
      () => useKeyboardNavigation({ itemCount: 5 }),
      { wrapper: StrictMode },
    );
    const container = mountGrid(result, 5);
    const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    pressKey("j");
    // Regression: scrollToItem used to run inside the setFocusedIndex
    // updater, which React deliberately calls twice in development.
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    pressKey("j");
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    document.body.removeChild(container);
  });
});
