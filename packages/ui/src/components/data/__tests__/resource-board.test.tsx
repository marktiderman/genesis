/**
 * ResourceView's board mode: a column per value of the view's `board` field, one request per
 * column page under core's list keys, and a move written through the resource's own update.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";

type Task = { id: string; title: string; stage: "todo" | "doing" | "done" | null; due_on: string | null; locked: boolean };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "done"], nullable: true },
    { name: "due_on", type: "datetime", dbType: "date", nullable: true },
    { name: "locked", type: "boolean", hasDefault: true },
  ],
});

const ROWS: Task[] = [
  { id: "a", title: "Write brief", stage: "todo", due_on: "2026-11-05", locked: false },
  { id: "b", title: "Review copy", stage: "doing", due_on: null, locked: false },
  { id: "c", title: "Ship it", stage: "doing", due_on: null, locked: true },
  { id: "d", title: "Unsorted", stage: null, due_on: null, locked: false },
];

/** A provider whose getList honours the board's column filter. */
function provider(rows: Task[] = ROWS, update?: DataProvider["update"]): DataProvider {
  const matches = (row: Task, f: FilterParam) =>
    f.operator === "is_null" ? row[f.field as keyof Task] == null : f.operator === "eq" ? row[f.field as keyof Task] === f.value : true;
  return {
    getList: vi.fn(async (_resource: string, params: ListParams) => {
      const data = rows.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      const { page = 1, perPage = 50 } = params.pagination ?? {};
      return { data: data.slice((page - 1) * perPage, page * perPage), total: data.length };
    }),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update:
      update ??
      vi.fn(async (_resource: string, { id, data }: { id: string; data: Partial<Task> }) => {
        const row = rows.find((r) => r.id === id)!;
        Object.assign(row, data);
        return { data: row };
      }),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const view = defineView(tasks, {
  fields: { stage: { labels: { todo: "To do" }, tones: { done: "success" } } },
  board: { field: "stage", cardFields: ["due_on"], limits: { doing: 1 } },
  can: { update: (row) => (row.locked ? "This task is locked." : true) },
});

afterEach(() => vi.restoreAllMocks());

const column = (name: string) => screen.getByRole("region", { name });

describe("ResourceView mode=board", () => {
  it("shows a column per choice, in the contract's order, then one for no value", async () => {
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["To do", "Doing", "Done", "No value"]);
    expect(within(column("No value")).getByText("Unsorted")).toBeTruthy();
    // One request per column, each narrowed to its value.
    const filters = vi.mocked(p.getList).mock.calls.map(([, params]) => params.filters?.at(-1));
    expect(filters).toEqual(
      expect.arrayContaining([
        { field: "stage", operator: "eq", value: "todo" },
        { field: "stage", operator: "is_null" },
      ]),
    );
  });

  it("draws the card's fields and flags a column over its limit in words", async () => {
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(ROWS.map((r) => ({ ...r })))) });
    await waitFor(() => expect(within(column("Doing")).getByText("Review copy")).toBeTruthy());
    expect(within(column("Doing")).getByText("2 of 1")).toBeTruthy();
    expect(within(column("Doing")).getByTestId("kanban-over-limit").textContent).toBe("Over limit of 1");
    expect(within(column("To do")).getByText(/^due on:/i)).toBeTruthy();
  });

  it("moves a card by writing the board's field through the resource's update", async () => {
    const rows = ROWS.map((r) => ({ ...r }));
    const p = provider(rows);
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Write brief" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
    });
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("tasks", expect.objectContaining({ id: "a", data: { stage: "done" } })));
    await waitFor(() => expect(within(column("Done")).getByText("Write brief")).toBeTruthy());
  });

  it("writes null for the no-value column", async () => {
    const rows = ROWS.map((r) => ({ ...r }));
    const p = provider(rows);
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("Doing")).getByText("Review copy")).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Review copy" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "No value" }));
    });
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("tasks", expect.objectContaining({ id: "b", data: { stage: null } })));
  });

  it("gives a card the view's guard refuses no handle or menu, and never writes it", async () => {
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("Doing")).getByText("Ship it")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Move Ship it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pick up Ship it" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Review copy" })).toBeTruthy();
    expect(p.update).not.toHaveBeenCalled();
  });

  it("narrows by the screen's own can as well (guards only narrow)", async () => {
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={view} mode="board" can={(action) => action !== "edit"} />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  });

  it("applies the screen's resourceOptions to a move", async () => {
    const onUpdateSuccess = vi.fn();
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={view} mode="board" resourceOptions={{ onUpdateSuccess }} />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Write brief" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
    });
    await waitFor(() => expect(onUpdateSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: "a", stage: "done" })));
  });

  it("reports a failed move once: on the board, not in the console as well", async () => {
    const refused = vi.fn(async () => {
      throw new Error("Not today.");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rows = ROWS.map((r) => ({ ...r }));
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, refused as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Write brief" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
    });
    expect((await screen.findByTestId("resource-board-refusal")).textContent).toBe("Not today.");
    expect(logged.mock.calls.filter(([message]) => String(message).includes("[useResource]"))).toEqual([]);
  });

  it("sends the view's orderBy, with where its empty values go, to every column", async () => {
    const ordered = defineView(tasks, { fields: { stage: { labels: { todo: "To do" } } }, board: { field: "stage" }, orderBy: { field: "due_on", direction: "desc", nulls: "last" } });
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={ordered} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    expect(JSON.stringify(vi.mocked(p.getList).mock.calls[0]![1])).toContain('{"field":"due_on","order":"desc","nulls":"last"}');
  });

  it("turns away a second move of a card while its first is saving", async () => {
    let settle!: () => void;
    const rows = ROWS.map((r) => ({ ...r }));
    const update = vi.fn(
      (_resource: string, { id, data }: { id: string; data: Partial<Task> }) =>
        new Promise((resolve) => {
          settle = () => resolve({ data: Object.assign(rows.find((r) => r.id === id)!, data) });
        }),
    );
    const p = provider(rows, update as never);
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    const handle = screen.getByRole("button", { name: "Pick up Write brief" });
    // Alt+→ twice, before the first save lands.
    fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(screen.getByText("Write brief").closest("button")?.getAttribute("aria-busy")).toBe("true"));
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => settle());
    await waitFor(() => expect(within(column("Doing")).getByText("Write brief")).toBeTruthy());
  });

  it("turns away a second move sent before the board re-renders", async () => {
    let settle!: () => void;
    const rows = ROWS.map((r) => ({ ...r }));
    const update = vi.fn(
      (_resource: string, { id, data }: { id: string; data: Partial<Task> }) =>
        new Promise((resolve) => {
          settle = () => resolve({ data: Object.assign(rows.find((r) => r.id === id)!, data) });
        }),
    );
    const p = provider(rows, update as never);
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    const handle = screen.getByRole("button", { name: "Pick up Write brief" });
    // Both presses inside one act: no render between them.
    act(() => {
      fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
      fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await act(async () => settle());
    await waitFor(() => expect(within(column("Doing")).getByText("Write brief")).toBeTruthy());
    expect(update).toHaveBeenCalledTimes(1);
    // The refused second move didn't cancel the first's refocus: the handle has focus in its new column.
    await waitFor(() => expect(document.activeElement).toBe(within(column("Doing")).getByRole("button", { name: "Pick up Write brief" })));
  });

  it("filters a yes/no board by booleans, not strings", async () => {
    const byUrgent = defineView(tasks, { board: { field: "locked" } });
    const p = provider(ROWS.map((r) => ({ ...r })));
    render(<ResourceView view={byUrgent} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("True")).getByText("Ship it")).toBeTruthy());
    const values = vi.mocked(p.getList).mock.calls.map(([, params]) => (params.filters?.at(-1) as { value?: unknown }).value);
    expect(values).toEqual(expect.arrayContaining([true, false]));
  });

  it("falls back to the view's block when the screen's override is bad", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ResourceView view={view} mode="board" board={{ columns: ["blocked"] }} />, { wrapper: wrap(provider(ROWS.map((r) => ({ ...r })))) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"blocked".*showing the view's board/));
  });

  it("leaves a card the server refuses where it was, and hands the error to onMoveError", async () => {
    const conflict = Object.assign(new Error("Someone else changed this task."), { outcome: "conflict" });
    const p = provider(ROWS.map((r) => ({ ...r })), vi.fn(async () => Promise.reject(conflict)) as never);
    const onMoveError = vi.fn();
    render(<ResourceView view={view} mode="board" board={{ onMoveError }} />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move Write brief" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Doing" }));
    });
    await waitFor(() => expect(onMoveError).toHaveBeenCalledWith(conflict, expect.objectContaining({ id: "a" })));
    expect(within(column("To do")).getByText("Write brief")).toBeTruthy();
    expect(screen.queryByTestId("resource-board-refusal")).toBeNull();
  });

  it("takes the screen's columns over the view's, and a column pages on its own", async () => {
    const many: Task[] = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, stage: "todo", due_on: null, locked: false }));
    render(<ResourceView view={view} mode="board" board={{ columns: ["todo"], perPage: 2, limits: {} }} />, { wrapper: wrap(provider(many)) });
    await waitFor(() => expect(within(column("To do")).getByText("Task 1")).toBeTruthy());
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(within(column("To do")).queryByText("Task 2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more (1 left)" }));
    await waitFor(() => expect(within(column("To do")).getByText("Task 2")).toBeTruthy());
  });

  it("draws a card once when it shows on two loaded pages of a column", async () => {
    const a: Task = { id: "a", title: "Write brief", stage: "todo", due_on: null, locked: false };
    const b: Task = { id: "b", title: "Book venue", stage: "todo", due_on: null, locked: false };
    // Page 2 was read after a row above it moved away: "b" shifted up and shows on both pages.
    const p = provider();
    vi.mocked(p.getList).mockImplementation(async (_r, params) => {
      const stage = (params.filters?.at(-1) as { value?: unknown }).value;
      if (stage !== "todo") return { data: [], total: 0 };
      return params.pagination?.page === 2 ? { data: [b], total: 3 } : { data: [a, b], total: 3 };
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ResourceView view={view} mode="board" board={{ perPage: 2 }} />, { wrapper: wrap(p) });
    fireEvent.click(await screen.findByRole("button", { name: /Load more/ }));
    await waitFor(() => expect(vi.mocked(p.getList).mock.calls.some(([, q]) => q.pagination?.page === 2)).toBe(true));
    await waitFor(() => expect(within(column("To do")).getAllByText("Book venue")).toHaveLength(1));
    expect(error.mock.calls.some(([m]) => String(m).includes("same key"))).toBe(false);
  });

  it("opens the peek from a card", async () => {
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(ROWS.map((r) => ({ ...r })))) });
    fireEvent.click(await screen.findByText("Write brief"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("refuses a board it can't draw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plain = defineView(tasks, {});
    expect(() => render(<ResourceView view={plain} mode="board" />, { wrapper: wrap(provider()) })).toThrow(/needs a board field/);
    expect(() => render(<ResourceView view={plain} mode="board" board={{ field: "title" }} />, { wrapper: wrap(provider()) })).toThrow(/no fixed values/);
  });
});
