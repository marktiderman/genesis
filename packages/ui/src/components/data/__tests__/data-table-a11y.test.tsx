/**
 * DataTable keyboard and screen-reader use: sortable headers are buttons,
 * aria-sort sits on the primary sort column only, and each clickable row has
 * a named open button with a roving tabindex (the table is one tab stop).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";

interface Row {
  id: string;
  name: string;
  team: string;
}

const rows: Row[] = [
  { id: "1", name: "Cara", team: "b" },
  { id: "2", name: "Ada", team: "a" },
  { id: "3", name: "Bo", team: "a" },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "team", header: "Team", sortable: true },
];

const bodyRows = () => screen.getAllByRole("row").slice(1);
const openButtons = () => bodyRows().map((r) => within(r).getByRole("button"));

describe("DataTable sortable headers", () => {
  it("is a button that sorts; aria-sort only on the sorted (primary) column", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const name = screen.getByRole("columnheader", { name: /name/i });
    const team = screen.getByRole("columnheader", { name: /team/i });
    expect(name.hasAttribute("aria-sort")).toBe(false);
    fireEvent.click(within(name).getByRole("button"));
    expect(name.getAttribute("aria-sort")).toBe("ascending");
    expect(team.hasAttribute("aria-sort")).toBe(false);
    expect(bodyRows().map((r) => r.cells[0]!.textContent)).toEqual(["Ada", "Bo", "Cara"]);
    fireEvent.click(within(name).getByRole("button"));
    expect(name.getAttribute("aria-sort")).toBe("descending");
  });

  it("says a secondary sort in its button's name, not with aria-sort or a bare digit", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const team = screen.getByRole("columnheader", { name: /team/i });
    const name = screen.getByRole("columnheader", { name: /name/i });
    fireEvent.click(within(team).getByRole("button"));
    fireEvent.click(within(name).getByRole("button"), { shiftKey: true });
    expect(team.getAttribute("aria-sort")).toBe("ascending");
    expect(name.hasAttribute("aria-sort")).toBe(false);
    expect(within(name).getByRole("button").getAttribute("aria-label")).toBe("Name, sorted ascending, sort 2");
    expect(bodyRows().map((r) => r.cells[0]!.textContent)).toEqual(["Ada", "Bo", "Cara"]);
  });

  it("leaves a non-sortable header as plain text", () => {
    render(<DataTable items={rows} columns={[{ key: "name", header: "Name" }]} getKey={(r) => r.id} />);
    expect(within(screen.getByRole("columnheader", { name: "Name" })).queryByRole("button")).toBeNull();
  });
});

describe("DataTable row open action", () => {
  it("names each row's open action by its title cell, and opens it", () => {
    const onRowClick = vi.fn();
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={onRowClick} />);
    const open = screen.getByRole("button", { name: "Ada" });
    fireEvent.click(open);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("makes the table one tab stop that moves with arrows, j/k and Home/End", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} />);
    const [a, b, c] = openButtons();
    expect([a!.tabIndex, b!.tabIndex, c!.tabIndex]).toEqual([0, -1, -1]);
    a!.focus();
    fireEvent.keyDown(a!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(b);
    expect(openButtons().map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(b!, { key: "j" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c!, { key: "k" });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b!, { key: "Home" });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a!, { key: "End" });
    expect(document.activeElement).toBe(c);
  });

  it("ignores modifier chords, so app shortcuts keep working", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} />);
    const [a] = openButtons();
    a!.focus();
    const event = fireEvent.keyDown(a!, { key: "ArrowDown", metaKey: true });
    expect(event).toBe(true); // not prevented
    expect(document.activeElement).toBe(a);
  });

  it("toggles selection with x, and labels the checkboxes", () => {
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
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select Ada" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Ada" }), { key: "x" });
    expect(onToggleSelect).toHaveBeenCalledWith("2");
  });

  it("uses openColumn, and makes no button with keyboardNavigation off or openColumn null", () => {
    const { unmount } = render(
      <DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} openColumn="team" />,
    );
    expect(within(bodyRows()[0]!).getByRole("button").textContent).toBe("b");
    unmount();
    const { unmount: u2 } = render(
      <DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} keyboardNavigation={false} />,
    );
    expect(bodyRows().every((r) => within(r).queryByRole("button") === null)).toBe(true);
    u2();
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={() => {}} openColumn={null} />);
    expect(bodyRows().every((r) => within(r).queryByRole("button") === null)).toBe(true);
  });

  it("keeps the row clickable with the mouse", () => {
    const onRowClick = vi.fn();
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} onRowClick={onRowClick} />);
    fireEvent.click(bodyRows()[2]!.cells[1]!);
    expect(onRowClick).toHaveBeenCalledWith(rows[2]);
  });
});

describe("DataTable open button beside interactive cell content", () => {
  it("never nests a rendered link inside the row's open button, keeping one tab stop per row", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        items={rows}
        columns={[{ key: "name", header: "Name", render: (r: Row) => <a href={`#${r.id}`}>{r.name}</a> }, columns[1]!]}
        getKey={(r) => r.id}
        onRowClick={onRowClick}
        columnVisibility={false}
      />,
    );
    for (const row of bodyRows()) {
      expect(within(row).getByRole("link").closest("button")).toBeNull();
    }
    const opens = bodyRows().map((r) => within(r).getByRole("button", { name: /^Open / }));
    expect(opens.map((b) => b.getAttribute("aria-label"))).toEqual(["Open Cara", "Open Ada", "Open Bo"]);
    expect(opens.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.click(opens[1]!);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    opens[0]!.focus();
    fireEvent.keyDown(opens[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(opens[1]);
  });

  it("leaves keys typed in the open column's editor to the editor", () => {
    render(
      <DataTable
        items={rows}
        columns={[
          {
            key: "name",
            header: "Name",
            render: (r: Row) => <input aria-label={`Edit ${r.name}`} defaultValue={r.name} />,
          },
        ]}
        getKey={(r) => r.id}
        onRowClick={() => {}}
        selectable
        onToggleSelect={vi.fn()}
        columnVisibility={false}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Edit Cara" });
    for (const key of ["j", "k", "x", "Home", "End", "ArrowDown"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
