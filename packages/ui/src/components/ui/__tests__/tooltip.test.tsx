/**
 * Tooltip — Radix-backed open/close, portalling, and trigger association.
 *
 * Tooltip used to be CSS-only: a `group` wrapper whose bubble was `hidden`
 * and revealed by `group-hover:block` / `group-focus-within:block`. The
 * regressions those class assertions locked out are now structural — Radix
 * owns opening, closing and the ARIA association — so this suite asserts the
 * BEHAVIOUR instead of the utility classes that used to stand in for it:
 *
 * 1. KEYBOARD REVEAL. The original bug was a bubble that only appeared on
 *    hover, leaving a Tab user with nothing. It is still the first thing
 *    tested, but now as "focusing the trigger opens the tooltip" rather than
 *    "the focus-within variant is present in the class list".
 *
 * 2. TRIGGER ASSOCIATION (CMT-367-003). The bubble must be REFERENCED by the
 *    trigger, not merely present, or a screen-reader user hears nothing while
 *    it is visibly open. Radix does this itself now; what it does NOT do is
 *    merge with an `aria-describedby` the caller already set — `Slot` lets
 *    child props win — so that union is still ours to guarantee and is still
 *    tested.
 *
 * 3. INVALID NESTING. `content` is a `ReactNode`, so callers pass block
 *    elements (`<p>`, `<ul>`, `<div>`). The bubble must not be phrasing
 *    content.
 *
 * The tooltip is portalled to `document.body`, so queries go through `screen`
 * (which searches the whole body) rather than the render container.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tooltip } from "../tooltip";

/** The bubble — the element `content` is rendered into, once open. */
function bubble() {
  return screen.getByRole("tooltip");
}

/** What Tab does: move focus to the trigger. */
function focusTrigger(el: HTMLElement) {
  act(() => {
    el.focus();
  });
}

describe("Tooltip — keyboard reveal", () => {
  it("stays closed until the trigger is reached", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on focus, not just on hover", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Hover me" });
    focusTrigger(trigger);

    expect(document.activeElement).toBe(trigger);
    expect(bubble().textContent).toBe("More info");
  });

  it("closes again on blur", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Hover me" });
    focusTrigger(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on pointer hover with no delay by default", async () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    fireEvent.pointerMove(screen.getByRole("button", { name: "Hover me" }), {
      pointerType: "mouse",
    });

    // `delayDuration` defaults to 0 — the CSS implementation had no delay, so
    // neither does this one. A regression to Radix's own 700ms default would
    // blow the default 1000ms `findBy` timeout only intermittently, hence the
    // tighter explicit budget.
    expect(await screen.findByRole("tooltip", {}, { timeout: 250 })).toBeTruthy();
  });

  it("dismisses on Escape", async () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    focusTrigger(screen.getByRole("button", { name: "Hover me" }));
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
});

describe("Tooltip — content contract", () => {
  it("renders block-level content in a block-capable wrapper", () => {
    render(
      <Tooltip
        content={
          <div>
            <p>Pro tip</p>
            <p>works with multiple blocks</p>
          </div>
        }
      >
        <button type="button">Rich</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Rich" }));

    const el = bubble();
    // A <span> here would make every block child invalid nesting.
    expect(el.tagName).toBe("DIV");
    expect(el.querySelectorAll("p")).toHaveLength(2);
    expect(el.closest("span")).toBeNull();
  });

  it("still renders plain string content", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));
    expect(bubble().textContent).toBe("More info");
  });
});

describe("Tooltip — wrapper and portal", () => {
  it("keeps the wrapper div that className and the rest of the div props land on", () => {
    const { container } = render(
      <Tooltip content="More info" className="custom" data-testid="wrap">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("group")).toBe(true);
    expect(wrapper.classList.contains("relative")).toBe(true);
    expect(wrapper.classList.contains("inline-flex")).toBe(true);
    // Caller className is merged, not replaced, and arbitrary div props still
    // reach the same element they always did.
    expect(wrapper.classList.contains("custom")).toBe(true);
    expect(wrapper.getAttribute("data-testid")).toBe("wrap");
  });

  it("portals the bubble out of the wrapper so no ancestor can clip it", () => {
    const { container } = render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));

    // The whole point of the portal: the bubble is NOT inside the (possibly
    // `overflow:hidden`) subtree that renders the trigger.
    expect(container.contains(bubble())).toBe(false);
    expect(document.body.contains(bubble())).toBe(true);
  });
});

describe("Tooltip — side placement", () => {
  it("defaults to top", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));
    expect(bubble().getAttribute("data-side")).toBe("top");
  });

  it("applies the requested side", () => {
    render(
      <Tooltip content="More info" side="right">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));
    expect(bubble().getAttribute("data-side")).toBe("right");
  });
});

// ---------------------------------------------------------------------------
// CMT-367-003 — the bubble must be ASSOCIATED with its trigger, not merely
// present. Before this, the bubble carried role="tooltip" with no id and the
// trigger had no aria-describedby, so a screen-reader user who focused the
// trigger was told nothing while the tooltip was visibly open.
//
// Radix now owns the id and the association. What it does NOT own is the
// union with a caller-supplied `aria-describedby`: `Slot` merges child props
// OVER slot props for every non-handler attribute, so without the shim in
// tooltip.tsx a trigger that already described itself would silently drop the
// tooltip's id — the same silence, reintroduced.
// ---------------------------------------------------------------------------

describe("Tooltip — trigger association", () => {
  it("points the trigger at the bubble via aria-describedby while open", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    const trigger = screen.getByRole("button", { name: "Hover me" });
    focusTrigger(trigger);

    const id = bubble().getAttribute("id");
    expect(id).toBeTruthy();
    expect(trigger.getAttribute("aria-describedby")).toBe(id);
  });

  it("leaves no dangling reference once closed", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    const trigger = screen.getByRole("button", { name: "Hover me" });

    // The bubble is unmounted when closed, so an id pointing at it would
    // reference nothing.
    expect(trigger.getAttribute("aria-describedby")).toBeNull();
  });

  it("appends to an aria-describedby the caller already set", () => {
    render(
      <>
        <span id="hint">Existing hint</span>
        <Tooltip content="More info">
          <button type="button" aria-describedby="hint">
            Hover me
          </button>
        </Tooltip>
      </>
    );
    const trigger = screen.getByRole("button", { name: "Hover me" });

    // Closed: the caller's own reference, untouched.
    expect(trigger.getAttribute("aria-describedby")).toBe("hint");

    focusTrigger(trigger);
    const described = trigger.getAttribute("aria-describedby")!.split(" ");

    // Open: the caller's reference survives; ours is added, not substituted.
    expect(described).toContain("hint");
    expect(described).toContain(bubble().getAttribute("id"));
  });

  it("gives each instance its own id", () => {
    render(
      <>
        <Tooltip content="First">
          <button type="button">One</button>
        </Tooltip>
        <Tooltip content="Second">
          <button type="button">Two</button>
        </Tooltip>
      </>
    );
    // Only one can be open at a time — focusing the second blurs the first,
    // and Radix additionally closes any other open tooltip — so read them in
    // turn rather than expecting two bubbles at once.
    const first = screen.getByRole("button", { name: "One" });
    focusTrigger(first);
    const firstId = bubble().getAttribute("id");
    expect(first.getAttribute("aria-describedby")).toBe(firstId);

    const second = screen.getByRole("button", { name: "Two" });
    focusTrigger(second);
    const secondId = bubble().getAttribute("id");
    expect(second.getAttribute("aria-describedby")).toBe(secondId);

    expect(firstId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  it("leaves a non-element child alone rather than throwing", async () => {
    // Radix's Slot throws on anything that isn't a single element, so bare
    // text gets a <span> wrapper instead of a crash. It is deliberately not
    // focusable — a text trigger never was a tab stop — so the pointer is the
    // only way in.
    render(<Tooltip content="More info">plain text</Tooltip>);
    const text = screen.getByText("plain text");
    expect(text.tagName).toBe("SPAN");

    fireEvent.pointerMove(text, { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// A fragment child is the trap `React.isValidElement` does not catch: it
// returns TRUE for `<>…</>`, so a fragment slips past a bare validity check and
// Radix's `Slot` then clones the FRAGMENT rather than the DOM node inside it.
// Fragments accept no props, so every handler and the ref are discarded and the
// tooltip never opens at all.
// ---------------------------------------------------------------------------

describe("Tooltip — fragment children", () => {
  it("wraps a fragment child so the trigger still opens the tooltip", async () => {
    render(
      <Tooltip content="More info">
        <>
          <button type="button">Fragmented</button>
        </>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Fragmented" });
    // The wrapper is what Radix actually instruments, not the inner button.
    const host = trigger.parentElement!;
    expect(host.tagName).toBe("SPAN");

    fireEvent.pointerMove(host, { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
  });

  it("wraps multiple children too", async () => {
    render(
      <Tooltip content="More info">
        <span>one</span>
        <span>two</span>
      </Tooltip>
    );

    const host = screen.getByText("one").parentElement!;
    expect(host.tagName).toBe("SPAN");
    fireEvent.pointerMove(host, { pointerType: "mouse" });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// THEME SCOPE. `GenesisThemeProvider` scopes dark CSS variables under a
// `[data-theme="dark"]` wrapper. A portal puts the bubble on `document.body`,
// OUTSIDE that wrapper, so without mirroring the attribute onto the bubble a
// dark app renders a light tooltip. This is invisible to every other test — the
// markup is identical either way — so it is asserted through computed style, on
// a rule that only matches when the attribute is present.
// ---------------------------------------------------------------------------

describe("Tooltip — theme scope across the portal", () => {
  function withThemeStylesheet() {
    const style = document.createElement("style");
    style.textContent =
      ':root { --probe-bg: light } [data-theme="dark"] { --probe-bg: dark }';
    document.head.appendChild(style);
    return () => style.remove();
  }

  it("resolves themed variables even though the bubble is portalled out", () => {
    const cleanup = withThemeStylesheet();
    try {
      const { container } = render(
        // How GenesisThemeProvider renders: display:contents + data-theme.
        <div data-theme="dark" style={{ display: "contents" }}>
          <Tooltip content="More info">
            <button type="button">Hover me</button>
          </Tooltip>
        </div>
      );
      focusTrigger(screen.getByRole("button", { name: "Hover me" }));

      const el = bubble();
      // Precondition: it really did leave the themed subtree.
      expect(container.contains(el)).toBe(false);
      // ...and still resolves the dark value, because the scope came with it.
      expect(el.getAttribute("data-theme")).toBe("dark");
      expect(getComputedStyle(el).getPropertyValue("--probe-bg")).toBe("dark");
    } finally {
      cleanup();
    }
  });

  it("adds no theme attribute when nothing scopes one", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));
    // Consumers not using a themed wrapper get untouched markup.
    expect(bubble().hasAttribute("data-theme")).toBe(false);
  });
});

describe("Tooltip — motion", () => {
  it("honours prefers-reduced-motion", () => {
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>
    );
    focusTrigger(screen.getByRole("button", { name: "Hover me" }));

    // The entrance animation is NEW — the CSS-only implementation had none —
    // so it ships with the escape hatch rather than running unconditionally.
    const classes = bubble().className.split(/\s+/);
    expect(classes).toContain("animate-in");
    expect(classes).toContain("motion-reduce:animate-none");
    expect(classes).toContain("motion-reduce:transition-none");
  });
});
