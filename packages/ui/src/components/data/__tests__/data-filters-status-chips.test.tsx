/**
 * `DataFilters.statusChips` — option objects, counts and the tabs variant.
 *
 * The compatibility assertion comes first: `options` was `string[]`, every
 * existing caller (including `useResourcePage`) still passes strings, and
 * those must render exactly as before. The object form and the `"tabs"`
 * variant are additive on top of that.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataFilters } from "../DataFilters";

const base = {
  search: "",
  onSearchChange: () => {},
  sort: "title",
  onSortChange: () => {},
  sortOptions: [{ value: "title", label: "Title" }],
};

describe("DataFilters — status chips", () => {
  it("still renders plain string options as chips", () => {
    render(
      <DataFilters
        {...base}
        statusChips={{
          options: ["Active", "Draft"],
          selected: ["Active"],
          onChange: () => {},
        }}
      />,
    );

    const active = screen.getByTestId("status-chip-Active");
    expect(active.textContent).toBe("Active");
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("status-chip-Draft").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.queryByTestId("status-tabs")).toBeNull();
  });

  it("renders an option object's label and count", () => {
    render(
      <DataFilters
        {...base}
        statusChips={{
          options: [
            { value: "active", label: "Active", count: 12 },
            { value: "draft" },
          ],
          selected: [],
          onChange: () => {},
        }}
      />,
    );

    const active = screen.getByTestId("status-chip-active");
    expect(active.textContent).toContain("Active");
    expect(active.textContent).toContain("12");
    // No label → the value is the label; no count → nothing after it.
    expect(screen.getByTestId("status-chip-draft").textContent).toBe("draft");
  });

  it("toggles by value, not label", () => {
    const onChange = vi.fn();
    render(
      <DataFilters
        {...base}
        statusChips={{
          options: [{ value: "active", label: "Active" }],
          selected: [],
          onChange,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("status-chip-active"));
    expect(onChange).toHaveBeenCalledWith(["active"]);
  });

  it("renders the tabs variant as one segmented strip, multi-select", () => {
    const onChange = vi.fn();
    render(
      <DataFilters
        {...base}
        statusChips={{
          variant: "tabs",
          options: [
            { value: "active", label: "Active", count: 12 },
            { value: "draft", label: "Draft", count: 3 },
          ],
          selected: ["active"],
          onChange,
        }}
      />,
    );

    const strip = screen.getByRole("group", { name: "Status" });
    expect(strip.getAttribute("data-testid")).toBe("status-tabs");
    expect(screen.queryByTestId("status-chip-active")).toBeNull();

    const active = screen.getByTestId("status-tab-active");
    const draft = screen.getByTestId("status-tab-draft");
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(draft.getAttribute("aria-pressed")).toBe("false");
    expect(active.textContent).toContain("12");

    // Selection stays additive: picking Draft keeps Active.
    fireEvent.click(draft);
    expect(onChange).toHaveBeenCalledWith(["active", "draft"]);
  });

  it("places the tabs strip before the search row", () => {
    const { container } = render(
      <DataFilters
        {...base}
        statusChips={{
          variant: "tabs",
          options: ["Active"],
          selected: [],
          onChange: () => {},
        }}
      />,
    );

    const strip = screen.getByTestId("status-tabs");
    const search = container.querySelector("input")!;
    expect(
      strip.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
