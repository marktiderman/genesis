// @feat:resource-tree
/**
 * Tree mode (docs/RESOURCE-VIEW.md, "Tree mode"). The logic is genesis-core's `treeRows`, run by
 * `useResourceView`; genesis-ui adds the indent and the expand arrow in the first cell. One test
 * per rule: the tree comes from a flat list (depth computed), open state is controlled or not,
 * the sort applies within siblings, a filter keeps a match's ancestors, selection cascades only
 * when asked, the table is a keyboard-usable treegrid, and the list view gets the same arrow.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView, treeRows, type ResourceTree } from "@marktiderman/genesis-core/resource-view";

import { DataTable, type DataTableColumn } from "../DataTable";
import { ResourceView, useResourceView } from "../resource-view";

interface League extends Record<string, unknown> {
  id: string;
  parent_id: string | null;
  name: string;
  rank: number;
}

const ROWS: League[] = [
  { id: "north", parent_id: null, name: "North", rank: 2 },
  { id: "south", parent_id: null, name: "South", rank: 1 },
  { id: "north-b", parent_id: "north", name: "North B", rank: 1 },
  { id: "north-a", parent_id: "north", name: "North A", rank: 2 },
  { id: "north-a-1", parent_id: "north-a", name: "North A One", rank: 1 },
  { id: "south-a", parent_id: "south", name: "South A", rank: 1 },
];
const getParentId = (r: League) => r.parent_id;

const bodyRows = () => screen.getAllByRole("row").slice(1) as HTMLTableRowElement[];
/** The name cell: the first one that isn't the selection checkbox's. */
const nameCell = (r: HTMLTableRowElement) => [...r.cells].find((c) => !c.querySelector("[role=checkbox]"))!;
const names = () => bodyRows().map((r) => nameCell(r).textContent);
const row = (name: string) => bodyRows().find((r) => nameCell(r).textContent === name)!;

describe("DataTable draws a tree", () => {
  const columns: DataTableColumn<League>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "rank", header: "Rank", sortable: true },
  ];
  function Drawn(props: { onRowClick?: (r: League) => void; onSortChange?: () => void; pagination?: boolean; pageSize?: number }) {
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(["north"]));
    const tree = treeRows(ROWS, { getId: (r) => r.id, getParentId, expanded });
    return (
      <DataTable
        items={tree.visible.map((n) => n.row)}
        columns={columns}
        getKey={(r) => r.id}
        pagination={false}
        {...props}
        tree={{
          node: (id) => tree.nodes.get(id),
          setExpanded: (id, open) => setExpanded((prev) => (open ? new Set([...prev, id]) : new Set([...prev].filter((x) => x !== id)))),
        }}
      />
    );
  }

  it("is a treegrid: level, position, open state and the indent in the first cell", () => {
    render(<Drawn />);
    expect(screen.getByRole("treegrid")).toBeTruthy();
    expect(names()).toEqual(["North", "North B", "North A", "South"]);
    expect(bodyRows().map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "2", "1"]);
    expect(row("North A").getAttribute("aria-posinset")).toBe("2");
    expect(row("North A").getAttribute("aria-setsize")).toBe("2");
    expect(row("North").getAttribute("aria-expanded")).toBe("true");
    expect(row("North A").getAttribute("aria-expanded")).toBe("false");
    // A leaf has no open state at all, not "false".
    expect(row("North B").hasAttribute("aria-expanded")).toBe(false);
    expect(within(row("North B")).getAllByRole("gridcell").length).toBe(2);
    expect((nameCell(row("North A")).firstElementChild as HTMLElement).style.paddingInlineStart).toBe("1.25rem");
  });

  it("pages the visible rows in tree order, and opening a row keeps the page", () => {
    render(<Drawn pagination pageSize={2} />);
    // North, North B | North A, South: the family is split across pages, as documented.
    expect(names()).toEqual(["North", "North B"]);
    fireEvent.click(screen.getByText("1 / 2").parentElement!.querySelectorAll("button")[1]!);
    expect(names()).toEqual(["North A", "South"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand North A" }));
    // Still page 2, now with North A's child.
    expect(names()).toEqual(["North A", "North A One"]);
  });

  it("opens and closes from the arrow", () => {
    render(<Drawn />);
    fireEvent.click(screen.getByRole("button", { name: "Expand North A" }));
    expect(names()).toEqual(["North", "North B", "North A", "North A One", "South"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse North" }));
    expect(names()).toEqual(["North", "South"]);
  });

  it("doesn't re-sort the tree's rows: a header click only reports the sort", () => {
    const onSortChange = vi.fn();
    render(<Drawn onSortChange={onSortChange} />);
    fireEvent.click(within(screen.getByRole("columnheader", { name: /rank/i })).getByRole("button"));
    expect(onSortChange).toHaveBeenCalledWith([{ key: "rank", dir: "asc" }]);
    expect(names()).toEqual(["North", "North B", "North A", "South"]);
  });

  it("opens with →, then moves to the first child; closes with ←, then moves to the parent", async () => {
    render(<Drawn onRowClick={() => {}} />);
    const open = (name: string) => within(row(name)).getAllByRole("button").find((b) => b.hasAttribute("data-row-open"))!;
    act(() => open("North A").focus());
    fireEvent.keyDown(open("North A"), { key: "ArrowRight" });
    expect(names()).toContain("North A One");
    fireEvent.keyDown(open("North A"), { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("North A One"));
    fireEvent.keyDown(open("North A One"), { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("North A"));
    fireEvent.keyDown(open("North A"), { key: "ArrowLeft" });
    expect(names()).not.toContain("North A One");
    // The row's keys do the arrow's job, so the arrow isn't a second tab stop.
    expect(screen.getByRole("button", { name: "Collapse North" }).tabIndex).toBe(-1);
  });
});

const leagues = defineResource<League>()({
  name: "leagues",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "parent_id", type: "string", nullable: true },
    { name: "name", type: "string" },
    { name: "rank", type: "number" },
  ],
});
const view = defineView(leagues, { columns: { default: ["name", "rank"] } });

function provider(): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: ROWS, total: ROWS.length })) as DataProvider["getList"],
    getOne: vi.fn(async (_r, { id }) => ({ data: ROWS.find((r) => r.id === id) })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}
function wrap(p: DataProvider = provider()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}
const treeOf = (extra: Partial<ResourceTree<League>> = {}): ResourceTree<League> => ({ getParentId, ...extra });

describe("ResourceView tree={…}", () => {
  it("builds the tree from the flat list, closed by default, loading every row", async () => {
    localStorage.clear();
    const p = provider();
    render(<ResourceView view={view} tree={treeOf()} mode="table" detail="none" />, { wrapper: wrap(p) });
    await screen.findByText("North");
    expect(names()).toEqual(["North", "South"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand North" }));
    expect(names()).toEqual(["North", "North B", "North A", "South"]);
    // Client paging: the whole list, not a server page.
    const params = (p.getList as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { pagination?: { perPage: number } };
    expect(params.pagination?.perPage ?? Infinity).toBeGreaterThan(ROWS.length);
  });

  it("opens rows shallower than defaultExpanded, or every parent with true", async () => {
    localStorage.clear();
    const { unmount } = render(<ResourceView view={view} tree={treeOf({ defaultExpanded: 1 })} mode="table" detail="none" />, { wrapper: wrap() });
    await screen.findByText("South A");
    expect(names()).toEqual(["North", "North B", "North A", "South", "South A"]);
    unmount();
    render(<ResourceView view={view} tree={treeOf({ defaultExpanded: true })} mode="table" detail="none" />, { wrapper: wrap() });
    await screen.findByText("North A One");
    expect(bodyRows().map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "2", "3", "1", "2"]);
  });

  it("follows a controlled open set, reporting each change", async () => {
    localStorage.clear();
    const onExpandedChange = vi.fn();
    function Controlled() {
      const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(["south"]));
      return (
        <ResourceView
          view={view}
          mode="table"
          detail="none"
          tree={treeOf({
            expanded,
            onExpandedChange: (next) => {
              onExpandedChange(next);
              setExpanded(next);
            },
          })}
        />
      );
    }
    render(<Controlled />, { wrapper: wrap() });
    await screen.findByText("South A");
    expect(names()).toEqual(["North", "South", "South A"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand North" }));
    expect([...onExpandedChange.mock.calls[0]![0]].sort()).toEqual(["north", "south"]);
    expect(names()).toEqual(["North", "North B", "North A", "South", "South A"]);
  });

  it("applies the sort within siblings, never moving a child from its parent", async () => {
    localStorage.clear();
    render(<ResourceView view={view} tree={treeOf({ defaultExpanded: true })} mode="table" detail="none" />, { wrapper: wrap() });
    await screen.findByText("North A One");
    fireEvent.click(within(screen.getByRole("columnheader", { name: /rank/i })).getByRole("button"));
    await waitFor(() => expect(names()).toEqual(["South", "South A", "North", "North B", "North A", "North A One"]));
    fireEvent.click(within(screen.getByRole("columnheader", { name: /name/i })).getByRole("button"));
    await waitFor(() => expect(names()).toEqual(["North", "North A", "North A One", "North B", "South", "South A"]));
  });

  it("keeps a search match's ancestors, open and muted, and drops the rest", async () => {
    localStorage.clear();
    render(<ResourceView view={view} tree={treeOf()} mode="table" detail="none" />, { wrapper: wrap() });
    await screen.findByText("North");
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "One" } });
    await waitFor(() => expect(names()).toEqual(["North", "North A", "North A One"]));
    expect(row("North").hasAttribute("data-tree-context")).toBe(true);
    expect(row("North").className).toContain("text-muted-foreground");
    expect(row("North A One").hasAttribute("data-tree-context")).toBe(false);
  });

  it("selects one row by default, and the row with its descendants with cascadeSelect", async () => {
    localStorage.clear();
    const bulk = [{ label: "Export", onAction: vi.fn(), testId: "export" }];
    const { result } = renderHook(() => useResourceView({ view, tree: treeOf({ cascadeSelect: true }), bulkActions: bulk }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    act(() => result.current.toggleSelected("north"));
    // Collapsed descendants too.
    expect([...result.current.selectedIds].sort()).toEqual(["north", "north-a", "north-a-1", "north-b"]);
    act(() => result.current.toggleSelected("north-a"));
    expect([...result.current.selectedIds].sort()).toEqual(["north", "north-b"]);

    const plain = renderHook(() => useResourceView({ view, tree: treeOf(), bulkActions: bulk }), { wrapper: wrap() });
    await waitFor(() => expect(plain.result.current.rows.length).toBe(2));
    act(() => plain.result.current.toggleSelected("north"));
    expect([...plain.result.current.selectedIds]).toEqual(["north"]);
  });

  it("surfaces the tree through useResourceView: rows in order, each row's node, and setExpanded", async () => {
    localStorage.clear();
    const { result } = renderHook(() => useResourceView({ view, tree: treeOf() }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["north", "south"]));
    expect(result.current.tree?.nodes.get("north")).toMatchObject({ depth: 0, hasChildren: true, expanded: false });
    act(() => result.current.tree!.setExpanded("north", true));
    expect(result.current.rows.map((r) => r.id)).toEqual(["north", "north-b", "north-a", "south"]);
    expect([...result.current.tree!.expanded]).toEqual(["north"]);
  });

  it("draws the arrow and indent in the list view too", async () => {
    localStorage.clear();
    render(<ResourceView view={view} tree={treeOf()} mode="list" detail="none" />, { wrapper: wrap() });
    fireEvent.click(await screen.findByRole("button", { name: "Expand North" }));
    expect(await screen.findByText("North A")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse North" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("refuses a pagination that would page the tree", () => {
    expect(() => render(<ResourceView view={view} tree={treeOf()} pagination="server" />, { wrapper: wrap() })).toThrow(/can't page a tree/);
  });
});
