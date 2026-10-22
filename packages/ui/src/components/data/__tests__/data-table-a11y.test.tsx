/**
 * DataTable keyboard and screen-reader use: sortable headers are buttons
 * with aria-sort on the cell, and clickable rows are tab stops that open on
 * Enter/Space and move with ↑/↓, j/k, Home/End.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: "1", name: "Cara" },
  { id: "2", name: "Ada" },
  { id: "3", name: "Bo" },
];
const columns: DataTableColumn<Row>[] = [{ key: "name", header: "Name", sortable: true }];

const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("DataTable sortable headers", () => {
  it("is a button that sorts, with aria-sort on the header cell", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const header = screen.getByRole("columnheader", { name: /name/i });
    expect(header.getAttribute("aria-sort")).toBe("none");
    const button = within(header).getByRole("button", { name: /name/i });
    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(bodyRows().map((r) => r.textContent)).toEqual(["Ada", "Bo", "Cara"]);
    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("descending");
  });

  it("leaves a non-sortable header as plain text without aria-sort", () => {
    render(<DataTable items={rows} columns={[{ key: "name", header: "Name" }]} getKey={(r) => r.id} />);
    const header = screen.getByRole("columnheader", { name: "Name" });
    expect(header.hasAttribute("aria-sort")).toBe(false);
    expect(within(header).queryByRole("button")).toBeNull();
  });
});

describe("DataTable row keys", () => {
  it("makes clickable rows tab stops that open on Enter and Space", () => {
    const onRowClick = vi.fn();
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={onRowClick} />);
    const [first] = bodyRows();
    expect(first!.tabIndex).toBe(0);
    fireEvent.keyDown(first!, { key: "Enter" });
    fireEvent.keyDown(first!, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("moves focus with arrows, j/k and Home/End", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} />);
    const [a, b, c] = bodyRows();
    a!.focus();
    fireEvent.keyDown(a!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b!, { key: "j" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c!, { key: "k" });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b!, { key: "Home" });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a!, { key: "End" });
    expect(document.activeElement).toBe(c);
  });

  it("toggles selection with x when selectable", () => {
    const onToggleSelect = vi.fn();
    render(
      <DataTable
        items={rows}
        columns={columns}
        getKey={(r) => r.id}
        onRowClick={() => {}}
        selectable
        selected={new Set()}
        onToggleSelect={onToggleSelect}
      />,
    );
    fireEvent.keyDown(bodyRows()[1]!, { key: "x" });
    expect(onToggleSelect).toHaveBeenCalledWith("2");
  });

  it("leaves keys typed in a control inside the row alone", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        items={rows}
        columns={[{ key: "name", header: "Name", render: (r) => <input aria-label={`edit ${r.name}`} /> }]}
        getKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("edit Ada"), { key: "Enter" });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("adds no tab stops without onRowClick, or with keyboardNavigation off", () => {
    const { unmount } = render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    expect(bodyRows().every((r) => !r.hasAttribute("tabindex"))).toBe(true);
    unmount();
    render(
      <DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} keyboardNavigation={false} />,
    );
    expect(bodyRows().every((r) => !r.hasAttribute("tabindex"))).toBe(true);
  });
});
