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

function provider(rows: Task[], update: DataProvider["update"], versioned = true): DataProvider {
  const matches = (row: Task, f: FilterParam) => (f.operator === "eq" ? row[f.field as keyof Task] === f.value : true);
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      // Copies, as a real read returns: a change to `rows` later isn't seen until the next read.
      const data = rows.filter((row) => (params.filters ?? []).every((f) => matches(row, f))).map((row) => ({ ...row }));
      return { data, total: data.length };
    }),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update,
    deleteOne: vi.fn(),
    // The real versioned path: core's write hooks send each row's `version` as `expectedVersion`.
    ...(versioned
      ? {
          capabilities: async () => ({
            search: false,
            sort: false,
            filterOperators: [],
            bulkWrites: false,
            versionedWrites: true,
            compositeKeys: false,
            version: { field: "version", kind: "integer" as const },
          }),
        }
      : {}),
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

/** Ravi moves the card to "doing" behind this board's back: the row is now at version 2. */
function raviMovesIt(rows: Task[]) {
  Object.assign(rows[0]!, { stage: "doing", version: 2 });
}

describe("ResourceView mode=board: conflicts", () => {
  it("opens ConflictSheet when a move meets someone else's change, and keeping mine re-sends at their version", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    // The board read version 1, and core sent it.
    expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "a", expectedVersion: "1" }));
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

  it("checks a move made right after keeping mine against the version keeping mine saved", async () => {
    const { rows, update } = conflicted();
    const p = provider(rows, update as never);
    // Hold the refetch after "keep mine", so the cache still has the stale row when the next move goes.
    let hold = false;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const getList = p.getList as ReturnType<typeof vi.fn>;
    const real = getList.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
    getList.mockImplementation(async (...args: unknown[]) => {
      if (hold) await held;
      return real(...args);
    });
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(p) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    hold = true;
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Keep my version" }));
    });
    await waitFor(() => expect(screen.queryByTestId("resource-board-conflict")).toBeNull());
    expect(rows[0]!.version).toBe(3);
    // The board still draws the card outside Done (the refetch is held): send it to Done again.
    await moveTo("Write brief", "Done");
    await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ data: { stage: "done" }, expectedVersion: "3" }));
    expect(screen.queryByTestId("resource-board-conflict")).toBeNull();
    release();
  });

  it("shows a failure that isn't a conflict in the sheet, and keeps it open", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    update.mockImplementationOnce(async () => {
      throw new DataWriteError("forbidden", "You can't change this task now.");
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Keep my version" }));
    });
    await waitFor(() => expect(within(screen.getByTestId("resource-board-conflict")).getByText(/You can't change this task now|wasn't saved/)).toBeTruthy());
  });

  it("shows a keep-mine save that changed no row as a refusal in the sheet", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    update.mockImplementationOnce(async () => ({ data: null }) as never);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Keep my version" }));
    });
    // Still open, saying nothing was saved, rather than closing as if it had.
    await waitFor(() => expect(within(screen.getByTestId("resource-board-conflict")).getByText(/was not changed|wasn't saved/)).toBeTruthy());
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("doesn't hand the sheet's conflict to the app's onError", async () => {
    const { rows, update } = conflicted();
    const onError = vi.fn();
    render(<ResourceView view={view} mode="board" resourceOptions={{ onError }} />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    await screen.findByTestId("resource-board-conflict");
    expect(onError).not.toHaveBeenCalled();
  });

  it("dims the card while keeping mine saves", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
    await moveTo("Write brief", "Done");
    const sheet = await screen.findByTestId("resource-board-conflict");
    let settle!: () => void;
    update.mockImplementationOnce(
      (_r: string, params: { id: string; data: Partial<Task> }) =>
        new Promise((resolve) => {
          settle = () => resolve({ data: Object.assign(rows[0]!, params.data, { version: 3 }) });
        }) as never,
    );
    act(() => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Keep my version" }));
    });
    await waitFor(() => expect(screen.getByText("Write brief").closest("button")?.getAttribute("aria-busy")).toBe("true"));
    await act(async () => settle());
    await waitFor(() => expect(screen.getByText("Write brief").closest("button")?.getAttribute("aria-busy")).toBeNull());
  });

  it("taking theirs leaves the card where their row puts it", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    await waitFor(() => expect(within(column("To do")).getByText("Write brief")).toBeTruthy());
    raviMovesIt(rows);
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
    raviMovesIt(rows);
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

  it("fades the right edges right to left, where scrollLeft runs negative", async () => {
    const { rows, update } = conflicted();
    render(<ResourceView view={view} mode="board" />, { wrapper: wrap(provider(rows, update as never)) });
    const strip = await screen.findByTestId("resource-board-strip");
    // At the start (the right edge in RTL) scrollLeft is 0; scrolled to the end it is -400.
    const metrics = { scrollLeft: 0, clientWidth: 600, scrollWidth: 1000 };
    for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
      Object.defineProperty(strip, key, { configurable: true, get: () => metrics[key] });
    }
    metrics.scrollLeft = -400;
    fireEvent.scroll(strip);
    await waitFor(() => expect(screen.getByTestId("resource-board-fade-start")).toBeTruthy());
    expect(screen.queryByTestId("resource-board-fade-end")).toBeNull();
  });
});
