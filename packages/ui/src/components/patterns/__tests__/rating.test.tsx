/**
 * Rating accessibility + behaviour contract.
 *
 * A row of star icons renders and typechecks identically whether a screen
 * reader hears "3 of 5 stars" once, five anonymous images, or nothing. The
 * read-only `img` name, the radiogroup semantics and the arrow-key stepping
 * are pinned here because nothing else would catch their loss.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Rating, nextRating } from "../rating";

describe("Rating (read-only)", () => {
  it("renders one img named 'N of M stars'", () => {
    render(<Rating value={3} />);
    expect(screen.getByRole("img", { name: "3 of 5 stars" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("prefixes a label and honours max", () => {
    render(<Rating value={7} max={10} label="Quality" />);
    expect(screen.getByRole("img", { name: "Quality: 7 of 10 stars" })).toBeTruthy();
  });

  it("clamps out-of-range values", () => {
    render(<Rating value={9} />);
    expect(screen.getByRole("img", { name: "5 of 5 stars" })).toBeTruthy();
  });

  it("fills exactly `value` stars with the warning colour", () => {
    const { container } = render(<Rating value={2} />);
    const filled = container.querySelectorAll("svg.text-warning");
    const empty = container.querySelectorAll("svg.text-muted-foreground");
    expect(filled).toHaveLength(2);
    expect(empty).toHaveLength(3);
  });
});

describe("Rating (interactive)", () => {
  it("is a radiogroup of one radio per star with the value checked", () => {
    render(<Rating value={2} onChange={() => {}} label="Rate this" />);
    expect(screen.getByRole("radiogroup", { name: "Rate this" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
    expect(radios[0]!.getAttribute("aria-checked")).toBe("false");
  });

  it("reports the clicked star", () => {
    const onChange = vi.fn();
    render(<Rating value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "4 of 5 stars" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  // Radix's RadioGroup takes the keys on the focused radio, as a real user's focus is.
  // Radix moves focus on the next tick; the arrow chooses the star it lands on.
  const press = async (key: string) => {
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key });
      await new Promise((r) => setTimeout(r, 0));
      fireEvent.keyUp(document.activeElement!, { key });
    });
  };
  const focusStar = (n: number) => act(() => screen.getByRole("radio", { name: `${n} of 5 stars` }).focus());

  it("steps with ArrowRight / ArrowLeft and stops at the ends", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Rating value={2} onChange={onChange} />);
    focusStar(2);
    await press("ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith(3);

    rerender(<Rating value={3} onChange={onChange} />);
    await press("ArrowLeft");
    expect(onChange).toHaveBeenLastCalledWith(2);

    onChange.mockClear();
    rerender(<Rating value={5} onChange={onChange} />);
    focusStar(5);
    await press("ArrowRight");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowLeft stops at 1 and never clears", async () => {
    const onChange = vi.fn();
    render(<Rating value={1} onChange={onChange} />);
    focusStar(1);
    await press("ArrowLeft");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("swaps ArrowLeft / ArrowRight in a right-to-left group", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <div dir="rtl">
        <Rating value={3} onChange={onChange} />
      </div>,
    );
    focusStar(3);
    await press("ArrowLeft");
    expect(onChange).toHaveBeenLastCalledWith(4);
    rerender(
      <div dir="rtl">
        <Rating value={4} onChange={onChange} />
      </div>,
    );
    await press("ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("is one tab stop that lands on the checked star", () => {
    render(<Rating value={3} onChange={() => {}} />);
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("tabindex") === "-1")).toBe(true);
    act(() => screen.getByRole("radiogroup").focus());
    expect(document.activeElement?.getAttribute("aria-label")).toBe("3 of 5 stars");
  });
});

describe("Rating — readOnly, clearing, getLabel", () => {
  it("nextRating returns the star, or 0 when it is already the value", () => {
    expect(nextRating(3, 4)).toBe(4);
    expect(nextRating(3, 3)).toBe(0);
    expect(nextRating(0, 1)).toBe(1);
  });

  it("clears to 0 when the current value is clicked again", () => {
    const onChange = vi.fn();
    render(<Rating value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "3 of 5 stars" }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders read-only when readOnly is set, even with onChange", () => {
    const onChange = vi.fn();
    render(<Rating value={4} onChange={onChange} readOnly />);
    expect(screen.getByRole("img", { name: "4 of 5 stars" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("uses getLabel for the image name and every radio's name", () => {
    const getLabel = (v: number, m: number) => `${v}/${m} hearts`;
    const { unmount } = render(<Rating value={2} max={3} getLabel={getLabel} />);
    expect(screen.getByRole("img", { name: "2/3 hearts" })).toBeTruthy();
    unmount();
    render(<Rating value={2} max={3} getLabel={getLabel} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "3/3 hearts" })).toBeTruthy();
  });
});

describe("Rating — a form's stars", () => {
  it("keeps the chosen star when not clearable, and still calls the star's own click", () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(<Rating value={3} onChange={onChange} clearable={false} getItemProps={() => ({ onClick })} />);
    fireEvent.click(screen.getByRole("radio", { name: "3 of 5 stars" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("takes the group's aria, a star's description, and a 44px target", () => {
    render(<Rating value={0} onChange={vi.fn()} size="touch" tone="primary" aria-labelledby="q" aria-required getItemProps={(n) => ({ "aria-describedby": n === 1 ? "low" : undefined })} />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-labelledby")).toBe("q");
    expect(group.getAttribute("aria-label")).toBeNull();
    expect(group.getAttribute("aria-required")).toBe("true");
    const stars = screen.getAllByRole("radio");
    expect(stars[0]!.getAttribute("aria-describedby")).toBe("low");
    expect(stars[0]!.className).toContain("size-11");
  });

  it("colours the chosen stars by tone", () => {
    render(<Rating value={2} onChange={vi.fn()} tone="primary" />);
    expect(screen.getAllByRole("radio")[0]!.className).toContain("text-primary-text");
    expect(screen.getAllByRole("radio")[0]!.className).not.toContain("text-warning");
  });

  it("can be disabled", () => {
    const onChange = vi.fn();
    render(<Rating value={0} onChange={onChange} disabled />);
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
