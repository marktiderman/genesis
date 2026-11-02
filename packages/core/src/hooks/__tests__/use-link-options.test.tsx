// @vitest-environment happy-dom
// @feat:resource-view-links
/**
 * useLinkOptions, a link picker's rows: sorted by the naming field then the key, so offset paging
 * never skips or repeats rows that share a name; a row with no name shows `untitled`, never its key.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataProviderRoot } from "../../provider/context";
import type { DataProvider, ListParams, SortParam } from "../../provider/types";
import { useLinkOptions } from "../use-link-options";

afterEach(cleanup);

type Person = { id: string; full_name: string | null };

function setup(rows: Person[]) {
  const getList = vi.fn(async (_resource: string, params: ListParams) => {
    const sorts: SortParam[] = params.sorts ?? (params.sort ? [params.sort] : []);
    const { page = 1, perPage = 25 } = params.pagination ?? {};
    // Ties the sorts leave open come back in a different order on every request, as a database's
    // can: only a total order keeps offset pages apart.
    const shuffled = page % 2 ? [...rows] : [...rows].reverse();
    const sorted = shuffled.sort((a, b) => {
      for (const s of sorts) {
        const x = String(a[s.field as keyof Person] ?? "");
        const y = String(b[s.field as keyof Person] ?? "");
        if (x !== y) return (x < y ? -1 : 1) * (s.order === "asc" ? 1 : -1);
      }
      return 0;
    });
    return { data: sorted.slice((page - 1) * perPage, page * perPage), total: rows.length };
  });
  const provider = {
    getList: getList as unknown as DataProvider["getList"],
    getOne: vi.fn(),
    getMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
    capabilities: () => ({ multiSort: true }),
  } as unknown as DataProvider;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DataProviderRoot provider={provider}>{children}</DataProviderRoot>
    </QueryClientProvider>
  );
  return { getList, wrapper };
}

describe("useLinkOptions: a caller's order", () => {
  it("sorts by `orderBy` then the key, not the name, and asks once", async () => {
    const rows = [
      { id: "s3", full_name: "Archived", position: 3 },
      { id: "s1", full_name: "Lead", position: 1 },
      { id: "s2", full_name: "Call", position: 2 },
    ] as unknown as Person[];
    const { getList, wrapper } = setup(rows);
    const { result } = renderHook(
      () => useLinkOptions({ resource: "stages", labelField: "full_name", orderBy: { field: "position" } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.options).toHaveLength(3));
    expect(getList.mock.calls[0]![1].sorts).toEqual([
      { field: "position", order: "asc" },
      { field: "id", order: "asc" },
    ]);
    expect(result.current.options.map((o) => o.label)).toEqual(["Lead", "Call", "Archived"]);
    expect(getList).toHaveBeenCalledTimes(1);
  });

  it("keeps a descending order, and never sends a field name that isn't one", async () => {
    const { getList, wrapper } = setup([{ id: "a", full_name: "A" }]);
    const { result } = renderHook(() => useLinkOptions({ resource: "stages", labelField: "full_name", orderBy: { field: "position", direction: "desc" } }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(getList.mock.calls[0]![1].sorts![0]).toEqual({ field: "position", order: "desc" });

    const bad = setup([{ id: "a", full_name: "A" }]);
    const second = renderHook(() => useLinkOptions({ resource: "stages", labelField: "full_name", orderBy: { field: "position; drop" } }), {
      wrapper: bad.wrapper,
    });
    await waitFor(() => expect(second.result.current.options).toHaveLength(1));
    expect(bad.getList.mock.calls[0]![1].sorts![0]).toEqual({ field: "full_name", order: "asc" });
  });
});

describe("useLinkOptions", () => {
  it("sorts by the naming field then the key, so rows sharing a name across a page boundary are all offered once", async () => {
    // Six people named Sam straddle the boundary between page 1 and page 2 (4 per page).
    const rows: Person[] = [
      { id: "a1", full_name: "Ada" },
      { id: "a2", full_name: "Ada" },
      ...["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => ({ id, full_name: "Sam" })),
    ];
    const { getList, wrapper } = setup(rows);
    const { result } = renderHook(() => useLinkOptions({ resource: "people", labelField: "full_name" }, { perPage: 4 }), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(4));
    expect(getList.mock.calls[0]![1].sorts).toEqual([
      { field: "full_name", order: "asc" },
      { field: "id", order: "asc" },
    ]);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.options).toHaveLength(8));
    expect(result.current.options.map((o) => o.value)).toEqual(["a1", "a2", "s1", "s2", "s3", "s4", "s5", "s6"]);
  });

  it("names a row with no words by `untitled`, never its raw key", async () => {
    const { wrapper } = setup([
      { id: "8f2c-uuid", full_name: null },
      { id: "b1", full_name: "  " },
      { id: "c1", full_name: "Cy" },
    ]);
    const { result } = renderHook(() => useLinkOptions({ resource: "people", labelField: "full_name" }, { untitled: "No name" }), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(3));
    const labels = Object.fromEntries(result.current.options.map((o) => [o.value, o.label]));
    expect(labels).toEqual({ "8f2c-uuid": "No name", b1: "No name", c1: "Cy" });
    expect(result.current.options.some((o) => o.label === String(o.value))).toBe(false);
  });

  it("defaults the words for an unnamed row to Untitled", async () => {
    const { wrapper } = setup([{ id: "x1", full_name: null }]);
    const { result } = renderHook(() => useLinkOptions({ resource: "people", labelField: "full_name" }), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(result.current.options[0]).toEqual({ value: "x1", label: "Untitled" });
  });
});
