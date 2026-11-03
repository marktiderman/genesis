/** NativeRating: one image when read-only, radios when tappable. */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GenesisModulesProvider, type GenesisModules } from "../../native-modules";
import { describe, expect, it, vi } from "vitest";
import { NativeRating, nextRating } from "../rating";

describe("NativeRating", () => {
  it("is a single image labelled 'N of M stars' when read-only", () => {
    render(<NativeRating value={3} testID="r" />);
    const root = screen.getByTestId("r");
    expect(root.getAttribute("role")).toBe("image");
    expect(root.getAttribute("aria-label")).toBe("3 of 5 stars");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByTestId("r-star-5")).toBeTruthy();
  });

  it("honours max and label, and rounds the value", () => {
    render(<NativeRating value={7.6} max={10} label="hearts" testID="r" />);
    expect(screen.getByTestId("r").getAttribute("aria-label")).toBe("hearts: 8 of 10 stars");
    expect(screen.getByTestId("r-star-10")).toBeTruthy();
    expect(screen.queryByTestId("r-star-11")).toBeNull();
  });

  it("is a radiogroup of selectable stars with onChange", () => {
    const onChange = vi.fn();
    render(<NativeRating value={2} onChange={onChange} testID="r" />);
    expect(screen.getByTestId("r").getAttribute("role")).toBe("radiogroup");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(screen.getByTestId("r-star-2").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("r-star-3").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByTestId("r-star-4"));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe("NativeRating additions", () => {
  it("nextRating clears when the current value is pressed again", () => {
    expect(nextRating(3, 3)).toBe(0);
    expect(nextRating(3, 4)).toBe(4);
    expect(nextRating(0, 1)).toBe(1);
  });

  it("pressing the current star reports 0", () => {
    const onChange = vi.fn();
    render(<NativeRating value={2} onChange={onChange} testID="r" />);
    fireEvent.click(screen.getByTestId("r-star-2"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("readOnly wins over onChange, and getLabel writes the label", () => {
    render(<NativeRating value={4} onChange={() => undefined} readOnly getLabel={(v, m) => `Rated ${v}/${m}`} testID="r" />);
    const root = screen.getByTestId("r");
    expect(root.getAttribute("role")).toBe("image");
    expect(root.getAttribute("aria-label")).toBe("Rated 4/5");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("NativeRating accessibility", () => {
  it("names the read-only control by label, then the count", () => {
    render(<NativeRating value={3} label="Service rating" testID="r" />);
    expect(screen.getByTestId("r").getAttribute("aria-label")).toBe("Service rating: 3 of 5 stars");
  });

  it("applies getLabel to each radio as well as the value", () => {
    render(<NativeRating value={2} onChange={() => undefined} getLabel={(v, m) => `${v}/${m} hearts`} testID="r" />);
    expect(screen.getByTestId("r-star-4").getAttribute("aria-label")).toBe("4/5 hearts");
    expect(screen.getByTestId("r").getAttribute("aria-valuetext")).toBe("2/5 hearts");
  });

  it("distinguishes filled from empty fallback stars without colour", () => {
    const modules = {
      icons: { star: (p: { fill?: unknown; testID?: string }) => <i data-testid={p.testID} data-fill={String(p.fill)} /> },
    } as unknown as GenesisModules;
    const wrap = (node: ReactNode) => <GenesisModulesProvider modules={modules}>{node}</GenesisModulesProvider>;
    render(wrap(<NativeRating value={1} testID="r" />));
    expect(screen.getByTestId("r-star-1").getAttribute("data-fill")).not.toBe("none");
    expect(screen.getByTestId("r-star-2").getAttribute("data-fill")).toBe("none");
  });
});
