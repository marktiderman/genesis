/**
 * Board mode's follow-ups: a move that meets someone else's change opens ConflictSheet (keep mine
 * re-sends at their version; take theirs leaves the card where their row puts it), and a fade
 * marks columns past the board's edge.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWriteError, defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";
import * as undoToast from "../undo-toast";

type Task = { id: string; title: string; stage: "todo" | "doing" | "done"; version: number };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "done"] },
    { name: "version", type: "number", hasDefault: true },
  ],
});
const view = defineView(tasks, { fields: { stage: { labels: { todo: "To do" } } }, board: { field: "stage" } });

function provider(rows: Task[], update: DataProvider["update"]): DataProvider {
  const matches = (row: Task, f: FilterParam) => (f.operator === "eq" ? row[f.field as keyof Task] === f.value : true);
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const data = rows.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      return { data, total: data.length };
    }),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update,
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

afterEach(() => vi.restoreAllMocks());

const column = (name: string) => screen.getByRole("region", { name });

/** A row someone else moved to "doing" (version 2) after this board read it at version 1. */
function conflicted() {
  const rows: Task[] = [{ id: "a", title: "Write brief", stage: "todo", version: 1 }];
  const update = vi.fn(async (_r: string, params: { id: string; data: Partial<Task>; expectedVersion?: string }) => {
    const row = rows[0]!;
    if (params.expectedVersion !== String(row.version)) {
      throw new DataWriteError("conflict", "Someone else changed this task.", { current: { ...row }, currentVersion: String(row.version) });
    }
    Object.assign(row, params.data, { version: row.version + 1 });
    return { data: { ...row } };
  });
  return { rows, update };
}

async function moveTo(name: string, target: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: `Move ${name}` }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  await act(async () => {
    fireEvent.click(await screen.findByRole("menuitem", { name: target }));
  });
}

describe("ResourceView mode=board: conflicts", () => {
  it("opens ConflictSheet when a move meets someone else's change, and keeping mine re-sends at their version", async () => {
    const { rows, update } = conflicted();
    const p = provider(rows, update as never);
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    // Someone else moves it to "doing" behind this board's back.
    Object.assign(rows[0]!, { stage: "doing", version: 2 });
    // The board still read version 1: send the move with it, as #656's versioned writes do.
    update.mockImplementationOnce(async () => {
      throw new DataWriteError("conflict", "Someone else changed this task.", { current: { ...rows[0]! }, currentVersion: "2" });
    });
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    expect(within(sheet).getByText("Doing")).toBeTruthy();
    expect(within(sheet).getByText("Done")).toBeTruthy();
    expect(screen.queryByTestId("resource-board-refusal")).toBeNull();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Keep my version" }));
    });
    await waitFor(() => expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "a", data: { stage: "done" }, expectedVersion: "2" })));
    await waitFor(() => expect(screen.queryByTestId("resource-board-conflict")).toBeNull());
    await waitFor(() => expect(within(column("Done")).getByText("Write brief")).toBeTruthy());
  });

  it("taking theirs leaves the card where their row puts it", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    Object.assign(rows[0]!, { stage: "doing", version: 2 });
    update.mockImplementationOnce(async () => {
      throw new DataWriteError("conflict", "Someone else changed this task.", { current: { ...rows[0]! }, currentVersion: "2" });
    });
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    fireEvent.click(within(sheet).getByRole("button", { name: "Take their version" }));
    await waitFor(() => expect(within(column("Doing")).getByText("Write brief")).toBeTruthy());
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("toasts a conflict that comes back after the board is gone", async () => {
    const { rows } = conflicted();
    let reject!: (error: unknown) => void;
    const update = vi.fn(() => new Promise((_, r) => (reject = r)));
    const toast = vi.spyOn(undoToast, "showWriteErrorToast").mockImplementation(() => {});
    const { unmount } = render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    await moveTo("Write brief", "Done");
    unmount();
    const conflict = new DataWriteError("conflict", "Someone else changed this task.", { current: { ...rows[0]!, stage: "doing" }, currentVersion: "2" });
    await act(async () => reject(conflict));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(conflict));
  });

  it("leaves a conflict to the screen's onMoveError when it has one", async () => {
    const { rows, update } = conflicted();
    const onMoveError = vi.fn();
    render(<ResourceView view={view} mode="board" board={{ onMoveError }} />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    update.mockImplementationOnce(async () => {
      throw new DataWriteError("conflict", "Someone else changed this task.", { current: { ...rows[0]!, stage: "doing" }, currentVersion: "2" });
    });
    await moveTo("Write brief", "Done");
    await waitFor(() => expect(onMoveError).toHaveBeenCalled());
    expect(screen.queryByTestId("resource-board-conflict")).toBeNull();
  });
});

describe("ResourceView mode=board: edges", () => {
  it("fades the edge with columns past it, and only while there are", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    const strip = await screen.findByTestId("resource-board-strip");
    const metrics = { scrollLeft: 0, clientWidth: 600, scrollWidth: 1000 };
    for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
      Object.defineProperty(strip, key, { configurable: true, get: () => metrics[key] });
    }
    fireEvent.scroll(strip);
    await waitFor(() => expect(screen.getByTestId("resource-board-fade-end")).toBeTruthy());
    expect(screen.queryByTestId("resource-board-fade-start")).toBeNull();
    metrics.scrollLeft = 400;
    fireEvent.scroll(strip);
    await waitFor(() => expect(screen.getByTestId("resource-board-fade-start")).toBeTruthy());
    expect(screen.queryByTestId("resource-board-fade-end")).toBeNull();
  });
});
