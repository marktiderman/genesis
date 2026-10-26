/**
 * useResourceTable: ResourcePage's behaviour without its markup. A custom
 * layout gets rows, search, paging, selection, the open record and delete
 * from the same hook, through its documented `ResourceTableState`.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { useResourceTable } from "../use-resource-table";
import * as hooks from "../../../hooks";
import type { SearchParamsAdapter } from "../../../navigation";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: "1", name: "Ada" },
  { id: "2", name: "Bo" },
  { id: "3", name: "Cy" },
];

beforeEach(() => localStorage.clear());

const mockWrapper = ({ children }: { children: ReactNode }) => (
  <GenesisProvider mock={{ datasets: {} }}>{children}</GenesisProvider>
);
function providerWrapper(provider: ReturnType<typeof createMockProvider>) {
  return ({ children }: { children: ReactNode }) => <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

describe("useResourceTable with rows passed in", () => {
  it("is exported from /hooks too", () => {
    expect(hooks.useResourceTable).toBe(useResourceTable);
  });

  it("searches the rows it is given", () => {
    const { result } = renderHook(
      () => useResourceTable<Row>({ data: rows, title: "People", columns: ["name"], searchFields: ["name"] }),
      { wrapper: mockWrapper },
    );
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.total).toBe(3);
    act(() => result.current.setSearch("bo"));
    expect(result.current.search).toBe("bo");
    expect(result.current.rows.map((r) => r.name)).toEqual(["Bo"]);
    expect(result.current.hasActiveFilters).toBe(true);
    act(() => result.current.clearFilters());
    expect(result.current.rows).toHaveLength(3);
  });

  it("drives selection and the open record for a custom layout", () => {
    function Cards() {
      const t = useResourceTable<Row>({ data: rows, title: "People", columns: ["name"], titleField: "name" });
      return (
        <div>
          {t.rows.map((row) => (
            <article key={row.id}>
              <button type="button" onClick={() => t.openRow(row)}>
                {row.name}
              </button>
              <input
                type="checkbox"
                aria-label={`select ${row.name}`}
                checked={t.selectedIds.has(t.getKey(row))}
                onChange={() => t.toggleSelected(t.getKey(row))}
              />
            </article>
          ))}
          <p data-testid="open">{t.detailOpen && t.openItem ? t.getTitle(t.openItem) : "none"}</p>
          <p data-testid="count">{t.selectedIds.size}</p>
          <button type="button" onClick={t.closeDetail}>
            close
          </button>
        </div>
      );
    }
    render(<Cards />, { wrapper: mockWrapper });
    fireEvent.click(screen.getByRole("button", { name: "Bo" }));
    expect(screen.getByTestId("open").textContent).toBe("Bo");
    fireEvent.click(screen.getByLabelText("select Ada"));
    fireEvent.click(screen.getByLabelText("select Cy"));
    expect(screen.getByTestId("count").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByTestId("open").textContent).toBe("none");
  });

  it("returns only the documented fields", () => {
    const { result } = renderHook(() => useResourceTable<Row>({ data: rows, title: "People", columns: ["name"] }), {
      wrapper: mockWrapper,
    });
    expect(Object.keys(result.current)).not.toContain("displayData");
    expect(Object.keys(result.current)).not.toContain("resourceHook");
    expect(Object.keys(result.current).sort()).toMatchInlineSnapshot(`
      [
        "actions",
        "can",
        "clearFilters",
        "clearSelection",
        "closeDetail",
        "columns",
        "create",
        "deleteConfirm",
        "detailOpen",
        "edit",
        "error",
        "form",
        "getKey",
        "getTitle",
        "hasActiveFilters",
        "loading",
        "openItem",
        "openItemMissing",
        "openRow",
        "page",
        "pageCount",
        "pageSize",
        "rangeFrom",
        "rangeTo",
        "remove",
        "rows",
        "search",
        "selectedIds",
        "setPage",
        "setPageSize",
        "setSearch",
        "setSort",
        "sort",
        "statusFilter",
        "toggleAll",
        "toggleSelected",
        "total",
        "truncated",
      ]
    `);
  });
});

describe("useResourceTable agrees with ResourcePage", () => {
  it("offers no create when `can` refuses it, as the page hides its button", () => {
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          data: rows,
          title: "People",
          columns: ["name"],
          onCreate: () => {},
          can: (action) => action !== "create",
        }),
      { wrapper: mockWrapper },
    );
    expect(result.current.create).toBeUndefined();
  });

  it("returns loadMore, with a fixed shape, only with pagination=\"cursor\"", async () => {
    const people = Array.from({ length: 3 }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}` }));
    const { result } = renderHook(
      () => useResourceTable<Row>({ resource: "people", title: "People", columns: ["name"], pagination: "cursor" }),
      { wrapper: providerWrapper(createMockProvider({ people })) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(Object.keys(result.current)).toContain("loadMore");
    expect(Object.keys(result.current.loadMore!).sort()).toEqual(["hasMore", "lastLoaded", "load", "loaded", "loading"]);
  });
});

describe("useResourceTable in resource mode", () => {
  const people = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), name: `Person ${String(i + 1).padStart(2, "0")}` }));

  it("loads rows through the data provider", async () => {
    const { result } = renderHook(
      () => useResourceTable<Row>({ resource: "people", title: "People", columns: ["name"] }),
      { wrapper: providerWrapper(createMockProvider({ people })) },
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.rows).toHaveLength(12));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.total).toBe(12);
    expect(result.current.setPage).toBeUndefined();
  });

  it('pages through the provider with pagination="server"', async () => {
    const provider = createMockProvider({ people });
    const getList = vi.spyOn(provider, "getList");
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource: "people",
          title: "People",
          columns: ["name"],
          pagination: "server",
          resourceOptions: { defaultPerPage: 5 },
        }),
      { wrapper: providerWrapper(provider) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current).toMatchObject({ page: 1, pageCount: 3, total: 12, rangeFrom: 1, rangeTo: 5 });
    act(() => result.current.setPage?.(3));
    await waitFor(() => expect(result.current.rows.map((r) => r.name)).toEqual(["Person 11", "Person 12"]));
    expect(result.current).toMatchObject({ page: 3, rangeFrom: 11, rangeTo: 12 });
    expect(getList.mock.calls.at(-1)?.[1]?.pagination).toMatchObject({ page: 3, perPage: 5 });
  });

  it("deletes through the confirm step", async () => {
    const provider = createMockProvider({ people });
    const remove = vi.spyOn(provider, "deleteOne");
    const { result } = renderHook(
      () => useResourceTable<Row>({ resource: "people", title: "People", columns: ["name"], allowDelete: true }),
      { wrapper: providerWrapper(provider) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(12));
    const target = result.current.rows[0]!;
    expect(result.current.remove).toBeDefined();
    act(() => result.current.remove!(target));
    expect(result.current.deleteConfirm.open).toBe(true);
    expect(result.current.deleteConfirm.item).toBe(target);
    expect(remove).not.toHaveBeenCalled();
    await act(() => result.current.deleteConfirm.confirm());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]?.[1]).toMatchObject({ id: target.id });
    await waitFor(() => expect(result.current.rows).toHaveLength(11));
  });

  it("offers no delete when the page cannot delete", async () => {
    const { result } = renderHook(
      () => useResourceTable<Row>({ resource: "people", title: "People", columns: ["name"] }),
      { wrapper: providerWrapper(createMockProvider({ people })) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(12));
    expect(result.current.remove).toBeUndefined();
  });
});

describe("useResourceTable urlState", () => {
  function memoryAdapter(initial = "") {
    let current = new URLSearchParams(initial);
    function useAdapter(): SearchParamsAdapter {
      const [sp, setSp] = useState(() => new URLSearchParams(initial));
      return {
        searchParams: sp,
        setSearchParams: (next) => {
          current = new URLSearchParams(next);
          setSp(current);
        },
      };
    }
    return { useAdapter, read: () => current };
  }

  it("opens the record named in the URL, and writes the search back", async () => {
    const { useAdapter, read } = memoryAdapter("id=2");
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          data: rows,
          title: "People",
          columns: ["name"],
          titleField: "name",
          urlState: useAdapter(),
        }),
      { wrapper: mockWrapper },
    );
    expect(result.current.detailOpen).toBe(true);
    expect(result.current.openItem?.name).toBe("Bo");
    act(() => result.current.setSearch("cy"));
    await waitFor(() => expect(read().get("q")).toBe("cy"));
    act(() => result.current.closeDetail());
    await waitFor(() => expect(read().get("id")).toBeNull());
    expect(result.current.detailOpen).toBe(false);
  });
});
