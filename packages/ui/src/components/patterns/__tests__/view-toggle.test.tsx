/**
 * ViewToggle / ViewSettings accessibility contract.
 *
 * Both components moved into `patterns/` in the layer split. Their controls
 * are ICON-ONLY, which is where these assertions earn their place: an icon
 * button with no accessible name, and a selected state expressed purely as a
 * `default` vs `ghost` CSS variant, render and typecheck perfectly while being
 * unusable and unreadable to a screen reader. Nothing else in the repo would
 * catch either. So the accessible name and the pressed state are pinned to the
 * rendered DOM here.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ViewToggle } from "../view-toggle";
import { ViewSettings } from "../view-settings";

describe("ViewToggle", () => {
  it("names every icon-only button so it is not an anonymous control", () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={() => {}} />);

    // getByRole matches on the ACCESSIBLE NAME, so these queries only pass
    // when the name is really computed — an icon alone would not do it.
    expect(screen.getByRole("button", { name: "Grid view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Table view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "List view" })).toBeTruthy();
  });

  it("reports the active view with aria-pressed, not just a colour variant", () => {
    render(<ViewToggle viewMode="table" onViewModeChange={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Table view" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "List view" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("moves aria-pressed when the selected mode changes", () => {
    const { rerender } = render(
      <ViewToggle viewMode="grid" onViewModeChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed"),
    ).toBe("true");

    rerender(<ViewToggle viewMode="list" onViewModeChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "List view" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("groups the three buttons under one label", () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={() => {}} />);
    expect(screen.getByRole("group", { name: "View mode" })).toBeTruthy();
  });

  it("still reports the clicked mode (behaviour unchanged by the a11y fix)", () => {
    const onViewModeChange = vi.fn();
    render(<ViewToggle viewMode="grid" onViewModeChange={onViewModeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });

  it("exposes stable automation selectors on the buttons themselves", () => {
    render(<ViewToggle viewMode="grid" onViewModeChange={() => {}} />);

    expect(screen.getByTestId("view-toggle-grid")).toBe(
      screen.getByRole("button", { name: "Grid view" }),
    );
    expect(screen.getByTestId("view-toggle-table")).toBe(
      screen.getByRole("button", { name: "Table view" }),
    );
    expect(screen.getByTestId("view-toggle-list")).toBe(
      screen.getByRole("button", { name: "List view" }),
    );
  });
});

describe("ViewSettings", () => {
  const props = {
    pageSize: 25,
    onPageSizeChange: () => {},
    density: "comfortable" as const,
    onDensityChange: () => {},
  };

  it("names the icon-only trigger without relying on title", () => {
    render(<ViewSettings {...props} />);

    const trigger = screen.getByRole("button", { name: "View settings" });
    expect(trigger).toBe(screen.getByTestId("view-settings-trigger"));
    // `title` is a tooltip, not a dependable accessible name — assert the
    // explicit label is what supplies it.
    expect(trigger.getAttribute("aria-label")).toBe("View settings");
  });

  it("associates each select with its visible label", () => {
    render(<ViewSettings {...props} />);
    fireEvent.click(screen.getByTestId("view-settings-trigger"));

    // Radix renders each SelectTrigger as a <button>, so a bare <label> next
    // to it associates with nothing. These pass only via aria-labelledby.
    expect(screen.getByRole("combobox", { name: "Page size" })).toBe(
      screen.getByTestId("view-settings-page-size"),
    );
    expect(screen.getByRole("combobox", { name: "Density" })).toBe(
      screen.getByTestId("view-settings-density"),
    );
  });

  it("gives each mounted instance its own label ids", () => {
    render(
      <>
        <ViewSettings {...props} />
        <ViewSettings {...props} />
      </>,
    );

    const [first, second] = screen.getAllByTestId("view-settings-trigger");
    fireEvent.click(first);
    fireEvent.click(second);

    const ids = screen
      .getAllByTestId("view-settings-page-size")
      .map((el) => el.getAttribute("aria-labelledby"));
    expect(ids.length).toBeGreaterThan(0);
    // Duplicated ids would make one label point at two controls.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
