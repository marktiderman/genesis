/**
 * Two list-chrome fixes:
 * - DataTable's pager is pinned to the bottom (sticky), so it's opaque (`bg-card`, the table's
 *   rounded bottom corners): a translucent one let the rows scrolling under it show through.
 * - ResourcePage's default list row adds no padding, divider or hover of its own: DataGrid's list
 *   wrapper draws each once.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { DataTable, type DataTableColumn } from "../DataTable";
import { ResourcePage } from "../ResourcePage";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
}

const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: `Member ${i + 1}` }));
const columns: DataTableColumn<Row>[] = [{ key: "name", header: "Name" }];

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

beforeEach(() => localStorage.clear());

describe("DataTable pinned pager", () => {
  it("is opaque, with the table's rounded bottom corners", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const pager = screen.getByTestId("data-table-pager");
    expect(classes(pager)).toEqual(expect.arrayContaining(["sticky", "bottom-0", "bg-card", "rounded-b-lg"]));
    expect(classes(pager).some((c) => c.startsWith("bg-") && c.includes("/"))).toBe(false);
  });

  it("wraps its controls, so it can't push a phone's page wider than the screen", () => {
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const controls = screen.getByTestId("data-table-pager").querySelector(":scope > div")!;
    expect(classes(controls)).toContain("flex-wrap");
  });
});

describe("ResourcePage default list row", () => {
  it("leaves padding, the divider and hover to DataGrid's list wrapper, so each is drawn once", async () => {
    render(
      <GenesisProvider mock={{ datasets: { members: rows.slice(0, 2) } }}>
        <ResourcePage<Row> resource="members" title="Members" defaultView="list" columns={["name"]} titleField="name" />
      </GenesisProvider>,
    );
    const [row] = await screen.findAllByTestId("resource-list-row");
    const wrapper = row!.parentElement!;
    // The wrapper: padding, hover; its list: the dividers.
    expect(classes(wrapper)).toEqual(expect.arrayContaining(["px-4", "py-3", "hover:bg-accent/50"]));
    expect(classes(wrapper.parentElement!)).toContain("divide-y");
    // The row: none of them again.
    const own = classes(row!);
    expect(own.filter((c) => /^(p[xytblr]?|border(-[btlr])?|hover:bg-.*)(-|$)/.test(c) || c === "border-b")).toEqual([]);
    expect(row!.getAttribute("class")).toMatchInlineSnapshot(`"flex items-start cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"`);
  });
});
