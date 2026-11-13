// @feat:view-filters
/**
 * ADR 0017 on the web: segments with counts and declared filters sent to the server and kept in
 * the URL, row and bulk actions with their reasons, the view-type switcher with the person's
 * choice in the store, grouping with totals, row tone, and rows a screen already holds.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorageAdapter, defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { createLocalSavedViewStore, defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView, ResourceViewDefaultsProvider } from "../resource-view";
import type { SearchParamsAdapter } from "../../../navigation";

type Task = { id: string; title: string; status: "todo" | "done"; hours: number; urgent: boolean };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["todo", "done"] },
    { name: "hours", type: "number" },
    { name: "urgent", type: "boolean" },
  ],
});

const ROWS: Task[] = [
  { id: "a", title: "Write the plan", status: "todo", hours: 2, urgent: true },
  { id: "b", title: "Ship it", status: "done", hours: 3, urgent: false },
  { id: "c", title: "Tell people", status: "todo", hours: 1, urgent: false },
];

const matches = (row: Task, f: FilterParam) => {
  const v = row[f.field as keyof Task] as unknown;
  if (f.operator === "eq") return v === f.value;
  if (f.operator === "in") return (f.value as unknown[]).includes(v);
  return true;
};

function provider(extra: Partial<DataProvider> = {}): DataProvider & { getList: ReturnType<typeof vi.fn> } {
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const data = ROWS.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      const sort = params.sort;
      if (sort) data.sort((x, y) => String(x[sort.field as keyof Task]).localeCompare(String(y[sort.field as keyof Task])) * (sort.order === "desc" ? -1 : 1));
      const { page = 1, perPage = 25 } = params.pagination ?? {};
      return { data: data.slice((page - 1) * perPage, page * perPage), total: data.length };
    }),
    getOne: vi.fn(async (_r: string, { id }: { id: string }) => ({ data: ROWS.find((r) => r.id === id) })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(async () => ({ data: null })),
    ...extra,
  } as unknown as DataProvider & { getList: ReturnType<typeof vi.fn> };
}

function wrap(p: DataProvider, defaults: Parameters<typeof ResourceViewDefaultsProvider>[0] | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {defaults ? <ResourceViewDefaultsProvider {...defaults}>{children}</ResourceViewDefaultsProvider> : children}
    </GenesisProvider>
  );
}

function adapter(initial: string): SearchParamsAdapter & { current: () => URLSearchParams } {
  let params = new URLSearchParams(initial);
  return {
    get searchParams() {
      return params;
    },
    setSearchParams: (next: URLSearchParams) => {
      params = new URLSearchParams(next);
    },
    current: () => params,
  };
}

const lastFilters = (p: { getList: ReturnType<typeof vi.fn> }) => (p.getList.mock.calls.at(-1)![1] as ListParams).filters ?? [];

afterEach(() => vi.restoreAllMocks());

describe("segments and declared filters", () => {
  const view = defineView(tasks, {
    segments: [
      { id: "open", label: "Open", where: { status: "todo" }, count: true },
      { id: "all", label: "All" },
    ],
    filters: [{ field: "status" }],
  });

  it("opens on the first segment, sends its filter, counts it and switches on click", async () => {
    const p = provider();
    render(<ResourceView view={view} />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    expect(screen.queryByText("Ship it")).toBeNull();
    expect(lastFilters(p)).toContainEqual({ field: "status", operator: "eq", value: "todo" });
    // The count is the provider's, asked with the segment's filter.
    await waitFor(() => expect(within(screen.getByTestId("view-segment-open")).getByText("2")).toBeTruthy());
    fireEvent.click(screen.getByTestId("view-segment-all"));
    await screen.findByText("Ship it");
  });

  it("reads the segment and filters from the URL the app registered, and writes them back", async () => {
    const p = provider();
    const url = adapter("seg=all&f.status=done&f.title=x");
    render(<ResourceView view={view} />, { wrapper: wrap(p, { urlState: url, children: null }) });
    await screen.findByText("Ship it");
    expect(screen.queryByText("Write the plan")).toBeNull();
    // Only declared filters reach the provider: f.title is ignored.
    expect(lastFilters(p).map((f) => f.field)).toEqual(["status"]);
    fireEvent.click(screen.getByTestId("view-segment-open"));
    await waitFor(() => expect(url.current().get("seg")).toBeNull());
    expect(url.current().get("f.status")).toBe("done");
  });
});

describe("row and bulk actions", () => {
  const view = defineView(tasks, {
    actions: [
      { name: "finish", label: "Finish", bulk: true, can: (t) => (t.status === "done" ? "It's already done." : true) },
    ],
  });

  it("draws a row menu whose refused action says why, and runs an allowed one through the provider", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    const p = provider({ runAction });
    render(<ResourceView view={view} rowActions />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    const menus = screen.getAllByTestId("resource-row-menu");
    // "Ship it" is the second row and is done.
    fireEvent.pointerDown(menus[1]!, { button: 0, ctrlKey: false });
    const refused = await screen.findByTestId("resource-row-menu-finish");
    expect(refused.getAttribute("aria-disabled")).toBe("true");
    expect(within(refused).getByText("It's already done.")).toBeTruthy();
    fireEvent.keyDown(refused, { key: "Escape" });
    fireEvent.pointerDown(screen.getAllByTestId("resource-row-menu")[0]!, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId("resource-row-menu-finish"));
    await waitFor(() => expect(runAction).toHaveBeenCalledWith("tasks", { id: "a", action: "finish" }));
  });

  it("runs a bulk action on the selected rows that allow it, and skips the rest", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    const p = provider({ runAction });
    render(<ResourceView view={view} />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    for (const name of ["Write the plan", "Ship it"]) fireEvent.click(screen.getByLabelText(`Select ${name}`));
    fireEvent.click(await screen.findByTestId("bulk-finish"));
    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(runAction).toHaveBeenCalledWith("tasks", { id: "a", action: "finish" });
  });

  it("selects a range with Shift", async () => {
    render(<ResourceView view={view} />, { wrapper: wrap(provider({ runAction: vi.fn() })) });
    await screen.findByText("Tell people");
    fireEvent.click(screen.getByLabelText("Select Write the plan"));
    fireEvent.click(screen.getByLabelText("Select Tell people"), { shiftKey: true });
    expect(await screen.findByText("3 selected")).toBeTruthy();
  });
});

describe("the view-type switcher", () => {
  const view = defineView(tasks, { board: { field: "status" } });

  it("offers the view's types, and keeps the person's choice in the store", async () => {
    const store = createLocalSavedViewStore({ storage: createMemoryStorageAdapter() });
    const p = provider();
    render(<ResourceView view={view} />, { wrapper: wrap(p, { savedViews: store, children: null }) });
    await screen.findByText("Ship it");
    expect(screen.getByTestId("view-type-board")).toBeTruthy();
    fireEvent.click(screen.getByTestId("view-type-board"));
    await screen.findByTestId("resource-board");
    // Signed out here: the device store keeps it under the signed-out viewer.
    expect(store.forViewer!(null).readCurrent!("tasks")).toEqual({ type: "board" });
    expect(store.readCurrent!("tasks")).toBeUndefined();
  });

  it("stays off when the screen fixes its type", async () => {
    render(<ResourceView view={view} type="table" />, { wrapper: wrap(provider()) });
    await screen.findByText("Ship it");
    expect(screen.queryByTestId("view-type-board")).toBeNull();
  });
});

describe("grouping, totals and tone", () => {
  it("draws a header per group with its count and total, and a tone on a row", async () => {
    const view = defineView(tasks, { groupBy: "status", totals: { hours: "sum" }, rowTone: (t) => (t.urgent ? "danger" : undefined) });
    const { container } = render(<ResourceView view={view} groupBy="status" />, { wrapper: wrap(provider()) });
    await screen.findByText("Ship it");
    const groups = container.querySelectorAll('[data-slot="table-group"]');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    // Sorted by the group first: Done (3 hours), then To do (2 + 1).
    expect(groups[0]!.textContent).toContain("Done");
    expect(groups[0]!.textContent).toContain("Hours: 3");
    expect(groups[1]!.textContent).toContain("2 loaded");
    expect(container.querySelectorAll('[data-tone="danger"]').length).toBe(1);
    // Server paging: the totals cover the rows loaded, and say so.
    expect(container.querySelector('[data-slot="table-footer"]')!.textContent).toContain("6");
    expect(container.querySelector('[data-slot="table-footer"]')!.textContent).toContain("Total of loaded rows");
    expect(groups[0]!.textContent).toContain("(loaded rows)");
  });
});

describe("rows a screen already holds", () => {
  it("draws them without asking the provider", async () => {
    const p = provider();
    render(<ResourceView view={defineView(tasks)} rows={ROWS.slice(0, 1)} />, { wrapper: wrap(p) });
    expect(await screen.findByText("Write the plan")).toBeTruthy();
    await act(async () => undefined);
    expect(p.getList).not.toHaveBeenCalled();
  });
});

describe("saved views", () => {
  const view = defineView(tasks, {
    segments: [
      { id: "open", label: "Open", where: { status: "todo" } },
      { id: "all", label: "All" },
    ],
    columns: { default: ["title", "status", "hours"], short: ["title"] },
    board: { field: "status" },
  });

  it("stores the segment, search, sort and type, and restores all of them on load", async () => {
    const store = createLocalSavedViewStore({ storage: createMemoryStorageAdapter() });
    const first = provider();
    const url = adapter("sort=hours:desc");
    const { unmount } = render(<ResourceView view={view} />, { wrapper: wrap(first, { savedViews: store, urlState: url, children: null }) });
    await screen.findByText("Write the plan");
    fireEvent.click(screen.getByTestId("view-segment-all"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "plan" } });
    await waitFor(() => expect((first.getList.mock.calls.at(-1)![1] as ListParams).search?.query).toBe("plan"));
    fireEvent.click(screen.getByText("Views"));
    fireEvent.click(await screen.findByText("Save current view"));
    fireEvent.change(screen.getByPlaceholderText("View name (e.g. 'Active Sessions')"), { target: { value: "Plans by hours" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(store.forViewer!(null).list("tasks")).toHaveLength(1));
    const saved = (await store.forViewer!(null).list("tasks"))[0]!;
    expect(saved.state).toEqual({ segment: "all", type: "table", search: "plan", sort: { field: "hours", order: "desc" } });
    expect(saved.version).toBe(1);
    unmount();

    // A fresh list, on its default segment and with no search or sort, loads the saved view.
    const second = provider();
    render(<ResourceView view={view} />, { wrapper: wrap(second, { savedViews: store, children: null }) });
    await screen.findByText("Write the plan");
    expect(screen.queryByText("Ship it")).toBeNull();
    fireEvent.click(screen.getByText("Views"));
    fireEvent.click(await screen.findByText("Plans by hours"));
    await waitFor(() => {
      const last = second.getList.mock.calls.at(-1)![1] as ListParams;
      expect(last.search?.query).toBe("plan");
      expect(last.sort).toMatchObject({ field: "hours", order: "desc" });
      expect((last.filters ?? []).some((f) => f.field === "status")).toBe(false);
    });
    expect((screen.getByPlaceholderText("Search...") as HTMLInputElement).value).toBe("plan");
    expect(screen.getByTestId("view-segment-all").getAttribute("aria-pressed")).toBe("true");
  });

  it("restores a saved column preset", async () => {
    const store = createLocalSavedViewStore({ storage: createMemoryStorageAdapter() });
    await store.forViewer!(null).save({ name: "Short", scope: "personal", resource: "tasks", version: 1, state: { columns: "short" } });
    const { container } = render(<ResourceView view={view} />, { wrapper: wrap(provider(), { savedViews: store, children: null }) });
    await screen.findByText("Write the plan");
    expect(container.querySelectorAll("thead th").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByText("Views"));
    fireEvent.click(await screen.findByText("Short"));
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: /Hours/ })).toBeNull());
  });
});

describe("review fixes: delete, edit, grouping and select-all-matching", () => {
  const view = defineView(tasks, {
    actions: [
      { name: "finish", label: "Finish", bulk: true },
      { name: "archive", label: "Archive", bulk: { matching: true, run: vi.fn() } },
    ],
  });

  it("deletes the chosen rows through the page's own delete, under the screen's can, with one confirm step", async () => {
    const deleteOne = vi.fn(async (_r: string, { id }: { id: string | number }) => ({ data: { id } }));
    const p = provider({ runAction: vi.fn(), deleteOne });
    render(<ResourceView view={view} can={(action, row) => action !== "delete" || (row as Task | undefined)?.id !== "b"} />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    for (const name of ["Write the plan", "Ship it", "Tell people"]) fireEvent.click(screen.getByLabelText(`Select ${name}`));
    fireEvent.click(await screen.findByTestId("bulk-delete"));
    // The confirm step counts the rows it will delete: the one the screen refuses isn't one.
    expect(await screen.findByText("Delete 2 records?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteOne).toHaveBeenCalledTimes(2));
    expect(deleteOne.mock.calls.map((c) => c[1].id).sort()).toEqual(["a", "c"]);
  });

  it("disables bulk Delete when the screen refuses every chosen row", async () => {
    render(<ResourceView view={view} can={(action) => action !== "delete"} />, { wrapper: wrap(provider({ runAction: vi.fn() })) });
    await screen.findByText("Ship it");
    fireEvent.click(screen.getByLabelText("Select Ship it"));
    expect((await screen.findByTestId("bulk-delete")).hasAttribute("disabled")).toBe(true);
  });

  it("leaves bulk Delete out when the screen deletes with onDelete, or holds the rows", async () => {
    const { unmount } = render(<ResourceView view={view} onDelete={vi.fn()} />, { wrapper: wrap(provider({ runAction: vi.fn() })) });
    await screen.findByText("Ship it");
    fireEvent.click(screen.getByLabelText("Select Ship it"));
    await screen.findByTestId("bulk-finish");
    expect(screen.queryByTestId("bulk-delete")).toBeNull();
    unmount();
    render(<ResourceView view={view} rows={ROWS} onAction={vi.fn()} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByLabelText("Select Ship it"));
    await screen.findByTestId("bulk-finish");
    expect(screen.queryByTestId("bulk-delete")).toBeNull();
  });

  it("shows the row menu's Delete disabled where the screen's can refuses it, and edits through the page's check", async () => {
    const onEdit = vi.fn();
    render(<ResourceView view={view} rowActions onEdit={onEdit} can={(action, row) => !(action === "edit" && (row as Task | undefined)?.id === "a") && action !== "delete"} />, {
      wrapper: wrap(provider({ runAction: vi.fn() })),
    });
    await screen.findByText("Ship it");
    fireEvent.pointerDown(screen.getAllByTestId("resource-row-menu")[0]!, { button: 0, ctrlKey: false });
    const del = await screen.findByTestId("resource-row-menu-delete");
    expect(del.getAttribute("aria-disabled")).toBe("true");
    expect(within(del).getByText("Not allowed for this row")).toBeTruthy();
    expect((await screen.findByTestId("resource-row-menu-edit")).getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(del, { key: "Escape" });
    fireEvent.pointerDown(screen.getAllByTestId("resource-row-menu")[1]!, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId("resource-row-menu-edit"));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "b" })));
  });

  it("keeps the row menu off unless the screen or the app turns it on", async () => {
    render(<ResourceView view={view} />, { wrapper: wrap(provider({ runAction: vi.fn() })) });
    await screen.findByText("Ship it");
    expect(screen.queryByTestId("resource-row-menu")).toBeNull();
  });

  it("doesn't group a table by the view's groupBy alone, and keeps orderBy under a group the screen asks for", async () => {
    const grouped = defineView(tasks, { groupBy: "status", orderBy: { field: "hours", direction: "desc" } });
    const p = provider();
    const { container, unmount } = render(<ResourceView view={grouped} />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    expect(container.querySelectorAll('[data-slot="table-group"]')).toHaveLength(0);
    expect((p.getList.mock.calls.at(-1)![1] as ListParams).sort).toEqual({ field: "hours", order: "desc" });
    unmount();
    const q = provider();
    const second = render(<ResourceView view={grouped} groupBy="status" />, { wrapper: wrap(q) });
    await screen.findByText("Ship it");
    expect(second.container.querySelectorAll('[data-slot="table-group"]').length).toBeGreaterThan(0);
    expect((q.getList.mock.calls.at(-1)![1] as ListParams).sorts).toEqual([
      { field: "status", order: "asc" },
      { field: "hours", order: "desc" },
    ]);
  });

  it("with every matching row selected, sends the query to a matching run and holds the actions that take loaded rows", async () => {
    const run = vi.fn();
    const matchingView = defineView(tasks, {
      actions: [
        { name: "finish", label: "Finish", bulk: true },
        { name: "archive", label: "Archive", bulk: { matching: true, run } },
      ],
    });
    render(<ResourceView view={matchingView} resourceOptions={{ defaultPerPage: 2 }} />, { wrapper: wrap(provider({ runAction: vi.fn() })) });
    await screen.findByText("Write the plan");
    fireEvent.click(screen.getByLabelText("Select all rows"));
    fireEvent.click(await screen.findByTestId("bulk-select-all-matching"));
    expect(await screen.findByText("All 3 matching selected")).toBeTruthy();
    expect(screen.getByTestId("bulk-finish").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("bulk-delete").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("bulk-archive"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0]).toMatchObject({ kind: "matching", total: 3 });
  });

  it("exports every matching row as CSV with the view's words", async () => {
    const exportView = defineView(tasks, { export: true, fields: { status: { labels: { todo: "To do", done: "Done" } } } });
    let blob: Blob | undefined;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:x";
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<ResourceView view={exportView} resourceOptions={{ defaultPerPage: 2 }} />, { wrapper: wrap(provider()) });
    await screen.findByText("Write the plan");
    fireEvent.pointerDown(screen.getByLabelText("More actions"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Export CSV"));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const text = await blob!.text();
    expect(text).toContain("Ship it");
    expect(text).toContain("Tell people");
    expect(text).toContain("To do");
    expect(text).not.toMatch(/,todo(,|\r?\n|$)/);
  });
});

describe("review fixes: list state", () => {
  const view = defineView(tasks, {
    segments: [
      { id: "open", label: "Open", where: { status: "todo" } },
      { id: "all", label: "All" },
    ],
    filters: [{ field: "title", kind: "text" }],
    board: { field: "status" },
  });

  it("reads no stored type while rendering, so a server render and the first client render agree", () => {
    const readCurrent = vi.fn(() => ({ type: "board" }));
    const store = { list: () => [], save: vi.fn(), remove: vi.fn(), readCurrent, writeCurrent: vi.fn() };
    const Wrapper = wrap(provider(), { savedViews: store, children: null });
    renderToString(
      <Wrapper>
        <ResourceView view={view} />
      </Wrapper>,
    );
    expect(readCurrent).not.toHaveBeenCalled();
  });

  it("follows the URL when it changes from outside (Back, a link)", async () => {
    const url = adapter("seg=open");
    const Wrapper = wrap(provider(), { urlState: url, children: null });
    const { rerender } = render(<ResourceView view={view} />, { wrapper: Wrapper });
    await screen.findByText("Write the plan");
    expect(screen.queryByText("Ship it")).toBeNull();
    url.setSearchParams(new URLSearchParams("seg=all"));
    rerender(<ResourceView view={view} />);
    await screen.findByText("Ship it");
  });

  it("asks again for a text filter after a pause, not on every keystroke", async () => {
    const p = provider();
    render(<ResourceView view={view} />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    const box = screen.getByPlaceholderText(/title/i);
    fireEvent.change(box, { target: { value: "wri" } });
    expect(lastFilters(p).some((f) => f.operator === "contains")).toBe(false);
    await waitFor(() => expect(lastFilters(p)).toContainEqual({ field: "title", operator: "contains", value: "wri" }));
  });
});
