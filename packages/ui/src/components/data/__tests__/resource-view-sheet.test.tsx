// @feat:resource-view-sheet
/**
 * ResourceView's sheet type: a view's rows on SheetGrid, only its writable fields editable, each
 * row through the view's guards (a refused cell says why), every change through the resource's
 * update row by row, and the last change undone.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";

type Task = { id: string; title: string; hours: number; locked: boolean; created_at: string };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "hours", type: "number" },
    { name: "locked", type: "boolean" },
    { name: "created_at", type: "datetime", readOnly: true },
  ],
});

function provider() {
  const rows: Task[] = [
    { id: "a", title: "Write the plan", hours: 2, locked: false, created_at: "2026-11-01T09:00:00Z" },
    { id: "b", title: "Ship it", hours: 3, locked: true, created_at: "2026-11-02T09:00:00Z" },
  ];
  return {
    rows,
    getList: vi.fn(async () => ({ data: rows.map((r) => ({ ...r })), total: rows.length })),
    getOne: vi.fn(async (_r: string, { id }: { id: string }) => ({ data: rows.find((r) => r.id === id) })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(async (_r: string, { id, data }: { id: string; data: Partial<Task> }) => {
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, data);
      return { data: { ...row } };
    }),
    deleteOne: vi.fn(),
  } as unknown as DataProvider & { update: ReturnType<typeof vi.fn>; rows: Task[] };
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const view = defineView(tasks, {
  columns: { default: ["title", "hours", "created_at"] },
  can: { update: (t) => (t.locked ? "It's locked." : true) },
});

const cellOf = (row: number, column: number) => screen.getAllByRole("row")[row + 1]!.querySelectorAll('[role="gridcell"]')[column] as HTMLElement;

// No layout in the test DOM: give elements a box, so the grid's virtualizer draws rows (as SheetGrid's own tests do).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 480 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1024 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 480 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1024 });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 480, right: 1024, width: 1024, height: 480, toJSON: () => ({}) }) as DOMRect;
});

describe("<ResourceView type=\"sheet\">", () => {
  it("edits a writable cell through the resource's update, and undoes it", async () => {
    const p = provider();
    render(<ResourceView view={view} type="sheet" />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "5" });
    const input = screen.getByLabelText(/Hours, row 1/i);
    fireEvent.change(input, { target: { value: "5" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("tasks", expect.objectContaining({ id: "a", data: { hours: 5 } })));
    fireEvent.click(screen.getByTestId("resource-sheet-undo"));
    await waitFor(() => expect(p.update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "a", data: { hours: 2 } })));
  });

  it("keeps a refused row's cells and a read-only column read-only, each saying why", async () => {
    const p = provider();
    render(<ResourceView view={view} type="sheet" />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    // Row 2 is locked: its writable cells refuse with the guard's words.
    expect(cellOf(1, 1).getAttribute("aria-readonly")).toBe("true");
    expect(cellOf(1, 1).getAttribute("title")).toBe("It's locked.");
    // Row 1 is open; created_at is read-only everywhere.
    expect(cellOf(0, 1).getAttribute("aria-readonly")).toBeNull();
    expect(cellOf(0, 2).getAttribute("aria-readonly")).toBe("true");
    expect(cellOf(0, 2).getAttribute("title")).toBe("Read-only");
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "9" });
    expect(screen.queryByLabelText(/Hours, row 2/i)).toBeNull();
    expect(p.update).not.toHaveBeenCalled();
  });

  /** Edit row 1's hours to `value` and wait for the save. */
  async function editHours(p: ReturnType<typeof provider>, value: string) {
    await screen.findByText("Write the plan");
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: value[0]! });
    const input = screen.getByLabelText(/Hours, row 1/i);
    fireEvent.change(input, { target: { value } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("tasks", expect.objectContaining({ id: "a", data: { hours: Number(value) } })));
  }

  it("checks the guards again before undoing, and keeps a refused undo to try later", async () => {
    const p = provider();
    let allowed = true;
    const { rerender } = render(<ResourceView view={view} type="sheet" can={() => allowed} />, { wrapper: wrap(p) });
    await editHours(p, "5");
    allowed = false;
    rerender(<ResourceView view={view} type="sheet" can={() => allowed} />);
    fireEvent.click(screen.getByTestId("resource-sheet-undo"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(p.update).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId("resource-sheet-undo") as HTMLButtonElement).disabled).toBe(false);
    // Allowed again: the same undo goes through.
    allowed = true;
    rerender(<ResourceView view={view} type="sheet" can={() => allowed} />);
    fireEvent.click(screen.getByTestId("resource-sheet-undo"));
    await waitFor(() => expect(p.update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "a", data: { hours: 2 } })));
    await waitFor(() => expect((screen.getByTestId("resource-sheet-undo") as HTMLButtonElement).disabled).toBe(true));
  });

  it("keeps an undo whose write failed, so it can be tried again", async () => {
    const p = provider();
    render(<ResourceView view={view} type="sheet" />, { wrapper: wrap(p) });
    await editHours(p, "6");
    p.update.mockRejectedValueOnce(new Error("Offline."));
    fireEvent.click(screen.getByTestId("resource-sheet-undo"));
    await waitFor(() => expect(p.update).toHaveBeenCalledTimes(2));
    expect((screen.getByTestId("resource-sheet-undo") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("resource-sheet-undo"));
    await waitFor(() => expect(p.update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "a", data: { hours: 2 } })));
  });

  it("never undoes one resource's change into another the sheet now shows", async () => {
    const p = provider();
    const notes = defineResource<Task>()({ ...tasks, name: "notes" });
    const notesView = defineView(notes, { columns: { default: ["title", "hours"] } });
    const { rerender } = render(<ResourceView view={view} type="sheet" />, { wrapper: wrap(p) });
    await editHours(p, "7");
    rerender(<ResourceView view={notesView as never} type="sheet" />);
    await screen.findByText("Write the plan");
    expect((screen.getByTestId("resource-sheet-undo") as HTMLButtonElement).disabled).toBe(true);
    expect(p.update).toHaveBeenCalledTimes(1);
  });

  it("keeps a list field read-only: its text can't be turned back into a list", async () => {
    type Tagged = Task & { tags: string[] };
    const tagged = defineResource<Tagged>()({ ...tasks, fields: [...tasks.fields, { name: "tags", type: "string", array: true }] } as never);
    const taggedView = defineView(tagged as typeof tasks, { columns: { default: ["title", "tags" as never] } });
    const p = provider();
    p.rows.forEach((r) => Object.assign(r, { tags: ["red", "blue"] }));
    render(<ResourceView view={taggedView} type="sheet" />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    expect(cellOf(0, 1).getAttribute("aria-readonly")).toBe("true");
  });

  it("says a failed read failed, with a retry, instead of showing an empty sheet", async () => {
    const p = provider();
    vi.mocked(p.getList).mockRejectedValue(new Error("The server is down."));
    render(<ResourceView view={view} type="sheet" />, { wrapper: wrap(p) });
    expect(await screen.findByTestId("resource-sheet-error")).toBeTruthy();
    expect(screen.getByTestId("resource-sheet-retry")).toBeTruthy();
  });
});
