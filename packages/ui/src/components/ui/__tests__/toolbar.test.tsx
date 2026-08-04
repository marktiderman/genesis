/**
 * Toolbar — roving tabindex.
 *
 * This is the entire reason Toolbar is a Radix primitive rather than a
 * `<div className="flex gap-1">`, so it is the thing worth pinning. Two
 * properties, neither of which a typecheck or a build can see:
 *
 * 1. ONE TAB STOP. Exactly one item carries `tabindex="0"` at a time; the rest
 *    are `-1`. A plain flex row of buttons puts every control in the tab order,
 *    so a five-button toolbar costs a keyboard user five Tab presses to get
 *    past. If the wrapper ever regresses to a `div`, every item ends up
 *    tabbable and this assertion fails.
 *
 * 2. ARROWS MOVE FOCUS. Right/Left (horizontal) and Down/Up (vertical) move
 *    focus between items, and the tabindex follows the focus so the group
 *    remembers where you were.
 *
 * Separators must be skipped by both — a 1px divider is not a stop.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
} from "../toolbar";

function renderToolbar(orientation: "horizontal" | "vertical" = "horizontal") {
  return render(
    <Toolbar aria-label="Formatting" orientation={orientation} testID="tb">
      <ToolbarButton testID="bold">Bold</ToolbarButton>
      <ToolbarSeparator data-testid="sep" />
      <ToolbarButton testID="italic">Italic</ToolbarButton>
      <ToolbarButton testID="underline">Underline</ToolbarButton>
    </Toolbar>
  );
}

/**
 * Radix moves focus in response to keydown on the currently focused item — but
 * it defers the actual `.focus()` call to a `setTimeout(0)`, so every assertion
 * about where focus landed has to be awaited rather than read synchronously.
 */
function arrow(from: HTMLElement, key: string) {
  fireEvent.keyDown(from, { key });
}

/** Awaits the deferred focus move above. */
async function expectFocus(el: HTMLElement) {
  await waitFor(() => expect(document.activeElement).toBe(el));
}

describe("Toolbar — roving tabindex", () => {
  it("renders as a toolbar with an accessible name", () => {
    renderToolbar();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBe(
      screen.getByTestId("tb")
    );
  });

  it("is a single tab stop — the group, not each control", () => {
    renderToolbar();

    // Radix parks the tab stop on the toolbar itself and delegates inward on
    // focus; no individual item is reachable by Tab. A plain flex row of
    // buttons would put all three in the tab order.
    expect(screen.getByTestId("tb").getAttribute("tabindex")).toBe("0");

    const tabbableItems = ["bold", "italic", "underline"].filter(
      (id) => screen.getByTestId(id).getAttribute("tabindex") === "0"
    );
    expect(tabbableItems).toEqual([]);
  });

  it("promotes exactly one item to the tab stop once focus is inside", async () => {
    renderToolbar();

    screen.getByTestId("bold").focus();

    await waitFor(() =>
      expect(screen.getByTestId("bold").getAttribute("tabindex")).toBe("0")
    );
    expect(screen.getByTestId("italic").getAttribute("tabindex")).toBe("-1");
    expect(screen.getByTestId("underline").getAttribute("tabindex")).toBe("-1");
  });

  it("moves focus with ArrowRight and back with ArrowLeft", async () => {
    renderToolbar();

    const bold = screen.getByTestId("bold");
    const italic = screen.getByTestId("italic");

    bold.focus();
    expect(document.activeElement).toBe(bold);

    arrow(bold, "ArrowRight");
    await expectFocus(italic);

    arrow(italic, "ArrowLeft");
    await expectFocus(bold);
  });

  it("hands the tab stop to whichever item last had focus", async () => {
    renderToolbar();

    const bold = screen.getByTestId("bold");
    bold.focus();
    arrow(bold, "ArrowRight");
    await expectFocus(screen.getByTestId("italic"));

    // Tabbing away and back must return to Italic, not restart at Bold.
    expect(screen.getByTestId("italic").getAttribute("tabindex")).toBe("0");
    expect(bold.getAttribute("tabindex")).toBe("-1");
  });

  it("jumps to the last and first item with End and Home", async () => {
    renderToolbar();

    const bold = screen.getByTestId("bold");
    bold.focus();

    arrow(bold, "End");
    await expectFocus(screen.getByTestId("underline"));

    arrow(screen.getByTestId("underline"), "Home");
    await expectFocus(bold);
  });

  it("skips the separator instead of focusing it", async () => {
    renderToolbar();

    const separator = screen.getByTestId("sep");
    expect(separator.hasAttribute("tabindex")).toBe(false);

    const bold = screen.getByTestId("bold");
    bold.focus();
    arrow(bold, "ArrowRight");

    // One ArrowRight from Bold lands on Italic — the separator between them
    // is not a stop.
    await expectFocus(screen.getByTestId("italic"));
  });

  it("draws the separator across the axis perpendicular to the toolbar", () => {
    // Radix inverts the separator's orientation relative to the toolbar's, so
    // a horizontal toolbar gets a VERTICAL rule. Getting this backwards
    // produces a full-width line that slices the toolbar in half — a purely
    // visual failure no typecheck sees, which is why it is pinned here.
    const { rerender } = render(
      <Toolbar orientation="horizontal">
        <ToolbarSeparator data-testid="sep" />
      </Toolbar>
    );
    expect(screen.getByTestId("sep").getAttribute("data-orientation")).toBe(
      "vertical"
    );
    expect(
      screen.getByTestId("sep").classList.contains(
        "data-[orientation=vertical]:w-px"
      )
    ).toBe(true);

    rerender(
      <Toolbar orientation="vertical">
        <ToolbarSeparator data-testid="sep" />
      </Toolbar>
    );
    expect(screen.getByTestId("sep").getAttribute("data-orientation")).toBe(
      "horizontal"
    );
    expect(
      screen.getByTestId("sep").classList.contains(
        "data-[orientation=horizontal]:h-px"
      )
    ).toBe(true);
  });

  it("uses the vertical arrow keys when orientation is vertical", async () => {
    renderToolbar("vertical");

    const bold = screen.getByTestId("bold");
    bold.focus();

    // The keyboard axis has to follow the visual axis; if `orientation` reached
    // the CVA class but not the Radix prop, this would be a no-op.
    arrow(bold, "ArrowDown");
    await expectFocus(screen.getByTestId("italic"));

    arrow(screen.getByTestId("italic"), "ArrowUp");
    await expectFocus(bold);
  });

  it("keeps the visual axis in sync with the orientation prop", () => {
    const { rerender } = render(
      <Toolbar orientation="horizontal" testID="tb">
        <ToolbarButton testID="a">A</ToolbarButton>
      </Toolbar>
    );
    expect(screen.getByTestId("tb").classList.contains("flex-row")).toBe(true);

    rerender(
      <Toolbar orientation="vertical" testID="tb">
        <ToolbarButton testID="a">A</ToolbarButton>
      </Toolbar>
    );
    expect(screen.getByTestId("tb").classList.contains("flex-col")).toBe(true);
  });
});

describe("Toolbar — item types", () => {
  it("keeps a link an anchor so it stays middle-clickable", () => {
    render(
      <Toolbar aria-label="Nav">
        <ToolbarLink href="/docs" testID="docs">
          Docs
        </ToolbarLink>
      </Toolbar>
    );

    const link = screen.getByTestId("docs");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/docs");
    expect(screen.getByRole("link", { name: "Docs" })).toBe(link);
  });

  it("exposes toggle items as pressable radio/checkbox-style controls", () => {
    render(
      <Toolbar aria-label="Formatting">
        <ToolbarToggleGroup type="single" defaultValue="left">
          <ToolbarToggleItem value="left" testID="left">
            Left
          </ToolbarToggleItem>
          <ToolbarToggleItem value="right" testID="right">
            Right
          </ToolbarToggleItem>
        </ToolbarToggleGroup>
      </Toolbar>
    );

    expect(screen.getByTestId("left").getAttribute("data-state")).toBe("on");
    expect(screen.getByTestId("right").getAttribute("data-state")).toBe("off");

    fireEvent.click(screen.getByTestId("right"));

    expect(screen.getByTestId("right").getAttribute("data-state")).toBe("on");
    expect(screen.getByTestId("left").getAttribute("data-state")).toBe("off");
  });
});
