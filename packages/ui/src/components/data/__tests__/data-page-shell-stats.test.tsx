/**
 * `DataPageShell.stats` reaches the header.
 *
 * The shell is one prop away from the header: `stats` is forwarded as
 * `PageHeader.stats`, and the header's `showStats` option (off by default)
 * decides whether it renders. What is locked here is the forwarding and the
 * default — a slot that exists on the shell but never reaches the DOM is the
 * kind of hatch a consumer only discovers at runtime, and a slot that renders
 * unasked is new chrome on every page that upgrades.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DataPageShell } from "../DataPageShell";
import { StatCard } from "../StatCard";

beforeEach(() => {
  localStorage.clear();
});

describe("DataPageShell — stats slot", () => {
  it("hides `stats` by default", () => {
    render(
      <DataPageShell title="Posts" stats={<StatCard label="Open" value={3} />}>
        <div>rows</div>
      </DataPageShell>,
    );

    expect(screen.queryByTestId("page-header-stats")).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.getByText("rows")).toBeTruthy();
  });

  it("renders `stats` in the header row when headerOptions.showStats is on", () => {
    render(
      <DataPageShell
        title="Posts"
        stats={<StatCard label="Open" value={3} />}
        headerOptions={{ showStats: true }}
        filters={<div>filter-row</div>}
      >
        <div>rows</div>
      </DataPageShell>,
    );

    const row = screen.getByTestId("page-header-stats");
    expect(row.textContent).toContain("Open");
    expect(row.textContent).toContain("3");
    // Above the filter row, which the standard branch renders as a sibling
    // after the header.
    const filterRow = screen.getByText("filter-row");
    expect(
      row.compareDocumentPosition(filterRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("forwards `stats` into the collapsible-filters branch too", () => {
    render(
      <DataPageShell
        title="Posts"
        stats={<StatCard label="Open" value={3} />}
        headerOptions={{ showStats: true }}
        filters={<div>filter-row</div>}
        filtersCollapsible
      >
        <div>rows</div>
      </DataPageShell>,
    );

    expect(screen.getByTestId("page-header-stats").textContent).toContain(
      "Open",
    );
  });
});
