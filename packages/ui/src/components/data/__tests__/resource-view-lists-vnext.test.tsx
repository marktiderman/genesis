// @feat:view-filters
/**
 * ADR 0017 on the web: segments with counts and declared filters sent to the server and kept in
 * the URL, row and bulk actions with their reasons, the view-type switcher with the person's
 * choice in the store, grouping with totals, row tone, and rows a screen already holds.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
      return { data, total: data.length };
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
    expect(store.readCurrent!("tasks")).toEqual({ type: "board" });
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
    const { container } = render(<ResourceView view={view} />, { wrapper: wrap(provider()) });
    await screen.findByText("Ship it");
    const groups = container.querySelectorAll('[data-slot="table-group"]');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    // Sorted by the group first: Done (3 hours), then To do (2 + 1).
    expect(groups[0]!.textContent).toContain("Done");
    expect(groups[0]!.textContent).toContain("Hours: 3");
    expect(groups[1]!.textContent).toContain("2 loaded");
    expect(container.querySelectorAll('[data-tone="danger"]').length).toBe(1);
    expect(container.querySelector('[data-slot="table-footer"]')!.textContent).toContain("6");
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
