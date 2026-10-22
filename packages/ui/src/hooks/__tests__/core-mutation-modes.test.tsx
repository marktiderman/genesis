/**
 * genesis-core's `mutationMode` on `useResource` and `useResourceForm`
 * (pessimistic / optimistic / undoable), driven through a real React tree
 * with fake timers.
 *
 * - optimistic: the cache changes before the provider answers, and is put
 *   back (with the error reported) when the write fails;
 * - undoable: nothing is sent until the delay ends; undo discards the write;
 *   unmounting sends it at once; a provider that serves `undo` gets the
 *   write at once and undoes it by audit id.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GenesisProvider,
  DataWriteError,
  pendingWriteCount,
  useResource,
  useResourceForm,
  type DataProvider,
  type ListResult,
  type UndoableWrite,
} from "@marktiderman/genesis-core";

type Row = { id: string; title: string };
const LIST_KEY = ["tasks", "list", { pagination: { page: 1, perPage: 25 } }];
const DETAIL_KEY = ["tasks", "detail", "t1", undefined];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(extra: Partial<DataProvider> = {}) {
  const provider: DataProvider = {
    getList: vi.fn(async () => ({ data: [], total: 0 })),
    getOne: vi.fn(async () => ({ data: { id: "t1", title: "Write" } })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    ...extra,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  queryClient.setQueryData<ListResult<Row>>(LIST_KEY, {
    data: [
      { id: "t1", title: "Write" },
      { id: "t2", title: "Read" },
    ],
    total: 2,
  });
  queryClient.setQueryData<Row>(DETAIL_KEY, { id: "t1", title: "Write" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const list = () => queryClient.getQueryData<ListResult<Row>>(LIST_KEY)!;
  const detail = () => queryClient.getQueryData<Row>(DETAIL_KEY);
  return { provider, queryClient, wrapper, list, detail };
}

/** Lets pending promises (and React updates) run. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useResource — pessimistic (default)", () => {
  it("leaves the cache alone until the provider answers", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const { result } = renderHook(() => useResource<Row>("tasks", { enabled: false }), { wrapper });
    let done = false;
    act(() => {
      void result.current.update("t1", { title: "Edited" }).then(() => {
        done = true;
      });
    });
    await flush();
    expect(list().data[0]!.title).toBe("Write");
    expect(done).toBe(false);
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
    expect(done).toBe(true);
  });
});

describe("useResource — optimistic", () => {
  it("patches the list and detail caches before the provider answers", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list, detail, provider } = setup({
      update: vi.fn(() => answer.promise) as DataProvider["update"],
    });
    const onUpdateSuccess = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onUpdateSuccess }),
      { wrapper },
    );
    let returned: Row | undefined;
    await act(async () => {
      returned = await result.current.update("t1", { title: "Edited" });
    });
    // Resolved at once, with the cached row merged.
    expect(returned).toEqual({ id: "t1", title: "Edited" });
    expect(list().data[0]).toEqual({ id: "t1", title: "Edited" });
    expect(list().data[1]).toEqual({ id: "t2", title: "Read" });
    expect(detail()).toEqual({ id: "t1", title: "Edited" });
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(onUpdateSuccess).not.toHaveBeenCalled();
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
    expect(onUpdateSuccess).toHaveBeenCalledWith({ id: "t1", title: "Edited" });
  });

  it("rolls the cache back and reports the error when the write fails", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list, detail, queryClient } = setup({
      update: vi.fn(() => answer.promise) as DataProvider["update"],
    });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(list().data[0]!.title).toBe("Edited");
    expect(pendingWriteCount(queryClient, "tasks")).toBe(1);
    answer.reject(new DataWriteError("forbidden", "You can't change this record."));
    await flush();
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
    expect(detail()).toEqual({ id: "t1", title: "Write" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toBe("You can't change this record.");
    expect(pendingWriteCount(queryClient, "tasks")).toBe(0);
  });

  it("a rollback puts back only its own row, not another pending write's", async () => {
    const first = deferred<{ data: Row }>();
    const second = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { wrapper, list } = setup({ update: update as DataProvider["update"] });
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError: () => {} }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "One" });
      await result.current.update("t2", { title: "Two" });
    });
    first.reject(new Error("nope"));
    await flush();
    expect(list().data).toEqual([
      { id: "t1", title: "Write" },
      { id: "t2", title: "Two" },
    ]);
    second.resolve({ data: { id: "t2", title: "Two" } });
    await flush();
  });

  it("removes a deleted row (and its count) at once, and restores it on failure", async () => {
    const answer = deferred<{ data: { id: string } }>();
    const { wrapper, list } = setup({ deleteOne: vi.fn(() => answer.promise) });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t1");
    });
    expect(list()).toEqual({ data: [{ id: "t2", title: "Read" }], total: 1 });
    answer.reject(new Error("offline"));
    await flush();
    expect(list()).toEqual({
      data: [
        { id: "t1", title: "Write" },
        { id: "t2", title: "Read" },
      ],
      total: 2,
    });
    expect(onError).toHaveBeenCalled();
  });

  it("does not refetch the resource while another optimistic write is pending", async () => {
    const slow = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => ({ data: { id: "t2", title: "Two" } }));
    const { wrapper, queryClient } = setup({ update: update as DataProvider["update"] });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "One" });
      await result.current.update("t2", { title: "Two" });
    });
    await flush();
    const tasksInvalidations = () =>
      invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["tasks"]').length;
    expect(tasksInvalidations()).toBe(0);
    slow.resolve({ data: { id: "t1", title: "One" } });
    await flush();
    expect(tasksInvalidations()).toBe(1);
  });
});

describe("useResource — undoable", () => {
  it("sends nothing until the delay ends, then commits", async () => {
    const { wrapper, list, provider } = setup();
    const onUndoable = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(list().data[0]!.title).toBe("Edited");
    expect(onUndoable).toHaveBeenCalledTimes(1);
    const write = onUndoable.mock.calls[0]![0] as UndoableWrite;
    expect(write).toMatchObject({ resource: "tasks", kind: "update", id: "t1", strategy: "delay", delayMs: 5000 });
    await flush(4999);
    expect(provider.update).not.toHaveBeenCalled();
    await flush(1);
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Edited" } });
    // Too late: the write was sent.
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write.undo();
    });
    expect(undone).toBe(false);
  });

  it("undo cancels the write and restores the cache", async () => {
    const { wrapper, list, detail, provider, queryClient } = setup();
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () =>
        useResource<Row>("tasks", {
          enabled: false,
          mutationMode: "undoable",
          undoDelayMs: 3000,
          onUndoable: (w) => {
            write = w;
          },
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(detail()!.title).toBe("Edited");
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write!.undo();
    });
    expect(undone).toBe(true);
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
    expect(detail()).toEqual({ id: "t1", title: "Write" });
    await flush(10_000);
    expect(provider.update).not.toHaveBeenCalled();
    expect(pendingWriteCount(queryClient, "tasks")).toBe(0);
    // A second undo, or a late commit, does nothing.
    await act(async () => {
      await write!.undo();
      write!.commit();
    });
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("undo cancels a delete", async () => {
    const { wrapper, list, provider } = setup();
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t2");
    });
    expect(list().total).toBe(1);
    await act(async () => {
      await write!.undo();
    });
    expect(list().total).toBe(2);
    expect(list().data.map((r) => r.id)).toEqual(["t1", "t2"]);
    await flush(6000);
    expect(provider.deleteOne).not.toHaveBeenCalled();
  });

  it("commits at once when the hook unmounts during the delay", async () => {
    const { wrapper, provider } = setup();
    const { result, unmount } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(provider.update).not.toHaveBeenCalled();
    unmount();
    await flush();
    expect(provider.update).toHaveBeenCalledTimes(1);
    // ...and only once: the timer no longer fires it.
    await flush(10_000);
    expect(provider.update).toHaveBeenCalledTimes(1);
  });

  it("commits waiting writes before the page unloads", async () => {
    const { wrapper, provider } = setup();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    await flush();
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("rolls back and reports when the delayed write fails", async () => {
    const { wrapper, list } = setup({
      update: vi.fn(async () => {
        throw new DataWriteError("gone", "This record no longer exists.");
      }),
    });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush(5000);
    expect(list().data[0]!.title).toBe("Write");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("with a provider that serves undo: sends at once, and undoes by audit id", async () => {
    const undo = vi.fn(async () => ({}));
    const { wrapper, provider } = setup({
      capabilities: async () => ({
        search: false,
        sort: false,
        filterOperators: [],
        bulkWrites: false,
        versionedWrites: false,
        compositeKeys: false,
        undo: true,
      }),
      update: vi.fn(async (_r, { id, data }) => ({
        data: { id, ...(data as object) },
        audit: {
          id: "audit-7",
          occurredAt: "2026-10-22T00:00:00Z",
          actor: null,
          resource: "tasks",
          key: { id },
          action: "update" as const,
          before: null,
          after: null,
        },
      })) as DataProvider["update"],
      undo,
    });
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush();
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(write).toMatchObject({ strategy: "provider", kind: "update", id: "t1" });
    await act(async () => {
      await write!.undo();
      await write!.undo();
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith("tasks", { auditId: "audit-7" });
  });
});

describe("useResourceForm — mutation modes", () => {
  const fields = [{ key: "title", type: "text" as const }];

  it("optimistic: calls onSuccess at once with the merged record, and patches the cache", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "optimistic",
          onSuccess,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Edited" });
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: "t1", title: "Edited" });
    expect(list().data[0]!.title).toBe("Edited");
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
  });

  it("optimistic: a failed save rolls back and reaches onError and the form", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "optimistic",
          onError,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Taken" });
    });
    answer.reject(
      new DataWriteError("invalid", "Title is already in use.", { fields: { title: "This value is already in use." } }),
    );
    await flush();
    expect(list().data[0]!.title).toBe("Write");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.form.formState.errors.title?.message).toBe("This value is already in use.");
    expect(result.current.form.formState.errors.root?.message).toBe("Title is already in use.");
  });

  it("undoable: a create waits, and undo means it is never sent", async () => {
    const { wrapper, provider } = setup();
    let write: UndoableWrite | undefined;
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "create",
          fields,
          prefillFromUrl: false,
          mutationMode: "undoable",
          onUndoable: (w) => (write = w),
          onSuccess,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "New" });
    });
    expect(onSuccess).toHaveBeenCalledWith({ title: "New" });
    expect(write).toMatchObject({ kind: "create", strategy: "delay" });
    expect(write!.id).toBeUndefined();
    await act(async () => {
      await write!.undo();
    });
    await flush(10_000);
    expect(provider.create).not.toHaveBeenCalled();
  });

  it("undoable: the form unmounting sends the save at once", async () => {
    const { wrapper, provider } = setup();
    const { result, unmount } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "undoable",
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Edited" });
    });
    expect(provider.update).not.toHaveBeenCalled();
    unmount();
    await flush();
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Edited" } });
  });
});
