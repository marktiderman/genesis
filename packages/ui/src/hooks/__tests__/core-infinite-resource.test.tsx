/**
 * genesis-core's `useInfiniteResource` and ResourcePage's
 * `pagination="cursor"` ("Load more").
 *
 * - a cursor provider is paged by `nextCursor`; one without cursor paging
 *   falls back to offset pages until `total`;
 * - a pending undoable delete is patched into every loaded page and stays
 *   hidden over a refetch; undo puts it back;
 * - ResourcePage shows the first page and appends the next on "Load more".
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GenesisProvider,
  useInfiniteResource,
  useResource,
  type DataProvider,
  type ListParams,
  type UndoableWrite,
} from "@marktiderman/genesis-core";
import { ResourcePage } from "../../components/data/ResourcePage";
import { useResourceTable } from "../../components/data/use-resource-table";

type Row = { id: string; title: string };
const ALL: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, title: `Task ${i + 1}` }));

/** Pages by cursor: the cursor is the index to start at. */
function cursorProvider(rows: Row[] = ALL): DataProvider {
  return baseProvider({
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const { perPage, cursor } = params.pagination!;
      // Searches on the server, as a real provider does.
      const q = params.search?.query.toLowerCase();
      const matching = q ? rows.filter((r) => String(r.title).toLowerCase().includes(q)) : rows;
      const start = cursor ? Number(cursor) : 0;
      const data = matching.slice(start, start + perPage);
      const next = start + perPage < matching.length ? String(start + perPage) : null;
      return { data, total: cursor ? -1 : matching.length, nextCursor: next };
    }) as DataProvider["getList"],
  });
}

/** Pages by offset only (ignores the cursor). */
function offsetProvider(rows: Row[] = ALL): DataProvider {
  return baseProvider({
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const { page, perPage } = params.pagination!;
      return { data: rows.slice((page - 1) * perPage, page * perPage), total: rows.length };
    }) as DataProvider["getList"],
  });
}

function baseProvider(extra: Partial<DataProvider>): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: [], total: 0 })),
    getOne: vi.fn(async (_r, { id }) => ({ data: { id } })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    ...extra,
  };
}

function wrap(provider: DataProvider) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  return { queryClient, wrapper };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useInfiniteResource", () => {
  it("pages by cursor, appending, until the provider says there is no more", async () => {
    const provider = cursorProvider();
    const { wrapper } = wrap(provider);
    const { result } = renderHook(() => useInfiniteResource<Row>("tasks", { perPage: 2 }), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.total).toBe(5);
    expect(vi.mocked(provider.getList).mock.calls[0]![1].pagination).toEqual({ page: 1, perPage: 2, cursor: null });

    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(vi.mocked(provider.getList).mock.calls[1]![1].pagination).toEqual({ page: 2, perPage: 2, cursor: "2" });
    // The first page's count stands; later pages aren't counted.
    expect(result.current.total).toBe(5);

    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("sorts by several fields: sorts first-to-last, the first also as sort, and setSort/setSorts replace them", async () => {
    const provider = cursorProvider();
    const { wrapper } = wrap(provider);
    const grouped = [
      { field: "group", order: "asc" as const },
      { field: "position", order: "desc" as const },
    ];
    const { result } = renderHook(() => useInfiniteResource<Row>("tasks", { perPage: 2, defaultSorts: grouped }), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    const first = vi.mocked(provider.getList).mock.calls[0]![1];
    expect(first.sorts).toEqual(grouped);
    expect(first.sort).toEqual(grouped[0]);

    act(() => result.current.setSort({ field: "title", order: "asc" }));
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls.length).toBeGreaterThan(1));
    const single = vi.mocked(provider.getList).mock.calls.at(-1)![1];
    expect(single.sort).toEqual({ field: "title", order: "asc" });
    expect(single.sorts).toBeUndefined();

    act(() => result.current.setSorts([{ field: "title", order: "desc" }, { field: "id", order: "asc" }]));
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls.at(-1)![1].sorts).toHaveLength(2));
    expect(result.current.params.sort).toEqual({ field: "title", order: "desc" });
  });

  it("shows a row once when it moved into a later page meanwhile", async () => {
    // t2 is pushed onto page 2 by a new row before it, after page 1 loaded.
    let rowsNow = ALL;
    const provider = baseProvider({
      getList: vi.fn(async (_r: string, params: ListParams) => {
        const { perPage, cursor } = params.pagination!;
        const start = cursor ? Number(cursor) : 0;
        const data = rowsNow.slice(start, start + perPage);
        const next = start + perPage < rowsNow.length ? String(start + perPage) : null;
        return { data, total: rowsNow.length, nextCursor: next };
      }) as DataProvider["getList"],
    });
    const { wrapper } = wrap(provider);
    const { result } = renderHook(() => useInfiniteResource<Row>("tasks", { perPage: 2 }), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    rowsNow = [ALL[0]!, { id: "t0", title: "New" }, ...ALL.slice(1)];
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls).toHaveLength(2));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3"]));
  });

  it("falls back to offset pages with a provider that has no cursor paging", async () => {
    const provider = offsetProvider();
    const { wrapper } = wrap(provider);
    const { result } = renderHook(() => useInfiniteResource<Row>("tasks", { perPage: 2 }), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.hasNextPage).toBe(false);
    expect(vi.mocked(provider.getList).mock.calls.map((c) => c[1].pagination!.page)).toEqual([1, 2, 3]);
  });

  it("keeps a pending undoable delete out of every loaded page, over a refetch", async () => {
    const provider = cursorProvider();
    const { wrapper, queryClient } = wrap(provider);
    const undos: UndoableWrite[] = [];
    const { result } = renderHook(
      () => ({
        list: useInfiniteResource<Row>("tasks", { perPage: 2 }),
        writes: useResource<Row>("tasks", {
          enabled: false,
          mutationMode: "undoable",
          undoDelayMs: 60_000,
          onUndoable: (w) => undos.push(w),
        }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.rows).toHaveLength(2));
    act(() => result.current.list.fetchNextPage());
    await waitFor(() => expect(result.current.list.rows).toHaveLength(4));

    await act(async () => {
      await result.current.writes.remove("t3");
    });
    await waitFor(() => expect(result.current.list.rows.map((r) => r.id)).toEqual(["t1", "t2", "t4"]));
    expect(result.current.list.total).toBe(4);

    // Refetch every page: the server still has t3, the patch hides it.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    });
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(result.current.list.rows.map((r) => r.id)).toEqual(["t1", "t2", "t4"]);
    expect(provider.deleteOne).not.toHaveBeenCalled();

    await act(async () => {
      await undos[0]!.undo();
    });
    await waitFor(() => expect(result.current.list.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4"]));
  });
});

describe("ResourcePage — pagination=\"cursor\"", () => {
  it("shows the first page and appends the next on Load more", async () => {
    localStorage.clear();
    const provider = cursorProvider();
    const { queryClient } = wrap(provider);
    render(
      <GenesisProvider provider={provider} queryClient={queryClient}>
        <ResourcePage<Row>
          resource="tasks"
          title="Tasks"
          columns={["title"]}
          detail="none"
          pagination="cursor"
          resourceOptions={{ defaultPerPage: 2 }}
        />
      </GenesisProvider>,
    );
    await screen.findByText("Task 2");
    expect(screen.queryByText("Task 3")).toBeNull();

    const button = screen.getByTestId("resource-page-load-more");
    const status = screen.getByTestId("resource-page-load-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");

    button.focus();
    fireEvent.click(button);
    await screen.findByText("Task 4");
    expect(screen.getByText("Task 1")).toBeTruthy();
    await waitFor(() => expect(status.textContent).toBe("Loaded 2 more. 4 shown."));

    fireEvent.click(screen.getByTestId("resource-page-load-more"));
    await screen.findByText("Task 5");
    await waitFor(() => expect(status.textContent).toBe("Loaded 1 more. 5 shown."));
    // Nothing left: the same button stays, focused, and says so.
    const done = screen.getByTestId("resource-page-load-more");
    expect(done).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(done.textContent).toBe("All 5 loaded");
    expect(done.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(done);
    expect(vi.mocked(provider.getList).mock.calls).toHaveLength(3);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("searches on the server, from the first page, with the server's count", async () => {
    localStorage.clear();
    const provider = cursorProvider();
    const { wrapper } = wrap(provider);
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource: "tasks",
          title: "Tasks",
          columns: ["title"],
          searchFields: ["title"],
          pagination: "cursor",
          resourceOptions: { defaultPerPage: 2 },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.total).toBe(5);
    expect(result.current.loadMore).toMatchObject({ hasMore: true, loaded: 2, lastLoaded: 0 });
    act(() => result.current.setSearch("Task 2"));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.total).toBe(1);
    // The search went to the provider, starting again without a cursor.
    const calls = (provider.getList as ReturnType<typeof vi.fn>).mock.calls;
    const last = calls.at(-1)![1] as ListParams;
    expect(last.search).toEqual({ query: "Task 2", fields: ["title"] });
    expect(last.pagination?.cursor ?? null).toBeNull();
  });

  it("sorts on the server only: column headers aren't client-sortable", async () => {
    localStorage.clear();
    const provider = cursorProvider();
    const { wrapper } = wrap(provider);
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource: "tasks",
          title: "Tasks",
          columns: ["title", { key: "shout", header: "Shout", accessor: (r: Row) => r.title.toUpperCase() }],
          pagination: "cursor",
          resourceOptions: { defaultPerPage: 2 },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.columns.map((c) => c.sortable)).toEqual([false, false]);
  });

  it("starts from the URL's search and sort in one request, ignoring a sort on a computed column", async () => {
    localStorage.clear();
    const provider = cursorProvider();
    const { wrapper } = wrap(provider);
    const columns = ["title", { key: "shout", header: "Shout", accessor: (r: Row) => r.title.toUpperCase() }];
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource: "tasks",
          title: "Tasks",
          columns,
          searchFields: ["title"],
          pagination: "cursor",
          resourceOptions: { defaultPerPage: 2 },
          urlState: { searchParams: new URLSearchParams("q=Task 3&sort=title:desc"), setSearchParams: () => {} },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    const calls = vi.mocked(provider.getList).mock.calls;
    expect(calls).toHaveLength(1);
    expect((calls[0]![1] as ListParams).search).toEqual({ query: "Task 3", fields: ["title"] });
    expect((calls[0]![1] as ListParams).sort).toEqual({ field: "title", order: "desc" });

    const computed = cursorProvider();
    const { wrapper: w2 } = wrap(computed);
    renderHook(
      () =>
        useResourceTable<Row>({
          resource: "tasks",
          title: "Tasks",
          columns,
          pagination: "cursor",
          resourceOptions: { defaultPerPage: 2 },
          urlState: { searchParams: new URLSearchParams("sort=shout:asc"), setSearchParams: () => {} },
        }),
      { wrapper: w2 },
    );
    await waitFor(() => expect(vi.mocked(computed.getList).mock.calls.length).toBeGreaterThan(0));
    expect((vi.mocked(computed.getList).mock.calls[0]![1] as ListParams).sort).toBeUndefined();
  });

  it("keeps the loaded rows on screen while a new search loads", async () => {
    localStorage.clear();
    const provider = cursorProvider();
    const inner = provider.getList;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    provider.getList = vi.fn(async (resource: string, params: ListParams) => {
      if (params.search) await held;
      return inner(resource, params);
    }) as DataProvider["getList"];
    const { wrapper } = wrap(provider);
    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource: "tasks",
          title: "Tasks",
          columns: ["title"],
          searchFields: ["title"],
          pagination: "cursor",
          resourceOptions: { defaultPerPage: 2 },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    act(() => result.current.setSearch("Task 4"));
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls.length).toBe(2));
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.loading).toBe(false);
    release();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it("refetches the loaded pages on a live change event", async () => {
    localStorage.clear();
    const listeners: ((e: { type: "changed" }) => void)[] = [];
    const provider = cursorProvider();
    provider.subscribe = vi.fn((_r, _p, cb) => {
      listeners.push(cb as (e: { type: "changed" }) => void);
      return () => {};
    });
    const { queryClient } = wrap(provider);
    render(
      <GenesisProvider provider={provider} queryClient={queryClient}>
        <ResourcePage<Row>
          resource="tasks"
          title="Tasks"
          columns={["title"]}
          detail="none"
          pagination="cursor"
          live={{ debounceMs: 0 }}
          resourceOptions={{ defaultPerPage: 2 }}
        />
      </GenesisProvider>,
    );
    await screen.findByText("Task 2");
    expect(provider.subscribe).toHaveBeenCalled();
    const before = vi.mocked(provider.getList).mock.calls.length;
    act(() => listeners.forEach((cb) => cb({ type: "changed" })));
    await waitFor(() => expect(vi.mocked(provider.getList).mock.calls.length).toBe(before + 1));
  });

  it("has no Load more button in the default (client) mode", async () => {
    localStorage.clear();
    const provider = offsetProvider();
    const { queryClient } = wrap(provider);
    render(
      <GenesisProvider provider={provider} queryClient={queryClient}>
        <ResourcePage<Row> resource="tasks" title="Tasks" columns={["title"]} detail="none" />
      </GenesisProvider>,
    );
    await screen.findByText("Task 1");
    expect(screen.queryByTestId("resource-page-load-more")).toBeNull();
  });
});
