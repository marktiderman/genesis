/**
 * DataTable on TanStack Table: typed sorting, pinned columns, reordering
 * (Alt+←/→, persisted, reset) and row virtualization for long unpaged tables.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";

interface Row {
  id: string;
  name: string;
  count: number;
  joined: Date;
  active: boolean;
}

const rows: Row[] = [
  { id: "1", name: "Cara", count: 10, joined: new Date("2026-03-01"), active: true },
  { id: "2", name: "Ada", count: 2, joined: new Date("2025-12-31"), active: false },
  { id: "3", name: "Bo", count: 100, joined: new Date("2026-01-15"), active: true },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "count", header: "Count", sortable: true },
  { key: "joined", header: "Joined", sortable: true, render: (r) => r.joined.toISOString().slice(0, 10) },
  { key: "active", header: "Active", sortable: true, render: (r) => (r.active ? "yes" : "no") },
];

const firstColumn = () => screen.getAllByRole("row").slice(1).map((r) => r.cells[0]!.textContent);
const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);
const sortBy = (name: string) =>
  fireEvent.click(within(screen.getByRole("columnheader", { name: new RegExp(name, "i") })).getByRole("button"));

beforeEach(() => localStorage.clear());

describe("DataTable typed sorting", () => {
  it("sorts numbers by value, not as text", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    sortBy("count");
    expect(firstColumn()).toEqual(["Ada", "Cara", "Bo"]);
  });

  it("sorts dates by time and booleans false first", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    sortBy("joined");
    expect(firstColumn()).toEqual(["Ada", "Bo", "Cara"]);
    sortBy("active");
    expect(firstColumn()[0]).toBe("Ada");
  });
});

describe("DataTable pinned columns", () => {
  it("keeps left- and right-pinned columns sticky at their edges", () => {
    render(
      <DataTable
        items={rows}
        columns={columns}
        getKey={(r) => r.id}
        pinnedColumns={{ left: ["name"], right: ["active"] }}
        columnVisibility={false}
      />,
    );
    const name = screen.getByRole("columnheader", { name: /name/i });
    const active = screen.getByRole("columnheader", { name: /active/i });
    expect(name.className).toContain("sticky");
    expect(name.style.left).toBe("0px");
    expect(active.style.right).toBe("0px");
    expect(headers()).toEqual(["Name", "Count", "Joined", "Active"]);
  });

  it("treats stickyFirstColumn as pinning the first column left", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} stickyFirstColumn columnVisibility={false} />);
    expect(screen.getByRole("columnheader", { name: /name/i }).style.left).toBe("0px");
  });
});

describe("DataTable column reorder", () => {
  it("moves a column with Alt+→ and keeps the order under columnOrderKey", () => {
    const { unmount } = render(
      <DataTable items={rows} columns={columns} getKey={(r) => r.id} columnOrderKey="people" columnVisibility={false} />,
    );
    const nameButton = within(screen.getByRole("columnheader", { name: /name/i })).getByRole("button");
    fireEvent.keyDown(nameButton, { key: "ArrowRight", altKey: true });
    expect(headers()).toEqual(["Count", "Name", "Joined", "Active"]);
    unmount();
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} columnOrderKey="people" columnVisibility={false} />);
    expect(headers()).toEqual(["Count", "Name", "Joined", "Active"]);
  });

  it("does nothing with reorderableColumns off", () => {
    render(
      <DataTable items={rows} columns={columns} getKey={(r) => r.id} reorderableColumns={false} columnVisibility={false} />,
    );
    fireEvent.keyDown(within(screen.getByRole("columnheader", { name: /name/i })).getByRole("button"), {
      key: "ArrowRight",
      altKey: true,
    });
    expect(headers()).toEqual(["Name", "Count", "Joined", "Active"]);
  });
});

describe("DataTable virtualization", () => {
  // The test DOM has no layout; give elements a 400px box so the virtualizer
  // has a viewport to fill.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 800, width: 800, height: 400, toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => vi.restoreAllMocks());

  const many: Row[] = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    name: `Person ${i}`,
    count: i,
    joined: new Date(2026, 0, 1),
    active: i % 2 === 0,
  }));

  it("renders only the rows in view for a long unpaged table", () => {
    render(
      <DataTable items={many} columns={columns} getKey={(r) => r.id} pagination={false} virtualize={{ height: 400 }} columnVisibility={false} />,
    );
    const rendered = screen.getAllByRole("row").slice(1).filter((r) => r.cells.length > 1);
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
  });

  it("renders every row when paginated, ignoring virtualize", () => {
    render(<DataTable items={many} columns={columns} getKey={(r) => r.id} pageSize={25} virtualize columnVisibility={false} />);
    expect(screen.getAllByRole("row").length - 1).toBe(25);
  });
});
