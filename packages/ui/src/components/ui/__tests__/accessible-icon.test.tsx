/**
 * AccessibleIcon — the label reaches the screen reader, the glyph does not.
 *
 * An icon-only button with no label renders perfectly and announces as
 * "button", full stop. Nothing in a typecheck, a build or a visual diff catches
 * that, so the contract is pinned here in three parts:
 *
 *   1. the child SVG is hidden from assistive tech (`aria-hidden`, and
 *      `focusable="false"` so it can't become a tab stop),
 *   2. the label is present as real text in the a11y tree, and
 *   3. together they produce the control's accessible NAME — the assertion
 *      that actually matters, since (1) and (2) can both hold while the name
 *      still comes out empty.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccessibleIcon } from "../accessible-icon";

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg data-testid="glyph" viewBox="0 0 24 24" {...props}>
      <path d="M3 6h18" />
    </svg>
  );
}

describe("AccessibleIcon", () => {
  it("gives an icon-only button its accessible name", () => {
    render(
      <button type="button">
        <AccessibleIcon label="Delete item">
          <TrashIcon />
        </AccessibleIcon>
      </button>
    );

    // The assertion the component exists for: without it the name is "".
    expect(screen.getByRole("button", { name: "Delete item" })).toBeTruthy();
  });

  it("hides the glyph from assistive technology", () => {
    render(
      <AccessibleIcon label="Delete item">
        <TrashIcon />
      </AccessibleIcon>
    );

    const glyph = screen.getByTestId("glyph");
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.getAttribute("focusable")).toBe("false");
  });

  it("renders the label as real text, not an aria-label attribute", () => {
    // An aria-label on the wrapper would be lost the moment the icon is put
    // inside a control that names itself from its content.
    render(
      <AccessibleIcon label="Delete item">
        <TrashIcon />
      </AccessibleIcon>
    );

    expect(screen.getByText("Delete item")).toBeTruthy();
  });

  it("visually hides the label rather than removing it", () => {
    render(
      <AccessibleIcon label="Delete item">
        <TrashIcon />
      </AccessibleIcon>
    );

    const style = screen.getByText("Delete item").style;
    expect(style.position).toBe("absolute");
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
  });

  it("preserves props the caller already put on the icon", () => {
    render(
      <AccessibleIcon label="Delete item">
        <TrashIcon className="size-4 text-muted-foreground" />
      </AccessibleIcon>
    );

    const glyph = screen.getByTestId("glyph");
    expect(glyph.classList.contains("size-4")).toBe(true);
    expect(glyph.classList.contains("text-muted-foreground")).toBe(true);
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
  });
});
